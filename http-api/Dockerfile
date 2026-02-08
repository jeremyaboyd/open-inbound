FROM node:20-alpine

WORKDIR /app

# Install dependencies for building native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install --production=false

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Copy static assets into dist
RUN mkdir -p dist/public && cp -r src/public/* dist/public/

# Expose HTTP port
EXPOSE 3000

# Run the service
CMD ["node", "dist/index.js"]
