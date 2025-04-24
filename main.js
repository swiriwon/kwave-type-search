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
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 90,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        await page.goto(request.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#categoryProductList', { timeout: 60000 });

        // Set view mode to 48 items per click (if exists)
        const view48 = await page.$('button[data-page-size="48"]');
        if (view48) {
            await view48.click();
            await page.waitForTimeout(3000);
        }

        // Click MORE button repeatedly
        while (true) {
            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;
            await moreBtn.evaluate(btn => btn.click());
            await page.waitForTimeout(3000);

            // Wait until products grow
            await page.waitForFunction(() => {
                return document.querySelectorAll('#categoryProductList > li').length > 0;
            }, { timeout: 60000 });
        }

        // Extract product data
        const data = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('#categoryProductList > li').forEach((el) => {
                const brand = el.querySelector('.brand-info dt')?.innerText?.trim() || '';
                const product = el.querySelector('.brand-info dd')?.innerText?.trim() || '';
                const href = el.querySelector('a')?.href || '';
                if (brand && product) {
                    items.push({ url: href, brand, product });
                }
            });
            return items;
        });

        collectedData.push(...data);
        log.info(`Extracted ${data.length} products.`);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},"${r.brand}","${r.product}"`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);
await Actor.exit();
