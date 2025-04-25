// filename: main.js

import { Actor } from 'apify';
import { PuppeteerCrawler, log as crawlerLog } from '@crawlee/puppeteer';
import fs from 'fs';
import path from 'path';

await Actor.init();

const input = await Actor.getInput();
const START_URL = input.startUrl;
const BRAND_LETTERS = input.brandLetters || ['A'];

if (!START_URL || typeof START_URL !== 'string' || !START_URL.startsWith('http')) {
    throw new Error('Missing or invalid input URL. Please provide a full URL in the input field as "startUrl".');
}

crawlerLog.info('Starting scraper...');

const outputFolder = '/home/myuser/app/output/';
if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
}

const MAX_PRODUCTS = 1000;

for (const letter of BRAND_LETTERS) {
    const collectedData = [];
    const filePath = path.join(outputFolder, `product_names_${letter.toUpperCase()}.csv`);

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
            crawlerLog.info(`Processing ${request.url} for letter ${letter}`);

            await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });
    let found = false;
    for (let i = 0; i < 10; i++) {
        const exists = await page.$('#categoryProductList .prd-unit, .filter-box');
        if (exists) {
            found = true;
            break;
        }
        await page.waitForTimeout(3000);
    }
    if (!found) throw new Error('Product or filter UI not found');
            } catch (e) {
                crawlerLog.warning(`Initial load failed. Retrying once...`);
                await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });
let foundRetry = false;
for (let i = 0; i < 10; i++) {
    const existsRetry = await page.$('#categoryProductList .prd-unit, .filter-box');
    if (existsRetry) {
        foundRetry = true;
        break;
    }
    await page.waitForTimeout(3000);
}
if (!foundRetry) throw new Error('Retry: Product or filter UI not found');
            }

            try {
                await page.waitForSelector('.option-list .select > button', { timeout: 30000 });
                await page.click('.option-list .select > button');
                await page.waitForSelector('.option-list ul li', { timeout: 15000 });
                await page.click('li button[data-viewcnt="48"]');
                await page.waitForTimeout(10000);
            } catch (err) {
                crawlerLog.warning('Failed to switch to 48 view mode. Continuing without it.');
            }

            try {
                crawlerLog.info(`Scrolling and filtering all brands starting with '${letter}'`);
                await page.waitForSelector('.filter-box .filter-list', { timeout: 20000 });
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(3000);

                const checkboxes = await page.$$('.filter-box .filter-list label');
                let checked = 0;

                for (const label of checkboxes) {
                    const text = await label.evaluate(el => el.textContent?.trim().toUpperCase());
                    if (text && text.startsWith(letter.toUpperCase())) {
                        const checkbox = await label.$('input[type="checkbox"]');
                        if (checkbox) {
                            await checkbox.evaluate(cb => cb.click());
                            await page.waitForTimeout(200);
                            checked++;
                        }
                    }
                }

                crawlerLog.info(`Checked ${checked} brand filters for '${letter}'`);
                await page.waitForTimeout(10000);
                await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 60000 });
            } catch (err) {
                crawlerLog.warning(`Brand sidebar filtering failed for letter '${letter}': ${err.message}`);
                return;
            }

            try {
                await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 120000 });
            } catch (e) {
                crawlerLog.error(`Failed to load product list on ${request.url}: ${e.message}`);
                return;
            }

            while (true) {
                if (collectedData.length >= MAX_PRODUCTS) {
                    crawlerLog.warning(`Reached max scrape limit of ${MAX_PRODUCTS} products.`);
                    break;
                }

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

            crawlerLog.info(`Extracted ${data.length} products for '${letter}'.`);
            collectedData.push(...data);

            if (collectedData.length >= MAX_PRODUCTS) {
                crawlerLog.info(`Stopping early after collecting ${collectedData.length} products.`);
            }
        },
    });

    await crawler.run([START_URL]);

    const csvHeader = 'url,brand,product';
    const csvRows = collectedData.slice(0, MAX_PRODUCTS).map(r => `${r.url},${r.brand},${r.product}`);
    fs.writeFileSync(filePath, [csvHeader, ...csvRows].join('\n'));

    crawlerLog.info(`✅ File saved to ${filePath}`);
    await Actor.pushData(collectedData.slice(0, MAX_PRODUCTS));
}

await Actor.exit();
