from django import forms
from django.contrib import admin
from django.contrib.auth.hashers import make_password

from .models import Device, Installation, Repair, User


class UserAdminForm(forms.ModelForm):
    password = forms.CharField(
        required=False,
        widget=forms.PasswordInput(render_value=False),
        help_text="Isi untuk set/ubah password. Kosongkan jika tidak diubah.",
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
    list_display = ("email", "name", "role", "created_at")
    search_fields = ("email", "name")
    list_filter = ("role",)
    readonly_fields = ("id", "created_at", "password_hash")
    fieldsets = (
        (
            "Informasi User",
            {
                "fields": (
                    "id",
                    "name",
                    "email",
                    "role",
                    "factory_access",
                    "created_at",
                )
            },
        ),
        (
            "Keamanan",
            {
                "fields": ("password", "password_hash"),
                "description": "Password akan disimpan sebagai hash ke database PostgreSQL.",
            },
        ),
    )


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("mcid", "mac_address", "factory", "line", "status", "last_update")
    search_fields = ("mcid", "mac_address", "factory", "line")
    list_filter = ("status", "factory", "line")
    readonly_fields = ("id", "last_update", "created_at")


@admin.register(Repair)
class RepairAdmin(admin.ModelAdmin):
    list_display = ("mcid", "factory", "line", "status", "date", "technician_name")
    search_fields = ("mcid", "factory", "line", "technician_name", "problem")
    list_filter = ("status", "factory", "line")
    readonly_fields = ("id", "created_at")


@admin.register(Installation)
class InstallationAdmin(admin.ModelAdmin):
    list_display = ("mcid", "factory", "line", "date_install", "technician")
    search_fields = ("mcid", "factory", "line", "technician")
    list_filter = ("factory", "line")
    readonly_fields = ("id", "created_at")
