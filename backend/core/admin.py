from django import forms
from django.contrib import admin
from django.contrib.auth.hashers import make_password
from django.db.models import Count, Q
from django.utils.html import format_html
from import_export import resources, fields
from import_export.admin import ImportExportModelAdmin
from import_export.widgets import ForeignKeyWidget, DateTimeWidget

from .models import ActivityLog, Device, DeviceStatus, Installation, Repair, RepairStatus, User


# ── Resources (untuk Import/Export + Update/Upsert) ──────────────────────────

# Kolom CSV/Excel saat import Device:
# WAJIB  : mcid
# Opsional: mac_address | factory | line | type_machine | model_machine | type_iot | status
# Kolom last_update dan created_at di-skip saat import (auto-managed oleh Django).
# Jika MCID sudah ada → data akan di-UPDATE. Jika belum ada → di-INSERT.

class DeviceResource(resources.ModelResource):
    # Export-only: timestamp fields (tidak wajib ada di file import)
    last_update = fields.Field(attribute="last_update", column_name="last_update",
                               widget=DateTimeWidget(), readonly=True)
    created_at  = fields.Field(attribute="created_at",  column_name="created_at",
                               widget=DateTimeWidget(), readonly=True)

    class Meta:
        model = Device
        fields = (
            "mcid", "mac_address", "factory", "line",
            "type_machine", "model_machine", "type_iot",
            "status", "last_update", "created_at",
        )
        export_order = (
            "mcid", "mac_address", "factory", "line",
            "type_machine", "model_machine", "type_iot",
            "status", "last_update", "created_at",
        )
        import_id_fields = ("mcid",)   # MCID sebagai kunci upsert
        skip_unchanged = True
        report_skipped = True

    def get_import_fields(self):
        """Saat import, hanya field yang bisa diedit user — timestamp dikecualikan."""
        exclude = {"last_update", "created_at"}
        return [f for f in super().get_import_fields() if f.column_name not in exclude]

    def before_save_instance(self, instance, row, **kwargs):
        """Pastikan device baru mendapat ID. Field opsional yang kosong diberi default kosong."""
        if not instance.pk:
            from .models import generate_id
            instance.id = generate_id()
        # Isi default untuk field opsional yang tidak disertakan di CSV
        for field in ("mac_address", "factory", "line", "type_machine", "model_machine", "type_iot"):
            if not getattr(instance, field, None):
                setattr(instance, field, "")
        if not instance.status:
            instance.status = "active"


# Kolom CSV/Excel yang dibutuhkan saat import Repair:
# mcid | mac_address | factory | line | date | problem | action | technician_name | status
# Kunci upsert: mcid + date (kombinasi unik per laporan)
# device_mcid opsional: jika diisi, akan di-link ke Device.

class RepairResource(resources.ModelResource):
    device_mcid = fields.Field(
        column_name="device_mcid",
        attribute="device",
        widget=ForeignKeyWidget(Device, field="mcid"),
    )
    date = fields.Field(attribute="date", column_name="date", widget=DateTimeWidget())

    class Meta:
        model = Repair
        fields = (
            "device_mcid", "mcid", "mac_address", "factory", "line",
            "date", "problem", "action", "technician_name", "status", "created_at",
        )
        export_order = (
            "device_mcid", "mcid", "mac_address", "factory", "line",
            "date", "problem", "action", "technician_name", "status", "created_at",
        )
        import_id_fields = ("mcid", "date")  # Upsert by mcid + tanggal
        skip_unchanged = True
        report_skipped = True

    def get_import_fields(self):
        """Saat import, created_at dikecualikan (auto-managed)."""
        return [f for f in super().get_import_fields() if f.column_name != "created_at"]

    def before_save_instance(self, instance, row, **kwargs):
        if not instance.pk:
            from .models import generate_id
            instance.id = generate_id()
        # Auto-link ke Device jika device belum ter-set
        if not instance.device_id and instance.mcid:
            device = Device.objects.filter(mcid=instance.mcid).first()
            if device:
                instance.device = device


