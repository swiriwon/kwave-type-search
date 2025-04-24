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
            // Try selecting 48 view mode
            const selectBox = await page.$('.select-box');
            if (selectBox) {
                await selectBox.click();
                await page.waitForTimeout(1000);

                const button48 = await page.$('button[data-value="48"]');
                if (button48) {
                    await button48.click();
                    await page.waitForTimeout(3000);
                } else {
                    log.warning('Button with data-value="48" not found.');
                }
            } else {
                log.warning('Select box for view mode not found.');
            }

            // Keep clicking MORE button until it's gone or max tries
            let tries = 0;
            while (tries < 70) {
                const moreBtn = await page.$('.more .btn');
                if (!moreBtn) break;
                await moreBtn.evaluate(el => el.click());
                await page.waitForTimeout(2500);
                await page.evaluate(() => window.scrollBy(0, 1000));
                tries++;
                log.info(`Clicked MORE button [${tries}]`);
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
        } catch (err) {
            log.error(`Failed on ${request.url}: ${err.message}`);
        }
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);

await Actor.exit();
