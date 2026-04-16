from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_device_machine_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='device',
            name='factory',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterField(
            model_name='device',
            name='line',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
