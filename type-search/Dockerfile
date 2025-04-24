FROM apify/actor-node-puppeteer:16

WORKDIR /home/myuser/app
COPY type-search/ ./
RUN npm install

CMD ["npm", "start"]
