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
    navigationTimeoutSecs: 60,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);

        await page.goto(request.url, { waitUntil: 'networkidle2' });

        try {
            await page.waitForSelector('.prd_list_area li, .prd_list_type li', { timeout: 45000 });
        } catch (e) {
            log.error('❌ Selector timeout, saving screenshot...');
            await page.screenshot({ path: path.join(outputFolder, 'timeout.png') });
            throw e;
        }

        // Set to view 48 products per click
        await page.select('select[name="rows"]', '48');
        await page.waitForTimeout(3000);

        let lastLoaded = 0;
        while (true) {
            const newCount = await page.$$eval('.prd_list_area li', els => els.length);
            if (newCount <= lastLoaded) break;
            lastLoaded = newCount;

            const moreBtn = await page.$('.more .btn');
            if (!moreBtn) break;

            log.info(`Clicking MORE button... (${newCount} items)`);
            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(3500);
        }

        const data = await page.evaluate(() => {
            const rows = [];
            document.querySelectorAll('.prd_list_area li').forEach((el) => {
                const brand = el.querySelector('.brand-info dt')?.innerText?.trim() || '';
                const product = el.querySelector('.brand-info dd')?.innerText?.trim() || '';
                if (brand && product) {
                    rows.push({ url: window.location.href, brand, product });
                }
            });
            return rows;
        });

        collectedData.push(...data);
        log.info(`Collected ${data.length} items from page.`);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);

await Actor.exit();
