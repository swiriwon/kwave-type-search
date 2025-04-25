// filename: main.js

import { Actor } from 'apify';
import { PuppeteerCrawler, log as crawlerLog } from '@crawlee/puppeteer';
import fs from 'fs';
import path from 'path';

await Actor.init();

const input = await Actor.getInput();
const START_URL = input.startUrl;
const BRAND_LETTERS = input.brandLetters || ['A']; // Example: ['A', 'B', 'C']

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
                await page.waitForSelector('.alpabet-wrap', { timeout: 15000 });
                const alpabetBtn = await page.$(`.alpabet-wrap button[value="${letter.toUpperCase()}"]`);
                if (alpabetBtn) {
                    crawlerLog.info(`Expanding brand section for '${letter}'`);
                    await alpabetBtn.click();
                    await page.waitForTimeout(3000);

                    const brandLabels = await page.$$('.brand-list .checkbox input');
                    let checked = 0;

                    for (const checkbox of brandLabels) {
                        const labelText = await page.evaluate(el => el.closest('label')?.innerText?.trim() || '', checkbox);
                        if (labelText.toUpperCase().startsWith(letter.toUpperCase())) {
                            await checkbox.evaluate(el => el.click());
                            checked++;
                            await page.waitForTimeout(200);
                        }
                    }

                    crawlerLog.info(`Selected ${checked} brands starting with '${letter}'`);
                    await page.waitForTimeout(10000);
                    await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 60000 });
                } else {
                    crawlerLog.warning(`No A~Z button found for letter: ${letter}`);
                }
            } catch (e) {
                crawlerLog.warning(`Brand checkbox filtering failed for letter '${letter}': ${e.message}`);
            }

            try {
                await page.waitForSelector('#categoryProductList .prd-unit', { timeout: 120000 });
            } catch (e) {
                crawlerLog.error(`Failed on ${request.url}: ${e.message}`);
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
