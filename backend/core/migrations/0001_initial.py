import core.models
import django.contrib.postgres.fields
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="User",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.models.generate_id,
                        editable=False,
                        max_length=100,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("email", models.EmailField(max_length=254, unique=True)),
                (
                    "password_hash",
                    models.CharField(
                        blank=True,
                        db_column="passwordHash",
                        max_length=255,
                        null=True,
                    ),
                ),
                (
                    "role",
                    models.CharField(
                        choices=[
                            ("teknisi", "Teknisi"),
                            ("supervisor", "Supervisor"),
                            ("admin", "Admin"),
                        ],
                        default="teknisi",
                        max_length=20,
                    ),
                ),
                (
                    "factory_access",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.TextField(),
                        blank=True,
                        default=list,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, db_column="createdAt"),
                ),
            ],
            options={
                "db_table": "User",
            },
        ),
        migrations.CreateModel(
            name="Device",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.models.generate_id,
                        editable=False,
                        max_length=100,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("mcid", models.CharField(max_length=100, unique=True)),
                ("mac_address", models.CharField(blank=True, default="", max_length=100)),
                ("factory", models.CharField(max_length=100)),
                ("line", models.CharField(max_length=100)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("active", "Active"),
                            ("repair", "Repair"),
                            ("broken", "Broken"),
                        ],
                        default="active",
                        max_length=20,
                    ),
                ),
                ("last_update", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "Device",
            },
        ),
        migrations.CreateModel(
            name="Repair",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.models.generate_id,
                        editable=False,
                        max_length=100,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="repairs",
                        to="core.device",
                    ),
                ),
                ("mcid", models.CharField(max_length=100)),
                ("mac_address", models.CharField(blank=True, default="", max_length=100)),
                ("factory", models.CharField(max_length=100)),
                ("line", models.CharField(max_length=100)),
                ("date", models.DateTimeField()),
                ("problem", models.TextField()),
                ("action", models.TextField(blank=True, default="")),
                ("technician_name", models.CharField(max_length=255)),
                ("photo_url", models.URLField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("completed", "Completed"),
                            ("approved", "Approved"),
                        ],
                        default="pending",
                        max_length=20,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, db_column="createdAt"),
                ),
            ],
            options={
                "db_table": "Repair",
            },
        ),
        migrations.CreateModel(
            name="Installation",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=core.models.generate_id,
                        editable=False,
                        max_length=100,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("mcid", models.CharField(max_length=100)),
                ("mac_address", models.CharField(blank=True, default="", max_length=100)),
                ("factory", models.CharField(max_length=100)),
                ("line", models.CharField(max_length=100)),
                ("date_install", models.DateTimeField()),
                ("technician", models.CharField(max_length=255)),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, db_column="createdAt"),
                ),
                (
                    "device",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="installations",
                        to="core.device",
                    ),
                ),
            ],
            options={
                "db_table": "Installation",
            },
        ),
    ]
