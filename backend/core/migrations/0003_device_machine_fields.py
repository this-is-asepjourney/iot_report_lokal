from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_activity_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='device',
            name='type_machine',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Tipe Mesin'),
        ),
        migrations.AddField(
            model_name='device',
            name='model_machine',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Model Mesin'),
        ),
        migrations.AddField(
            model_name='device',
            name='type_iot',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='Tipe IoT'),
        ),
    ]
