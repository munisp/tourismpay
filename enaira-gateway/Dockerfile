FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o enaira-gateway .

FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/enaira-gateway /enaira-gateway
EXPOSE 8095
ENTRYPOINT ["/enaira-gateway"]
