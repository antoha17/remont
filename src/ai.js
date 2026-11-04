/* ================= Искусственный интеллект ================= */
/* Страница обращается только к выбранному сервису ИИ (список адресов — в CSP в шапке).
   Ключ хранится только в этом браузере и не попадает в файл объекта. */
const AI_PRESETS = {
  openai:     {label: "OpenAI — ChatGPT", url: "https://api.openai.com/v1", site: "platform.openai.com/api-keys", model: "gpt-5.4-mini", noMax: true},
  openrouter: {label: "OpenRouter — много моделей по одному ключу", url: "https://openrouter.ai/api/v1", site: "openrouter.ai/keys"},
  anthropic:  {label: "Anthropic — Claude", url: "https://api.anthropic.com/v1", fmt: "anthropic", site: "console.anthropic.com"},
  gemini:     {label: "Google — Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", site: "aistudio.google.com/apikey"},
  deepseek:   {label: "DeepSeek (не умеет читать фото и PDF)", url: "https://api.deepseek.com/v1", noVision: true, site: "platform.deepseek.com"},
};
const aiCfg = () => Object.assign({preset: "openai", key: "", model: "gpt-5.4-mini"}, load("remont.ai") || {});
const aiReady = () => { const c = aiCfg(); return !!(c.key && c.model && AI_PRESETS[c.preset]); };
let aiModels = []; // список моделей, полученный от сервиса

