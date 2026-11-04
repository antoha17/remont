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
/* Текст в старых PDF часто «кракозябры» (кириллица в кодировке Windows-1251, прочитанная как латиница) — чиним */
function fixMojibake(t){
  const lat = (t.match(/[À-ÿ]/g) || []).length, cyr = (t.match(/[а-яё]/gi) || []).length;
  if (lat < 3 || cyr > lat) return t;
  const bytes = new Uint8Array([...t].map(ch => { const c = ch.charCodeAt(0); return c < 256 ? c : 63; }));
  try { return new TextDecoder("windows-1251").decode(bytes); } catch(e) { return t; }
}
function cut(cv, x, y, w, h, maxSide){ const k = Math.min(1, maxSide / Math.max(w, h)), c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(cv, x, y, w, h, 0, 0, c.width, c.height); return canvasJPEG(c); }
/* Мелкие размеры на чертеже ИИ видит плохо, если лист целиком уменьшен. Поэтому кроме общего вида
   готовим 4 увеличенных фрагмента с перекрытием (tiles) — их отправляем при распознавании плана. */
function tilesOf(cv){
  const W = cv.width, H = cv.height, ov = 0.1, tw = Math.round(W * (0.5 + ov)), th = Math.round(H * (0.5 + ov)), out = [];
  for (const [x, y] of [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]]) out.push(cut(cv, x, y, tw, th, 2000));
  return out;
}
async function fileToImages(file, maxPages = 8, opts = {}){
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    initPdf();
    const doc = await pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: false}).promise;
    const out = [], big = opts.tiles ? 3800 : MAXPX;
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i), v1 = page.getViewport({scale: 1});
      const scale = Math.min(6, big / Math.max(v1.width, v1.height)), vp = page.getViewport({scale});
      const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      await page.render({canvasContext: g, viewport: vp}).promise;
      let text = ""; try { text = (await page.getTextContent()).items.map(x => fixMojibake(x.str)).join(" "); } catch(e) {}
      out.push({name: `${file.name}, стр. ${i}`, url: cut(cv, 0, 0, cv.width, cv.height, MAXPX), tiles: opts.tiles ? tilesOf(cv) : null, text});
      cv.width = cv.height = 1;
    }
    if (doc.numPages > maxPages) toast(`В PDF ${doc.numPages} стр., взяты первые ${maxPages}`);
    return out;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad({msg: `Не удалось открыть «${file.name}». Подходят JPG, PNG и PDF.`}); i.src = url; });
    const big = opts.tiles ? 3800 : MAXPX, k = Math.min(1, big / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return [{name: file.name, url: cut(cv, 0, 0, cv.width, cv.height, MAXPX), tiles: opts.tiles && Math.max(cv.width, cv.height) > 2400 ? tilesOf(cv) : null, text: ""}];
  } finally { URL.revokeObjectURL(url); }
}
async function filesToImages(files, opts){ const out = []; for (const f of files) out.push(...await fileToImages(f, 8, opts)); return out; }

