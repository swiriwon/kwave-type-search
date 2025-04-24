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
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        await page.goto(request.url, { waitUntil: 'networkidle2' });

        await page.waitForSelector('#categoryProductList', { timeout: 30000 });

        await page.evaluate(() => {
            const select = document.querySelector('select[name="rows"]');
            if (select) select.value = "48";
            select?.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await page.waitForTimeout(3000);

        let loadCount = 0;
        while (true) {
            const moreButton = await page.$('.more .btn');
            if (!moreButton) break;
            await moreButton.click();
            loadCount++;
            log.info(`Clicked MORE button (${loadCount})`);
            await page.waitForTimeout(3000);
        }

        await page.waitForSelector('.brand-info', { timeout: 20000 });

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
        log.info(`Extracted ${data.length} products.`);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);

await Actor.exit();
