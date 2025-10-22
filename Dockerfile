FROM node:20-slim

# Install Chromium and required system libraries for Puppeteer
# Note: If libappindicator3-1 is unavailable on your Debian variant, replace it with libayatana-appindicator3-1
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      libappindicator3-1 \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use system Chromium and avoid downloading Chromium during npm install to keep image small
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --production

# Copy source files and wrapper script
COPY bin/ ./bin/
COPY src/ ./src/
COPY sleepiq ./sleepiq
COPY tsconfig.json ./tsconfig.json

# Make wrapper executable, create sessions dir, fix ownership and perms
RUN chmod +x sleepiq && \
    mkdir -p .sessions && \
    chown -R node:node /app && \
    chmod 700 .sessions

# Run as non-root to allow Chromium sandbox to work
USER node

# CLI entrypoint. JSON output will go to stdout, logs to stderr (as implemented by your CLI).
ENTRYPOINT ["node", "bin/sleepiq"]

# No ports exposed; this is a CLI tool