/* ---------- Проект (PDF) для просмотра: хранится на устройстве (IndexedDB), в файл объекта не попадает ---------- */
let projPages = [], projPage = 0, projZoom = 1;
function idb(){ return new Promise((ok, bad) => { try { const q = indexedDB.open("remont", 1); q.onupgradeneeded = () => q.result.createObjectStore("files"); q.onsuccess = () => ok(q.result); q.onerror = () => bad(q.error); } catch(e) { bad(e); } }); }
async function idbPut(key, val){ try { const db = await idb(); await new Promise((ok, bad) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(val, key); tx.oncomplete = ok; tx.onerror = () => bad(tx.error); }); } catch(e) { /* хранилище недоступно — проект будет только до перезагрузки */ } }
async function idbGet(key){ try { const db = await idb(); return await new Promise((ok, bad) => { const q = db.transaction("files").objectStore("files").get(key); q.onsuccess = () => ok(q.result); q.onerror = () => bad(q.error); }); } catch(e) { return null; } }
function setProject(pages, file){
  projPages = pages; projPage = Math.max(0, pages.findIndex(p => /обмерн/i.test(p.title || ""))); projZoom = 1;
  P.project = {file, pages: pages.length, text: pages.map((p, i) => `[Лист ${i + 1}${p.title ? " — " + p.title : ""}] ` + (p.text || "").replace(/\s+/g, " ")).join("\n").slice(0, 12000)};
  save(); idbPut("project", {pages, file});
}
function clearProject(){ projPages = []; idbPut("project", null); if (P) delete P.project; }
idbGet("project").then(v => { if (v && v.pages && v.pages.length && P.project) { projPages = v.pages; projPage = Math.max(0, v.pages.findIndex(p => /обмерн/i.test(p.title || ""))); if (viewMode === "proj") renderProject(); } });
function renderProject(){
  const el = $("#view");
  if (!projPages.length) {
    el.innerHTML = `<div class="empty" style="padding-top:60px">Проект не загружен.<br><br><button class="primary" id="projLoad">Загрузить проект (PDF или фото)…</button>
      <div class="muted" style="margin-top:10px;font-size:12px">Проект нужен для наглядности: посмотреть, что где. Расчёты идут по смете.<br>Проект хранится только на этом устройстве.</div></div>`;
    return;
  }
  const pg = projPages[Math.min(projPage, projPages.length - 1)];
  el.innerHTML = `<div style="position:absolute;inset:0;overflow:auto;background:#fff" id="projScroll"><img src="${pg.url}" alt="" style="display:block;width:${projZoom * 100}%;max-width:none"></div>
    <div class="zoombtns noprint"><button data-pz="in" title="Приблизить">+</button><button data-pz="out" title="Отдалить">−</button><button data-pz="fit" title="По ширине">⤢</button></div>
    <div class="noprint" style="position:absolute;left:8px;bottom:8px;right:56px;display:flex;gap:4px;flex-wrap:wrap">
      ${projPages.map((p, i) => `<button class="small" data-pp="${i}" style="${i === projPage ? "background:var(--accent);color:#fff" : "background:rgba(255,255,255,.95)"}">${esc(p.title || "Лист " + (i + 1))}</button>`).join("")}
      <button class="small" id="projLoad" style="background:rgba(255,255,255,.95)">Заменить…</button></div>`;
}
$("#view").addEventListener("click", e => {
  if (viewMode !== "proj") return;
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "projLoad") { const i = document.createElement("input"); i.type = "file"; i.accept = "application/pdf,image/*"; i.multiple = true;
    i.onchange = async () => { const files = [...i.files]; if (!files.length) return; $("#view").innerHTML = `<div class="busy" style="margin:20px">Открываю проект…</div>`;
      try { const pages = (await filesToImages(files, {tiles: true})).map(p => ({...p, title: pageTitle(p.text)})); setProject(pages, files.map(f => f.name).join(", ")); }
      catch(err) { toast(err.msg || "Не удалось открыть файл"); } renderProject(); };
    i.click(); return; }
  if (t.dataset.pp !== undefined) { projPage = +t.dataset.pp; projZoom = 1; renderProject(); }
  if (t.dataset.pz) { projZoom = t.dataset.pz === "fit" ? 1 : Math.min(8, Math.max(1, projZoom * (t.dataset.pz === "in" ? 1.5 : 1 / 1.5))); const sc = $("#projScroll"), fx = (sc.scrollLeft + sc.clientWidth / 2) / sc.scrollWidth, fy = (sc.scrollTop + sc.clientHeight / 2) / sc.scrollHeight;
    renderProject(); const s2 = $("#projScroll"); s2.scrollLeft = fx * s2.scrollWidth - s2.clientWidth / 2; s2.scrollTop = fy * s2.scrollHeight - s2.clientHeight / 2; }
});

/* ---------- Распознавание плана ---------- */
let recPages = [], recLast = null; // recLast: {pages, notes, checks, backup}
function openRecognize(){
  if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; }
  recPages = projPages.map(p => ({...p, on: /обмерн/i.test(p.title || "")}));
  if (recPages.length && !recPages.some(p => p.on)) recPages.forEach(p => p.on = true);
  renderRec(); $("#recModal").classList.add("on");
}
function renderRec(){
  $("#recBody").innerHTML = `
    <div class="muted" style="margin:8px 0">Загрузите схему объекта: PDF или фото (можно несколько). ИИ прочитает размеры и построит комнаты. Результат — черновик: обязательно сверьте размеры со схемой.</div>
    <div class="row"><button class="primary" id="recPick">Выбрать PDF или фото…</button><input type="file" id="recFile" accept="application/pdf,image/*" multiple hidden></div>
    ${recPages.length ? `${recPages.length > 1 ? `<div class="muted" style="font-size:12px">Отметьте листы с размерами (обычно «Обмерный план»). Листы с мебелью, светом и электрикой для размеров не нужны.</div>` : ""}
    <div class="thumbs">${recPages.map((p, i) => `<label><img src="${p.url}" alt=""><span><input type="checkbox" data-pg="${i}" ${p.on ? "checked" : ""}> ${esc(p.title || p.name)}</span></label>`).join("")}</div>
    <div class="fields">
      <label>Подсказка для ИИ</label><input id="recHint" placeholder="необязательно: «размеры в мм», «высота потолков 2,75», «только 2 этаж»">
      <label>Куда</label><select id="recMode"><option value="replace">Заменить комнаты объекта</option><option value="append">Добавить к имеющимся</option></select>
    </div>
    <div class="row" style="margin-top:10px"><button class="primary" id="recGo">Распознать</button></div>` : ""}
    <div id="recMsg"></div>`;
}
$("#btnRecognize").onclick = openRecognize;
function pageTitle(t){ // название листа проекта: «ОБМЕРНЫЙ ПЛАН», «ПЛАН РАССТАНОВКИ МЕБЕЛИ»…
  const m = String(t || "").match(/(обмерный план|план[а-яё\s]{0,40}?(мебели|светильников|освещени[ея]м?|электрооборудования|розеток|полов|потолк[а-яё]*|демонтажа|монтажа)|развертк[а-яё]*|экспликаци[яи])/i);
  return m ? m[0].replace(/\s+/g, " ").toUpperCase() : "";
}
$("#recBody").addEventListener("click", e => { if (e.target.id === "recPick") $("#recFile").click(); if (e.target.id === "recGo") recognizePlan(); });
$("#recBody").addEventListener("change", async e => {
  if (e.target.dataset.pg !== undefined) { recPages[+e.target.dataset.pg].on = e.target.checked; return; }
  if (e.target.id !== "recFile") return;
  const files = [...e.target.files]; if (!files.length) return;
  $("#recMsg").innerHTML = `<div class="busy">Открываю файлы…</div>`;
  try {
    recPages = (await filesToImages(files, {tiles: true})).map(p => ({...p, title: pageTitle(p.text), on: true}));
    // в проекте много листов (мебель, свет, электрика) — для размеров нужен обмерный план
    const meas = [/обмерн/i, /план\s+(помещений|квартиры)/i, /экспликац/i].map(re => recPages.filter(p => re.test(p.text))).find(x => x.length) || [];
    if (meas.length) recPages.forEach(p => p.on = meas.includes(p));
    setProject(recPages.map(({name, title, url, tiles, text}) => ({name, title, url, tiles, text})), files.map(f => f.name).join(", ")); // проект сохраняется для просмотра
    renderRec();
  }
  catch(err) { $("#recMsg").innerHTML = `<div class="errbox">${esc(err.msg || "Не удалось открыть файл: " + (err.message || err))}</div>`; }
});
const PLAN_PROMPT = `На изображениях — план (обмерный план, схема, чертёж) квартиры или помещения. Восстанови помещения для программы расчёта ремонта.
Для каждого листа сначала идёт общий вид, затем 4 увеличенных фрагмента этого же листа с перекрытием (левый верхний, правый верхний, левый нижний, правый нижний) — мелкие размеры читай по фрагментам, расположение — по общему виду.
Верни ТОЛЬКО JSON без пояснений:
{"rooms":[{"name":"строка","num":"номер помещения по экспликации или null","area":число|null,"h":число|null,"x":число,"y":число,
  "walls":[{"dir":"R"|"D"|"L"|"U","len":число}],
  "openings":[{"type":"door"|"window"|"arch","wall":целое,"pos":число,"w":число,"h":число|null,"sill":число|null}]}],
 "totalArea":число|null, "notes":"строка"}
Правила:
- Все размеры — в метрах. На чертежах размеры обычно в миллиметрах (3450 = 3.45) — переведи.
- Если на листе есть ЭКСПЛИКАЦИЯ ПОМЕЩЕНИЙ (таблица № / наименование / площадь) — бери названия и номера помещений оттуда,
  area — площадь из экспликации; totalArea — итог экспликации. Каждое помещение из экспликации должно быть в rooms.
- Каждая комната — отдельный контур по внутренним размерам (размеры, проставленные внутри помещения вдоль стен).
- Обход стен каждой комнаты — по часовой стрелке, начиная с самого верхнего из самых левых углов; первая стена обычно идёт вправо.
  Направления как на листе: R — вправо, D — вниз, L — влево, U — вверх. Контур обязательно замкнут: сумма R = сумме L, сумма D = сумме U.
  Выступы, ниши, короба — отдельными стенами контура. Косые и скруглённые стены приближай прямыми углами и упомяни в notes.
- Высота потолка помещения часто подписана внутри помещения как «H - 2660 мм» или «H=2,66» — это h (в метрах).
- Окна: «Н проема окна - 1480 мм» — высота окна h; «Н подоконника - 990 мм» — sill (высота от пола до низа окна).
  Двери/проёмы: «Н проема - 2170 мм» — высота h; «Н порога» — не высота от пола, sill = 0. Ширину проёма бери из размеров на плане.
- x, y — положение начального угла комнаты на общем плане в метрах от левого верхнего угла плана, чтобы комнаты стояли так же, как на чертеже (с учётом толщины стен).
- Проёмы: wall — номер стены (с 0) в списке walls этой комнаты; pos — расстояние от начала стены (по ходу обхода) до ближнего края проёма; w — ширина.
  Дверь: если высота не указана — h 2.0. Окно: если не указано — h 1.4, sill 0.8. Проём без двери — "arch". Дверь между двумя комнатами указывай в обеих комнатах.
- Балконы и лоджии — отдельными помещениями.
- Листы с мебелью, светильниками, электрикой для размеров не используй (если они приложены).
- Ничего не выдумывай: если размер не читается, оцени по соседним размерам или площади из экспликации и обязательно напиши об этом в notes.
- Проверь себя: площадь по твоим размерам должна быть близка к площади из экспликации (±3%). Если нет — перечитай размеры.
- notes — кратко по-русски: что не удалось прочитать, что оценено примерно, на что обратить внимание.`;
async function recognizePlan(){
  const pages = recPages.filter(p => p.on);
  if (!pages.length) { $("#recMsg").innerHTML = `<div class="errbox">Отметьте хотя бы одну страницу.</div>`; return; }
  const hint = $("#recHint").value.trim(), mode = $("#recMode").value;
  const res = await withBusy($("#recMsg"), "ИИ читает схему (обычно 20–90 секунд)", async signal => parseAIJSON(await callAI({signal,
    system: "Ты — опытный прораб и сметчик, отлично читаешь строительные чертежи. Отвечаешь только JSON.",
    messages: [{role: "user", parts: [...pages.flatMap(p => [{image: p.url}, ...(pages.length <= 2 && p.tiles ? p.tiles.map(t => ({image: t})) : [])]),
      {text: PLAN_PROMPT + (pages.some(p => p.text) ? "\nТекст, извлечённый из PDF (может помочь прочитать подписи):\n" + pages.map(p => p.text).join("\n").slice(0, 6000) : "") + (hint ? "\nПодсказка от пользователя: " + hint : "")}]}]})));
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
  recLast = {pages, notes: String(res.notes || ""), checks, backup, totalArea: num(res.totalArea) || null, sumArea: r2(rooms.reduce((a, r) => a + metrics(r).floor, 0))};
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
    ${recLast.totalArea ? `<div style="margin:4px 0" class="${Math.abs(recLast.totalArea - recLast.sumArea) / recLast.totalArea > 0.03 ? "warn" : ""}">Общая площадь: по экспликации ${fmt(recLast.totalArea)} м², по построенным комнатам ${fmt(recLast.sumArea)} м².</div>` : ""}
    ${bad.length ? `<div class="warn" style="margin:4px 0">${bad.map(c => c.open ? `«${esc(c.name)}»: контур не замкнут — проверьте длины стен.` : `«${esc(c.name)}»: по схеме ${fmt(c.label)} м², по размерам ${fmt(c.area)} м².`).join("<br>")}</div>`
      : `<div style="color:var(--ok);margin:4px 0">Площади совпадают с подписанными на схеме (где они были).</div>`}
    <details><summary>Показать схему</summary><div class="thumbs">${recLast.pages.map(p => `<a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="" style="max-width:100%;max-height:none"></a>`).join("")}</div></details>
  </div>`;
}
$("#recReport").addEventListener("click", e => {
  if (e.target.id === "recHide") { recLast = null; renderRecReport(); }
  if (e.target.id === "recUndo" && recLast) { P = JSON.parse(recLast.backup); sel = P.rooms[0]?.id || null; recLast = null; save(); renderAll(); toast("Распознавание отменено"); }
});

