# Multi-stage production container for FYERS Live Market Station
FROM node:22-bookworm-slim

# Install system dependencies: Python 3, pip, compilation tools for native SQLite
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    build-essential \
    curl \
    sqlite3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./
COPY requirements.txt ./

# Install Node and Python dependencies
RUN npm ci
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy source code and assets
COPY . .

# Build Vite frontend and compile server / supervisor bundles
RUN npm run build

# Create persistent storage directories
RUN mkdir -p /app/backups /app/data

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV WORKER_PORT=3001
ENV AUTO_ARCHIVE_TIME=15:40

# Expose HTTP port
EXPOSE 3000

# Health check against server status
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/server/status || exit 1

# Start supervisor process
CMD ["npm", "start"]
