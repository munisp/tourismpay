FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o temporal-worker .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/temporal-worker /temporal-worker
USER nonroot:nonroot
ENTRYPOINT ["/temporal-worker"]