/* ---------- Смета работ (согласованная с заказчиком) и акт выполненных работ ---------- */
// P.works — смета работ, P.act — акт: {lines:[{id, ref, section, name, unit, qty, price, sum, kind}], total, notes, files}
function docOf(k){
  if (k === "works" && !P.works && P.client && (P.client.lines || []).length) // старый раздел «Смета заказчика» → смета работ
    P.works = {lines: P.client.lines, total: P.client.total ?? null, notes: P.client.notes || "", files: P.client.files || ""};
  if (P.client) delete P.client;
  return (P[k] = P[k] || {lines: [], total: null, notes: "", files: ""});
}
const DOC_NAME = {works: "смету работ", act: "таблицу акта", mats: "смету материалов"};
const lineSum = l => (l.sum !== "" && l.sum != null) ? num(l.sum) : r2(num(l.qty) * num(l.price));
const docSum = d => r2(d.lines.reduce((a, l) => a + lineSum(l), 0));
const workLines = d => d.lines.filter(l => l.kind !== "material");
const docSumD = (d, pct) => { const k = pct == null ? discK() : 1 - num(pct) / 100; return r2(d.lines.reduce((a, l) => a + lineSum(l) * (l.nodisc ? 1 : k), 0)); }; // с учётом скидки
const discK = () => 1 - Math.min(100, Math.max(0, num(docOf("works").discount))) / 100; // скидка из сметы работ — и к акту
const KIND = {work: "работа", material: "материал", other: "прочее"};
function words(s){ return norm(s).replace(/[^a-zа-я0-9 ]/g, " ").split(" ").filter(w => w.length > 2 && !/^(для|под|без|мм|шт)$/.test(w)).map(w => w.slice(0, 5)); }
const DOC_PROMPT = what => `На изображениях — ${what} (или его часть) по ремонту квартиры: работы и, возможно, материалы. Перепиши ВСЕ строки в таблицу.
Верни ТОЛЬКО JSON без пояснений:
{"lines":[{"room":"помещение, если смета разбита по помещениям, иначе пусто","section":"раздел или пусто","name":"наименование","unit":"ед. изм.","qty":число|null,"price":число|null,"sum":число|null,"kind":"work"|"material"|"other"}],
 "total":число|null, "discount":число|null, "notes":"строка"}
Правила:
- discount — скидка в процентах, если указана (например 10), иначе null.
- Переписывай как есть, ничего не выдумывай и не пересчитывай. Числа — с точкой как разделителем дробной части, без пробелов и валюты.
- Строки «Итого» по разделам в lines не включай; общий итог документа — в total.
- kind: work — работы, material — материалы, other — прочее (доставка, вывоз мусора и т. п.).
- Если документ на нескольких фото — объедини, повторяющиеся строки не дублируй.
- notes — кратко по-русски: что не удалось прочитать или прочитано неуверенно.`;
function normLine(l){
  return {id: uid(), ref: l.ref || null, room: String(l.room || "").trim(), section: String(l.section || ""), name: String(l.name || ""), unit: String(l.unit || ""),
    qty: l.qty == null || l.qty === "" ? "" : num(l.qty), price: l.price == null || l.price === "" ? "" : num(l.price), sum: l.sum == null || l.sum === "" ? "" : num(l.sum),
    kind: KIND[l.kind] ? l.kind : "work", ...(l.nodisc ? {nodisc: true} : {})};
}
/* Excel-смета разбирается без ИИ. Понимает сметы-шаблоны: на листе все виды работ, а в смету входят только строки,
   отмеченные «1» в отдельной колонке; повторяющиеся заголовки «ед. изм. / кол-во / цена / сумма» у каждого раздела;
   подразделы («Полы», «Стены»); строки «Итого…»; «Скидка, %»; лист = помещение. */
