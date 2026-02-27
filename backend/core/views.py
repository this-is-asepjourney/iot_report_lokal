import csv
import io
import json
from typing import Any

from django.db.models import Count
from django.contrib.auth.hashers import check_password, make_password
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import CoreTokenAuthentication, issue_jwt_token
from .models import Device, Installation, Repair, User, UserRole
from .serializers import (
    DeviceSerializer,
    InstallationSerializer,
    LoginSerializer,
    RegisterSerializer,
    RepairSerializer,
    UserSerializer,
)


class IsCoreAuthenticated(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, "is_authenticated", False))


class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(getattr(request.user, "role", None) == UserRole.ADMIN)


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
    permission_classes = [IsCoreAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
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
    permission_classes = [IsCoreAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
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


class InstallationViewSet(viewsets.ModelViewSet):
    queryset = Installation.objects.all().order_by("-date_install")
    serializer_class = InstallationSerializer
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]


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
            }
        )


class AuthRegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = issue_jwt_token(user)
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
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeviceImportAPIView(APIView):
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

        serializer = DeviceSerializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"imported": len(serializer.data)})


class DeviceExportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
        data = DeviceSerializer(Device.objects.all().order_by("-last_update"), many=True).data
        fieldnames = ["id", "mcid", "mac_address", "factory", "line", "status", "last_update", "created_at"]
        return csv_response("devices.csv", data, fieldnames)


class RepairImportAPIView(APIView):
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

        serializer = RepairSerializer(data=rows, many=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"imported": len(serializer.data)})


class RepairExportAPIView(APIView):
    authentication_classes = [CoreTokenAuthentication]
    permission_classes = [IsCoreAuthenticated]

    def get(self, request):
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

