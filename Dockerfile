FROM node:22-slim

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs

# Default to API mode, can be overridden
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run the compiled JavaScript
CMD ["node", "dist/index.js"]