function linesFromSheet(ws){
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: ""});
  const T = c => norm(c), isNum = c => typeof c === "number" || /^-?\d+([.,]\d+)?$/.test(String(c).trim());
  const isQty = c => /^(кол-?во|количество|объ[её]м|кол\.)/.test(T(c)), isPrice = c => /^(цена|расценк|стоимость ед)/.test(T(c)), isSum = c => /^(сумма|стоимость|всего)/.test(T(c));
  let col = null, big = "", sub = "", total = null, discount = null, zeroTotal = false; const cand = [];
  for (const r of rows) {
    // скидка, % — где угодно на листе
    const di = r.findIndex(c => /^скидка/.test(T(c)));
    if (di >= 0) { const v = r.slice(di + 1).find(isNum); if (v !== undefined && num(v) > 0 && (num(v) <= 1 || /%/.test(T(r[di])))) discount = num(v) <= 1 ? r2(num(v) * 100) : num(v); }
    const qi = r.findIndex(isQty);
    if (qi >= 0 && (r.some(isPrice) || r.some(isSum))) { // строка заголовков (может повторяться у каждого раздела)
      if (!col) {
        const unit = r.findIndex(c => /^ед/.test(T(c)));
        let name = r.findIndex(c => /наимен|название|вид работ|работ|товар|позиция/.test(T(c)));
        if (name < 0 || name > qi) name = unit > 0 ? unit - 1 : qi - 1;
        col = {name, unit, qty: qi, price: r.findIndex(isPrice), sum: r.findIndex(isSum)};
      }
      const t = String(r[col.name] || "").trim();
      big = /наимен|название/.test(T(t)) ? "" : t; sub = "";
      continue;
    }
    if (!col) continue;
    const name = String(r[col.name] ?? "").trim(), texts = r.map(c => String(c).trim()).filter(c => c && !isNum(c));
    if (/^(итого|всего)/i.test(name) || /^(итого|всего)/i.test(texts[0] || "")) {
      const t = T(name || texts[0]), v = num(r[col.sum]);
      if (!/скидк|раздел/.test(t) && /помещени|стоимость работ|по смете|^всего|^итого:?$/.test(t)) { if (v) total = v; else if (isNum(r[col.sum])) zeroTotal = true; }
      continue;
    }
    const q = r[col.qty], sm = col.sum >= 0 ? r[col.sum] : "", pr = col.price >= 0 ? r[col.price] : "";
    if (!name) { if (texts.length === 1) sub = texts[0]; continue; }
    if (!isNum(q) && !isNum(sm) && !isNum(pr)) { sub = name; continue; } // подраздел
    if (/^скидка/i.test(name)) continue;
    if (!isNum(q) && !isNum(pr)) continue; // только сумма без количества и цены — это подытог, не работа
    cand.push({r, line: {section: [big, sub].filter(Boolean).join(" / "), name, unit: col.unit >= 0 ? r[col.unit] : "", qty: q, price: pr, sum: sm, kind: /материал/i.test(big + sub) ? "material" : "work"}});
  }
  if (!cand.length) return discount != null ? {lines: [], total: null, discount, flagged: false, all: 0} : null;
  // колонка-отметка «1 — входит в смету»: только 0/1/пусто, есть и отмеченные, и неотмеченные строки
  let flag = -1, noneSelected = false;
  for (let c = 0; c < col.name; c++) {
    const vals = cand.map(x => x.r[c]);
    if (!vals.every(v => v === "" || v === 0 || v === 1 || v === "0" || v === "1")) continue;
    const ones = vals.filter(v => v !== "" && +v === 1).length, explicit = vals.filter(v => v !== "").length;
    if (ones && ones < vals.length) { flag = c; break; }
    if (!ones && explicit >= vals.length * 0.5) { // везде 0: если и количества везде 1 — это пустой шаблон/прайс, ничего не выбрано
      // итог в документе 0 при ненулевых строках или везде количество 1 — это пустой шаблон-прайс, ничего не выбрано
      if (zeroTotal || cand.every(x => !isNum(x.line.qty) || num(x.line.qty) === 1)) { flag = c; noneSelected = true; }
      break;
    }
  }
  const lines = cand.filter(x => flag < 0 || +x.r[flag] === 1).map(x => normLine(x.line)).filter(l => num(l.qty) || num(l.sum));
  if (!lines.length && noneSelected) return {lines: [], total, discount, flagged: true, all: cand.length, noneSelected: true};
  return lines.length ? {lines, total, discount, flagged: flag >= 0, all: cand.length} : null;
}
/* Размеры помещения в шапке листа сметы: строка «L,м/п | B,м/п | H,м/п | Проем, м2», значения — строкой ниже;
   «Периметр», «Площадь пола», «Площадь стен» — значение под подписью. */