# ── User ─────────────────────────────────────────────────────────────────────

class UserAdminForm(forms.ModelForm):
    password = forms.CharField(
        required=False,
        widget=forms.PasswordInput(render_value=False),
        help_text="Isi untuk set/ubah password. Kosongkan jika tidak ingin mengubah.",
    )

    class Meta:
        model = User
        fields = "__all__"

    def clean(self):
        cleaned_data = super().clean()
        password = cleaned_data.get("password")
        if not self.instance.pk and not password:
            raise forms.ValidationError("Password wajib diisi saat membuat user baru.")
        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=False)
        password = self.cleaned_data.get("password")
        if password:
            instance.password_hash = make_password(password)
        if commit:
            instance.save()
        return instance


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    form = UserAdminForm
    list_display = ("email", "name", "role_badge", "factory_access_display", "created_at")
    search_fields = ("email", "name")
    list_filter = ("role",)
    list_per_page = 25
    ordering = ("email",)
    readonly_fields = ("id", "created_at", "password_hash")
    fieldsets = (
        (
            "Informasi User",
            {
                "fields": ("id", "name", "email", "role", "factory_access", "created_at"),
            },
        ),
        (
            "Keamanan",
            {
                "fields": ("password", "password_hash"),
                "description": "Password disimpan sebagai hash bcrypt/PBKDF2 ke database.",
                "classes": ("collapse",),
            },
        ),
    )

    @admin.display(description="Role")
    def role_badge(self, obj):
        colors = {
            "admin": ("#dc2626", "white"),
            "supervisor": ("#d97706", "white"),
            "teknisi": ("#2563eb", "white"),
        }
        bg, fg = colors.get(obj.role, ("#6b7280", "white"))
        return format_html(
            '<span style="background:{};color:{};padding:2px 8px;border-radius:12px;font-size:0.8em;font-weight:600">{}</span>',
            bg, fg, obj.role.title(),
        )

    @admin.display(description="Factory Access")
    def factory_access_display(self, obj):
        if not obj.factory_access:
            return format_html('<span style="color:#9ca3af;font-style:italic">Semua</span>')
        badges = "".join(
            f'<span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:8px;font-size:0.78em;margin:1px">{f}</span>'
            for f in obj.factory_access
        )
        return format_html(badges)


# ── Device ────────────────────────────────────────────────────────────────────

