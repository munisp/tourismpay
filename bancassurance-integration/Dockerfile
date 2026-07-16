FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o service .

FROM gcr.io/distroless/static-debian11
WORKDIR /app
COPY --from=builder /app/service .
EXPOSE 8092
ENTRYPOINT ["/app/service"]