function aiHeaders(c){
  const p = AI_PRESETS[c.preset];
  return p.fmt === "anthropic"
    ? {"content-type": "application/json", "x-api-key": c.key.trim(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"}
    : {"content-type": "application/json", "authorization": "Bearer " + c.key.trim()};
}
function aiError(e){
  if (e && e.name === "AbortError") return "Остановлено.";
  if (e && e.http) {
    if (e.http === 401 || e.http === 403) return "Сервис ИИ не принял ключ. Проверьте ключ в «⚙ ИИ».";
    if (e.http === 402) return "На счёте сервиса ИИ закончились деньги.";
    if (e.http === 429) return "Слишком много запросов или превышен лимит. Подождите минуту.";
    if (e.http === 404) return "Модель не найдена. Выберите другую в «⚙ ИИ».";
    return "Ошибка сервиса ИИ: " + (e.message || e.http);
  }
  if (e && e.msg) return e.msg;
  return navigator.onLine ? "Не удалось связаться с сервисом ИИ. Проверьте интернет; возможно, сеть на работе его блокирует." : "Нет интернета.";
}
/* parts: [{text}|{image: dataURL}] ; messages: [{role:"user"|"assistant", parts}] */
async function callAI({system = "", messages, signal, maxTokens = 8000}){
  const c = aiCfg(), p = AI_PRESETS[c.preset];
  if (!c.key || !c.model) throw {msg: "ИИ не подключён. Нажмите «⚙ ИИ» вверху и укажите сервис, ключ и модель."};
  const hasImg = messages.some(m => m.parts.some(x => x.image));
  if (hasImg && p.noVision) throw {msg: "Выбранный сервис не умеет читать фото и PDF. Выберите другой в «⚙ ИИ»."};
  let r, j;
  if (p.fmt === "anthropic") {
    const content = parts => parts.map(x => x.image ? {type: "image", source: {type: "base64", media_type: x.image.slice(5, x.image.indexOf(";")), data: x.image.split(",")[1]}} : {type: "text", text: x.text});
    r = await fetch(p.url + "/messages", {method: "POST", signal, headers: aiHeaders(c),
      body: JSON.stringify({model: c.model.trim(), max_tokens: maxTokens, system: system || undefined, messages: messages.map(m => ({role: m.role, content: content(m.parts)}))})});
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw {http: r.status, message: j.error?.message};
    return (j.content || []).filter(x => x.type === "text").map(x => x.text).join("");
  }
  const content = parts => parts.some(x => x.image) ? parts.map(x => x.image ? {type: "image_url", image_url: {url: x.image}} : {type: "text", text: x.text}) : parts.map(x => x.text).join("\n");
  const msgs = (system ? [{role: "system", content: system}] : []).concat(messages.map(m => ({role: m.role, content: content(m.parts)})));
  r = await fetch(p.url + "/chat/completions", {method: "POST", signal, headers: aiHeaders(c),
    // у новых моделей OpenAI (GPT-5 и новее) параметр max_tokens запрещён, а лимит включает «размышления» — не ограничиваем
    body: JSON.stringify(p.noMax ? {model: c.model.trim(), messages: msgs} : {model: c.model.trim(), messages: msgs, max_tokens: maxTokens})});
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw {http: r.status, message: j.error?.message || (typeof j.error === "string" ? j.error : "")};
  const msg = j.choices?.[0]?.message?.content;
  return Array.isArray(msg) ? msg.map(x => x.text || "").join("") : (msg || "");
}
function parseAIJSON(t){
  t = String(t || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return JSON.parse(t.slice(a, b + 1)); } catch(e) { throw {msg: "ИИ ответил не в том формате. Попробуйте ещё раз или выберите более сильную модель."}; }
}
/* Запуск с индикатором ожидания и кнопкой «Стоп» в указанном блоке */
let aiCtl = null;
async function withBusy(el, text, fn){
  if (aiCtl) { toast("ИИ уже занят — дождитесь ответа"); return null; }
  aiCtl = new AbortController(); const t0 = Date.now();
  el.innerHTML = `<div class="busy"><span id="busyT">${esc(text)}…</span><button class="small" id="busyStop">Стоп</button></div>`;
  const tick = setInterval(() => { const b = document.getElementById("busyT"); if (b) b.textContent = `${text}… ${Math.floor((Date.now() - t0) / 1000)} с`; }, 1000);
  document.getElementById("busyStop").onclick = () => aiCtl && aiCtl.abort();
  const timer = setTimeout(() => aiCtl && aiCtl.abort(), 240000);
  try { const res = await fn(aiCtl.signal); el.innerHTML = ""; return res; }
  catch(e) { el.innerHTML = `<div class="errbox">${esc(aiError(e))}</div>`; return null; }
  finally { clearInterval(tick); clearTimeout(timer); aiCtl = null; }
}

/* ---------- Настройки ИИ ---------- */
let aiDraft = null, aiNote = "";
function openAI(){ aiDraft = aiCfg(); aiNote = ""; renderAISettings(); $("#aiModal").classList.add("on"); }
function renderAISettings(){
  const c = aiDraft, p = AI_PRESETS[c.preset];
  const models = aiModels.filter(m => m.preset === c.preset);
  $("#aiBody").innerHTML = `
    <div class="fields" style="margin-top:8px">
      <label>Сервис</label><select id="aiPreset">${Object.entries(AI_PRESETS).map(([k, v]) => `<option value="${k}" ${k === c.preset ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
      <label>Ключ API</label><input id="aiKey" type="password" value="${esc(c.key)}" placeholder="вставьте ключ" autocomplete="off">
      <label>Модель</label><div class="row" style="flex-wrap:nowrap"><input id="aiModel" list="aiModelList" value="${esc(c.model)}" placeholder="выберите или впишите" style="flex:1"><button class="small" id="aiList">Список моделей</button></div>
    </div>
    <datalist id="aiModelList">${models.map(m => `<option value="${esc(m.id)}">${esc(m.label)}</option>`).join("")}</datalist>
    ${models.length ? `<div class="muted" style="font-size:12px;margin-top:4px">Загружено моделей: ${models.length}. Начните вводить название (например «claude», «gpt», «gemini») — появится список.${c.preset === "openrouter" ? " 📷 — модель читает фото и PDF." : ""}</div>` : ""}
    <div class="row" style="margin-top:12px"><button class="primary" id="aiSave">Сохранить</button><button id="aiTest">Проверить связь</button></div>
    <div id="aiNote">${aiNote}</div>
    <div class="muted" style="font-size:12px;margin-top:10px">Ключ получают на сайте сервиса (${esc(p.site)}) и пополняют там счёт. Ключ хранится только в этом браузере на этом устройстве
    и не попадает в файл объекта. Для распознавания схем и смет нужна модель, которая читает фото: например gpt-5.4-mini, Claude, Gemini.
    При работе с ИИ фото, PDF и данные объекта отправляются выбранному сервису.</div>`;
}
$("#btnAI").onclick = openAI;
document.addEventListener("click", e => { const b = e.target.closest("[data-close]"); if (b) $("#" + b.dataset.close).classList.remove("on"); });
for (const id of ["aiModal", "recModal", "sugModal"]) $("#" + id).addEventListener("click", e => { if (e.target.id === id) e.target.classList.remove("on"); });
$("#aiBody").addEventListener("input", e => { if (e.target.id === "aiKey") aiDraft.key = e.target.value; if (e.target.id === "aiModel") aiDraft.model = e.target.value; });
$("#aiBody").addEventListener("change", e => { if (e.target.id === "aiPreset") { aiDraft.preset = e.target.value; aiDraft.model = AI_PRESETS[e.target.value].model || ""; aiNote = ""; renderAISettings(); } });
$("#aiBody").addEventListener("click", async e => {
  const id = e.target.id, c = aiDraft;
  if (id === "aiSave") { store("remont.ai", c); aiNote = `<div class="okbox">Сохранено.</div>`; renderAISettings(); renderChat(); }
  if (id === "aiList") {
    const p = AI_PRESETS[c.preset];
    if (!c.key && c.preset !== "openrouter") { $("#aiNote").innerHTML = `<div class="errbox">Сначала вставьте ключ.</div>`; return; }
    $("#aiNote").innerHTML = `<div class="busy">Загружаю список моделей…</div>`;
    try {
      const r = await fetch(p.url + "/models" + (p.fmt === "anthropic" ? "?limit=100" : ""), {headers: c.key ? aiHeaders(c) : {}});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw {http: r.status, message: j.error?.message};
      const list = (j.data || j.models || []).map(m => {
        const id = String(m.id || m.name || "").replace(/^models\//, "");
        const img = (m.architecture?.input_modalities || []).includes("image");
        const price = m.pricing?.prompt ? ` · ${(m.pricing.prompt * 1e6).toFixed(2)}$/${(m.pricing.completion * 1e6).toFixed(2)}$ за млн` : "";
        return {preset: c.preset, id, label: (img ? "📷 " : "") + (m.name || m.display_name || id) + price};
      }).filter(m => m.id).sort((a, b) => a.id.localeCompare(b.id));
      aiModels = aiModels.filter(m => m.preset !== c.preset).concat(list);
      aiNote = ""; renderAISettings();
    } catch(err) { $("#aiNote").innerHTML = `<div class="errbox">${esc(aiError(err))}</div>`; }
  }
  if (id === "aiTest") {
    const saved = load("remont.ai"); store("remont.ai", c);
    const res = await withBusy($("#aiNote"), "Проверяю", signal => callAI({messages: [{role: "user", parts: [{text: "Ответь одним словом: работает"}]}], signal, maxTokens: 20}));
    if (res !== null) { aiNote = `<div class="okbox">Связь есть. Модель ответила: «${esc(res.trim().slice(0, 60))}». Настройки сохранены.</div>`; renderAISettings(); }
    else if (saved) store("remont.ai", saved);
  }
});

/* ---------- Фото и PDF → картинки ---------- */
/* pdf.js работает без отдельного потока: его «рабочая» часть встроена в страницу (globalThis.pdfjsWorker) */
function initPdf(){ if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = "встроен"; }
const MAXPX = 2000;
function canvasJPEG(cv){ return cv.toDataURL("image/jpeg", 0.85); }
async function fileToImages(file, maxPages = 8){
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    initPdf();
    const doc = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: false}).promise;
    const out = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i), v1 = page.getViewport({scale: 1});
      const scale = Math.min(4, MAXPX / Math.max(v1.width, v1.height)), vp = page.getViewport({scale});
      const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      await page.render({canvasContext: g, viewport: vp}).promise;
      out.push({name: `${file.name}, стр. ${i}`, url: canvasJPEG(cv)});
    }
    if (doc.numPages > maxPages) toast(`В PDF ${doc.numPages} стр., взяты первые ${maxPages}`);
    return out;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad({msg: `Не удалось открыть «${file.name}». Подходят JPG, PNG и PDF.`}); i.src = url; });
    const k = Math.min(1, MAXPX / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return [{name: file.name, url: canvasJPEG(cv)}];
  } finally { URL.revokeObjectURL(url); }
}
async function filesToImages(files){ const out = []; for (const f of files) out.push(...await fileToImages(f)); return out; }

/* ---------- Распознавание плана ---------- */
let recPages = [], recLast = null; // recLast: {pages, notes, checks, backup}
function openRecognize(){
  if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; }
  recPages = []; renderRec(); $("#recModal").classList.add("on");
}
function renderRec(){
  $("#recBody").innerHTML = `
    <div class="muted" style="margin:8px 0">Загрузите схему объекта: PDF или фото (можно несколько). ИИ прочитает размеры и построит комнаты. Результат — черновик: обязательно сверьте размеры со схемой.</div>
    <div class="row"><button class="primary" id="recPick">Выбрать PDF или фото…</button><input type="file" id="recFile" accept="application/pdf,image/*" multiple hidden></div>
    ${recPages.length ? `<div class="thumbs">${recPages.map((p, i) => `<label><img src="${p.url}" alt=""><span><input type="checkbox" data-pg="${i}" ${p.on ? "checked" : ""}> ${esc(p.name)}</span></label>`).join("")}</div>
    <div class="fields">
      <label>Подсказка для ИИ</label><input id="recHint" placeholder="необязательно: «размеры в мм», «высота потолков 2,75», «только 2 этаж»">
      <label>Куда</label><select id="recMode"><option value="replace">Заменить комнаты объекта</option><option value="append">Добавить к имеющимся</option></select>
    </div>
    <div class="row" style="margin-top:10px"><button class="primary" id="recGo">Распознать</button></div>` : ""}
    <div id="recMsg"></div>`;
}
$("#btnRecognize").onclick = openRecognize;
$("#recBody").addEventListener("click", e => { if (e.target.id === "recPick") $("#recFile").click(); if (e.target.id === "recGo") recognizePlan(); });
$("#recBody").addEventListener("change", async e => {
  if (e.target.dataset.pg !== undefined) { recPages[+e.target.dataset.pg].on = e.target.checked; return; }
  if (e.target.id !== "recFile") return;
  const files = [...e.target.files]; if (!files.length) return;
  $("#recMsg").innerHTML = `<div class="busy">Открываю файлы…</div>`;
  try { recPages = (await filesToImages(files)).map(p => ({...p, on: true})); renderRec(); }
  catch(err) { $("#recMsg").innerHTML = `<div class="errbox">${esc(err.msg || "Не удалось открыть файл: " + (err.message || err))}</div>`; }
});
const PLAN_PROMPT = `На изображениях — план (схема, обмерный чертёж) квартиры или помещения. Восстанови помещения для программы расчёта ремонта.
Верни ТОЛЬКО JSON без пояснений:
{"rooms":[{"name":"строка","area":число|null,"h":число|null,"x":число,"y":число,
  "walls":[{"dir":"R"|"D"|"L"|"U","len":число}],
  "openings":[{"type":"door"|"window"|"arch","wall":целое,"pos":число,"w":число,"h":число|null,"sill":число|null}]}],
 "notes":"строка"}
Правила:
- Все размеры — в метрах. На чертежах размеры обычно в миллиметрах (3450 = 3.45) или сантиметрах — переведи.
- Каждая комната — отдельный контур по внутренним размерам (по чистовым стенам), если они указаны.
- Обход стен каждой комнаты — по часовой стрелке, начиная с самого верхнего из самых левых углов; первая стена обычно идёт вправо.
  Направления как на листе: R — вправо, D — вниз, L — влево, U — вверх. Контур обязательно замкнут: сумма R = сумме L, сумма D = сумме U.
- Косые и скруглённые стены приближай прямыми углами, упомяни это в notes.
- x, y — положение начального угла комнаты на общем плане в метрах от левого верхнего угла плана, чтобы комнаты стояли так же, как на схеме (с учётом толщины стен).
- Проёмы: wall — номер стены (с 0) в списке walls этой комнаты; pos — расстояние от начала стены (по ходу обхода) до ближнего края проёма; w — ширина.
  Дверь: h по умолчанию 2.0, sill 0. Окно: если высота не указана — h 1.4, sill 0.8. Проём без двери — "arch".
  Дверь между двумя комнатами указывай в обеих комнатах.
- area — площадь, если подписана на плане (для проверки), иначе null. h — высота потолка, если указана, иначе null.
- Балконы и лоджии — отдельными комнатами, если на них есть размеры.
- Ничего не выдумывай: если размер не читается, оцени по соседним размерам или масштабу и обязательно напиши об этом в notes.
- notes — кратко по-русски: что не удалось прочитать, что оценено примерно, на что обратить внимание.`;
async function recognizePlan(){
  const pages = recPages.filter(p => p.on);
  if (!pages.length) { $("#recMsg").innerHTML = `<div class="errbox">Отметьте хотя бы одну страницу.</div>`; return; }
  const hint = $("#recHint").value.trim(), mode = $("#recMode").value;
  const res = await withBusy($("#recMsg"), "ИИ читает схему (обычно 20–90 секунд)", async signal => parseAIJSON(await callAI({signal,
    system: "Ты — опытный прораб и сметчик, отлично читаешь строительные чертежи. Отвечаешь только JSON.",
    messages: [{role: "user", parts: [...pages.map(p => ({image: p.url})), {text: PLAN_PROMPT + (hint ? "\nПодсказка от пользователя: " + hint : "")}]}]})));
  if (!res) return;
  const rooms = (res.rooms || []).map(toRoom).filter(Boolean);
  if (!rooms.length) { $("#recMsg").innerHTML = `<div class="errbox">ИИ не нашёл на схеме комнат с размерами. ${esc(res.notes || "")}</div>`; return; }
  const backup = JSON.stringify(P);
  if (mode === "replace") { P.rooms = rooms; }
  else { const dx = P.rooms.length ? Math.max(...P.rooms.map(q => bbox(q).x1)) + 1 : 0; rooms.forEach(r => r.x = r2(r.x + dx)); P.rooms.push(...rooms); }
  sel = rooms[0].id;
  const checks = rooms.map(r => { const m = metrics(r), g = gap(r);
    return {name: r.name, area: m.floor, label: r._area, open: g.d >= 0.01}; });
  rooms.forEach(r => delete r._area);
  recLast = {pages, notes: String(res.notes || ""), checks, backup};
  save(); $("#recModal").classList.remove("on"); renderAll(); toast(`Построено комнат: ${rooms.length}`);
}
function toRoom(x){
  const walls = (x.walls || []).map(w => ({dir: DIRS[String(w.dir).toUpperCase()] ? String(w.dir).toUpperCase() : "R", len: r2(Math.abs(num(w.len)))})).filter(w => w.len > 0);
  if (walls.length < 3) return null;
  const r = newRoom(String(x.name || "Комната").slice(0, 40));
  r.shape = "poly"; r.walls = walls; r.x = r2(num(x.x)); r.y = r2(num(x.y)); r.h = num(x.h) > 1.5 && num(x.h) < 6 ? num(x.h) : 2.7;
  // прямоугольник — показываем как прямоугольник (проще править)
  if (walls.length === 4 && walls.map(w => w.dir).join("") === "RDLU" && Math.abs(walls[0].len - walls[2].len) < 0.01 && Math.abs(walls[1].len - walls[3].len) < 0.01) { r.shape = "rect"; r.L = walls[0].len; r.W = walls[1].len; }
  const S = segs(r);
  r.openings = (x.openings || []).map(o => {
    const type = OPEN_TYPES[o.type] ? o.type : "door", d = openDefaults(type), wall = Math.max(0, Math.min(S.length - 1, Math.round(num(o.wall))));
    const w = num(o.w) > 0 ? r2(num(o.w)) : d.w;
    return {id: uid(), type, wall, pos: r2(Math.max(0, Math.min(S[wall].len - w, num(o.pos)))), w, h: num(o.h) > 0 ? r2(num(o.h)) : d.h, sill: o.sill == null ? d.sill : r2(num(o.sill))};
  });
  r._area = num(x.area) || null;
  return r;
}
function renderRecReport(){
  const el = $("#recReport"); if (!el) return;
  if (!recLast) { el.innerHTML = ""; return; }
  const bad = recLast.checks.filter(c => c.open || (c.label && Math.abs(c.label - c.area) / c.label > 0.05));
  el.innerHTML = `<div class="box" style="background:#fffaf0">
    <div class="row" style="justify-content:space-between"><b>Результат распознавания — проверьте</b>
      <span class="row"><button class="small" id="recUndo">Отменить</button><button class="small" id="recHide">Скрыть</button></span></div>
    ${recLast.notes ? `<div style="margin:6px 0">${esc(recLast.notes)}</div>` : ""}
    ${bad.length ? `<div class="warn" style="margin:4px 0">${bad.map(c => c.open ? `«${esc(c.name)}»: контур не замкнут — проверьте длины стен.` : `«${esc(c.name)}»: по схеме ${fmt(c.label)} м², по размерам ${fmt(c.area)} м².`).join("<br>")}</div>`
      : `<div style="color:var(--ok);margin:4px 0">Площади совпадают с подписанными на схеме (где они были).</div>`}
    <details><summary>Показать схему</summary><div class="thumbs">${recLast.pages.map(p => `<a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="" style="max-width:100%;max-height:none"></a>`).join("")}</div></details>
  </div>`;
}
$("#recReport").addEventListener("click", e => {
  if (e.target.id === "recHide") { recLast = null; renderRecReport(); }
  if (e.target.id === "recUndo" && recLast) { P = JSON.parse(recLast.backup); sel = P.rooms[0]?.id || null; recLast = null; save(); renderAll(); toast("Распознавание отменено"); }
});

/* ---------- Смета заказчика ---------- */
const clientOf = () => (P.client = P.client || {lines: [], total: null, match: {}, files: ""});
const CLIENT_PROMPT = `На изображениях — смета (или её часть) на ремонтные работы и/или материалы. Перепиши ВСЕ строки сметы в таблицу.
Верни ТОЛЬКО JSON без пояснений:
{"lines":[{"section":"раздел или пусто","name":"наименование","unit":"ед. изм.","qty":число|null,"price":число|null,"sum":число|null,"kind":"material"|"work"|"other"}],
 "total":число|null, "notes":"строка"}
Правила:
- Переписывай как есть, ничего не выдумывай и не пересчитывай. Числа — с точкой как разделителем дробной части, без пробелов и валюты.
- Строки «Итого» по разделам в lines не включай; общий итог сметы — в total.
- kind: material — материалы, work — работы, other — прочее (доставка, вывоз мусора и т. п.).
- Если смета на нескольких фото — объедини, повторяющиеся строки не дублируй.
- notes — кратко по-русски: что не удалось прочитать или прочитано неуверенно.`;
$("#btnClientLoad").onclick = () => { if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; } $("#fileClient").click(); };
$("#fileClient").onchange = async e => {
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  const C = clientOf();
  if (C.lines.length && !confirm("Заменить уже загруженную смету заказчика?")) return;
  const res = await withBusy($("#clientMsg"), "ИИ читает смету (обычно 20–120 секунд)", async signal => {
    const pages = await filesToImages(files);
    return parseAIJSON(await callAI({signal, maxTokens: 16000, system: "Ты — внимательный сметчик. Отвечаешь только JSON.",
      messages: [{role: "user", parts: [...pages.map(p => ({image: p.url})), {text: CLIENT_PROMPT}]}]}));
  });
  if (!res) return;
  C.lines = (res.lines || []).filter(l => l && l.name).map(l => ({id: uid(), section: String(l.section || ""), name: String(l.name), unit: String(l.unit || ""),
    qty: l.qty == null ? "" : num(l.qty), price: l.price == null ? "" : num(l.price), sum: l.sum == null ? "" : num(l.sum), kind: ["material", "work", "other"].includes(l.kind) ? l.kind : "other"}));
  C.total = res.total == null ? null : num(res.total); C.notes = String(res.notes || ""); C.files = files.map(f => f.name).join(", "); C.match = {};
  save(); renderClient(); toast(`Строк в смете: ${C.lines.length}`);
};
$("#btnClientAdd").onclick = () => { clientOf().lines.push({id: uid(), section: "", name: "", unit: "", qty: "", price: "", sum: "", kind: "material"}); save(); renderClient(); };
$("#btnClientClear").onclick = () => { if (confirm("Очистить смету заказчика?")) { P.client = null; save(); renderClient(); } };
const lineSum = l => num(l.sum) || r2(num(l.qty) * num(l.price));
const KIND = {material: "материал", work: "работа", other: "прочее"};
function words(s){ return norm(s).replace(/[^a-zа-я0-9 ]/g, " ").split(" ").filter(w => w.length > 2 && !/^(для|под|без|мм|шт)$/.test(w)).map(w => w.slice(0, 5)); }
function autoMatch(ours, lines, C){
  const used = new Set(Object.values(C.match));
  for (const o of ours) {
    if (C.match[o.key] !== undefined) continue;
    const wo = new Set(words(o.name)); let best = null, bs = 0;
    for (const l of lines) { if (used.has(l.id) || l.kind === "work") continue; const wl = words(l.name); const common = wl.filter(w => wo.has(w)).length; const s = common / Math.max(2, Math.min(wo.size, wl.length)); if (s > bs) { bs = s; best = l; } }
    if (best && bs >= 0.5) { C.match[o.key] = best.id; used.add(best.id); }
  }
}
function renderClient(){
  const el = $("#client"); if (!el) return;
  const C = clientOf(), ours = summary().map(s => ({...s, key: norm(s.name) + "|" + norm(s.unit)}));
  if (!C.lines.length) { el.innerHTML = `<div class="empty">Смета заказчика не загружена.</div>`; return; }
  autoMatch(ours, C.lines, C);
  const sumAll = C.lines.reduce((a, l) => a + lineSum(l), 0), sumMat = C.lines.filter(l => l.kind === "material").reduce((a, l) => a + lineSum(l), 0);
  const ourTotal = ours.reduce((a, s) => a + s.sum, 0), byId = new Map(C.lines.map(l => [l.id, l]));
  const matched = new Set(Object.values(C.match));
  const cmpRows = ours.map(o => { const l = byId.get(C.match[o.key]); const ls = l ? lineSum(l) : 0, diff = l ? r2(ls - o.sum) : null;
    return `<tr class="${diff == null ? "" : diff < 0 ? "over" : "under"}"><td>${esc(o.name)}</td><td class="r">${fmt(o.qty)} ${esc(o.unit)}</td><td class="r">${money(o.sum)}</td>
      <td><select data-match="${esc(o.key)}" style="max-width:260px"><option value="">— нет в смете заказчика —</option>${C.lines.map(x => `<option value="${x.id}" ${x.id === C.match[o.key] ? "selected" : ""}>${esc(x.name.slice(0, 70))}</option>`).join("")}</select></td>
      <td class="r">${l ? fmt(num(l.qty)) + " " + esc(l.unit) : ""}</td><td class="r">${l ? money(ls) : ""}</td>
      <td class="r"><b>${diff == null ? "" : (diff >= 0 ? "+" : "") + money(diff)}</b></td></tr>`; }).join("");
  const extra = C.lines.filter(l => !matched.has(l.id) && l.kind === "material");
  const diffTot = r2(sumMat - ourTotal);
  el.innerHTML = `
    ${C.notes ? `<div class="box" style="background:#fffaf0">${esc(C.notes)}</div>` : ""}
    <div class="box"><div class="metrics" style="max-width:520px">
      <span>Итого по смете заказчика (все строки)</span><b>${money(sumAll)}</b>
      ${C.total != null ? `<span>Итог, написанный в смете</span><b class="${Math.abs(C.total - sumAll) > 1 ? "warn" : ""}">${money(C.total)}</b>` : ""}
      <span>Из них материалы</span><b>${money(sumMat)}</b>
      <span>Ваш расчёт материалов</span><b>${money(ourTotal)}</b>
      <span>${diffTot >= 0 ? "Запас по материалам" : "Не хватает по материалам"}</span><b style="color:${diffTot >= 0 ? "var(--ok)" : "var(--bad)"}">${money(Math.abs(diffTot))}</b>
    </div>${C.total != null && Math.abs(C.total - sumAll) > 1 ? `<div class="warn" style="font-size:12px;margin-top:4px">Сумма строк не совпадает с итогом в смете — возможно, какая-то строка прочитана неверно или не попала.</div>` : ""}</div>
    <h3>Сравнение по материалам</h3>
    <div class="muted" style="font-size:12px;margin-bottom:4px">Красным — ваш расчёт дороже, чем заложено в смете заказчика (не влезает). Зелёным — влезает. Пары подобраны по названию автоматически — поправьте, если нужно.</div>
    <div class="row" style="margin-bottom:6px"><button class="small" id="btnAIMatch">Подобрать пары с помощью ИИ</button><span id="matchMsg"></span></div>
    ${ours.length ? `<div class="scrollx"><table><tr><th>Ваш материал</th><th class="r">Ваше кол-во</th><th class="r">Ваша сумма</th><th>Строка сметы заказчика</th><th class="r">Кол-во по смете</th><th class="r">Сумма по смете</th><th class="r">Разница</th></tr>${cmpRows}</table></div>` : `<div class="muted">В вашем расчёте (вкладка 2) пока нет материалов.</div>`}
    ${extra.length ? `<h3>Материалы из сметы заказчика, которых нет в вашем расчёте</h3><ul>${extra.map(l => `<li>${esc(l.name)} — ${fmt(num(l.qty))} ${esc(l.unit)}, ${money(lineSum(l))}</li>`).join("")}</ul>` : ""}
    <h3>Строки сметы заказчика ${C.files ? `<span class="muted" style="font-weight:400">· ${esc(C.files)}</span>` : ""}</h3>
    <div class="scrollx"><table class="est"><tr><th>Раздел</th><th>Наименование</th><th>Тип</th><th>Ед.</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th><th></th></tr>
    ${C.lines.map((l, i) => `<tr data-cl="${i}">
      <td><input data-k="section" value="${esc(l.section)}" style="width:110px"></td>
      <td><input data-k="name" value="${esc(l.name)}" style="width:280px"></td>
      <td><select data-k="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${l.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><input data-k="unit" value="${esc(l.unit)}" style="width:60px"></td>
      <td class="r"><input class="num" data-k="qty" value="${esc(l.qty)}" inputmode="decimal"></td>
      <td class="r"><input class="num" data-k="price" value="${esc(l.price)}" inputmode="decimal"></td>
      <td class="r"><input class="num" style="width:100px" data-k="sum" value="${esc(l.sum)}" inputmode="decimal"></td>
      <td><button class="icon danger" data-cdel="${i}">✕</button></td></tr>`).join("")}</table></div>`;
}
$("#client").addEventListener("change", e => {
  const t = e.target, C = clientOf();
  if (t.dataset.match !== undefined) { if (t.value) { for (const k in C.match) if (C.match[k] === t.value) delete C.match[k]; C.match[t.dataset.match] = t.value; } else C.match[t.dataset.match] = null; save(); renderClient(); return; }
  const tr = t.closest("tr[data-cl]"); if (!tr || !t.dataset.k) return;
  const l = C.lines[+tr.dataset.cl]; l[t.dataset.k] = ["qty", "price", "sum"].includes(t.dataset.k) ? t.value.replace(",", ".") : t.value;
  save(); renderClient();
});
$("#client").addEventListener("click", async e => {
  const C = clientOf();
  if (e.target.dataset.cdel !== undefined) { C.lines.splice(+e.target.dataset.cdel, 1); save(); renderClient(); }
  if (e.target.id === "btnAIMatch") {
    if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; }
    const ours = summary().map(s => ({key: norm(s.name) + "|" + norm(s.unit), name: s.name, unit: s.unit}));
    const res = await withBusy($("#matchMsg"), "ИИ сопоставляет", async signal => parseAIJSON(await callAI({signal, system: "Ты — сметчик. Отвечаешь только JSON.",
      messages: [{role: "user", parts: [{text: `Сопоставь материалы из моего расчёта со строками сметы заказчика (одно и то же по смыслу, даже если названия разные).
Мой расчёт: ${JSON.stringify(ours.map((o, i) => ({i, name: o.name, unit: o.unit})))}
Смета заказчика: ${JSON.stringify(C.lines.map((l, j) => ({j, name: l.name, unit: l.unit, kind: l.kind})))}
Верни ТОЛЬКО JSON: {"pairs":[{"i":номер из моего расчёта,"j":номер строки заказчика}]}. Каждую строку заказчика используй не больше одного раза. Если пары нет — не включай.`}]}]})));
    if (!res) return;
    C.match = {}; for (const p of res.pairs || []) { const o = ours[p.i], l = C.lines[p.j]; if (o && l) C.match[o.key] = l.id; }
    for (const o of ours) if (C.match[o.key] === undefined) C.match[o.key] = null;
    save(); renderClient(); toast("Пары подобраны — проверьте");
  }
});

/* ---------- Подбор материалов ИИ ---------- */
let sug = null; // {step:"setup"|"result", rooms:Set, useClient, wish, list:[{room, it, on, why, dup}], missing, notes}
$("#btnSuggest").onclick = () => {
  if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; }
  if (!P.rooms.length) { toast("Сначала добавьте комнаты (вкладка 1)"); return; }
  if (!DB.items.length) { toast("Сначала загрузите базу материалов (вкладка 3)"); document.querySelector('[data-tab="DB"]').click(); return; }
  sug = {step: "setup", rooms: new Set(P.rooms.map(r => r.id)), useClient: !!(P.client && P.client.lines.length), wish: sug?.wish || ""};
  renderSug(); $("#sugModal").classList.add("on");
};
function renderSug(){
  const el = $("#sugBody"), hasClient = !!(P.client && P.client.lines.length);
  if (sug.step === "setup") {
    el.innerHTML = `
      <div class="muted" style="margin:8px 0">ИИ посмотрит на размеры комнат${hasClient ? ", смету заказчика" : ""} и ваши пожелания и предложит материалы <b>только из вашей базы</b>
      (${DB.items.length} поз.) с расходом и запасом. Вы проверите и отметите, что добавить.</div>
      <b>Комнаты</b>
      <div class="row" style="margin:6px 0 10px">${P.rooms.map(r => `<label class="row" style="gap:4px;border:1px solid var(--line);border-radius:8px;padding:4px 8px"><input type="checkbox" data-sroom="${r.id}" ${sug.rooms.has(r.id) ? "checked" : ""}> ${esc(r.name)}</label>`).join("")}</div>
      <label class="row" style="gap:6px;margin-bottom:8px"><input type="checkbox" id="sugClient" ${sug.useClient ? "checked" : ""} ${hasClient ? "" : "disabled"}> Опираться на смету заказчика ${hasClient ? "" : "<span class='muted'>(не загружена — вкладка 4)</span>"}</label>
      <div><b>Пожелания</b> <span class="muted">(необязательно)</span></div>
      <textarea id="sugWish" rows="3" style="width:100%;margin-top:4px" placeholder="Например: в комнатах ламинат и обои под покраску, в санузле плитка на стены и пол, потолки натяжные">${esc(sug.wish)}</textarea>
      <div class="row" style="margin-top:10px"><button class="primary" id="sugGo">Подобрать</button></div>
      <div id="sugMsg"></div>`;
    return;
  }
  const byRoom = new Map();
  for (const x of sug.list) { if (!byRoom.has(x.room)) byRoom.set(x.room, []); byRoom.get(x.room).push(x); }
  let total = 0;
  const blocks = [...byRoom.entries()].map(([rid, xs]) => {
    const r = rid === "common" ? null : room(rid), m = r ? metrics(r) : totalMetrics();
    return `<h3>${esc(r ? r.name : "Общее на объект")}</h3><div class="scrollx"><table class="est">
      <tr><th></th><th>Материал</th><th>Считать по</th><th class="r">Расход</th><th class="r">Запас, %</th><th class="r">Фасовка</th><th class="r">Нужно</th><th class="r">Сумма</th><th>Почему</th></tr>
      ${xs.map(x => { const c = itemCalc(x.it, m); if (x.on) total += c.sum; const k = sug.list.indexOf(x);
        return `<tr data-sg="${k}"><td><input type="checkbox" data-k="on" ${x.on ? "checked" : ""}></td>
          <td>${esc(x.it.name)}${x.dup ? `<div class="warn" style="font-size:12px">уже есть в смете</div>` : ""}</td>
          <td><select data-k="base">${Object.entries(BASES).map(([kk, [n, u]]) => `<option value="${kk}" ${x.it.base === kk ? "selected" : ""}>${n}${u ? ", " + u : ""}</option>`).join("")}</select>
            ${x.it.base === "custom" ? `<input class="num" data-k="custom" value="${esc(x.it.custom)}">` : `<div class="muted" style="font-size:12px">= ${fmt(c.base)} ${BASES[x.it.base][1]}</div>`}</td>
          <td class="r"><input class="num" data-k="rate" value="${esc(x.it.rate)}"></td>
          <td class="r"><input class="num" data-k="reserve" value="${esc(x.it.reserve)}"></td>
          <td class="r"><input class="num" data-k="pack" value="${esc(x.it.pack)}" placeholder="—"></td>
          <td class="r"><b>${fmt(c.qty)}</b> ${esc(x.it.unit)}</td><td class="r">${money(c.sum)}</td>
          <td class="muted" style="font-size:12px;min-width:160px">${esc(x.why)}</td></tr>`; }).join("")}</table></div>`;
  }).join("");
  el.innerHTML = `
    ${sug.notes ? `<div class="box" style="background:#fffaf0;margin-top:8px">${esc(sug.notes)}</div>` : ""}
    ${sug.list.length ? blocks : `<div class="empty">ИИ не нашёл подходящих материалов в базе.</div>`}
    ${sug.missing.length ? `<h3>Нужно, но нет в вашей базе</h3><ul>${sug.missing.map(m => `<li>${esc(m.name)}${m.reason ? ` — <span class="muted">${esc(m.reason)}</span>` : ""}</li>`).join("")}</ul>` : ""}
    <div class="total">Отмечено на сумму: ${money(r2(total))}</div>
    <div class="row" style="justify-content:flex-end"><button id="sugBack">← Изменить пожелания</button><button class="primary" id="sugAdd">Добавить отмеченные в смету</button></div>`;
}
$("#sugBody").addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.sroom) { t.checked ? sug.rooms.add(t.dataset.sroom) : sug.rooms.delete(t.dataset.sroom); return; }
  if (t.id === "sugClient") { sug.useClient = t.checked; return; }
  const tr = t.closest("tr[data-sg]"); if (!tr || !t.dataset.k) return;
  const x = sug.list[+tr.dataset.sg];
  if (t.dataset.k === "on") x.on = t.checked;
  else { x.it[t.dataset.k] = t.tagName === "SELECT" ? t.value : t.value.replace(",", "."); if (t.dataset.k === "base" && t.value === "custom" && !num(x.it.custom)) x.it.custom = 1; }
  renderSug();
});
$("#sugBody").addEventListener("input", e => { if (e.target.id === "sugWish") sug.wish = e.target.value; });
$("#sugBody").addEventListener("click", e => {
  if (e.target.id === "sugGo") runSuggest();
  if (e.target.id === "sugBack") { sug.step = "setup"; renderSug(); }
  if (e.target.id === "sugAdd") {
    let n = 0;
    for (const x of sug.list) if (x.on) { const items = x.room === "common" ? P.common : room(x.room)?.items; if (items) { items.push({...x.it, id: uid()}); n++; } }
    save(); $("#sugModal").classList.remove("on"); renderEstimate(); toast(`Добавлено позиций: ${n}`);
  }
});
function dbForPrompt(extraText){
  const LIMIT = 1500;
  let idx = DB.items.map((m, i) => i);
  if (idx.length > LIMIT) { // большая база — сначала позиции, похожие на смету заказчика и пожелания
    const ws = new Set(words(extraText));
    const score = i => { const h = words(DB.items[i].name + " " + DB.items[i].cat); return h.filter(w => ws.has(w)).length; };
    idx = idx.map(i => [i, score(i)]).sort((a, b) => b[1] - a[1]).slice(0, LIMIT).map(x => x[0]);
  }
  return idx.map(i => { const m = DB.items[i]; return [i, m.name, m.unit, num(m.price), m.cat, m.rate || "", m.pack || "", m.base || ""].join(" | "); }).join("\n");
}
async function runSuggest(){
  const rooms = P.rooms.filter(r => sug.rooms.has(r.id));
  if (!rooms.length) { $("#sugMsg").innerHTML = `<div class="errbox">Отметьте хотя бы одну комнату.</div>`; return; }
  const C = sug.useClient && P.client ? P.client.lines : [];
  const roomData = rooms.map((r, k) => { const m = metrics(r); return {room: k, name: r.name, height: num(r.h),
    floor: r2(m.floor), walls: r2(m.walls), wallsGross: r2(m.wallsGross), ceiling: r2(m.ceiling), perim: r2(m.perim), plinth: r2(m.plinth),
    slopesWin: r2(m.slopesWin), slopesDoor: r2(m.slopesDoor), windows: m.windows, doors: m.doors, alreadyInEstimate: r.items.map(i => i.name)}; });
  const clientTxt = C.length ? C.map(l => `${l.section ? l.section + ": " : ""}${l.name} — ${num(l.qty)} ${l.unit}${l.kind === "work" ? " (работа)" : ""}`).join("\n") : "";
  const prompt = `Подбери материалы для ремонта из БАЗЫ ПОЛЬЗОВАТЕЛЯ для каждой комнаты.
Комнаты (размеры в м, м², м.п.): ${JSON.stringify(roomData)}
${clientTxt ? `Смета заказчика (ориентир, что заложено в работу):\n${clientTxt}\n` : ""}${sug.wish.trim() ? `Пожелания прораба: ${sug.wish.trim()}\n` : ""}
База пользователя (номер | наименование | ед. | цена | категория | расход | фасовка | считать по):
${dbForPrompt(clientTxt + " " + sug.wish)}

Верни ТОЛЬКО JSON:
{"suggestions":[{"room":номер комнаты или -1 (на весь объект),"i":номер позиции из базы,
  "base":"floor"|"ceiling"|"walls"|"wallsGross"|"perim"|"plinth"|"slopesWin"|"slopesDoor"|"windows"|"doors"|"volume"|"custom",
  "custom":число|null,"rate":число,"pack":число|null,"reserve":число,"why":"кратко по-русски"}],
 "missing":[{"name":"чего не хватает в базе","reason":"зачем нужно"}],
 "notes":"кратко по-русски: общая логика подбора, на что обратить внимание"}
Как считает программа: количество = основа(base) × rate × (1 + reserve/100), затем делится на pack и округляется вверх.
- rate — расход в тех единицах, в которых считается pack (или в единицах товара, если pack нет). Пример: шпаклёвка 1.2 кг/м², мешок 25 кг → base "walls", rate 1.2, pack 25.
  Ламинат в упаковках по 2.4 м² → base "floor", rate 1, pack 2.4. Плинтус 2.5 м/шт → base "plinth", rate 1, pack 2.5. Если ед. товара м² — rate 1, pack null.
- Если в базе уже указаны расход/фасовка/считать по — используй их.
- reserve — запас в %: обычно 5–10, плитка 10–15, штучные (двери) 0.
- base "custom" — когда нужно конкретное число штук (custom), например 1 унитаз; тогда rate 1.
- Бери ТОЛЬКО позиции из базы по их номеру i, ничего не придумывай. Чего нет в базе, но нужно — в "missing".
- Не дублируй то, что уже есть в alreadyInEstimate. Работы (услуги) добавляй, только если они есть в базе и упомянуты в смете заказчика или пожеланиях.
- Если есть смета заказчика — подбирай под её состав (те же виды отделки), а не всё подряд.`;
  const res = await withBusy($("#sugMsg"), "ИИ подбирает материалы (обычно 20–90 секунд)", async signal => parseAIJSON(await callAI({signal, maxTokens: 16000,
    system: "Ты — опытный прораб и сметчик. Отвечаешь только JSON.", messages: [{role: "user", parts: [{text: prompt}]}]})));
  if (!res) return;
  const list = [];
  for (const s of res.suggestions || []) {
    const m = DB.items[Math.round(num(s.i))]; if (!m || s.i === null || s.i === undefined) continue;
    const k = Math.round(num(s.room)), r = k >= 0 ? rooms[k] : null; if (k >= 0 && !r) continue;
    const it = itemFromMat(m);
    if (BASES[s.base]) it.base = s.base;
    if (it.base === "custom") it.custom = num(s.custom) > 0 ? num(s.custom) : 1;
    if (num(s.rate) > 0) it.rate = num(s.rate);
    if (s.pack != null) it.pack = num(s.pack) > 0 ? num(s.pack) : "";
    if (s.reserve != null && num(s.reserve) >= 0 && num(s.reserve) <= 50) it.reserve = num(s.reserve);
    const items = r ? r.items : P.common, dup = items.some(x => norm(x.name) === norm(it.name));
    list.push({room: r ? r.id : "common", it, on: !dup, dup, why: String(s.why || "")});
  }
  sug.list = list; sug.missing = (res.missing || []).filter(x => x && x.name).map(x => ({name: String(x.name), reason: String(x.reason || "")}));
  sug.notes = String(res.notes || ""); sug.step = "result"; renderSug();
}

/* ---------- Чат ---------- */
function projectContext(question){
  const rooms = P.rooms.map(r => { const m = metrics(r); return {
    name: r.name, height: num(r.h), shape: r.shape === "rect" ? `прямоугольник ${num(r.L)}×${num(r.W)} м` : "сложная: " + r.walls.map(w => w.dir + num(w.len)).join(" "),
    openings: r.openings.map(o => `${OPEN_TYPES[o.type]} ${num(o.w)}×${num(o.h)} (стена ${o.wall + 1})`),
    metrics: Object.fromEntries(Object.entries(BASES).filter(([k]) => k !== "custom").map(([k, [n, u]]) => [n + ", " + u, r2(m[k])])),
    estimate: r.items.map(it => { const c = itemCalc(it, m); return {material: it.name, base: BASES[it.base][0], rate: num(it.rate), reserve: num(it.reserve), pack: num(it.pack) || null, qty: c.qty, unit: it.unit, price: num(it.price), sum: c.sum}; })
  }; });
  const tm = totalMetrics();
  const common = P.common.map(it => { const c = itemCalc(it, tm); return {material: it.name, qty: c.qty, unit: it.unit, price: num(it.price), sum: c.sum}; });
  const sum = summary(), C = P.client;
  let db;
  if (DB.items.length <= 400) db = DB.items.map(m => `${m.name} | ${m.unit} | ${m.price}`);
  else { const ws = words(question || ""); db = DB.items.filter(m => { const h = norm(m.name + " " + m.cat); return ws.some(w => h.includes(w)); }).slice(0, 120).map(m => `${m.name} | ${m.unit} | ${m.price}`); }
  return JSON.stringify({object: P.name || "", rooms, commonItems: common, purchaseSummary: sum.map(s => ({name: s.name, qty: s.qty, unit: s.unit, price: s.price, sum: s.sum})),
    ourTotal: r2(sum.reduce((a, s) => a + s.sum, 0)),
    customerEstimate: C && C.lines.length ? {lines: C.lines.map(l => ({section: l.section, name: l.name, kind: l.kind, unit: l.unit, qty: num(l.qty), price: num(l.price), sum: lineSum(l)})), statedTotal: C.total} : null,
    priceBase: {totalItems: DB.items.length, file: DB.file, items: db, note: DB.items.length > 400 ? "показаны только позиции, похожие на вопрос" : "вся база"}});
}
const CHAT_SYSTEM = `Ты — помощник прораба в программе расчёта ремонта. Отвечай по-русски, коротко и по делу, простыми словами, с цифрами.
Опирайся только на данные объекта из программы (они ниже в JSON): замеры комнат, расчёт материалов, смета заказчика, база цен пользователя.
Цены не придумывай и не бери из интернета — только из базы пользователя и сметы. Если данных не хватает — так и скажи и подскажи, что внести в программу.
Считай аккуратно, показывай расчёт кратко. Единицы: метры, м², м.п., рубли.`;
const QUICK = ["Влезаем ли мы в смету заказчика?", "Что я мог забыть в расчёте?", "Проверь расход материалов — нет ли ошибок?", "Сколько всего стоят материалы по каждой комнате?"];
function renderChat(){
  const log = $("#chatLog"); if (!log) return;
  const chat = P.chat || [];
  log.innerHTML = (aiReady() ? "" : `<div class="errbox">ИИ не подключён. Нажмите «⚙ ИИ» вверху.</div>`) +
    (chat.length ? chat.map(m => `<div class="msg ${m.role}">${fmtMsg(m.text)}</div>`).join("") : `<div class="empty">Задайте вопрос про этот объект.</div>`);
  $("#chatQuick").innerHTML = QUICK.map(q => `<button class="small" data-q="${esc(q)}">${esc(q)}</button>`).join("");
  log.scrollTop = log.scrollHeight;
}
function fmtMsg(t){ return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#{1,4} (.*)$/gm, "<b>$1</b>"); }
async function sendChat(text){
  text = (text || "").trim(); if (!text) return;
  if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; }
  P.chat = P.chat || []; P.chat.push({role: "user", text}); $("#chatInput").value = ""; save(); renderChat();
  const hist = P.chat.slice(-20).map(m => ({role: m.role, parts: [{text: m.text}]}));
  const reply = await withBusy($("#chatMsg"), "ИИ думает", signal => callAI({signal, maxTokens: 4000, system: CHAT_SYSTEM + "\n\nДанные объекта:\n" + projectContext(text), messages: hist}));
  if (reply !== null) { P.chat.push({role: "assistant", text: reply.trim() || "(пустой ответ)"}); save(); renderChat(); }
  else { P.chat.pop(); $("#chatInput").value = text; save(); renderChat(); }
}
$("#chatSend").onclick = () => sendChat($("#chatInput").value);
$("#chatInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(e.target.value); } });
$("#chatQuick").addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (b) sendChat(b.dataset.q); });
$("#btnChatClear").onclick = () => { if ((P.chat || []).length && confirm("Очистить переписку по этому объекту?")) { P.chat = []; save(); renderChat(); } };
