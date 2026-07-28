FROM rust:1.76-alpine AS builder
RUN apk add --no-cache musl-dev openssl-dev pkgconfig
WORKDIR /app
COPY Cargo.toml .
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true
COPY src src/
RUN touch src/main.rs && cargo build --release

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata openssl
WORKDIR /app
COPY --from=builder /app/target/release/accessibility_service ./service
EXPOSE 8103
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8103/health || exit 1
CMD ["./service"]
