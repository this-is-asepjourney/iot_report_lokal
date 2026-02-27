from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminUserDetailAPIView,
    AdminUserListAPIView,
    AuthLoginAPIView,
    AuthLogoutAPIView,
    AuthMeAPIView,
    AuthRegisterAPIView,
    DashboardSummaryAPIView,
    DeviceViewSet,
    DeviceExportAPIView,
    DeviceImportAPIView,
    InstallationViewSet,
    InstallationImportAPIView,
    RepairViewSet,
    RepairExportAPIView,
    RepairImportAPIView,
    UserImportAPIView,
)

router = DefaultRouter()
router.register(r"devices", DeviceViewSet)
router.register(r"repairs", RepairViewSet)
router.register(r"installations", InstallationViewSet)

urlpatterns = [
    path("auth/register/", AuthRegisterAPIView.as_view()),
    path("auth/login/", AuthLoginAPIView.as_view()),
    path("auth/me/", AuthMeAPIView.as_view()),
    path("auth/logout/", AuthLogoutAPIView.as_view()),
    path("admin/import/devices/", DeviceImportAPIView.as_view()),
    path("admin/import/repairs/", RepairImportAPIView.as_view()),
    path("admin/import/installations/", InstallationImportAPIView.as_view()),
    path("admin/import/users/", UserImportAPIView.as_view()),
    path("admin/users/", AdminUserListAPIView.as_view()),
    path("admin/users/<str:user_id>/", AdminUserDetailAPIView.as_view()),
    path("export/devices.csv", DeviceExportAPIView.as_view()),
    path("export/repairs.csv", RepairExportAPIView.as_view()),
    path("dashboard/summary/", DashboardSummaryAPIView.as_view()),
    path("", include(router.urls)),
]