function roomDimsFromSheet(ws, name){
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: ""}).slice(0, 30), T = c => norm(c), d = {name};
  const below = (i, j) => { for (let k = i + 1; k < Math.min(rows.length, i + 3); k++) if (typeof rows[k][j] === "number") return rows[k][j]; return null; };
  rows.forEach((r, i) => r.forEach((c, j) => {
    const t = T(c);
    if (d.L == null && /^l\s*,/.test(t)) d.L = below(i, j);
    if (d.B == null && /^b\s*,/.test(t)) d.B = below(i, j);
    if (d.H == null && /^h\s*,/.test(t)) d.H = below(i, j);
    if (d.open == null && /^про[её]м/.test(t)) d.open = below(i, j);
    if (d.perim == null && /^периметр$/.test(t)) d.perim = below(i, j);
    if (d.floor == null && /^площадь пола$/.test(t)) d.floor = below(i, j);
    if (d.walls == null && /^площадь стен$/.test(t)) d.walls = below(i, j);
  }));
  return num(d.L) > 0 && num(d.B) > 0 ? d : null;
}
const DOC_MSG = {works: "#worksMsg", act: "#actMsg", mats: "#matsMsg"};
const renderDoc = k => k === "works" ? renderWorks() : k === "mats" ? renderMats() : renderAct();
async function loadDoc(k, files){
  const D = docOf(k), msg = $(DOC_MSG[k]);
  if (D.lines.length && !confirm(`Заменить уже загруженную ${DOC_NAME[k]}?`)) return;
  const xl = files.filter(f => /\.(xlsx|xlsm|xls|csv)$/i.test(f.name)), other = files.filter(f => !xl.includes(f));
  let res = null;
  if (xl.length && !other.length) {
    msg.innerHTML = `<div class="busy">Читаю Excel…</div>`; await new Promise(r => setTimeout(r, 50));
    const parts = [], dims = []; let discount = null, empty = false;
    for (const f of xl) {
      const wb = XLSX.read(await f.arrayBuffer(), {type: "array"});
      wb.SheetNames.forEach((sn, i) => { if (wb.Workbook?.Sheets?.[i]?.Hidden) return; // скрытые листы пропускаем
        const r = linesFromSheet(wb.Sheets[sn]); if (r) { if (r.discount != null) discount = r.discount; if (r.noneSelected) empty = true; if (r.lines.length) parts.push({sn: sn.trim(), ...r}); }
        const dm = roomDimsFromSheet(wb.Sheets[sn], sn.trim()); if (dm) dims.push(dm); });
    }
    msg.innerHTML = "";
    if (!parts.length) { msg.innerHTML = empty
      ? `<div class="errbox">В файле не отмечена ни одна позиция (в колонке-отметке везде 0, итог сметы 0) — это пустой шаблон-прайс. Его место — «База материалов» (вкладка 3); сюда загружайте заполненную смету.</div>`
      : `<div class="errbox">Не нашёл в Excel таблицу с колонками «Наименование» и «Количество»/«Сумма».</div>`; return; }
    const multi = parts.length > 1, lines = [];
    // если скидка есть в смете, но на каком-то листе её нет (например, «Спецмонтаж») — строки этого листа без скидки
    const someDisc = parts.some(x => x.discount != null);
    for (const x of parts) for (const l of x.lines) { if (multi) l.room = x.sn; if (discount && someDisc && x.discount == null) l.nodisc = true; lines.push(l); }
    const total = parts.every(x => x.total != null) ? r2(parts.reduce((a, x) => a + x.total, 0)) : (multi ? null : parts[0].total);
    const notes = [multi ? `Прочитано листов: ${parts.length} (${parts.map(x => x.sn).join(", ")}).` : "",
      parts.some(x => x.flagged) ? "В смету взяты только строки, отмеченные «1» (остальные — шаблон)." : "",
      discount ? `Скидка из сметы: ${discount}%${lines.some(l => l.nodisc) ? ` (кроме: ${[...new Set(lines.filter(l => l.nodisc).map(l => l.room))].join(", ")})` : ""}.` : ""].filter(Boolean).join(" ");
    res = {lines, total, notes, discount, dims};
  } else {
    if (!aiReady()) { toast("Для PDF и фото нужен ИИ — подключите его"); openAI(); return; }
    res = await withBusy(msg, `ИИ читает ${DOC_NAME[k]} (обычно 20–120 секунд)`, async signal => {
      const pages = await filesToImages(other);
      return parseAIJSON(await callAI({signal, maxTokens: 16000, system: "Ты — внимательный сметчик. Отвечаешь только JSON.",
        messages: [{role: "user", parts: [...pages.map(p => ({image: p.url})), {text: DOC_PROMPT(k === "act" ? "акт выполненных работ" : k === "mats" ? "смета на материалы" : "смета")}]}]}));
    });
    if (!res) return;
    res.lines = (res.lines || []).filter(l => l && l.name).map(normLine);
    if (res.discount != null && !(num(res.discount) > 0 && num(res.discount) < 100)) res.discount = null;
  }
  D.lines = res.lines; D.total = res.total == null ? null : num(res.total); D.notes = String(res.notes || ""); D.files = files.map(f => f.name).join(", ");
  if (k !== "act") D.discount = res.discount != null ? num(res.discount) : 0; // новая смета — своя скидка
  if (k === "mats") D.lines.forEach(l => l.kind = "material");
  if (k === "works") D.roomDims = (res.dims || []).filter(d => num(d.L) > 0);
  if (k === "act") { const n = D.lines.length; D.lines = workLines(D); if (n > D.lines.length) toast(`Строки материалов (${n - D.lines.length}) пропущены — в акте только работы`); autoRef(); }
  save(); renderDoc(k); toast(`Строк: ${D.lines.length}`);
  if (k === "works" && D.roomDims.length && confirm(`В смете есть размеры ${D.roomDims.length} помещений (${D.roomDims.map(d => d.name).join(", ")}).\n${P.rooms.length ? "Заменить ими комнаты на плане?" : "Построить по ним комнаты?"}`)) roomsFromEstimate(true);
}
$("#btnRoomsEst").onclick = () => { const d = docOf("works").roomDims || [];
  if (!d.length) { toast("Сначала загрузите смету работ с размерами помещений (вкладка 2)"); return; }
  if (!P.rooms.length || confirm(`Заменить комнаты на плане помещениями из сметы (${d.length})?`)) roomsFromEstimate(true); };
