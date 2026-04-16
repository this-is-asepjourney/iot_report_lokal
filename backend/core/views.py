import csv
import io
import json
import os
import re
import subprocess
from datetime import datetime
from typing import Any

from django.db import models
from django.db.models import Count
from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import CoreTokenAuthentication, issue_jwt_token
from .models import ActivityLog, Device, Installation, Repair, RepairStatus, User, UserRole
from .serializers import (
    DeviceSerializer,
    InstallationSerializer,
    LoginSerializer,
    RegisterSerializer,
    RepairSerializer,
    UserSerializer,
)

PLANNING_HTML_MAX_BYTES = 3 * 1024 * 1024
PLANNING_SYNC_SCRIPT_ID = "iot-planning-sync"


def _extract_planning_json_from_html(html: str) -> dict[str, Any] | None:
    esc_id = re.escape(PLANNING_SYNC_SCRIPT_ID)
    pat = re.compile(
        rf'<script[^>]*\bid=["\']{esc_id}["\'][^>]*>([\s\S]*?)</script>',
        re.IGNORECASE,
    )
    m = pat.search(html)
    if not m:
        return None
    raw = m.group(1).strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


def _parse_checked_repair_ids_from_html_inputs(html: str) -> list[str]:
    ids: list[str] = []
    for m in re.finditer(r"<input\b[^>]*>", html, re.IGNORECASE):
        tag = m.group(0)
        if not re.search(r'type\s*=\s*["\']checkbox["\']', tag, re.IGNORECASE):
            continue
        if not re.search(r"\bchecked\b", tag, re.IGNORECASE):
            continue
        mid = re.search(r'data-repair-id\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if mid:
            ids.append(mid.group(1))
    return ids


def parse_planning_html_checked_ids(html: str) -> tuple[list[str], dict[str, Any]]:
    """
    Gabungkan checked_ids dari blok JSON (iot-planning-sync) dan input checkbox
    yang memiliki atribut checked di HTML.
    """
    meta: dict[str, Any] = {}
    checked: set[str] = set()
    payload = _extract_planning_json_from_html(html)
    if payload:
        meta = {k: payload[k] for k in ("version", "exported_at") if k in payload}
        raw_ids = payload.get("checked_ids")
        if isinstance(raw_ids, list):
            checked.update(str(x) for x in raw_ids if x)
    for rid in _parse_checked_repair_ids_from_html_inputs(html):
        checked.add(rid)
    return sorted(checked), meta


def user_can_update_repair(request_user, repair: Repair) -> bool:
    """Selaras dengan aturan RepairViewSet (factory + teknisi hanya milik sendiri)."""
    role = getattr(request_user, "role", None)
    if role in (UserRole.TEKNISI, UserRole.SUPERVISOR):
        factories = getattr(request_user, "factory_access", None) or []
        if factories and repair.factory not in factories:
            return False
    if role == UserRole.TEKNISI and repair.technician_name != request_user.name:
        return False
    return True


class IsCoreAuthenticated(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, "is_authenticated", False))


class IsAdminRole(permissions.BasePermission):
    """Hanya Admin."""
    def has_permission(self, request, view):
        return bool(getattr(request.user, "role", None) == UserRole.ADMIN)


class IsSupervisorOrAdmin(permissions.BasePermission):
    """Supervisor dan Admin dapat melakukan aksi ini."""
    def has_permission(self, request, view):
        return bool(getattr(request.user, "role", None) in (UserRole.SUPERVISOR, UserRole.ADMIN))


def _get_client_ip(request) -> str | None:
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    return x_forwarded.split(",")[0].strip() if x_forwarded else request.META.get("REMOTE_ADDR")


def log_activity(user, action: str, description: str = "", request=None) -> None:
    try:
        ActivityLog.objects.create(
            user=user,
            user_email=getattr(user, "email", ""),
            user_name=getattr(user, "name", ""),
            action=action,
            description=description,
            ip_address=_get_client_ip(request) if request else None,
        )
    except Exception:
        pass


