FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY ml/requirements.txt /app/ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt

# Copy ML code
COPY ml/ /app/ml/

# Default: run inference server
ENV ML_MODEL_DIR=/app/ml/saved_models
ENV ML_INFERENCE_PORT=8200

EXPOSE 8200

CMD ["python", "-m", "uvicorn", "ml.inference.serve:app", "--host", "0.0.0.0", "--port", "8200"]