/* Комнаты из размеров в смете: прямоугольник L×B, высота H, проёмы — общей площадью, поправка площади пола как в смете */
function roomsFromEstimate(replace){
  const dims = docOf("works").roomDims || [];
  if (!dims.length) { toast("В смете работ нет размеров помещений (L, B, H)"); return; }
  const rooms = []; let x = 0, y = 0, rowH = 0;
  for (const d of dims) {
    const L = r2(num(d.L)), B = r2(num(d.B)), r = newRoom(d.name, L, B);
    r.h = num(d.H) > 1 ? r2(num(d.H)) : 2.7; r.openArea = r2(num(d.open));
    if (d.floor != null && Math.abs(num(d.floor) - L * B) > 0.005) r.floorAdj = r2(num(d.floor) - L * B);
    if (x > 0 && x + L > 14) { x = 0; y = r2(y + rowH + 1); rowH = 0; }
    r.x = x; r.y = y; x = r2(x + L + 1); rowH = Math.max(rowH, B); rooms.push(r);
  }
  if (replace || !P.rooms.length) P.rooms = rooms; else P.rooms.push(...rooms);
  sel = rooms[0].id; save(); renderAll(); toast(`Комнат из сметы: ${rooms.length}. Расположение условное — размеры как в смете`);
}
const showNum = (v, d) => v === "" || v == null ? "" : (typeof v === "number" ? Math.round(v * 10 ** d) / 10 ** d : v);
function linesTable(k, D, cols){
  const kindCol = k !== "act", ncol = 7 + (kindCol ? 1 : 0) + (cols ? cols.n : 0);
  const sums = new Map(); D.lines.forEach(l => sums.set(l.room, r2((sums.get(l.room) || 0) + lineSum(l))));
  const grouped = D.lines.some(l => l.room);
  let last = null;
  return `<div class="scrollx"><table class="est"><tr><th>Раздел</th><th>Наименование</th>${kindCol ? "<th>Тип</th>" : ""}<th>Ед.</th><th class="r">Кол-во</th><th class="r">Цена</th><th class="r">Сумма</th>${cols ? cols.head : ""}<th></th></tr>
    ${D.lines.map((l, i) => { let g = "";
      if (grouped && l.room !== last) { last = l.room; g = `<tr class="grp"><td colspan="${ncol}" style="background:var(--accent-soft)"><b>${esc(l.room || "Без помещения")}</b> <span class="muted">· ${money(sums.get(l.room))}</span></td></tr>`; }
      return g + `<tr data-doc="${k}" data-li="${i}">
      <td><input data-k="section" value="${esc(l.section)}" style="width:130px" title="${esc(l.section)}"></td>
      <td><input data-k="name" value="${esc(l.name)}" style="width:280px" title="${esc(l.name)}"></td>
      ${kindCol ? `<td><select data-k="kind">${Object.entries(KIND).map(([kk, v]) => `<option value="${kk}" ${l.kind === kk ? "selected" : ""}>${v}</option>`).join("")}</select></td>` : ""}
      <td><input data-k="unit" value="${esc(l.unit)}" style="width:56px"></td>
      <td class="r"><input class="num" data-k="qty" value="${esc(showNum(l.qty, 3))}" inputmode="decimal"></td>
      <td class="r"><input class="num" data-k="price" value="${esc(showNum(l.price, 2))}" inputmode="decimal"></td>
      <td class="r"><b>${money(lineSum(l))}</b></td>${cols ? cols.row(l) : ""}
      <td class="noprint"><button class="icon danger" data-ldel="1">✕</button></td></tr>`; }).join("")}</table></div>`;
}
function docHeader(D){
  const s = docSum(D);
  return `${D.notes ? `<div class="box" style="background:#fffaf0">${esc(D.notes)}</div>` : ""}
    ${D.total != null && Math.abs(D.total - s) > 1 ? `<div class="warn" style="margin:6px 0">Сумма строк (${money(s)}) не совпадает с итогом в документе (${money(D.total)}) — возможно, какая-то строка прочитана неверно или не попала.</div>` : ""}`;
}
// таблицы редактируются одинаково в обоих разделах
for (const sel of ["#works", "#act", "#mats"]) {
  $(sel).addEventListener("change", e => {
    const t = e.target, tr = t.closest("tr[data-doc]"); if (!tr || !t.dataset.k) return;
    const k = tr.dataset.doc, l = docOf(k).lines[+tr.dataset.li];
    if (t.dataset.k === "ref") l.ref = t.value || null;
    else if (["qty", "price"].includes(t.dataset.k)) { l[t.dataset.k] = t.value.replace(",", "."); l.sum = ""; } // сумма пересчитается
    else l[t.dataset.k] = t.value;
    save(); renderDoc(k);
  });
  $(sel).addEventListener("click", e => {
    const b = e.target.closest("[data-ldel]"); if (!b) return;
    const tr = b.closest("tr[data-doc]"), k = tr.dataset.doc; docOf(k).lines.splice(+tr.dataset.li, 1); save(); renderDoc(k);
  });
}
/* --- смета работ (вкладка «Смета», нижняя часть) --- */
function discBox(id, title, D){
  const s0 = docSum(D), d = num(D.discount), s1 = docSumD(D, id === "matsDisc" ? d : null);
  return `<div class="box" style="max-width:520px;margin:10px 0 10px auto"><div class="metrics">
      <span>Итого: ${title}</span><b>${money(s0)}</b>
      <span>Скидка, % <input class="num" id="${id}" value="${esc(D.discount || 0)}" inputmode="decimal" style="width:60px"></span><b>${d ? "− " + money(r2(s0 - s1)) : "—"}</b>
      <span><b>С учётом скидки</b></span><b style="font-size:16px">${money(s1)}</b></div></div>`;
}
function renderWorks(){
  const el = $("#works"); if (!el) return;
  const D = docOf("works");
  el.innerHTML = D.lines.length ? docHeader(D) + linesTable("works", D) + discBox("worksDisc", "работы", D)
    : `<div class="muted">Смета работ не загружена. Загрузите согласованную с заказчиком смету (Excel, PDF или фото) или добавьте строки вручную.</div>`;
  renderEstTotal();
}
function renderMats(){
  const el = $("#mats"); if (!el) return;
  const D = docOf("mats");
  el.innerHTML = D.lines.length ? docHeader(D) + linesTable("mats", D) + discBox("matsDisc", "материалы", D)
    : `<div class="muted">Смета материалов не загружена. Загрузите исходную смету материалов (Excel, PDF или фото) или добавьте строки вручную. Свой расчёт по комнатам — ниже, в разделе «Проверка».</div>`;
  renderEstTotal();
}
function renderEstTotal(){
  const el = $("#estTotal"); if (!el) return;
  const M = docOf("mats"), W = docOf("works"), own = r2(summary().reduce((a, s) => a + s.sum, 0));
  const m = M.lines.length ? docSumD(M, num(M.discount)) : own, w = docSumD(W);
  el.innerHTML = (M.lines.length || W.lines.length || own) ? `<div class="box" style="max-width:560px;margin-left:auto;background:#f6f9ff"><div class="metrics">
      <span>Материалы${M.lines.length ? " (смета)" : " (свой расчёт)"}</span><b>${money(m)}</b>
      <span>Работы (смета${num(W.discount) ? ", со скидкой" : ""})</span><b>${money(w)}</b>
      <span><b>Всего по объекту</b></span><b style="font-size:17px">${money(r2(m + w))}</b>
      ${M.lines.length && own ? `<span class="muted">Для сверки: свой расчёт материалов по комнатам</span><b class="muted">${money(own)} (${own > m ? "+" : ""}${money(r2(own - m))})</b>` : ""}</div></div>` : "";
}
$("#btnMatsLoad").onclick = () => $("#fileMats").click();
$("#fileMats").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) loadDoc("mats", f); };
$("#btnMatsAdd").onclick = () => { docOf("mats").lines.push(normLine({kind: "material"})); save(); renderMats(); };
$("#btnMatsClear").onclick = () => { if (docOf("mats").lines.length && confirm("Очистить смету материалов?")) { P.mats = null; save(); renderMats(); } };
$("#mats").addEventListener("change", e => { if (e.target.id === "matsDisc") { docOf("mats").discount = num(e.target.value); save(); renderMats(); } });
$("#btnWorksLoad").onclick = () => $("#fileWorks").click();
$("#works").addEventListener("change", e => { if (e.target.id === "worksDisc") { docOf("works").discount = num(e.target.value); save(); renderWorks(); } });
$("#fileWorks").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) loadDoc("works", f); };
$("#btnWorksAdd").onclick = () => { docOf("works").lines.push(normLine({kind: "work"})); save(); renderWorks(); };
$("#btnWorksClear").onclick = () => { if (docOf("works").lines.length && confirm("Очистить смету работ?")) { P.works = null; save(); renderWorks(); } };

