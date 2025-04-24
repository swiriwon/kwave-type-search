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
    requestHandlerTimeoutSecs: 260,
    navigationTimeoutSecs: 100,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        await page.goto(request.url, { waitUntil: 'networkidle2' });

        await page.waitForSelector('#categoryProductList', { timeout: 90000 });

        // Switch to view 48 items per page
        const view48Selector = '.sort-area .sort-box .option-list button[data-viewcnt="48"]';
        const view48Btn = await page.$(view48Selector);
        if (view48Btn) {
            await view48Btn.click();
            await page.waitForTimeout(9000);
        }

        // Click "More" until all products are loaded
        while (true) {
            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;

            const disabled = await moreBtn.evaluate(el => el.classList.contains('disabled'));
            if (disabled) break;

            log.info('Clicking MORE button...');
            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(9000);
        }

        log.info('Extracting data...');
        const data = await page.evaluate(() => {
            const rows = [];
            document.querySelectorAll('#categoryProductList .prd-unit').forEach(el => {
                const brand = el.querySelector('.brand-info dt')?.innerText?.trim() || '';
                const product = el.querySelector('.brand-info dd')?.innerText?.trim() || '';
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
