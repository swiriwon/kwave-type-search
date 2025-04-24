// filename: main.js

import { Actor } from 'apify';
import { PuppeteerCrawler, log as crawlerLog } from '@crawlee/puppeteer';
import fs from 'fs';
import path from 'path';

await Actor.init();

const input = await Actor.getInput();
const START_URL = input.startUrl;

if (!START_URL || typeof START_URL !== 'string' || !START_URL.startsWith('http')) {
    throw new Error('Missing or invalid input URL. Please provide a full URL in the input field as "startUrl".');
}

crawlerLog.info('Starting scraper...');

const outputFolder = '/home/myuser/app/output/';
const filePath = path.join(outputFolder, 'product_names.csv');

if (!fs.existsSync(outputFolder)) {
    crawlerLog.info(`Creating directory: ${outputFolder}`);
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
    requestHandlerTimeoutSecs: 1800,
    navigationTimeoutSecs: 300,
    async requestHandler({ page, request }) {
        crawlerLog.info(`Processing ${request.url}`);

        try {
            await page.waitForSelector('.option-list button', { timeout: 60000 });
            const viewButtons = await page.$$('.option-list button');
            for (const btn of viewButtons) {
                const text = await page.evaluate(el => el.innerText.trim(), btn);
                if (text.includes('48')) {
                    crawlerLog.info('Switching to 48 view mode...');
                    await btn.click();
                    await page.waitForTimeout(15000);
                    break;
                }
            }
        } catch (err) {
            crawlerLog.warning('Failed to switch to 48 view mode. Continuing without it.');
        }

        try {
            await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 120000 });
        } catch (e) {
            crawlerLog.error(`Failed on ${request.url}: ${e.message}`);
            return;
        }

        let retries = 3;
        let lastCount = 0;

        while (retries > 0) {
            crawlerLog.info('Extracting data...');

            const data = await page.evaluate(() => {
                const rows = [];
                document.querySelectorAll('.prd-unit').forEach((unit) => {
                    const brand = unit.querySelector('.brand-info dt')?.innerText?.trim() || '';
                    const product = unit.querySelector('.brand-info dd')?.innerText?.trim() || '';
                    if (brand && product) {
                        rows.push({ url: window.location.href, brand, product });
                    }
                });
                return rows;
            });

            crawlerLog.info(`Extracted ${data.length} products.`);
            const newCount = collectedData.length + data.length;
            collectedData.push(...data);

            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;

            crawlerLog.info('Clicking MORE button...');
            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(10000);

            try {
                await page.waitForFunction(
                    (prev) => document.querySelectorAll('.prd-unit').length > prev,
                    { timeout: 150000 },
                    newCount
                );
            } catch (e) {
                retries--;
                crawlerLog.warning(`Retrying load after MORE button. Retries left: ${retries}`);
                if (retries === 0) {
                    crawlerLog.warning('Assuming no more products or page stuck. Exiting loop.');
                    break;
                }
            }
        }

        crawlerLog.info('Finished loading all products.');
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

crawlerLog.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);
await Actor.exit();