/* --- акт выполненных работ --- */
function autoRef(){ // строки акта без привязки — ищем такую же строку в смете работ
  const W = workLines(docOf("works")), A = docOf("act").lines, used = new Set(A.map(l => l.ref).filter(Boolean));
  for (const l of A) {
    if (l.ref && W.some(w => w.id === l.ref)) continue;
    l.ref = null; const wl = new Set(words(l.name)); let best = null, bs = 0;
    for (const w of W) { if (used.has(w.id) || (l.room && w.room && norm(l.room) !== norm(w.room))) continue; if (norm(w.name) === norm(l.name)) { best = w; bs = 9; break; }
      const ww = words(w.name), s = ww.filter(x => wl.has(x)).length / Math.max(2, Math.max(wl.size, ww.length)); if (s > bs) { bs = s; best = w; } }
    if (best && bs >= 0.6) { l.ref = best.id; used.add(best.id); }
  }
}
function renderAct(){
  const el = $("#act"); if (!el) return;
  const W0 = docOf("works"), W = {lines: workLines(W0)}, A = docOf("act"), byId = new Map(W.lines.map(w => [w.id, w]));
  const k = discK(), dPct = num(W0.discount), plan0 = docSum(W), fact0 = docSum(A), plan = docSumD(W), fact = docSumD(A), diff = r2(fact - plan), matCount = W0.lines.length - W.lines.length;
  if (!A.lines.length) {
    el.innerHTML = `<div class="empty">Акт пока пуст. ${W.lines.length ? "Нажмите «Заполнить из сметы работ» — строки сметы перенесутся сюда, останется поправить фактические объёмы и добавить доп. работы." : "Сначала загрузите смету работ на вкладке «2. Смета» или загрузите готовый акт."}</div>`;
    return;
  }
  const refOpts = l => `<select data-k="ref" style="max-width:220px"><option value="">— доп. работа (нет в смете) —</option>${W.lines.map(w => `<option value="${w.id}" ${w.id === l.ref ? "selected" : ""}>${esc((w.room ? w.room + ": " : "") + w.name.slice(0, 60))}</option>`).join("")}</select>`;
  const cols = {n: 3, head: `<th>Строка сметы</th><th class="r">По смете</th><th class="r">Разница</th>`,
    row: l => { const w = byId.get(l.ref), ws = w ? lineSum(w) : 0, d = r2(lineSum(l) - ws);
      return `<td>${refOpts(l)}</td><td class="r">${w ? `${fmt(num(w.qty))} ${esc(w.unit)}<div class="muted" style="font-size:12px">${money(ws)}</div>` : "—"}</td>
        <td class="r" style="color:${d > 0 ? "var(--bad)" : d < 0 ? "var(--ok)" : "inherit"}"><b>${d ? (d > 0 ? "+" : "") + money(d) : "0"}</b></td>`; }};
  const linked = new Set(A.lines.map(l => l.ref).filter(Boolean)), notDone = W.lines.filter(w => !linked.has(w.id));
  const extra = A.lines.filter(l => !l.ref);
  el.innerHTML = `
    <div class="box"><div class="metrics" style="max-width:560px">
      <span>По смете работ (согласовано)${dPct ? `, со скидкой ${dPct}%` : ""}</span><b>${money(plan)}</b>
      <span>По акту (фактически выполнено)${dPct ? `, со скидкой ${dPct}%` : ""}</span><b>${money(fact)}</b>
      ${extra.length ? `<span>в т. ч. доп. работы, которых не было в смете</span><b>${money(docSumD({lines: extra}))}</b>` : ""}
      <span><b>${diff > 0 ? "Заказчику доплатить" : diff < 0 ? "Меньше сметы на (вернуть / не доплачивать)" : "Совпадает со сметой"}</b></span>
      <b style="font-size:16px;color:${diff > 0 ? "var(--bad)" : "var(--ok)"}">${money(Math.abs(diff))}</b>
    </div>${!W.lines.length ? `<div class="warn" style="font-size:12px;margin-top:4px">Смета работ не загружена — сравнивать не с чем (вкладка «2. Смета»).</div>` : ""}
    ${matCount ? `<div class="muted" style="font-size:12px;margin-top:4px">Строки материалов из сметы (${matCount}) в акте не участвуют — сравниваются только работы.</div>` : ""}</div>
    ${docHeader(A)}
    <div class="muted" style="font-size:12px;margin-bottom:4px">«Кол-во» и «Цена» — фактические. Справа — что было в смете и разница: красным — дороже сметы, зелёным — дешевле.</div>
    ${linesTable("act", A, cols)}
    ${notDone.length ? `<h3>Есть в смете, но нет в акте (не выполнено?)</h3><ul>${notDone.map(w => `<li>${w.room ? esc(w.room) + ": " : ""}${esc(w.name)} — ${fmt(num(w.qty))} ${esc(w.unit)}, ${money(lineSum(w))}</li>`).join("")}</ul>` : ""}`;
}
$("#btnActFill").onclick = () => {
  const W = {lines: workLines(docOf("works"))}, A = docOf("act");
  if (!W.lines.length) { toast("Сначала загрузите смету работ (вкладка 2)"); return; }
  if (A.lines.length && !confirm("Заменить строки акта строками из сметы работ?")) return;
  A.lines = W.lines.map(w => ({...normLine(w), ref: w.id, price: w.price !== "" ? w.price : (num(w.qty) ? r2(lineSum(w) / num(w.qty)) : ""), sum: w.sum}));
  A.total = null; A.notes = ""; A.files = ""; save(); renderAct(); toast("Строки перенесены — поправьте фактические объёмы");
};
$("#btnActLoad").onclick = () => $("#fileAct").click();
$("#fileAct").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) loadDoc("act", f); };
$("#btnActAdd").onclick = () => { docOf("act").lines.push(normLine({kind: "work", section: "Дополнительные работы"})); save(); renderAct(); };
$("#btnActClear").onclick = () => { if (docOf("act").lines.length && confirm("Очистить акт?")) { P.act = null; save(); renderAct(); } };
$("#btnActExport").onclick = () => {
  const W = {lines: workLines(docOf("works"))}, A = docOf("act"), byId = new Map(W.lines.map(w => [w.id, w])), title = P.name || "Объект";
  const rows = [[`Акт выполненных работ — ${title}`], [], ["Помещение", "Раздел", "Наименование", "Ед.", "Кол-во", "Цена", "Сумма", "По смете: кол-во", "По смете: сумма", "Разница"]];
  for (const l of A.lines) { const w = byId.get(l.ref); rows.push([l.room || "", l.section, l.name, l.unit, num(l.qty), num(l.price), lineSum(l), w ? num(w.qty) : "доп. работа", w ? lineSum(w) : 0, r2(lineSum(l) - (w ? lineSum(w) : 0))]); }
  const k = discK(), dp = num(docOf("works").discount), plan = docSumD(W), fact = docSumD(A), diff = r2(fact - plan), sfx = dp ? ` (со скидкой ${dp}%)` : "";
  rows.push([], ["", "", "Итого по акту" + sfx, "", "", "", fact], ["", "", "Итого по смете работ" + sfx, "", "", "", plan], ["", "", diff >= 0 ? "Заказчику доплатить" : "Меньше сметы на", "", "", "", Math.abs(diff)]);
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{wch: 16}, {wch: 24}, {wch: 50}, {wch: 7}, {wch: 9}, {wch: 10}, {wch: 12}, {wch: 14}, {wch: 14}, {wch: 12}];
  XLSX.utils.book_append_sheet(wb, ws, "Акт"); XLSX.writeFile(wb, "Акт_" + title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) + ".xlsx");
};

