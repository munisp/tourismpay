# KYC AI Engine — Multi-stage build with pre-downloaded models
# Stage 1: Base with dependencies
FROM python:3.11-slim AS base

WORKDIR /app

# System dependencies for OpenCV, PaddleOCR, MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender1 \
    libgomp1 wget curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Model download (cached layer — only invalidated when models change)
FROM base AS models

COPY download_models.py .
COPY . .

# Pre-download models during build (cached in Docker layer)
# This layer is ~4GB but cached — subsequent builds skip this step
RUN python download_models.py || echo "Some models failed — service will use fallbacks"

# Stage 3: Production runtime
FROM base AS production

COPY --from=models /root/.paddleocr /root/.paddleocr
COPY --from=models /root/.cache /root/.cache
COPY --from=models /root/.insightface /root/.insightface
COPY --from=models /torch /torch
COPY --from=models /app/models /app/models

COPY . .

ENV PYTHONPATH=/app
ENV KYC_AI_PORT=8100
ENV WORKERS=2
ENV OMP_NUM_THREADS=2
ENV MKL_NUM_THREADS=2

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8100/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2", "--timeout-keep-alive", "120"]
