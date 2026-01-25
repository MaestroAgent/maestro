FROM node:22-slim

# Install build dependencies for better-sqlite3 and git for cloning repos
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for TypeScript build)
RUN npm ci

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Create non-root user for security (required for Claude Code)
RUN useradd -m -s /bin/bash maestro

# Create directories for data, logs, and projects
RUN mkdir -p /app/data /app/logs /app/projects

# Change ownership to non-root user
RUN chown -R maestro:maestro /app

# Switch to non-root user
USER maestro

# Default to API mode, can be overridden
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run the compiled JavaScript
CMD ["node", "dist/index.js"]
