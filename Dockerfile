# syntax=docker/dockerfile:1
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application sources
COPY packages/ ./packages/
COPY backend/ ./backend/
COPY simulator/ ./simulator/
COPY profiles/ ./profiles/
COPY infra/ ./infra/
COPY sbom.json .

# Install twin-core package in editable/development mode
RUN pip install --no-cache-dir -e ./packages/twin-core

# Create non-privileged user and writable data directories
RUN useradd -m -u 1001 uavtwin && \
    mkdir -p /app/data && \
    chown -R uavtwin:uavtwin /app

USER uavtwin

EXPOSE 8000 8765

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health/live || exit 1

CMD ["python", "backend/inference.py"]
