############################
# 1️⃣ Build stage
############################
FROM node:24-bullseye AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    pkg-config \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* yarn.lock* ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile

# Copy app source and build
COPY . .
RUN pnpm run build || echo "No build step"


############################
# 2️⃣ Runtime stage
############################
FROM node:24-bullseye-slim

# Install ffmpeg and pnpm for runtime
RUN apt-get update && apt-get install -y ffmpeg \
 && npm install -g pnpm \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app from builder
COPY --from=builder /app /app

EXPOSE 3000

CMD ["pnpm", "run", "start:prod"]

