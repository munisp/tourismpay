FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy proto files and generate code
COPY proto/ ./proto/
COPY generate_proto.sh .
RUN chmod +x generate_proto.sh && ./generate_proto.sh

# Copy source code
COPY src/ ./src/

# Expose gRPC port
EXPOSE 50051

# Run scaler service
CMD ["python", "src/scaler_service.py"]
