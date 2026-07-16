FROM python:3.12-slim AS base
WORKDIR /app
RUN addgroup --system app && adduser --system --group app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
RUN chown -R app:app /app
USER app
EXPOSE 8085
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8085/health')"
ENTRYPOINT ["python3", "main.py"]
