

# Multi-stage build for Node.js application
FROM node:22.16.0-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (use npm install instead of npm ci for compatibility)
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22.16.0-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client ./client

# Create logs directory
RUN mkdir -p /app/logs

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 --ingroup nodejs appuser

# Set correct permissions
RUN chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5000

# Environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["npm", "start"]
