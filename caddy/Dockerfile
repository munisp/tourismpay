FROM caddy:2.7.6-builder AS builder

RUN xcaddy build \
    --with github.com/greenpau/caddy-security \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/fabriziosalmi/caddy-waf \
    --with github.com/pberkel/caddy-storage-redis \
    --with github.com/caddyserver/caddy-l4

FROM caddy:2.7.6

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Create directories for certs if needed
RUN mkdir -p /etc/caddy/certs

# Set environment variables for Caddy
ENV CADDY_OAUTH_SECRET=""
ENV CADDY_JWT_SECRET=""

EXPOSE 80 443 2019

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
