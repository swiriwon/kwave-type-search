FROM apify/actor-node-puppeteer:16

COPY . ./
RUN npm install
CMD ["npm", "start"]
