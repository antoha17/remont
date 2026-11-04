// Проверка ИИ-функций с подставными ответами (настоящий сервис не вызывается).
// node scripts/smoke_ai.js <папка для снимков>
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const shots = process.argv[2] || '/tmp/rshots'; fs.mkdirSync(shots, {recursive: true});
  const browser = await chromium.launch();
  // 1) делаем PDF со «схемой» (выдуманной)
  const pg0 = await browser.newPage();
  await pg0.setContent(`<div style="font:20px Arial;padding:40px"><h2>План квартиры (выдуманный)</h2>
    <svg width="600" height="400"><rect x="20" y="20" width="340" height="260" fill="none" stroke="#000" stroke-width="6"/><rect x="360" y="20" width="220" height="260" fill="none" stroke="#000" stroke-width="6"/>
    <text x="150" y="150">Кухня 12,0</text><text x="420" y="150">Санузел</text><text x="150" y="15">4000</text><text x="440" y="15">2500</text><text x="0" y="160">3000</text></svg></div>`);
  const pdfPath = path.join(shots, 'plan_test.pdf'); await pg0.pdf({path: pdfPath, format: 'A4'}); await pg0.close();
  const ctx = await browser.newContext({viewport: {width: 1300, height: 900}});
  const page = await ctx.newPage(); const errors = [], net = [], aiCalls = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  page.on('request', r => { const u = r.url(); if (!/^(file|blob|data):/.test(u) && !u.startsWith('https://openrouter.ai/')) net.push(u); });
  const PLAN = {rooms: [
    {name: 'Кухня', area: 12.0, h: 2.75, x: 0, y: 0, walls: [{dir: 'R', len: 4}, {dir: 'D', len: 3}, {dir: 'L', len: 4}, {dir: 'U', len: 3}], openings: [{type: 'window', wall: 0, pos: 1.4, w: 1.2, h: null, sill: null}, {type: 'door', wall: 1, pos: 1, w: 0.8}]},
    {name: 'Санузел', area: 7.0, h: null, x: 4.1, y: 0, walls: [{dir: 'R', len: 2.5}, {dir: 'D', len: 3}, {dir: 'L', len: 2.5}, {dir: 'U', len: 3}], openings: [{type: 'door', wall: 3, pos: 1, w: 0.8}]}],
    notes: 'Высота санузла не указана — принята 2,7 м.'};
  const CLIENT = {lines: [
    {section: 'Полы', name: 'Ламинат 33 кл. дуб', unit: 'уп', qty: 9, price: 2100, sum: 18900, kind: 'material'},
    {section: 'Стены', name: 'Шпатлевка финишная 25кг', unit: 'меш', qty: 2, price: 600, sum: 1200, kind: 'material'},
    {section: 'Работы', name: 'Укладка ламината', unit: 'м2', qty: 21, price: 450, sum: 9450, kind: 'work'},
    {section: 'Прочее', name: 'Вывоз мусора', unit: 'рейс', qty: 1, price: 5000, sum: 5000, kind: 'other'}], total: 34550, notes: ''};
  await page.route('https://openrouter.ai/api/v1/**', async route => {
    const req = route.request();
    if (req.url().endsWith('/models')) return route.fulfill({json: {data: [{id: 'anthropic/test-model', name: 'Тестовая модель', architecture: {input_modalities: ['text', 'image']}, pricing: {prompt: '0.000003', completion: '0.000015'}}]}, headers: {'access-control-allow-origin': '*'}});
    const body = JSON.parse(req.postData()); const all = JSON.stringify(body.messages);
    aiCalls.push({model: body.model, hasImage: all.includes('image_url'), len: all.length});
    let text = 'работает';
    if (all.includes('Восстанови помещения')) text = '```json\n' + JSON.stringify(PLAN) + '\n```';
    else if (all.includes('Перепиши ВСЕ строки сметы')) text = JSON.stringify(CLIENT);
    else if (all.includes('Подбери материалы')) text = JSON.stringify({suggestions: [
      {room: 2, i: 0, base: 'floor', rate: 1, pack: 2.4, reserve: 10, why: 'ламинат как в комнатах'},
      {room: 2, i: 5, base: 'walls', rate: 1, pack: 10.6, reserve: 10, why: 'обои'},
      {room: 0, i: 0, base: 'floor', rate: 1, pack: 2.4, reserve: 10, why: 'дубль'},
      {room: -1, i: 9, base: 'custom', custom: 2, rate: 1, pack: null, reserve: 0, why: 'входные'},
      {room: 1, i: 999, base: 'floor', rate: 1, why: 'нет такой позиции'}],
      missing: [{name: 'Затирка для швов', reason: 'для плитки в санузле'}], notes: 'Подобрано по аналогии с комнатами.'});
    else if (all.includes('Сопоставь материалы')) text = JSON.stringify({pairs: [{i: 0, j: 0}]});
    else if (body.messages[0].role === 'system' && body.messages[0].content.includes('Данные объекта')) text = 'По данным программы: **итого** ' + (body.messages[0].content.includes('Кухня') ? 'вижу кухню' : 'нет кухни');
    await new Promise(r => setTimeout(r, 300));
    route.fulfill({json: {choices: [{message: {content: text}}]}, headers: {'access-control-allow-origin': '*'}});
  });
  await page.goto('file://' + path.resolve('dist/Ремонт_смета.html'));
  await page.click('#btnDemo');
  // настройки ИИ
  await page.click('#btnAI');
  await page.selectOption('#aiPreset', 'openrouter');
  await page.fill('#aiKey', 'sk-test');
  await page.click('#aiList'); await page.waitForSelector('#aiModelList option', {state: 'attached'});
  await page.fill('#aiModel', 'anthropic/test-model');
  await page.click('#aiTest'); await page.waitForSelector('#aiNote .okbox');
  console.log('test:', await page.textContent('#aiNote'));
  await page.screenshot({path: `${shots}/ai_settings.png`});
  await page.click('[data-close="aiModal"]');
  // распознавание плана
  await page.click('#btnRecognize');
  await page.setInputFiles('#recFile', pdfPath);

  await page.waitForSelector('.thumbs img');
  await page.screenshot({path: `${shots}/rec_modal.png`});
  await page.click('#recGo');
  await page.waitForSelector('#recReport .box', {timeout: 20000});
  console.log('rooms:', await page.evaluate(() => P.rooms.map(r => `${r.name} ${r.shape} ${metrics(r).floor.toFixed(2)} h=${r.h} openings=${r.openings.length}`).join('; ')));
  console.log('report:', (await page.textContent('#recReport')).replace(/\s+/g, ' ').slice(0, 300));
  await page.screenshot({path: `${shots}/rec_result.png`});
  // отмена и повтор
  await page.click('#recUndo'); console.log('after undo rooms:', await page.evaluate(() => P.rooms.map(r => r.name).join(',')));
  // смета заказчика (на примере)
  await page.click('[data-tab="Client"]');
  await page.setInputFiles('#fileClient', pdfPath);
  await page.waitForSelector('#client table', {timeout: 20000});
  console.log('client:', (await page.textContent('#client .metrics')).replace(/\s+/g, ' '));
  await page.click('#btnAIMatch'); await page.waitForTimeout(1200);
  await page.screenshot({path: `${shots}/client.png`, fullPage: true});
  // подбор материалов
  await page.click('[data-tab="Est"]'); await page.click('#btnSuggest');
  await page.fill('#sugWish', 'в коридоре ламинат и обои'); await page.click('#sugGo');
  await page.waitForSelector('#sugAdd', {timeout: 20000});
  console.log('suggest rows:', await page.locator('#sugBody tr[data-sg]').count(), 'checked:', await page.locator('#sugBody tr[data-sg] input[data-k=on]:checked').count());
  console.log('suggest total:', await page.textContent('#sugBody .total'));
  await page.screenshot({path: `${shots}/suggest.png`, fullPage: true});
  const before = await page.evaluate(() => P.rooms[2].items.length + P.common.length);
  await page.click('#sugAdd');
  console.log('added:', await page.evaluate(b => P.rooms[2].items.length + P.common.length - b, before), 'corridor:', await page.evaluate(() => P.rooms[2].items.map(i => i.name + ' ' + itemCalc(i, metrics(P.rooms[2])).qty).join('; ')));
  // чат
  await page.click('[data-tab="Chat"]');
  await page.fill('#chatInput', 'Сколько стоит гостиная?'); await page.press('#chatInput', 'Enter');
  await page.waitForSelector('.msg.assistant');
  console.log('chat:', await page.textContent('.msg.assistant'));
  await page.screenshot({path: `${shots}/chat.png`});
  console.log('ai calls:', JSON.stringify(aiCalls));
  console.log('errors:', errors); console.log('other network requests:', net);
  await browser.close();
})();
