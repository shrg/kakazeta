// Каказета: вёрстка выпуска.
// node render.mjs --issue issue.json [--config config.json] [--out out]
// Читает issue.json (его готовит редактор), пишет out/index.html. Без зависимостей, Node 18+.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (n, d) => { const k = args.indexOf(n); return k >= 0 ? args[k + 1] : d; };
const cfg = JSON.parse(readFileSync(arg("--config", join(here, "config.json")), "utf8"));
const issue = JSON.parse(readFileSync(arg("--issue", join(here, "issue.json")), "utf8"));
const OUT = arg("--out", join(here, "out"));
const L = {
  volume: "№", edition: "Утренний выпуск", weather: "Погода", dayUpTo: "днём до",
  digest: "Главное за день", almanac: "Альманах", sunrise: "Восход", sunset: "Закат",
  sources: "Источники", easy: "Изи-ньюз", weekend: "Выходные и съёмка", staffLine: (a, r) => `Журналистов в редакции: ${a} · отметились в этом выпуске: ${r}`,
  ...cfg.labels,
};

const paras = (t) => String(t || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
// ---- проверка входных данных: падаем громко, чтобы не выпустить сломанную страницу
const errs = [];
const warns = [];
const items = Array.isArray(issue.items) ? issue.items : [];
if (!items.length) errs.push("items пуст");
const ids = new Set();
for (const i of items) {
  if (!i.id || ids.has(i.id)) errs.push(`id пуст или повторяется: ${i.id}`);
  ids.add(i.id);
  if (!i.title?.trim()) errs.push(`${i.id}: нет title`);
  if (!i.summary?.trim()) errs.push(`${i.id}: нет summary`);
  if (!i.rubric?.trim()) errs.push(`${i.id}: нет rubric`);
  if (!Array.isArray(i.sources) || !i.sources.length) errs.push(`${i.id}: нет sources`);
  else for (const s of i.sources) if (!s.name || !/^https?:\/\//.test(s.url || "")) errs.push(`${i.id}: плохой источник ${JSON.stringify(s)}`);
}
const byId = new Map(items.map((i) => [i.id, i]));
if (!byId.has(issue.leadId)) errs.push(`leadId не найден: ${issue.leadId}`);
if (!issue.leadParagraph?.trim()) errs.push("leadParagraph пуст");
if (issue.secondId && !byId.has(issue.secondId)) errs.push(`secondId не найден: ${issue.secondId}`);
const dg = Array.isArray(issue.digest) ? issue.digest : [];
if (dg.length < cfg.digestMin || dg.length > cfg.digestMax) errs.push(`digest: нужно ${cfg.digestMin}–${cfg.digestMax} пунктов, сейчас ${dg.length}`);
for (const d of dg) if (!byId.has(d.id) || !d.text?.trim()) errs.push(`digest: неизвестный id или пустой text: ${d.id}`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(issue.issueDate || "")) errs.push("issueDate должен быть YYYY-MM-DD");
const dayMs = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const issueNo = errs.length ? 0 : Math.round((dayMs(issue.issueDate) - dayMs(cfg.firstIssueDate)) / 86400000) + 1;
if (!errs.length && issueNo < 1) errs.push(`issueDate раньше firstIssueDate: номер ${issueNo}`);
const easy = items.filter((i) => i.easy);
if (easy.length < 1) warns.push("нет ни одного изи-ньюз (по правилам нужно 1–2)");
const thin = (n, min, what) => { if (n < min) warns.push(what); };
thin(paras(issue.leadParagraph).join(" ").length, 500, `главная новость: текст ${paras(issue.leadParagraph).join(" ").length} знаков, нужно от 500 (5–8 предложений)`);
if (issue.secondId) thin(byId.get(issue.secondId).summary.length, 300, `вторая новость: summary короче 300 знаков`);
for (const i of items) if (i.id !== issue.leadId && i.id !== issue.secondId) thin(i.summary.length, i.easy ? 120 : 180, `${i.id}: summary короче ${i.easy ? 120 : 180} знаков, суть не передана`);
const st = issue.staff;
if (!st || !Number.isInteger(st.active) || !Number.isInteger(st.reported) || st.reported > st.active || st.active < 0) warns.push("staff: нужны целые active и reported (reported ≤ active); служебная строка не выведена");
if (!issue.weekend) warns.push("нет блока weekend");
if (!issue.weather) warns.push("нет блока weather");
if (errs.length) { console.error(`issue.json не прошёл проверку:\n  ${errs.join("\n  ")}`); process.exit(1); }
for (const w of warns) console.warn(`ВНИМАНИЕ: ${w}`);

// ---- вспомогательное
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const d0 = new Date(`${issue.issueDate}T12:00:00Z`);
const wd = new Intl.DateTimeFormat(cfg.locale, { timeZone: "UTC", weekday: "long" }).format(d0);
const dm = new Intl.DateTimeFormat(cfg.locale, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(d0);
const dateStr = `${wd[0].toUpperCase()}${wd.slice(1)}, ${dm}`;
const w = issue.weather;
const weather = w ? `${w.place}: ${Math.round(w.temp)}°${w.max != null ? `, ${L.dayUpTo} ${Math.round(w.max)}°` : ""}` : "";
const kick = (i) => esc(i.easy ? L.easy : i.rubric).toUpperCase();
const link = (i, inner) => `<a href="${esc(i.sources[0].url)}" target="_blank" rel="noopener">${inner}</a>`;
const src = (i) => `<div class="src">${esc(L.sources)}: ${i.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(" · ")}</div>`;
const IMG = (i, cls) => i.image ? `<a class="${cls}" href="${esc(i.sources[0].url)}" target="_blank" rel="noopener"><img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></a>` : "";

// ---- первая полоса: главная, вторая и короткие. Изи-ньюз в неё не попадает.
const lead = byId.get(issue.leadId);
const second = issue.secondId ? byId.get(issue.secondId) : undefined;
const used = new Set([lead.id, second?.id].filter(Boolean));
const briefs = items.filter((i) => !used.has(i.id) && !i.easy).slice(0, cfg.frontBriefs);
briefs.forEach((i) => used.add(i.id));

const size = lead.title.length > 90 ? 32 : lead.title.length > 60 ? 37 : 42;
const leadHtml = `<article class="lead">${IMG(lead, "fig big")}<div class="kick">${kick(lead)}</div>
<h2 style="font-size:${size}px">${link(lead, esc(lead.title))}</h2>${paras(issue.leadParagraph).map((t, n) => `<p class="body${n ? "" : " drop"}">${esc(t)}</p>`).join("")}${src(lead)}</article>`;
const secondHtml = second ? `<article class="second">${IMG(second, "fig mid")}<div class="kick">${kick(second)}</div><h3>${link(second, esc(second.title))}</h3>
<p class="body">${esc(second.summary)}</p>${src(second)}</article>` : "";
const brief = (i) => `<div class="brief">${IMG(i, "thumb")}<h4>${link(i, esc(i.title))}</h4><p class="bsum">${esc(i.summary)}</p>${src(i)}</div>`;
const digest = dg.map((d, n) => { const i = byId.get(d.id); return `<li><span class="n">${n + 1}</span><div>${link(i, esc(i.title))}<small>${esc(d.text)}</small></div></li>`; }).join("");

// ---- рубрики: порядок из issue.rubrics, остальные по первому появлению; изи-ньюз последним
const order = [...(issue.rubrics || [])];
for (const i of items) if (!i.easy && !order.includes(i.rubric)) order.push(i.rubric);
const story = (i) => `<div class="story">${IMG(i, "thumb")}<div class="kick">${kick(i)}</div><h5>${link(i, esc(i.title))}</h5><p>${esc(i.summary)}</p>${src(i)}</div>`;
const desk = (title, its) => its.length ? `<section class="desk"><div class="deskhead"><span>${esc(title)}</span><i>${its.length}</i></div>${its.map(story).join("")}</section>` : "";
const desks = order.map((r) => desk(r, items.filter((i) => !i.easy && i.rubric === r && !used.has(i.id)))).join("") + desk(L.easy, easy.filter((i) => !used.has(i.id)));

// ---- боковая колонка: главное, выходные, альманах
const counts = order.map((r) => [r, items.filter((i) => !i.easy && i.rubric === r).length]).filter(([, c]) => c > 0);
if (easy.length) counts.push([L.easy, easy.length]);
const wk = issue.weekend;
const weekendBox = wk ? `<div class="boxx wk"><h6>${esc(L.weekend)}</h6>${(wk.days || []).map((d) => `<div class="wkday"><b>${esc(d.label)}</b>${esc(d.text)}</div>`).join("")}${wk.verdict ? `<p class="verdict">${esc(wk.verdict)}</p>` : ""}</div>` : "";
const almanac = `<div class="boxx al"><h6>${esc(L.almanac)}</h6>${w?.sunrise ? `<div class="row"><span>${esc(L.sunrise)}</span><b>${esc(w.sunrise)}</b></div><div class="row"><span>${esc(L.sunset)}</span><b>${esc(w.sunset)}</b></div>` : ""}${counts.map(([t, c]) => `<div class="row"><span>${esc(t)}</span><b>${c}</b></div>`).join("")}</div>`;

const staffOk = st && Number.isInteger(st.active) && Number.isInteger(st.reported) && st.reported <= st.active && st.active >= 0;

// ---- календарь архива: клик по дате; выпуски лежат в issues/YYYY-MM-DD.html, список в issues/index.json
const calScript = (base) => `(function(){
var BASE=${JSON.stringify(base)},CUR=${JSON.stringify(issue.issueDate)},DATES=${JSON.stringify(dates)};
var MON=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
var cal=document.getElementById("cal"),btn=document.getElementById("dt"),y,m;
function set(d){return Object.create(null)}
function show(){var has={};DATES.forEach(function(d){has[d]=1});
 var first=new Date(Date.UTC(y,m,1)),off=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(y,m+1,0)).getUTCDate();
 var h='<div class="ch"><button type="button" data-n="-1" aria-label="Назад">‹</button><b>'+MON[m]+' '+y+'</b><button type="button" data-n="1" aria-label="Вперёд">›</button></div><div class="cg">';
 ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].forEach(function(w){h+='<i>'+w+'</i>'});
 for(var i=0;i<off;i++)h+='<span></span>';
 for(var d=1;d<=days;d++){var k=y+"-"+("0"+(m+1)).slice(-2)+"-"+("0"+d).slice(-2);
  h+=has[k]?'<a href="'+BASE+(k===DATES[DATES.length-1]?"":"issues/")+(k===DATES[DATES.length-1]?"index.html":k+".html")+'" class="on'+(k===CUR?' cur':'')+'">'+d+'</a>':'<span>'+d+'</span>'}
 cal.innerHTML=h+'</div>'}
function open_(){var p=CUR.split("-");y=+p[0];m=+p[1]-1;show();cal.hidden=false}
function close_(){cal.hidden=true}
btn.addEventListener("click",function(e){e.stopPropagation();cal.hidden?open_():close_()});
cal.addEventListener("click",function(e){e.stopPropagation();var n=e.target.getAttribute&&e.target.getAttribute("data-n");if(n){m+=+n;if(m<0){m=11;y--}if(m>11){m=0;y++}show()}});
document.addEventListener("click",close_);document.addEventListener("keydown",function(e){if(e.key==="Escape")close_()});
try{fetch(BASE+"issues/index.json").then(function(r){return r.json()}).then(function(j){if(j&&j.dates){DATES=j.dates;if(!cal.hidden)show()}}).catch(function(){})}catch(e){}
})();`;
// ---- выравнивание первой полосы: короткие новости переезжают под главную, пока колонки не сравняются по высоте
const balScript = `(function(){var c1=document.getElementById("c1"),c2=document.getElementById("c2");if(!c1||!c2||!window.matchMedia)return;
var mq=window.matchMedia("(max-width:1000px)");
function h(c){var l=c.lastElementChild;return l?l.getBoundingClientRect().bottom-c.getBoundingClientRect().top:0}
function bal(){var all=[].slice.call(document.querySelectorAll(".front .brief"));all.forEach(function(b){c2.appendChild(b)});
 if(mq.matches)return;
 for(var i=0;i<all.length;i++){var d0=Math.abs(h(c1)-h(c2));c1.appendChild(all[i]);var d1=Math.abs(h(c1)-h(c2));if(d1>=d0){c2.insertBefore(all[i],c2.children[1+0]||null);
  /* вернуть на место: в начало списка коротких, после второй новости */
  var sec=c2.querySelector(".second");if(sec)sec.after(all[i]);break}}}
bal();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(bal);window.addEventListener("load",bal);var t;window.addEventListener("resize",function(){clearTimeout(t);t=setTimeout(bal,150)})})();`;
const css = readFileSync(join(here, "style.css"), "utf8");
const build = (base) => `<!doctype html><html lang="${esc(cfg.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(cfg.title)} · №${issueNo} · ${esc(dm)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,800;1,400&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div class="w">
<div class="top"><span>${esc(L.volume)} ${issueNo}</span><span>${esc(cfg.topline)}</span></div>
<div class="mast"><h1>${esc(cfg.title)}</h1></div>
<div class="tag">${esc(cfg.tagline)}</div>
<div class="date"><button type="button" class="dt" id="dt" aria-haspopup="dialog" aria-label="Архив выпусков">${esc(dateStr)}</button><div id="cal" class="cal" role="dialog" aria-label="Архив выпусков" hidden></div><span>${esc(L.edition)}</span>${weather ? `<span>${esc(L.weather)}: ${esc(weather)}</span>` : ""}</div>
<main class="page"><div class="front"><div class="c1" id="c1">${leadHtml}</div><div class="c2" id="c2">${secondHtml}${briefs.map(brief).join("")}</div>
<aside class="side"><div class="boxx dg"><h6>${esc(L.digest)}</h6><ol>${digest}</ol></div>${weekendBox}${almanac}</aside></div>
<div class="desks">${desks}</div></main>
${staffOk ? `<footer>${esc(L.staffLine(st.active, st.reported))}</footer>` : ""}
</div><script>${calScript(base)}</script><script>${balScript}</script></body></html>`;
mkdirSync(join(OUT, "issues"), { recursive: true });
const known = new Set(readdirSync(join(OUT, "issues")).map((f) => f.match(/^(\d{4}-\d{2}-\d{2})\.html$/)?.[1]).filter(Boolean));
known.add(issue.issueDate);
const dates = [...known].sort();
writeFileSync(join(OUT, "issues", "index.json"), JSON.stringify({ dates, first: cfg.firstIssueDate }));
const page = build("");
writeFileSync(join(OUT, "issues", `${issue.issueDate}.html`), build("../"));
writeFileSync(join(OUT, "index.html"), page);
console.log(`OK: ${join(OUT, "index.html")} + issues/${issue.issueDate}.html (№${issueNo}, ${items.length} новостей, ${dates.length} в архиве)`);