@admin.register(Device)
class DeviceAdmin(ImportExportModelAdmin):
    resource_classes = [DeviceResource]
    import_template_name = "admin/core/device/import.html"
    list_display = (
        "mcid", "mac_address", "factory", "line",
        "type_machine_badge", "model_machine_badge", "type_iot_badge",
        "status_badge", "last_update",
    )
    search_fields = ("mcid", "mac_address", "factory", "line", "type_machine", "model_machine", "type_iot")
    list_filter = ("status", "factory", "type_machine", "type_iot")
    list_per_page = 30
    ordering = ("-last_update",)
    readonly_fields = ("id", "last_update", "created_at")
    fieldsets = (
        (
            "Identifikasi",
            {"fields": ("id", "mcid", "mac_address")},
        ),
        (
            "Lokasi",
            {"fields": ("factory", "line")},
        ),
        (
            "Informasi Mesin & IoT",
            {"fields": ("type_machine", "model_machine", "type_iot")},
        ),
        (
            "Status & Waktu",
            {"fields": ("status", "last_update", "created_at")},
        ),
    )

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom = [
            path(
                "template-csv/",
                self.admin_site.admin_view(self._download_device_template),
                name="core_device_template_csv",
            ),
        ]
        return custom + urls

    def _download_device_template(self, request):
        import csv
        from django.http import HttpResponse
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="template_device.csv"'
        response.write("\ufeff")  # BOM untuk Excel
        writer = csv.writer(response)
        # Header lengkap — hanya kolom mcid yang wajib, lainnya boleh dikosongkan
        writer.writerow(["mcid", "mac_address", "factory", "line", "type_machine", "model_machine", "type_iot", "status"])
        writer.writerow(["M10068525", "48:55:19:EE:BC:AA", "FAC-C2", "LINE 5", "CNC", "DMU 50", "Sensor", "active"])
        writer.writerow(["M10068526", "48:55:19:EE:BC:BB", "FAC-C2", "LINE 6", "Conveyor", "CV-200", "Gateway", "active"])
        writer.writerow(["M10068527", "", "", "", "", "", "", ""])  # Contoh: hanya mcid diisi
        return response

    def changelist_view(self, request, extra_context=None):
        qs = Device.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(status=DeviceStatus.ACTIVE)),
            repair=Count("id", filter=Q(status=DeviceStatus.REPAIR)),
            broken=Count("id", filter=Q(status=DeviceStatus.BROKEN)),
        )
        extra_context = extra_context or {}
        extra_context["device_stats"] = qs
        extra_context["device_template_csv_url"] = "template-csv/"
        return super().changelist_view(request, extra_context=extra_context)

    @admin.display(description="Tipe Mesin", ordering="type_machine")
    def type_machine_badge(self, obj):
        if obj.type_machine:
            return format_html(
                '<span style="background:#f0f9ff;color:#0369a1;padding:2px 9px;border-radius:10px;font-size:0.8em;font-weight:500">{}</span>',
                obj.type_machine,
            )
        return format_html('<span style="color:#9ca3af;font-size:0.8em">—</span>')

    @admin.display(description="Model Mesin", ordering="model_machine")
    def model_machine_badge(self, obj):
        if obj.model_machine:
            return format_html(
                '<span style="background:#fdf4ff;color:#7e22ce;padding:2px 9px;border-radius:10px;font-size:0.8em;font-weight:500">{}</span>',
                obj.model_machine,
            )
        return format_html('<span style="color:#9ca3af;font-size:0.8em">—</span>')

    @admin.display(description="Tipe IoT", ordering="type_iot")
    def type_iot_badge(self, obj):
        if obj.type_iot:
            return format_html(
                '<span style="background:#f0fdf4;color:#15803d;padding:2px 9px;border-radius:10px;font-size:0.8em;font-weight:500">{}</span>',
                obj.type_iot,
            )
        return format_html('<span style="color:#9ca3af;font-size:0.8em">—</span>')

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        colors = {
            DeviceStatus.ACTIVE: ("#16a34a", "#dcfce7"),
            DeviceStatus.REPAIR: ("#d97706", "#fef3c7"),
            DeviceStatus.BROKEN: ("#dc2626", "#fee2e2"),
        }
        fg, bg = colors.get(obj.status, ("#374151", "#f3f4f6"))
        return format_html(
            '<span style="background:{};color:{};padding:2px 10px;border-radius:12px;font-size:0.8em;font-weight:600">{}</span>',
            bg, fg, obj.status.upper(),
        )

    actions = ["mark_active", "mark_repair", "mark_broken"]

    @admin.action(description="Tandai → Active")
    def mark_active(self, request, queryset):
        updated = queryset.update(status=DeviceStatus.ACTIVE)
        self.message_user(request, f"{updated} device ditandai Active.")

    @admin.action(description="Tandai → Repair")
    def mark_repair(self, request, queryset):
        updated = queryset.update(status=DeviceStatus.REPAIR)
        self.message_user(request, f"{updated} device ditandai Repair.")

    @admin.action(description="Tandai → Broken")
    def mark_broken(self, request, queryset):
        updated = queryset.update(status=DeviceStatus.BROKEN)
        self.message_user(request, f"{updated} device ditandai Broken.")


# ── Repair ────────────────────────────────────────────────────────────────────

