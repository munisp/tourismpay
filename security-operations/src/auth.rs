use actix_web::dev::{ServiceRequest, ServiceResponse, Transform, Service};
use std::env;
use std::future::{Ready, ready};
use std::pin::Pin;

pub struct RequireAuth;

impl<S, B> Transform<S, ServiceRequest> for RequireAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = actix_web::Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = actix_web::Error;
    type Transform = RequireAuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequireAuthMiddleware { service }))
    }
}

pub struct RequireAuthMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for RequireAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = actix_web::Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = actix_web::Error;
    type Future = Pin<Box<dyn std::future::Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, ctx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.service.poll_ready(ctx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let path = req.path().to_string();
        if path == "/health" || path == "/healthz" || path == "/ready" {
            let fut = self.service.call(req);
            return Box::pin(async move { fut.await });
        }

        if env::var("APP_ENV").unwrap_or_default() == "development"
            || env::var("RUST_ENV").unwrap_or_default() == "development"
        {
            let fut = self.service.call(req);
            return Box::pin(async move { fut.await });
        }

        let auth_header = req
            .headers()
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .unwrap_or_default();

        if !auth_header.starts_with("Bearer ") || auth_header.len() < 27 {
            return Box::pin(async move {
                Err(actix_web::error::ErrorUnauthorized(
                    r#"{"error":"unauthorized","message":"Bearer token required"}"#,
                ))
            });
        }

        let token = &auth_header[7..];
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Box::pin(async move {
                Err(actix_web::error::ErrorUnauthorized(
                    r#"{"error":"invalid_token","message":"Malformed JWT"}"#,
                ))
            });
        }

        let fut = self.service.call(req);
        Box::pin(async move { fut.await })
    }
}
