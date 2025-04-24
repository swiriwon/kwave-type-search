FROM apify/actor-node-puppeteer-chrome:18-21.1.0

USER root

# Clean Crawlee to prevent version conflicts
RUN rm -rf /home/myuser/node_modules/crawlee

# Setup app directory
RUN mkdir -p /home/myuser/app && chown -R myuser:myuser /home/myuser/app

WORKDIR /home/myuser/app

USER myuser

# Install deps
COPY package*.json ./
RUN npm install && \
    npm install @crawlee/puppeteer@3.13.2 --force && \
    npm list || true

# Copy app files
COPY . .

# Start the actor
CMD ["node", "--experimental-specifier-resolution=node", "main.js"]
