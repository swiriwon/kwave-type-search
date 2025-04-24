FROM apify/actor-node-puppeteer-chrome:18-21.1.0

USER root

RUN rm -rf /home/myuser/node_modules/crawlee
RUN mkdir -p /home/myuser/app && chown -R myuser:myuser /home/myuser/app

WORKDIR /home/myuser/app

USER myuser

COPY package*.json ./

RUN npm install && \
    npm list || true

COPY . .

CMD ["node", "--experimental-specifier-resolution=node", "main.js"]
