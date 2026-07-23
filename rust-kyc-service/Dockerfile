FROM rust:1.90-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src/ ./src/
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
RUN cargo build --release --jobs 2

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/tourismpay-kyc-service /usr/local/bin/
ENV KYC_PORT=8082
EXPOSE 8082
CMD ["tourismpay-kyc-service"]