/* ---------- Подбор материалов ИИ ---------- */
let sug = null; // {step:"setup"|"result", rooms:Set, useClient, wish, list:[{room, it, on, why, dup}], missing, notes}
$("#btnSuggest").onclick = () => {
  if (!aiReady()) { toast("Сначала подключите ИИ"); openAI(); return; }
  if (!P.rooms.length) { toast("Сначала добавьте комнаты (вкладка 1)"); return; }
  if (!DB.items.length) { toast("Сначала загрузите базу материалов (вкладка 3)"); document.querySelector('[data-tab="DB"]').click(); return; }
  sug = {step: "setup", rooms: new Set(P.rooms.map(r => r.id)), useClient: docOf("works").lines.length > 0, wish: sug?.wish || ""};
  renderSug(); $("#sugModal").classList.add("on");
};
function renderSug(){
  const el = $("#sugBody"), hasClient = docOf("works").lines.length > 0;
  if (sug.step === "setup") {
    el.innerHTML = `
      <div class="muted" style="margin:8px 0">ИИ посмотрит на размеры комнат${hasClient ? ", смету работ" : ""} и ваши пожелания и предложит материалы <b>только из вашей базы</b>
      (${DB.items.length} поз.) с расходом и запасом. Вы проверите и отметите, что добавить.</div>
      <b>Комнаты</b>
      <div class="row" style="margin:6px 0 10px">${P.rooms.map(r => `<label class="row" style="gap:4px;border:1px solid var(--line);border-radius:8px;padding:4px 8px"><input type="checkbox" data-sroom="${r.id}" ${sug.rooms.has(r.id) ? "checked" : ""}> ${esc(r.name)}</label>`).join("")}</div>
      <label class="row" style="gap:6px;margin-bottom:8px"><input type="checkbox" id="sugClient" ${sug.useClient ? "checked" : ""} ${hasClient ? "" : "disabled"}> Опираться на смету работ ${hasClient ? "" : "<span class='muted'>(не загружена — внизу вкладки 2)</span>"}</label>
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
  const C = sug.useClient ? docOf("works").lines : [];
  const roomData = rooms.map((r, k) => { const m = metrics(r); return {room: k, name: r.name, height: num(r.h),
    floor: r2(m.floor), walls: r2(m.walls), wallsGross: r2(m.wallsGross), ceiling: r2(m.ceiling), perim: r2(m.perim), plinth: r2(m.plinth),
    slopesWin: r2(m.slopesWin), slopesDoor: r2(m.slopesDoor), windows: m.windows, doors: m.doors, alreadyInEstimate: r.items.map(i => i.name)}; });
  const clientTxt = C.length ? C.map(l => `${l.section ? l.section + ": " : ""}${l.name} — ${num(l.qty)} ${l.unit}${l.kind === "work" ? " (работа)" : ""}`).join("\n") : "";
  const prompt = `Подбери материалы для ремонта из БАЗЫ ПОЛЬЗОВАТЕЛЯ для каждой комнаты.
Комнаты (размеры в м, м², м.п.): ${JSON.stringify(roomData)}
${clientTxt ? `Согласованная смета работ (ориентир: какие работы и отделка заложены):\n${clientTxt}\n` : ""}${sug.wish.trim() ? `Пожелания прораба: ${sug.wish.trim()}\n` : ""}
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
- Не дублируй то, что уже есть в alreadyInEstimate. Работы (услуги) добавляй, только если они есть в базе и упомянуты в смете работ или пожеланиях.
- Если есть смета работ — подбирай материалы под эти работы (те же виды отделки), а не всё подряд.`;
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
  const sum = summary(), W = docOf("works"), A = docOf("act");
  let db;
  if (DB.items.length <= 400) db = DB.items.map(m => `${m.name} | ${m.unit} | ${m.price}`);
  else { const ws = words(question || ""); db = DB.items.filter(m => { const h = norm(m.name + " " + m.cat); return ws.some(w => h.includes(w)); }).slice(0, 120).map(m => `${m.name} | ${m.unit} | ${m.price}`); }
  return JSON.stringify({object: P.name || "", rooms, commonItems: common, purchaseSummary: sum.map(s => ({name: s.name, qty: s.qty, unit: s.unit, price: s.price, sum: s.sum})),
    ourTotal: r2(sum.reduce((a, s) => a + s.sum, 0)),
    worksEstimate: W.lines.length ? {note: "согласованная с заказчиком смета работ", discountPercent: num(W.discount), lines: W.lines.map(l => ({room: l.room, section: l.section, name: l.name, kind: l.kind, unit: l.unit, qty: num(l.qty), price: num(l.price), sum: lineSum(l)})), total: docSum(W)} : null,
    act: A.lines.length ? {note: "акт выполненных работ (факт); planLine — строка сметы", lines: A.lines.map(l => ({name: l.name, unit: l.unit, qty: num(l.qty), price: num(l.price), sum: lineSum(l), planLine: W.lines.find(w => w.id === l.ref)?.name || "доп. работа"})), total: docSum(A), differenceToWorksEstimate: r2(docSum(A) - docSum({lines: workLines(W)})), note2: "акт сравнивается только с работами сметы, без материалов"} : null,
    project: P.project ? {note: "проект квартиры (PDF) — только для наглядности: что где расположено; расчёты ведутся по смете", file: P.project.file, text: P.project.text} : null,
    estimateRoomDims: (P.works && P.works.roomDims) || null,
    materialsEstimate: P.mats && P.mats.lines.length ? {lines: P.mats.lines.map(l => ({section: l.section, name: l.name, unit: l.unit, qty: num(l.qty), price: num(l.price), sum: lineSum(l)})), total: docSum(P.mats), discountPercent: num(P.mats.discount)} : null,
    priceBase: {totalItems: DB.items.length, file: DB.file, items: db, note: DB.items.length > 400 ? "показаны только позиции, похожие на вопрос" : "вся база"}});
}
const CHAT_SYSTEM = `Ты — помощник прораба в программе расчёта ремонта. Отвечай по-русски, коротко и по делу, простыми словами, с цифрами.
Опирайся только на данные объекта из программы (они ниже в JSON). ГЛАВНЫЙ источник — исходная смета (материалы и работы, в т. ч. размеры помещений из сметы).
Проект (PDF) — для наглядности: что где стоит. Также есть свой расчёт материалов по комнатам (для проверки), акт выполненных работ и база цен.
Цены не придумывай и не бери из интернета — только из базы пользователя, сметы и акта. Если данных не хватает — так и скажи и подскажи, что внести в программу.
Считай аккуратно, показывай расчёт кратко. Единицы: метры, м², м.п., рубли.`;
const QUICK = ["Сколько заказчику доплатить по акту и за что?", "Что я мог забыть в расчёте?", "Проверь расход материалов — нет ли ошибок?", "Сколько всего стоят материалы по каждой комнате?"];
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
