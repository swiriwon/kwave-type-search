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
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    },
    requestHandlerTimeoutSecs: 180,
    navigationTimeoutSecs: 90,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);
        await page.waitForSelector('.prd_list_area', { timeout: 30000 });

        let prevCount = 0;

        while (true) {
            await page.waitForSelector('.brand-info', { timeout: 30000 });

            const products = await page.$$('.brand-info');
            const currentCount = products.length;

            log.info(`Found ${currentCount} items...`);

            if (currentCount > prevCount) {
                prevCount = currentCount;
            } else {
                log.info('No new items loaded, exiting loop.');
                break;
            }

            const moreBtn = await page.$('.more .btn:not(.disabled)');
            if (!moreBtn) {
                log.info('MORE button not found or disabled.');
                break;
            }

            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(2000);
        }

        // Final collection
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
        log.info(`Collected ${data.length} products`);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);
await Actor.exit();