def parse_upload_rows(uploaded_file) -> list[dict[str, Any]]:
    filename = (uploaded_file.name or "").lower()
    content = uploaded_file.read()
    if filename.endswith(".json"):
        data = json.loads(content.decode("utf-8"))
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list):
            raise ValueError("Format JSON harus array of objects.")
        return [row for row in data if isinstance(row, dict)]

    decoded = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))
    return [dict(row) for row in reader]


def csv_response(filename: str, rows: list[dict[str, Any]], fieldnames: list[str]) -> HttpResponse:
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("\ufeff")
    writer = csv.DictWriter(response, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    return response


class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.all().order_by("-last_update")
    serializer_class = DeviceSerializer
    authentication_classes = [CoreTokenAuthentication]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsCoreAuthenticated(), IsAdminRole()]
        if self.action in ("create", "update", "partial_update"):
            return [IsCoreAuthenticated(), IsSupervisorOrAdmin()]
        return [IsCoreAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        # Teknisi & supervisor hanya lihat device di factory mereka
        role = getattr(user, "role", None)
        if role in (UserRole.TEKNISI, UserRole.SUPERVISOR):
            factories = getattr(user, "factory_access", [])
            if factories:
                queryset = queryset.filter(factory__in=factories)

        factory = self.request.query_params.get("factory")
        line = self.request.query_params.get("line")
        search = self.request.query_params.get("search")

        if factory:
            queryset = queryset.filter(factory__iexact=factory)
        if line:
            queryset = queryset.filter(line__iexact=line)
        if search:
            queryset = queryset.filter(mcid__icontains=search)
        return queryset


class RepairViewSet(viewsets.ModelViewSet):
    queryset = Repair.objects.all().order_by("-date")
    serializer_class = RepairSerializer
    authentication_classes = [CoreTokenAuthentication]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsCoreAuthenticated(), IsAdminRole()]
        return [IsCoreAuthenticated()]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        # Teknisi & supervisor hanya lihat repair di factory mereka
        role = getattr(user, "role", None)
        if role in (UserRole.TEKNISI, UserRole.SUPERVISOR):
            factories = getattr(user, "factory_access", [])
            if factories:
                queryset = queryset.filter(factory__in=factories)

        done = self.request.query_params.get("done")
        factory = self.request.query_params.get("factory")
        line = self.request.query_params.get("line")
        search = self.request.query_params.get("search")

        if done == "done":
            queryset = queryset.filter(status__in=["completed", "approved"])
        elif done == "belum":
            queryset = queryset.filter(status="pending")
        if factory:
            queryset = queryset.filter(factory__iexact=factory)
        if line:
            queryset = queryset.filter(line__iexact=line)
        if search:
            queryset = queryset.filter(mcid__icontains=search)
        return queryset

    def perform_create(self, serializer):
        # Auto-set technician_name dari user yang sedang login
        repair = serializer.save(technician_name=self.request.user.name)
        log_activity(
            self.request.user,
            ActivityLog.ACTION_CREATE_REPAIR,
            f"Buat laporan: {repair.mcid} — {repair.problem[:60]}",
            self.request,
        )

    def perform_update(self, serializer):
        from rest_framework.exceptions import PermissionDenied

        user = self.request.user
        role = getattr(user, "role", None)
        instance = serializer.instance
        new_status = serializer.validated_data.get("status", instance.status)

        # Teknisi hanya bisa edit laporan yang dibuat oleh dirinya sendiri
        if role == UserRole.TEKNISI and instance.technician_name != user.name:
            raise PermissionDenied(
                "Teknisi hanya dapat mengedit laporan yang dibuat oleh dirinya sendiri."
            )

        # Hanya supervisor/admin yang bisa meng-approve
        if new_status == "approved" and role == UserRole.TEKNISI:
            raise PermissionDenied(
                "Hanya Supervisor atau Admin yang dapat meng-approve laporan."
            )

        old_status = instance.status
        instance = serializer.save()
        if old_status != instance.status:
            action = (
                ActivityLog.ACTION_DICOPOT
                if instance.status == "dicopot"
                else ActivityLog.ACTION_UPDATE_REPAIR
            )
            log_activity(
                self.request.user,
                action,
                f"Status {instance.mcid}: {old_status} → {instance.status}",
                self.request,
            )


