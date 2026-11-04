// Проверка: node scripts/smoke.js <prices.xlsx> <папка для снимков>
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const [prices, shots] = process.argv.slice(2); fs.mkdirSync(shots, {recursive: true});
  const browser = await chromium.launch({args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']});
  const errors = [], net = [];
  for (const vp of [{width: 1400, height: 900}, {width: 390, height: 844}]) {
    const ctx = await browser.newContext({viewport: vp, acceptDownloads: true});
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { if (!/GL Driver Message/.test(m.text())) errors.push(m.text()); } });
    page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) net.push(r.url()); });
    page.on('dialog', d => d.accept());
    await page.goto('file://' + path.resolve('dist/Ремонт_смета.html'));
    await page.click('#btnDemo');
    await page.screenshot({path: `${shots}/plan_${vp.width}.png`, fullPage: vp.width < 500});
    await page.click('[data-mode="3d"]'); await page.waitForTimeout(500);
    await page.screenshot({path: `${shots}/3d_${vp.width}.png`});
    await page.click('[data-scope="one"]'); await page.waitForTimeout(300);
    await page.screenshot({path: `${shots}/3d_one_${vp.width}.png`});
    await page.click('[data-mode="2d"]');
    // перетаскивание комнаты
    const before = await page.evaluate(() => P.rooms[0].x);
    await page.click('[data-scope="all"]');
    const box = await page.locator('#svg g[data-room] polygon').first().boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.down();
    await page.mouse.move(box.x + box.width/2 - 60, box.y + box.height/2, {steps: 5}); await page.mouse.up();
    const after = await page.evaluate(() => P.rooms[0].x);
    console.log('drag x', before, '->', after);
    // смета
    await page.click('[data-tab="Est"]');
    console.log('total:', await page.textContent('.total'));
    await page.screenshot({path: `${shots}/est_${vp.width}.png`, fullPage: true});
    // загрузка прайса
    await page.click('[data-tab="DB"]');
    await page.setInputFiles('#fileDB', prices);
    await page.waitForFunction(() => /prices/.test(DB.file), null, {timeout: 20000});
    console.log('db:', await page.evaluate(() => DB.items.map(m => `${m.cat}|${m.name}|${m.unit}|${m.price}|${m.rate}|${m.pack}`).join('\n')));
    await page.fill('#dbSearch', 'краска');
    await page.screenshot({path: `${shots}/db_${vp.width}.png`});
    // добавление материала
    await page.click('[data-tab="Est"]');
    await page.click('[data-pick]'); await page.fill('#pickSearch', 'штукатурка');
    await page.click('#pickList [data-mat]'); await page.click('#pickClose');
    console.log('last item:', await page.evaluate(() => JSON.stringify(itemCalc(P.rooms[0].items.at(-1), metrics(P.rooms[0])))));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]);
    console.log('export:', dl.suggestedFilename());
    await page.click('[data-tab="Plan"]'); const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log('width', vp.width, 'scrollWidth', sw);
    await ctx.close();
  }
  console.log('errors:', errors); console.log('network requests:', net);
  await browser.close();
})();
