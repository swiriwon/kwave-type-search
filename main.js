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
    requestHandlerTimeoutSecs: 600,
    navigationTimeoutSecs: 180,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        try {
            await page.waitForSelector('.option-list button', { timeout: 20000 });
            const viewButtons = await page.$$('.option-list button');
            for (const btn of viewButtons) {
                const text = await page.evaluate(el => el.innerText.trim(), btn);
                if (text.includes('48')) {
                    log.info('Switching to 48 view mode...');
                    await btn.click();
                    await page.waitForTimeout(8000);
                    break;
                }
            }
        } catch (err) {
            log.warn('Failed to switch to 48 view mode. Continuing without it.');
        }

        try {
            await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 30000 });
        } catch (e) {
            log.error(`Failed on ${request.url}: ${e.message}`);
            return;
        }

        while (true) {
            log.info('Extracting data...');

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

            log.info(`Extracted ${data.length} products.`);
            collectedData.push(...data);

            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;

            log.info('Clicking MORE button...');
            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(8000);

            try {
                await page.waitForSelector('.brand-info', { timeout: 30000 });
            } catch (e) {
                log.warn('Timeout after clicking MORE, assuming no more products or very slow load.');
                break;
            }
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
