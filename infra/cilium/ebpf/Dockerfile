# ─────────────────────────────────────────────────────────────────────────────
# TourismPay eBPF Loader — Multi-stage build
#
# Stage 1: Compile eBPF C programs with clang/LLVM
# Stage 2: Build Go loader with CGO disabled
# Stage 3: Minimal runtime image (privileged DaemonSet)
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: eBPF C compilation
FROM ubuntu:24.04 AS ebpf-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang-17 \
    llvm-17 \
    libbpf-dev \
    linux-headers-generic \
    linux-libc-dev \
    libelf-dev \
    gcc \
    make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY src/ ./

# Compile wallet rate limiter
RUN clang-17 -O2 -g -target bpf \
    -D__TARGET_ARCH_x86 \
    -I/usr/include/x86_64-linux-gnu \
    -I/usr/include/bpf \
    -c wallet_ratelimit.c -o wallet_ratelimit.o

# Compile fraud detector
RUN clang-17 -O2 -g -target bpf \
    -D__TARGET_ARCH_x86 \
    -I/usr/include/x86_64-linux-gnu \
    -I/usr/include/bpf \
    -c fraud_detector.c -o fraud_detector.o

# Stage 2: Go loader build
FROM golang:1.22-bookworm AS go-builder

WORKDIR /app

COPY loader/go.mod loader/go.sum* ./
RUN go mod download

COPY loader/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o ebpf-loader .

# Stage 3: Runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libelf1 \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=ebpf-builder /src/wallet_ratelimit.o .
COPY --from=ebpf-builder /src/fraud_detector.o .
COPY --from=go-builder /app/ebpf-loader .

# eBPF programs require privileged access
# The DaemonSet spec sets securityContext.privileged: true
ENTRYPOINT ["/app/ebpf-loader"]
CMD ["--iface", "eth0", "--fraud-endpoint", "http://fraud-ml-service:8080", "--metrics-addr", ":9099"]
