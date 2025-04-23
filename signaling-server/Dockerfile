# Stage 1: Build dependencies
FROM node:22-bullseye-slim AS builder
WORKDIR /app

# Install build tools and Git (needed for uWS build from git)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including native builds)
RUN pnpm install

# Stage 2: Production environment
FROM node:22-bullseye-slim
WORKDIR /app

# Only install runtime dependencies if absolutely necessary.
# Git might be needed if 'uWebSockets.js' needs it at runtime, but unlikely.
# For a minimal image, try removing the following RUN line first.
# If it fails, add back only what's strictly needed (e.g., maybe just git if runtime fetching occurs).
# RUN apt-get update && apt-get install -y --no-install-recommends git && apt-get clean && rm -rf /var/lib/apt/lists/*

# We need pnpm to execute the start command defined in package.json
RUN npm install -g pnpm

# Copy built node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=9000

# Expose the port
EXPOSE 9000

# Start the application using the corrected 'start' script
# User 'node' is often preferred for security instead of root
# USER node
CMD ["pnpm", "start"]