class InstallationViewSet(viewsets.ModelViewSet):
    queryset = Installation.objects.all().order_by("-date_install")
    serializer_class = InstallationSerializer
    authentication_classes = [CoreTokenAuthentication]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsCoreAuthenticated(), IsAdminRole()]
        return [IsCoreAuthenticated()]

    def perform_create(self, serializer):
        inst = serializer.save()
        log_activity(
            self.request.user,
            ActivityLog.ACTION_CREATE_INSTALLATION,
            f"Instalasi: {inst.mcid} di {inst.factory}/{inst.line}",
            self.request,
        )


class HistoryAPIView(APIView):
    """Riwayat repair dan installation (maintenance) untuk halaman riwayat."""
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
        limit = min(int(request.query_params.get("limit", 100)), 500)
        repairs = Repair.objects.all().order_by("-date")[:limit]
        installations = Installation.objects.all().order_by("-date_install")[:limit]
        return Response(
            {
                "repairs": RepairSerializer(repairs, many=True).data,
                "installations": InstallationSerializer(installations, many=True).data,
            }
        )


class DashboardSummaryAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
        total_devices = Device.objects.count()
        total_errors = Repair.objects.count()
        pending_errors = Repair.objects.filter(status="pending").count()
        completed_errors = Repair.objects.filter(status__in=["completed", "approved"]).count()

        by_factory = list(
            Device.objects.values("factory").annotate(total=Count("id")).order_by("factory")
        )
        by_status = list(
            Device.objects.values("status").annotate(total=Count("id")).order_by("status")
        )
        errors_by_factory = list(
            Repair.objects.values("factory").annotate(total=Count("id")).order_by("factory")
        )

        # Akumulasi per tipe mesin: jumlah device & error per type_machine
        devices_by_type_machine = list(
            Device.objects
            .values("type_machine")
            .annotate(total=Count("id"))
            .order_by("-total")
        )
        # Gabungkan: error per type_machine (lewat relasi repair->device)
        errors_by_type_machine = list(
            Repair.objects
            .values(type_machine=models.F("device__type_machine"))
            .annotate(total=Count("id"))
            .order_by("-total")
        )

        return Response(
            {
                "summary": {
                    "total_devices": total_devices,
                    "total_errors": total_errors,
                    "pending_errors": pending_errors,
                    "completed_errors": completed_errors,
                },
                "devices_by_factory": by_factory,
                "devices_by_status": by_status,
                "errors_by_factory": errors_by_factory,
                "devices_by_type_machine": devices_by_type_machine,
                "errors_by_type_machine": errors_by_type_machine,
            }
        )


class AuthRegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = issue_jwt_token(user)
        log_activity(user, ActivityLog.ACTION_REGISTER, f"Registrasi akun baru: {user.email}", request)
        return Response(
            {"token": token, "access_token": token, "token_type": "Bearer", "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class AuthLoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        user = User.objects.filter(email=email).first()
        if not user or not user.password_hash or not check_password(password, user.password_hash):
            return Response(
                {"detail": "Email atau password salah."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token = issue_jwt_token(user)
        log_activity(user, ActivityLog.ACTION_LOGIN, f"Login berhasil dari {_get_client_ip(request)}", request)
        return Response({"token": token, "access_token": token, "token_type": "Bearer", "user": UserSerializer(user).data})


class AuthMeAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class AuthLogoutAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def post(self, request):
        log_activity(request.user, ActivityLog.ACTION_LOGOUT, "", request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceImportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsSupervisorOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "File wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rows = parse_upload_rows(uploaded_file)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = DeviceSerializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, ActivityLog.ACTION_IMPORT, f"Import {len(serializer.data)} devices", request)
        return Response({"imported": len(serializer.data)})


class DeviceExportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
        log_activity(request.user, ActivityLog.ACTION_EXPORT, "Export devices.csv", request)
        data = DeviceSerializer(Device.objects.all().order_by("-last_update"), many=True).data
        fieldnames = ["id", "mcid", "mac_address", "factory", "line", "status", "last_update", "created_at"]
        return csv_response("devices.csv", data, fieldnames)


class RepairImportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsSupervisorOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "File wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rows = parse_upload_rows(uploaded_file)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        for row in rows:
            if not row.get("device"):
                device = Device.objects.filter(mcid=row.get("mcid", "")).first()
                if device:
                    row["device"] = device.id

        serializer = RepairSerializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, ActivityLog.ACTION_IMPORT, f"Import {len(serializer.data)} repairs", request)
        return Response({"imported": len(serializer.data)})


class RepairExportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
        log_activity(request.user, ActivityLog.ACTION_EXPORT, "Export repairs.csv", request)
        data = RepairSerializer(Repair.objects.all().order_by("-date"), many=True).data
        fieldnames = [
            "id",
            "device",
            "mcid",
            "mac_address",
            "factory",
            "line",
            "date",
            "problem",
            "action",
            "technician_name",
            "photo_url",
            "status",
            "created_at",
        ]
        return csv_response("repairs.csv", data, fieldnames)


class PlanningHtmlImportAPIView(APIView):
    """
    Unggah file HTML hasil export Planning (checkbox + JSON iot-planning-sync).
    Repair yang ditandai selesai di-set status menjadi completed (aturan sama seperti PATCH repair).
    """
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"detail": "File wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        if getattr(uploaded, "size", 0) and uploaded.size > PLANNING_HTML_MAX_BYTES:
            return Response(
                {"detail": "File terlalu besar (maks. 3 MB)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            raw = uploaded.read()
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("utf-8", errors="replace")

        checked_ids, _meta = parse_planning_html_checked_ids(text)
        if not checked_ids:
            return Response(
                {
                    "updated": 0,
                    "skipped": 0,
                    "detail": "Tidak ada repair yang ditandai selesai di file (checkbox / JSON kosong).",
                },
                status=status.HTTP_200_OK,
            )

        updated = 0
        skipped = 0
        errors: list[dict[str, str]] = []

        for rid in checked_ids:
            repair = Repair.objects.filter(id=rid).first()
            if not repair:
                skipped += 1
                errors.append({"id": rid, "reason": "Repair tidak ditemukan."})
                continue
            if repair.status != RepairStatus.PENDING:
                skipped += 1
                errors.append({"id": rid, "reason": f"Status bukan pending ({repair.status})."})
                continue
            if not user_can_update_repair(request.user, repair):
                skipped += 1
                errors.append({"id": rid, "reason": "Tidak ada izin mengubah repair ini."})
                continue
            try:
                ser = RepairSerializer(
                    repair,
                    data={"status": RepairStatus.COMPLETED},
                    partial=True,
                    context={"request": request},
                )
                ser.is_valid(raise_exception=True)
                ser.save()
                updated += 1
            except ValidationError as exc:
                skipped += 1
                errors.append({"id": rid, "reason": str(exc.detail)})
            except Exception as exc:
                skipped += 1
                errors.append({"id": rid, "reason": str(exc)})

        if updated:
            log_activity(
                request.user,
                ActivityLog.ACTION_UPDATE_REPAIR,
                f"Import planning HTML: {updated} repair ditandai selesai",
                request,
            )

        return Response(
            {
                "updated": updated,
                "skipped": skipped,
                "errors": errors[:50],
            },
            status=status.HTTP_200_OK,
        )


class InstallationImportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "File wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rows = parse_upload_rows(uploaded_file)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        for row in rows:
            if not row.get("device"):
                device = Device.objects.filter(mcid=row.get("mcid", "")).first()
                if device:
                    row["device"] = device.id

        serializer = InstallationSerializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, ActivityLog.ACTION_IMPORT, f"Import {len(serializer.data)} installations", request)
        return Response({"imported": len(serializer.data)})


class UserImportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "File wajib diisi."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rows = parse_upload_rows(uploaded_file)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        imported = 0
        for row in rows:
            register_serializer = RegisterSerializer(data=row)
            register_serializer.is_valid(raise_exception=True)
            register_serializer.save()
            imported += 1
        return Response({"imported": imported})


class AdminUserListAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsAdminRole]

    def get(self, request):
        users = User.objects.all().order_by("created_at")
        return Response(UserSerializer(users, many=True).data)


class AdminUserDetailAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsAdminRole]

    def patch(self, request, user_id: str):
        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({"detail": "User tidak ditemukan."}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get("name")
        role = request.data.get("role")
        factory_access = request.data.get("factory_access")
        password = request.data.get("password")

        if name is not None:
            user.name = name
        if role in [UserRole.TEKNISI, UserRole.SUPERVISOR, UserRole.ADMIN]:
            user.role = role
        if isinstance(factory_access, list):
            user.factory_access = factory_access
        if password:
            user.password_hash = make_password(password)

        user.save()
        return Response(UserSerializer(user).data)


class DatabaseSQLExportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated, IsAdminRole]

    def get(self, request):
        db_name = os.getenv("DB_NAME", "iot_reports")
        db_user = os.getenv("DB_USER", "postgres")
        db_host = os.getenv("DB_HOST", "db")
        db_port = os.getenv("DB_PORT", "5432")
        db_password = os.getenv("DB_PASSWORD", "")

        env = {**os.environ, "PGPASSWORD": db_password}

        result = subprocess.run(
            [
                "pg_dump",
                "-h", db_host,
                "-p", db_port,
                "-U", db_user,
                "--no-owner",
                "--no-acl",
                "-d", db_name,
            ],
            env=env,
            capture_output=True,
            timeout=120,
        )

        if result.returncode != 0:
            return Response(
                {"detail": result.stderr.decode("utf-8", errors="replace")},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.sql"
        log_activity(request.user, ActivityLog.ACTION_EXPORT, f"Export database SQL: {filename}", request)
        response = HttpResponse(result.stdout, content_type="application/octet-stream")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


def admin_export_database_view(request):
    """View khusus admin panel (session auth) untuk download pg_dump."""
    from django.contrib import messages
    from django.shortcuts import redirect

    db_name = os.getenv("DB_NAME", "iot_reports")
    db_user = os.getenv("DB_USER", "postgres")
    db_host = os.getenv("DB_HOST", "db")
    db_port = os.getenv("DB_PORT", "5432")
    db_password = os.getenv("DB_PASSWORD", "")
    env = {**os.environ, "PGPASSWORD": db_password}

    try:
        result = subprocess.run(
            ["pg_dump", "-h", db_host, "-p", db_port, "-U", db_user, "--no-owner", "--no-acl", "-d", db_name],
            env=env,
            capture_output=True,
            timeout=120,
        )
    except Exception as exc:
        messages.error(request, f"Export gagal: {exc}")
        return redirect("/admin/")

    if result.returncode != 0:
        messages.error(request, f"pg_dump error: {result.stderr.decode('utf-8', errors='replace')[:500]}")
        return redirect("/admin/")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{ts}.sql"
    resp = HttpResponse(result.stdout, content_type="application/octet-stream")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp

