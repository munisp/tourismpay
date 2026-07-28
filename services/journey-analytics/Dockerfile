FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV HTTP_PORT=8105
EXPOSE 8105

CMD ["python", "main.py"]
