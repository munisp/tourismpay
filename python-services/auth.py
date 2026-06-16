"""
Shared authentication middleware for TourismPay Python services.
Supports API key (X-API-Key header) and JWT Bearer token validation.
Skips authentication for /health, /docs, /openapi.json endpoints.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import base64
import time
from typing import Optional

from fastapi import HTTPException, Security, Request
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from starlette.middleware.base import BaseHTTPMiddleware

API_KEY_NAME = "X-API-Key"
_api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)
_bearer_scheme = HTTPBearer(auto_error=False)

UNPROTECTED_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


def _get_api_key() -> str:
    key = os.environ.get("SERVICE_API_KEY", "")
    if not key:
        key = os.environ.get("SETTLEMENT_API_KEY", "")
    return key


def _get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "")


def _base64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def _verify_jwt(token: str) -> dict:
    secret = _get_jwt_secret()
    if not secret:
        raise ValueError("JWT_SECRET not configured")

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT token")

    header_b64, payload_b64, signature_b64 = parts

    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected_sig = hmac.new(
        secret.encode(), signing_input, hashlib.sha256
    ).digest()
    actual_sig = _base64url_decode(signature_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid token signature")

    payload = json.loads(_base64url_decode(payload_b64))
    exp = payload.get("exp")
    if exp and time.time() > exp:
        raise ValueError("Token expired")

    return payload


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces authentication on all routes except /health and /docs.
    Accepts X-API-Key header or Authorization: Bearer <jwt>.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/") or "/"
        if path in UNPROTECTED_PATHS:
            return await call_next(request)

        # Check X-API-Key
        api_key = request.headers.get(API_KEY_NAME)
        if api_key:
            expected = _get_api_key()
            if expected and hmac.compare_digest(api_key, expected):
                return await call_next(request)
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid API key"},
            )

        # Check Bearer token
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                _verify_jwt(token)
                return await call_next(request)
            except ValueError as e:
                return JSONResponse(
                    status_code=401,
                    content={"detail": str(e)},
                )

        return JSONResponse(
            status_code=401,
            content={"detail": "Authorization required. Provide X-API-Key or Bearer token."},
        )


async def verify_service_auth(
    api_key: Optional[str] = Security(_api_key_header),
    bearer: Optional[HTTPAuthorizationCredentials] = Security(_bearer_scheme),
) -> dict:
    """
    FastAPI dependency (alternative to middleware) that validates either:
    1. X-API-Key header matching SERVICE_API_KEY env var
    2. Bearer JWT token signed with JWT_SECRET
    """
    if api_key:
        expected = _get_api_key()
        if expected and hmac.compare_digest(api_key, expected):
            return {"auth": "api_key", "service": True}
        raise HTTPException(status_code=401, detail="Invalid API key")

    if bearer:
        try:
            claims = _verify_jwt(bearer.credentials)
            return {"auth": "jwt", "sub": claims.get("sub"), "role": claims.get("role")}
        except ValueError as e:
            raise HTTPException(status_code=401, detail=str(e))

    raise HTTPException(
        status_code=401,
        detail="Authorization required. Provide X-API-Key or Bearer token.",
    )
