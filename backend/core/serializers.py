from rest_framework import serializers
from django.contrib.auth.hashers import make_password

from .models import Device, Installation, Repair, User, UserRole


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = "__all__"


class RepairSerializer(serializers.ModelSerializer):
    class Meta:
        model = Repair
        fields = "__all__"


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

