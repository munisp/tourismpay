use actix_web::dev::{Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::{Error, HttpMessage, HttpResponse, body::EitherBody};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::env;
use std::future::{self, Ready, Future};
use std::pin::Pin;
use std::task::{Context, Poll};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub role: Option<String>,
    pub exp: Option<i64>,
}

pub struct JwtAuth;

impl<S, B> Transform<S, ServiceRequest> for JwtAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = JwtAuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        future::ready(Ok(JwtAuthMiddleware { service }))
    }
}

pub struct JwtAuthMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for JwtAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        // Check X-API-Key first
        if let Some(api_key) = req.headers().get("X-API-Key") {
            let expected = env::var("KYC_API_KEY").unwrap_or_default();
            if !expected.is_empty() && api_key.as_bytes() == expected.as_bytes() {
                req.extensions_mut().insert(JwtClaims {
                    sub: "service".to_string(),
                    role: Some("service".to_string()),
                    exp: None,
                });
                let fut = self.service.call(req);
                return Box::pin(async move {
                    let res = fut.await?;
                    Ok(res.map_into_left_body())
                });
            }
        }

        // Check Bearer token
        let auth_header = req.headers().get("Authorization").and_then(|v| v.to_str().ok());

        let token = match auth_header {
            Some(h) if h.starts_with("Bearer ") => &h[7..],
            _ => {
                let response = HttpResponse::Unauthorized()
                    .json(serde_json::json!({"error": "Authorization required", "code": "MISSING_AUTH"}));
                return Box::pin(future::ready(Ok(req.into_response(response).map_into_right_body())));
            }
        };

        match validate_jwt(token) {
            Ok(claims) => {
                req.extensions_mut().insert(claims);
                let fut = self.service.call(req);
                Box::pin(async move {
                    let res = fut.await?;
                    Ok(res.map_into_left_body())
                })
            }
            Err(e) => {
                let response = HttpResponse::Unauthorized()
                    .json(serde_json::json!({"error": e, "code": "INVALID_TOKEN"}));
                Box::pin(future::ready(Ok(req.into_response(response).map_into_right_body())))
            }
        }
    }
}

fn get_jwt_secret() -> Vec<u8> {
    env::var("JWT_SECRET")
        .or_else(|_| env::var("SESSION_SECRET"))
        .unwrap_or_else(|_| "tourismpay-kyc-dev-secret".to_string())
        .into_bytes()
}

fn validate_jwt(token: &str) -> Result<JwtClaims, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid token format".to_string());
    }

    let secret = get_jwt_secret();
    let signing_input = format!("{}.{}", parts[0], parts[1]);

    let mut mac = HmacSha256::new_from_slice(&secret)
        .map_err(|_| "HMAC init failed".to_string())?;
    mac.update(signing_input.as_bytes());
    let expected_sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

    if parts[2] != expected_sig {
        return Err("Invalid token signature".to_string());
    }

    let payload = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| "Invalid token payload".to_string())?;

    let claims: JwtClaims = serde_json::from_slice(&payload)
        .map_err(|_| "Invalid token claims".to_string())?;

    if let Some(exp) = claims.exp {
        let now = chrono::Utc::now().timestamp();
        if now > exp {
            return Err("Token expired".to_string());
        }
    }

    if claims.sub.is_empty() {
        return Err("Token missing subject".to_string());
    }

    Ok(claims)
}
