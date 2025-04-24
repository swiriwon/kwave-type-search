FROM apify/actor-node-puppeteer-chrome:18-21.1.0

USER root

# Clean any existing Crawlee module
RUN rm -rf /home/myuser/node_modules/crawlee

# Prepare application folder
RUN mkdir -p /home/myuser/app && chown -R myuser:myuser /home/myuser/app

WORKDIR /home/myuser/app

USER myuser

# Copy dependency info
COPY package*.json ./

# Install dependencies
RUN npm install && \
    npm install @crawlee/puppeteer@3.13.0 --force && \
    npm list || true

# Copy project files
COPY . .

# Default command
CMD ["node", "--experimental-specifier-resolution=node", "main.js"]
