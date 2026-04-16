import os

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand

from core.models import User, UserRole


class Command(BaseCommand):
    help = "Membuat akun admin pertama jika belum ada user sama sekali di database."

    def handle(self, *args, **options):
        if User.objects.exists():
            self.stdout.write(self.style.WARNING("User sudah ada, skip pembuatan admin awal."))
            return

        email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        password = os.getenv("ADMIN_PASSWORD", "admin123")
        name = os.getenv("ADMIN_NAME", "Administrator")

        User.objects.create(
            name=name,
            email=email,
            password_hash=make_password(password),
            role=UserRole.ADMIN,
            factory_access=[],
        )
        self.stdout.write(
            self.style.SUCCESS(f"Admin awal berhasil dibuat: {email}")
        )