@admin.register(Repair)
class RepairAdmin(ImportExportModelAdmin):
    resource_classes = [RepairResource]
    import_template_name = "admin/core/repair/import.html"
    list_display = (
        "mcid", "factory", "line",
        "device_type_machine_col", "device_model_machine_col", "device_type_iot_col",
        "problem_short", "status_badge", "date", "technician_name",
    )
    search_fields = ("mcid", "factory", "line", "technician_name", "problem")
    list_filter = ("status", "factory")
    list_per_page = 25
    date_hierarchy = "date"
    ordering = ("-date",)
    readonly_fields = ("id", "created_at")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("device")

    @admin.display(description="Tipe Mesin", ordering="device__type_machine")
    def device_type_machine_col(self, obj):
        val = getattr(obj.device, "type_machine", "") if obj.device else ""
        if val:
            return format_html(
                '<span style="background:#f0f9ff;color:#0369a1;padding:1px 7px;border-radius:8px;font-size:0.8em">{}</span>',
                val,
            )
        return format_html('<span style="color:#9ca3af">—</span>')

    @admin.display(description="Model Mesin", ordering="device__model_machine")
    def device_model_machine_col(self, obj):
        val = getattr(obj.device, "model_machine", "") if obj.device else ""
        if val:
            return format_html(
                '<span style="background:#fdf4ff;color:#7e22ce;padding:1px 7px;border-radius:8px;font-size:0.8em">{}</span>',
                val,
            )
        return format_html('<span style="color:#9ca3af">—</span>')

    @admin.display(description="Tipe IoT", ordering="device__type_iot")
    def device_type_iot_col(self, obj):
        val = getattr(obj.device, "type_iot", "") if obj.device else ""
        if val:
            return format_html(
                '<span style="background:#f0fdf4;color:#15803d;padding:1px 7px;border-radius:8px;font-size:0.8em">{}</span>',
                val,
            )
        return format_html('<span style="color:#9ca3af">—</span>')
    fieldsets = (
        (
            "Identifikasi",
            {"fields": ("id", "device", "mcid", "mac_address")},
        ),
        (
            "Lokasi",
            {"fields": ("factory", "line")},
        ),
        (
            "Detail Error",
            {"fields": ("date", "problem", "action", "technician_name", "photo_url")},
        ),
        (
            "Status",
            {"fields": ("status", "created_at")},
        ),
    )

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom = [
            path(
                "template-csv/",
                self.admin_site.admin_view(self._download_repair_template),
                name="core_repair_template_csv",
            ),
        ]
        return custom + urls

    def _download_repair_template(self, request):
        import csv
        from django.http import HttpResponse
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="template_repair.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow(["mcid", "mac_address", "factory", "line", "date", "problem", "action", "technician_name", "status"])
        writer.writerow(["M10068525", "48:55:19:EE:BC:AA", "FAC-C2", "LINE 5", "2026-03-09 08:00:00", "Sensor error", "Replace sensor", "Teknisi A", "pending"])
        return response

    def changelist_view(self, request, extra_context=None):
        qs = Repair.objects.aggregate(
            total=Count("id"),
            pending=Count("id", filter=Q(status=RepairStatus.PENDING)),
            completed=Count("id", filter=Q(status=RepairStatus.COMPLETED)),
            approved=Count("id", filter=Q(status=RepairStatus.APPROVED)),
        )
        extra_context = extra_context or {}
        extra_context["repair_stats"] = qs
        extra_context["repair_template_csv_url"] = "template-csv/"
        return super().changelist_view(request, extra_context=extra_context)

    @admin.display(description="Problem")
    def problem_short(self, obj):
        text = obj.problem
        if len(text) > 60:
            return format_html('<span title="{}">{}&hellip;</span>', text, text[:60])
        return text

    @admin.display(description="Status", ordering="status")
    def status_badge(self, obj):
        colors = {
            RepairStatus.PENDING: ("#d97706", "#fef3c7"),
            RepairStatus.COMPLETED: ("#16a34a", "#dcfce7"),
            RepairStatus.APPROVED: ("#2563eb", "#dbeafe"),
        }
        fg, bg = colors.get(obj.status, ("#374151", "#f3f4f6"))
        return format_html(
            '<span style="background:{};color:{};padding:2px 10px;border-radius:12px;font-size:0.8em;font-weight:600">{}</span>',
            bg, fg, obj.status.upper(),
        )

    actions = ["mark_completed", "mark_approved", "mark_pending"]

    @admin.action(description="Tandai → Completed")
    def mark_completed(self, request, queryset):
        updated = queryset.update(status=RepairStatus.COMPLETED)
        self.message_user(request, f"{updated} repair ditandai Completed.")

    @admin.action(description="Tandai → Approved")
    def mark_approved(self, request, queryset):
        updated = queryset.update(status=RepairStatus.APPROVED)
        self.message_user(request, f"{updated} repair ditandai Approved.")

    @admin.action(description="Tandai → Pending")
    def mark_pending(self, request, queryset):
        updated = queryset.update(status=RepairStatus.PENDING)
        self.message_user(request, f"{updated} repair dikembalikan ke Pending.")


