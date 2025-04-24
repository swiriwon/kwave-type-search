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
    requestHandlerTimeoutSecs: 300,
    navigationTimeoutSecs: 120,
    async requestHandler({ page, request }) {
        log.info(`Processing ${request.url}`);
        await page.goto(request.url, { waitUntil: 'networkidle2' });

        await page.waitForSelector('.prd_list_area', { timeout: 30000 });

        // Set 48 items per view if selector exists
        const view48 = await page.$('button[title="48개씩 보기"]');
        if (view48) {
            log.info('Switching to 48 items per view...');
            await view48.click();
            await page.waitForTimeout(3000);
        }

        while (true) {
            await page.waitForSelector('.brand-info', { timeout: 30000 });

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

            const moreText = await page.$eval('.more .count', el => el.textContent.trim()).catch(() => '');
            const moreBtn = await page.$('.more .btn');

            log.info(`Loaded: ${moreText}`);
            if (moreText.includes('43 / 43') || !moreBtn) {
                log.info('Reached final batch. Exiting...');
                break;
            }

            log.info('Clicking MORE button...');
            await moreBtn.evaluate(el => el.click());
            await page.waitForTimeout(3000);
        }

        log.info(`Finished collecting items.`);
    },
});

await crawler.run([START_URL]);

const csvHeader = 'url,brand,product';
const csvRows = collectedData.map(r => `${r.url},${r.brand},${r.product}`);
fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

log.info(`✅ File saved to ${filePath}`);
await Actor.pushData(collectedData);
await Actor.exit();
