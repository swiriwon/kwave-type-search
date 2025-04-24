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
    requestHandlerTimeoutSecs: 180,
    navigationTimeoutSecs: 90,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        try {
            await page.waitForSelector('.option-box .select-box', { timeout: 30000 });
            await page.click('.option-box .select-box');

            const option48Selector = '.option-list button[data-value="48"]';
            await page.waitForSelector(option48Selector, { timeout: 10000 });
            await page.click(option48Selector);
            await page.waitForTimeout(5000);
        } catch (e) {
            log.warning('Failed to switch to 48 view mode. Continuing without it.');
        }

        while (true) {
            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;
            log.info('Clicking MORE button...');
            await moreBtn.click();
            await page.waitForTimeout(3000);
        }

        await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 30000 });

        const data = await page.evaluate(() => {
            const rows = [];
            document.querySelectorAll('#categoryProductList .prd-unit').forEach((unit) => {
                const brand = unit.querySelector('.brand-info dt')?.innerText.trim() || '';
                const product = unit.querySelector('.brand-info dd')?.innerText.trim() || '';
                if (brand && product) {
                    rows.push({ url: window.location.href, brand, product });
                }
            });
            return rows;
        });

        log.info(`Extracted ${data.length} products.`);
        collectedData.push(...data);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);

await Actor.exit();