# ── Activity Log ──────────────────────────────────────────────────────────────

@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp_col", "user_col", "action_badge", "description_col", "ip_address")
    list_filter = ("action", ("timestamp", admin.DateFieldListFilter))
    search_fields = ("user_email", "user_name", "description", "ip_address")
    list_per_page = 50
    ordering = ("-timestamp",)
    date_hierarchy = "timestamp"
    readonly_fields = ("id", "user", "user_email", "user_name", "action", "description", "ip_address", "timestamp")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    @admin.display(description="Waktu", ordering="timestamp")
    def timestamp_col(self, obj):
        return format_html(
            '<span style="white-space:nowrap;font-size:0.85em;color:#374151">{}</span>',
            obj.timestamp.strftime("%d %b %Y %H:%M:%S"),
        )

    @admin.display(description="User")
    def user_col(self, obj):
        name = obj.user_name or obj.user_email or "—"
        role_colors = {"admin": "#dc2626", "supervisor": "#d97706", "teknisi": "#2563eb"}
        if obj.user:
            color = role_colors.get(obj.user.role, "#6b7280")
            return format_html(
                '<span style="font-weight:600;color:{}">{}</span>'
                '<br><small style="color:#9ca3af;font-size:0.8em">{}</small>',
                color, name, obj.user.role,
            )
        return format_html('<span style="color:#9ca3af">{}</span>', name)

    @admin.display(description="Aksi")
    def action_badge(self, obj):
        colors = {
            "login":                ("#16a34a", "#dcfce7"),
            "logout":               ("#6b7280", "#f3f4f6"),
            "register":             ("#1d4ed8", "#dbeafe"),
            "create_repair":        ("#d97706", "#fef3c7"),
            "update_repair":        ("#2563eb", "#dbeafe"),
            "create_installation":  ("#0891b2", "#cffafe"),
            "import_data":          ("#065f46", "#d1fae5"),
            "export_data":          ("#9f1239", "#ffe4e6"),
        }
        fg, bg = colors.get(obj.action, ("#374151", "#f3f4f6"))
        label = dict(ActivityLog.ACTION_CHOICES).get(obj.action, obj.action)
        return format_html(
            '<span style="background:{};color:{};padding:2px 9px;border-radius:10px;'
            'font-size:0.78em;font-weight:600;white-space:nowrap">{}</span>',
            bg, fg, label,
        )

    @admin.display(description="Keterangan")
    def description_col(self, obj):
        text = obj.description or "—"
        if len(text) > 80:
            return format_html('<span title="{}">{}&hellip;</span>', text, text[:80])
        return text

    def changelist_view(self, request, extra_context=None):
        from django.db.models import Count
        extra_context = extra_context or {}
        stats = ActivityLog.objects.values("action").annotate(total=Count("id")).order_by("-total")
        extra_context["activity_stats"] = list(stats)
        extra_context["total_activities"] = ActivityLog.objects.count()
        extra_context["unique_users"] = ActivityLog.objects.values("user_email").distinct().count()
        return super().changelist_view(request, extra_context=extra_context)


