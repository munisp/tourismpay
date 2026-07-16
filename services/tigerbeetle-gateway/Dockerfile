FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o tigerbeetle-gateway .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app/tigerbeetle-gateway /tigerbeetle-gateway
EXPOSE 8081
USER nonroot:nonroot
ENTRYPOINT ["/tigerbeetle-gateway"]
