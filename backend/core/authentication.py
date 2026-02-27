from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from .models import User

JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = 24


def issue_jwt_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRES_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=JWT_ALGORITHM)


class CoreTokenAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None

        token_key = auth_header.replace("Bearer ", "", 1).strip()
        if not token_key:
            raise exceptions.AuthenticationFailed("Token tidak valid.")

        try:
            payload = jwt.decode(
                token_key,
                settings.SECRET_KEY,
                algorithms=[JWT_ALGORITHM],
            )
            user_id = payload.get("sub")
        except jwt.ExpiredSignatureError as exc:
            raise exceptions.AuthenticationFailed("Token sudah expired.") from exc
        except jwt.InvalidTokenError as exc:
            raise exceptions.AuthenticationFailed("Token tidak valid.") from exc

        user = User.objects.filter(id=user_id).first()
        if not user:
            raise exceptions.AuthenticationFailed("User tidak ditemukan.")

        return (user, token_key)