# ── Installation ──────────────────────────────────────────────────────────────

from django.contrib.admin import AdminSite as _BaseAdminSite
from .views import admin_export_database_view as _export_db_view


class _IoTAdminSite(_BaseAdminSite):
    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom = [
            path(
                "tools/export-database/",
                self.admin_view(_export_db_view),
                name="export_database",
            ),
        ]
        return custom + urls

    def index(self, request, extra_context=None):
        import json
        from datetime import timedelta
        from django.db.models import Count, Q
        from django.db.models.functions import TruncDate
        from django.utils import timezone

        # Chart 1 – Error per Line per Factory (detail, for client-side filtering)
        errors_by_line_detail = list(
            Repair.objects.values("line", "factory")
            .annotate(
                total=Count("id"),
                pending=Count("id", filter=Q(status="pending")),
                completed=Count("id", filter=Q(status="completed")),
                approved=Count("id", filter=Q(status="approved")),
            )
            .order_by("line", "factory")
        )
        # Aggregate summary (all factories) for initial render
        errors_by_line = list(
            Repair.objects.values("line")
            .annotate(
                total=Count("id"),
                pending=Count("id", filter=Q(status="pending")),
                completed=Count("id", filter=Q(status="completed")),
                approved=Count("id", filter=Q(status="approved")),
            )
            .order_by("-total")[:15]
        )

        # Chart 2 – Device status doughnut
        devices_by_status = list(
            Device.objects.values("status").annotate(total=Count("id"))
        )

        # Chart 3 – Error per Factory
        errors_by_factory = list(
            Repair.objects.values("factory")
            .annotate(total=Count("id"))
            .order_by("-total")
        )

        # Chart 4 – Error trend per day per factory (14 hari terakhir)
        since = timezone.now() - timedelta(days=14)
        errors_trend_detail = [
            {"day": str(r["day"]), "factory": r["factory"], "total": r["total"]}
            for r in Repair.objects.filter(date__gte=since)
            .annotate(day=TruncDate("date"))
            .values("day", "factory")
            .annotate(total=Count("id"))
            .order_by("day", "factory")
        ]

        extra_context = extra_context or {}
        extra_context.update({
            "iot_errors_by_line":        json.dumps(errors_by_line),
            "iot_errors_by_line_detail": json.dumps(errors_by_line_detail),
            "iot_devices_by_status":     json.dumps(devices_by_status),
            "iot_errors_by_factory":     json.dumps(errors_by_factory),
            "iot_errors_trend_detail":   json.dumps(errors_trend_detail),
            "iot_summary": {
                "total_devices":   Device.objects.count(),
                "active_devices":  Device.objects.filter(status="active").count(),
                "total_repairs":   Repair.objects.count(),
                "pending_repairs": Repair.objects.filter(status="pending").count(),
            },
        })
        return super().index(request, extra_context)


admin.site.__class__ = _IoTAdminSite


@admin.register(Installation)
class InstallationAdmin(admin.ModelAdmin):
    list_display = ("mcid", "mac_address", "factory", "line", "date_install", "technician")
    search_fields = ("mcid", "mac_address", "factory", "line", "technician")
    list_filter = ("factory",)
    list_per_page = 25
    date_hierarchy = "date_install"
    ordering = ("-date_install",)
    readonly_fields = ("id", "created_at")
    fieldsets = (
        (
            "Identifikasi",
            {"fields": ("id", "device", "mcid", "mac_address")},
        ),
        (
            "Lokasi & Waktu",
            {"fields": ("factory", "line", "date_install", "technician")},
        ),
        (
            "Audit",
            {"fields": ("created_at",), "classes": ("collapse",)},
        ),
    )
