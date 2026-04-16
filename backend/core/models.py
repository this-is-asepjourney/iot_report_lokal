from django.db import models
from django.contrib.postgres.fields import ArrayField
import uuid


def generate_id() -> str:
    return uuid.uuid4().hex


class UserRole(models.TextChoices):
    TEKNISI = "teknisi", "Teknisi"
    SUPERVISOR = "supervisor", "Supervisor"
    ADMIN = "admin", "Admin"


class DeviceStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    REPAIR = "repair", "Repair"
    BROKEN = "broken", "Broken"
    NONAKTIF = "nonaktif", "Nonaktif"  # Dicopot / tidak dipakai lagi


class RepairStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    COMPLETED = "completed", "Completed"
    APPROVED = "approved", "Approved"
    DICOPOT = "dicopot", "Dicopot"  # Perangkat dilepas dari line


class User(models.Model):
    id = models.CharField(primary_key=True, max_length=100, default=generate_id, editable=False)
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255, null=True, blank=True, db_column="passwordHash")
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.TEKNISI,
    )
    factory_access = ArrayField(
        base_field=models.TextField(),
        default=list,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_column="createdAt")

    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"

    class Meta:
        db_table = "User"


class Device(models.Model):
    id = models.CharField(primary_key=True, max_length=100, default=generate_id, editable=False)
    mcid = models.CharField(max_length=100, unique=True)
    mac_address = models.CharField(max_length=100, blank=True, default="")
    factory = models.CharField(max_length=100, blank=True, default="")
    line = models.CharField(max_length=100, blank=True, default="")
    type_machine = models.CharField(max_length=100, blank=True, default="", verbose_name="Tipe Mesin")
    model_machine = models.CharField(max_length=100, blank=True, default="", verbose_name="Model Mesin")
    type_iot = models.CharField(max_length=100, blank=True, default="", verbose_name="Tipe IoT")
    status = models.CharField(
        max_length=20,
        choices=DeviceStatus.choices,
        default=DeviceStatus.ACTIVE,
    )
    last_update = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.mcid} - {self.factory}/{self.line}"

    class Meta:
        db_table = "Device"


class Repair(models.Model):
    id = models.CharField(primary_key=True, max_length=100, default=generate_id, editable=False)
    device = models.ForeignKey(
        Device,
        related_name="repairs",
        on_delete=models.CASCADE,
    )
    mcid = models.CharField(max_length=100)
    mac_address = models.CharField(max_length=100, blank=True, default="")
    factory = models.CharField(max_length=100)
    line = models.CharField(max_length=100)
    date = models.DateTimeField()
    problem = models.TextField()
    action = models.TextField(blank=True, default="")
    technician_name = models.CharField(max_length=255)
    photo_url = models.URLField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=RepairStatus.choices,
        default=RepairStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True, db_column="createdAt")

    def __str__(self) -> str:
        return f"{self.mcid} - {self.problem[:30]}"

    class Meta:
        db_table = "Repair"


class Installation(models.Model):
    id = models.CharField(primary_key=True, max_length=100, default=generate_id, editable=False)
    mcid = models.CharField(max_length=100)
    mac_address = models.CharField(max_length=100, blank=True, default="")
    factory = models.CharField(max_length=100)
    line = models.CharField(max_length=100)
    date_install = models.DateTimeField()
    technician = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True, db_column="createdAt")

    device = models.ForeignKey(
        Device,
        related_name="installations",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )

    def __str__(self) -> str:
        return f"{self.mcid} - {self.factory}/{self.line}"

    class Meta:
        db_table = "Installation"


class ActivityLog(models.Model):
    ACTION_LOGIN = "login"
    ACTION_LOGOUT = "logout"
    ACTION_REGISTER = "register"
    ACTION_CREATE_REPAIR = "create_repair"
    ACTION_UPDATE_REPAIR = "update_repair"
    ACTION_DICOPOT = "dicopot"
    ACTION_CREATE_INSTALLATION = "create_installation"
    ACTION_IMPORT = "import_data"
    ACTION_EXPORT = "export_data"

    ACTION_CHOICES = [
        (ACTION_LOGIN, "Login"),
        (ACTION_LOGOUT, "Logout"),
        (ACTION_REGISTER, "Registrasi User"),
        (ACTION_CREATE_REPAIR, "Buat Laporan Error"),
        (ACTION_UPDATE_REPAIR, "Update Repair"),
        (ACTION_DICOPOT, "Dicopot Perangkat"),
        (ACTION_CREATE_INSTALLATION, "Instalasi Perangkat"),
        (ACTION_IMPORT, "Import Data"),
        (ACTION_EXPORT, "Export Data"),
    ]

    id = models.CharField(primary_key=True, max_length=100, default=generate_id, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities"
    )
    user_email = models.CharField(max_length=255, blank=True, db_index=True)
    user_name = models.CharField(max_length=255, blank=True)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES, db_index=True)
    description = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self) -> str:
        ts = self.timestamp.strftime("%Y-%m-%d %H:%M") if self.timestamp else "—"
        return f"{self.user_email} — {self.action} @ {ts}"

    class Meta:
        db_table = "ActivityLog"
        ordering = ["-timestamp"]
        verbose_name = "Activity Log"
        verbose_name_plural = "Activity Logs"

