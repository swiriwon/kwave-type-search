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
            await page.waitForSelector('.option-list', { timeout: 60000 });
            const buttons = await page.$$('.option-list button');

            for (const btn of buttons) {
                const text = await page.evaluate(el => el.textContent.trim(), btn);
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

        while (true) {
            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) {
                crawlerLog.info('No MORE button found. Assuming all products are loaded.');
                break;
            }

            const prevCount = await page.$$eval('.prd-unit', els => els.length);
            crawlerLog.info(`Current product count: ${prevCount}`);

            crawlerLog.info('Clicking MORE button...');
            await moreBtn.evaluate(el => el.click());
            
            let retries = 5;
            while (retries > 0) {
                try {
                    await page.waitForFunction(
                        (count) => document.querySelectorAll('.prd-unit').length > count,
                        { timeout: 20000 },
                        prevCount
                    );
                    crawlerLog.info('New products loaded.');
                    break;
                } catch (err) {
                    retries--;
                    crawlerLog.warning(`Products not fully loaded yet. Retries left: ${retries}`);
                    await page.waitForTimeout(5000);
                    if (retries === 0) crawlerLog.warning('Moving on despite possible missing products.');
                }
            }
        }

        crawlerLog.info('Extracting product data...');

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

        crawlerLog.info(`Extracted total ${data.length} products.`);
        collectedData.push(...data);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

crawlerLog.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);
await Actor.exit();
