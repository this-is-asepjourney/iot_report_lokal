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


class RepairStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    COMPLETED = "completed", "Completed"
    APPROVED = "approved", "Approved"


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
        managed = False


class Device(models.Model):
    id = models.CharField(primary_key=True, max_length=100, default=generate_id, editable=False)
    mcid = models.CharField(max_length=100, unique=True)
    mac_address = models.CharField(max_length=100, blank=True, default="")
    factory = models.CharField(max_length=100)
    line = models.CharField(max_length=100)
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
        managed = False


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
        managed = False


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
        managed = False

