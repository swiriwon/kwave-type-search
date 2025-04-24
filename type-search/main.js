// filename: main.js

import { Actor } from 'apify';
import { PuppeteerCrawler, log } from '@crawlee/puppeteer';
import fs from 'fs';
import path from 'path';

await Actor.init();

const input = await Actor.getInput();
const START_URL = input.startUrl;

if (!START_URL || typeof START_URL !== 'string' || !START_URL.startsWith('http')) {
    throw new Error('Missing or invalid input URL. Please provide a full URL in the input field as "startUrl".');
}

log.info('Starting scraper...');

const outputFolder = '/home/myuser/app/output/';
const filePath = path.join(outputFolder, 'product_names.csv');

if (!fs.existsSync(outputFolder)) {
    log.info(`Creating directory: ${outputFolder}`);
    fs.mkdirSync(outputFolder, { recursive: true });
}

const collectedData = [];

const crawler = new PuppeteerCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    },
    requestHandlerTimeoutSecs: 90,
    navigationTimeoutSecs: 60,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        while (true) {
            await page.waitForSelector('.brand-info', { timeout: 30000 });

            const data = await page.evaluate(() => {
                const rows = [];
                document.querySelectorAll('.brand-info').forEach((el) => {
                    const brand = el.querySelector('dt')?.innerText?.trim() || '';
                    const product = el.querySelector('dd')?.innerText?.trim() || '';
                    if (brand && product) {
                        rows.push({ url: window.location.href, brand, product });
                    }
                });
                return rows;
            });

            collectedData.push(...data);

            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;

            log.info('Clicking MORE button...');
            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(3000);
        }

        log.info('Finished loading all products.');
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);

await Actor.exit();
