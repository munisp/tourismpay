FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-jdk-headless \
    libgeos-dev \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8104
HEALTHCHECK --interval=30s --timeout=10s CMD python -c "import httpx; httpx.get('http://localhost:8104/health').raise_for_status()"
CMD ["python", "main.py"]
