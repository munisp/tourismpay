#!/bin/bash
# Generate Python code from protobuf definitions

set -e

echo "Generating Python protobuf code..."

python -m grpc_tools.protoc \
    -I./proto \
    --python_out=./src \
    --grpc_python_out=./src \
    ./proto/externalscaler.proto

echo "Protobuf code generated successfully!"
echo "Generated files:"
echo "  - src/externalscaler_pb2.py"
echo "  - src/externalscaler_pb2_grpc.py"
