import uuid
from rest_framework import serializers
from django.contrib.auth.hashers import make_password
from django.core.files.storage import default_storage

from .models import Device, Installation, Repair, User, UserRole


def save_repair_photo(photo_file, context) -> str | None:
    """Simpan file foto ke media/repairs/, kembalikan URL publik."""
    if not photo_file:
        return None
    ext = (photo_file.name or "").split(".")[-1] or "jpg"
    if ext.lower() not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    name = f"repairs/{uuid.uuid4().hex}.{ext}"
    path = default_storage.save(name, photo_file)
    request = context.get("request")
    if request:
        return request.build_absolute_uri(default_storage.url(path))
    return default_storage.url(path)


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = "__all__"

    def create(self, validated_data):
        """Upsert by MCID: jika MCID sudah ada, update device tersebut; jika belum, buat baru."""
        mcid = (validated_data.get("mcid") or "").strip()
        if not mcid:
            return super().create(validated_data)
        existing = Device.objects.filter(mcid__iexact=mcid).first()
        if existing:
            for key, value in validated_data.items():
                setattr(existing, key, value)
            existing.save()
            return existing
        return super().create(validated_data)


class RepairSerializer(serializers.ModelSerializer):
    # Izinkan device tidak dikirim / bernilai null; akan di-handle di create().
    device = serializers.PrimaryKeyRelatedField(
        queryset=Device.objects.all(), required=False, allow_null=True
    )
    # Upload foto: file disimpan di media, URL disimpan di photo_url.
    photo = serializers.ImageField(required=False, write_only=True, allow_null=True)

    # Info mesin dari device terkait (read-only, untuk tampilan di frontend)
    device_type_machine = serializers.SerializerMethodField()
    device_model_machine = serializers.SerializerMethodField()
    device_type_iot = serializers.SerializerMethodField()

    class Meta:
        model = Repair
        fields = "__all__"
        # technician_name di-set otomatis dari user login di perform_create ViewSet;
        # jadikan optional agar frontend tidak perlu mengirimnya.
        extra_kwargs = {
            "technician_name": {"required": False, "default": ""},
        }

    def get_device_type_machine(self, obj) -> str:
        return getattr(obj.device, "type_machine", "") or ""

    def get_device_model_machine(self, obj) -> str:
        return getattr(obj.device, "model_machine", "") or ""

    def get_device_type_iot(self, obj) -> str:
        return getattr(obj.device, "type_iot", "") or ""

    def _inject_photo_url(self, validated_data):
        photo_file = validated_data.pop("photo", None)
        if photo_file:
            validated_data["photo_url"] = save_repair_photo(photo_file, self.context)

    @staticmethod
    def _sync_device_location(device, factory, line, mac):
        """Update factory/line/mac_address device sesuai data repair terbaru."""
        fields: list[str] = []
        if factory and device.factory != factory:
            device.factory = factory
            fields.append("factory")
        if line and device.line != line:
            device.line = line
            fields.append("line")
        if mac and device.mac_address != mac:
            device.mac_address = mac
            fields.append("mac_address")
        return fields

    @staticmethod
    def _sync_device_status(device, repair_status, exclude_repair_id=None):
        """
        Sinkronkan Device.status berdasarkan status repair aktif:
        - pending             → device = 'repair'
        - completed/approved  → jika tidak ada pending lain, device = 'active'
        - dicopot             → device = 'nonaktif' (dilepas dari line)
        """
        if repair_status == "dicopot":
            if device.status != "nonaktif":
                device.status = "nonaktif"
                return True
        elif repair_status == "pending":
            if device.status != "repair":
                device.status = "repair"
                return True
        elif repair_status in ("completed", "approved"):
            qs = Repair.objects.filter(device=device, status="pending")
            if exclude_repair_id:
                qs = qs.exclude(id=exclude_repair_id)
            if not qs.exists() and device.status not in ("active", "nonaktif"):
                device.status = "active"
                return True
        return False

    def create(self, validated_data):
        """
        Buat Repair baru.
        - Jika device tidak dikirim, cari/buat berdasarkan mcid.
        - Selalu sinkronkan factory/line/mac_address dan status Device.
        - Jika sudah ada repair pending untuk device ini, update repair itu
          (hindari duplikasi) sekaligus perbarui lokasi device.
        """
        self._inject_photo_url(validated_data)

        mcid    = validated_data.get("mcid", "")
        factory = validated_data.get("factory", "")
        line    = validated_data.get("line", "")
        mac     = validated_data.get("mac_address", "")

        device = validated_data.get("device")
        if not device:
            if not mcid:
                raise serializers.ValidationError({"mcid": "MCID wajib diisi."})

            device = Device.objects.filter(mcid__iexact=mcid).first()
            if device:
                # Update lokasi/MAC device sesuai data repair terbaru
                loc_fields = self._sync_device_location(device, factory, line, mac)
                if loc_fields:
                    device.save(update_fields=loc_fields)
            else:
                device = Device.objects.create(
                    mcid=mcid,
                    mac_address=mac or "",
                    factory=factory,
                    line=line,
                )
            validated_data["device"] = device

        # Jika sudah ada repair pending untuk device ini, update saja (hindari duplikat)
        repair_status = validated_data.get("status", "pending")
        pending = Repair.objects.filter(device=device, status="pending").order_by("-date").first()
        if pending:
            for key, value in validated_data.items():
                if key != "id":
                    setattr(pending, key, value)
            pending.save()
            repair_obj = pending
        else:
            repair_obj = super().create(validated_data)

        # Sinkronkan status Device
        if self._sync_device_status(device, repair_status):
            device.save(update_fields=["status"])

        return repair_obj

    def update(self, instance, validated_data):
        """
        Update Repair.
        - Sinkronkan factory/line/mac_address ke Device terkait.
        - Sinkronkan status Device berdasarkan status repair baru.
        """
        self._inject_photo_url(validated_data)

        device = getattr(instance, "device", None)
        if device:
            factory = validated_data.get("factory")
            line    = validated_data.get("line")
            mac     = validated_data.get("mac_address")

            # Sinkronkan lokasi/MAC
            loc_fields = self._sync_device_location(
                device,
                factory or "",
                line or "",
                mac or "",
            )

            # Sinkronkan status Device berdasarkan status repair baru
            new_status = validated_data.get("status", instance.status)
            status_changed = self._sync_device_status(
                device, new_status, exclude_repair_id=instance.id
            )
            if status_changed:
                loc_fields.append("status")

            if loc_fields:
                device.save(update_fields=loc_fields)

        return super().update(instance, validated_data)


class InstallationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Installation
        fields = "__all__"


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email", "role", "factory_access", "created_at"]


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=6, write_only=True)
    role = serializers.ChoiceField(choices=UserRole.choices, default=UserRole.TEKNISI, required=False)
    factory_access = serializers.ListField(
        child=serializers.CharField(max_length=100), required=False, default=list
    )

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email sudah terdaftar.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create(
            password_hash=make_password(password),
            **validated_data,
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

