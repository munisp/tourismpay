FROM rust:1.77-slim AS builder
WORKDIR /app
COPY Cargo.toml ./
COPY src/ src/
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/zero-trust-network /server
EXPOSE 8094
CMD ["/server"]
