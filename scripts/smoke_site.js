// Проверка сайта: node scripts/smoke_site.js  (поднимает локальный сервер из корня репозитория)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json'};
const srv = http.createServer((q, s) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html';
  const p = path.join(root, f); if (!p.startsWith(root) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, {'content-type': types[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(s); });
srv.listen(0, async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch(); const ctx = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await ctx.newPage(); const errors = [], ext = []; let body = null;
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await ctx.route('https://api.openai.com/**', r => { body = JSON.parse(r.request().postData()); r.fulfill({json: {choices: [{message: {content: 'работает'}}]}, headers: {'access-control-allow-origin': '*'}}); });
  ctx.on('request', r => { const u = r.url(); if (!u.startsWith(url) && !/^(blob|data):/.test(u) && !u.startsWith('https://api.openai.com/')) ext.push(u); });
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, {timeout: 10000});
  console.log('manifest:', (await (await page.request.get(url + 'manifest.webmanifest')).json()).short_name);
  await page.click('#btnDemo');
  await page.click('#btnAI');
  console.log('preset/model by default:', await page.inputValue('#aiPreset'), await page.inputValue('#aiModel'));
  await page.fill('#aiKey', 'sk-test'); await page.click('#aiTest'); await page.waitForSelector('#aiNote .okbox');
  console.log('openai body keys:', Object.keys(body).join(','), 'model', body.model);
  await page.click('[data-close="aiModal"]');
  // без интернета: перезагрузка берёт сохранённую копию, данные на месте
  await page.waitForTimeout(500); await ctx.setOffline(true); await page.reload();
  console.log('offline reload, rooms:', await page.evaluate(() => P.rooms.length), 'title:', await page.title());
  await ctx.setOffline(false);
  await page.screenshot({path: '/tmp/rshots/site_390.png'});
  console.log('errors:', errors.filter(e => !/ERR_INTERNET_DISCONNECTED/.test(e))); console.log('other network requests:', ext);
  await browser.close(); srv.close();
});
