from django.contrib.auth import get_user_model
from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.hashers import check_password

from .models import User as CoreUser


class CoreAdminAuthBackend(BaseBackend):
    """
    Authenticate Django admin users against Core User table.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        email = username or kwargs.get("email")
        if not email or not password:
            return None

        core_user = CoreUser.objects.filter(email=email).first()
        if not core_user or not core_user.password_hash:
            return None
        if not check_password(password, core_user.password_hash):
            return None

        django_user_model = get_user_model()
        django_user, _ = django_user_model.objects.get_or_create(
            username=core_user.email,
            defaults={
                "email": core_user.email,
                "first_name": core_user.name,
            },
        )

        django_user.email = core_user.email
        django_user.first_name = core_user.name
        django_user.is_active = True
        django_user.is_staff = core_user.role == "admin"
        django_user.is_superuser = core_user.role == "admin"
        django_user.save(
            update_fields=[
                "email",
                "first_name",
                "is_active",
                "is_staff",
                "is_superuser",
            ]
        )
        return django_user

    def get_user(self, user_id):
        django_user_model = get_user_model()
        try:
            return django_user_model.objects.get(pk=user_id)
        except django_user_model.DoesNotExist:
            return None
