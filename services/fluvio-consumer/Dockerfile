FROM rust:1.81-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/target/release/fluvio-consumer /fluvio-consumer
EXPOSE 8082
USER nonroot:nonroot
ENTRYPOINT ["/fluvio-consumer"]
