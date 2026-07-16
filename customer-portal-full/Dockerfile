FROM node:22-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy application
COPY server.cjs .
COPY dist/ ./dist/
COPY platform-hardening-migration.sql .

# Security: non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5002

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5002/health || exit 1

CMD ["node", "server.cjs"]
