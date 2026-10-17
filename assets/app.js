import { el, renderBlocks, safeUrl, illustration } from "./blocks.js?v=__V__";

const main = document.getElementById("main");
const cache = new Map();
let index, categories;
let posts = [];   // tous les articles de toutes les éditions, du plus récent au plus ancien
let days = [];    // [{ date, posts }] du plus récent au plus ancien
let filter = "all";
let shownDays = 3;

const TZ = "Europe/Paris";
const fmtDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtTime = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtDayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayLabel = (s) => fmtDay.format(new Date(s + "T12:00:00Z"));
const time = (p) => fmtTime.format(new Date(p.ts));
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const j = await r.json();
  cache.set(url, j);
  return j;
}

function buildModel() {
  // Un article ne peut pas être publié après la génération de son édition, ni dans le futur : on plafonne l'horodatage.
  const clamp = (v, e) => Math.min(Date.parse(v) || 0, Date.parse(e.generatedAt) || Infinity, Date.now());
  posts = index.editions.flatMap((e) => e.posts.map((p) => ({ ...p, edition: e.id, ts: clamp(p.publishedAt, e) })));
  posts.sort((a, b) => b.ts - a.ts);
  const byDay = new Map();
  for (const p of posts) {
    p.day = fmtDayKey.format(new Date(p.ts));
    if (!byDay.has(p.day)) byDay.set(p.day, []);
    byDay.get(p.day).push(p);
  }
  days = [...byDay].map(([date, list]) => ({ date, posts: list }));
}

const cat = (id) => categories.find((c) => c.id === id) || { id, label: id, icon: "📄", hue: 220 };
const catStyle = (id) => `--h:${cat(id).hue ?? 220}`;
const catTag = (id) => el("span", { class: "tag", style: catStyle(id) }, cat(id).label);
const art = (p, extra = {}) => illustration({ icon: p.icon || cat(p.category).icon, hue: cat(p.category).hue, motif: p.category, seed: p.edition + p.id, cover: p.cover?.url, svg: p.illustration?.svg, alt: p.cover?.alt || p.title, ...extra });
const href = (p) => `#/p/${p.edition}/${p.id}`;

/* ---------- Favoris & partage (localStorage) ---------- */

const SAVED_KEY = "td:saved";
let saved = new Set();
try { saved = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]")); } catch {}
const keyOf = (p) => `${p.edition}/${p.id}`;
const isSaved = (p) => saved.has(keyOf(p));
function persist() { try { localStorage.setItem(SAVED_KEY, JSON.stringify([...saved])); } catch {} }

// « Lu » : un article est marqué lu quand on l'ouvre ; on peut le remettre en non lu depuis sa page.
const READ_KEY = "td:read";
let read = new Set();
try { read = new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); } catch {}
const isRead = (p) => read.has(keyOf(p));
function persistRead() { try { localStorage.setItem(READ_KEY, JSON.stringify([...read])); } catch {} }
const readBadge = (p) => (isRead(p) ? el("span", { class: "read-badge", text: "✓ Lu" }) : null);
function setRead(p, on) {
  const k = keyOf(p);
  if (on === read.has(k)) return;
  on ? read.add(k) : read.delete(k);
  persistRead();
}

const ICONS = {
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  share: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
function icon(name, filled = false) {
  const s = el("span", { class: "ico", "aria-hidden": "true" });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return s;
}

let toastTimer;
function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = el("div", { class: "toast", role: "status", text: msg });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

const postUrl = (p) => `${location.origin}${location.pathname}${href(p)}`;
async function copyLink(p) {
  const url = postUrl(p);
  try { await navigator.clipboard.writeText(url); }
  catch {
    const ta = el("textarea", { "aria-hidden": "true", style: "position:fixed;opacity:0" });
    ta.value = url; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  toast("Lien copié dans le presse-papiers");
}

function paintSaveBtn(b, p) {
  const on = isSaved(p);
  b.setAttribute("aria-pressed", String(on));
  const label = on ? "Retirer des favoris" : "Enregistrer dans les favoris";
  b.title = label;
  const text = b.querySelector(".btn-text");
  b.setAttribute("aria-label", label);
  if (text) text.textContent = on ? "Enregistré" : "Enregistrer";
  b.querySelector(".ico")?.replaceWith(icon("bookmark", on));
}
function paintNavCount() {
  const n = document.getElementById("saved-count");
  if (n) { n.textContent = saved.size ? String(saved.size) : ""; n.hidden = !saved.size; }
}
function toggleSaved(p) {
  const k = keyOf(p);
  if (saved.has(k)) { saved.delete(k); toast("Retiré des favoris"); } else { saved.add(k); toast("Ajouté aux favoris"); }
  persist();
  document.querySelectorAll(`.save[data-key="${k}"]`).forEach((b) => paintSaveBtn(b, p));
  paintNavCount();
  if (location.hash.startsWith("#/saved")) route();
}
function saveBtn(p, labeled = false) {
  const b = el("button", { class: "save" + (labeled ? " btn" : " mini"), type: "button", "data-key": keyOf(p) }, icon("bookmark"), labeled ? el("span", { class: "btn-text" }) : null);
  paintSaveBtn(b, p);
  b.onclick = () => toggleSaved(p);
  return b;
}
function shareBtn(p, labeled = false) {
  const b = el("button", { class: "share" + (labeled ? " btn" : " mini"), type: "button", title: "Copier le lien", "aria-label": "Copier le lien de l'article" }, icon("share"), labeled ? el("span", { class: "btn-text", text: "Copier le lien" }) : null);
  b.onclick = () => copyLink(p);
  return b;
}
const matches = (p) => (filter === "all" ? true : filter === "unread" ? !isRead(p) : p.category === filter);
const cardActions =(p) => el("div", { class: "card-actions" }, saveBtn(p), shareBtn(p));

function postRow(p) {
  return el("div", { class: "row", style: catStyle(p.category) },
    el("time", { class: "row-time", datetime: new Date(p.ts).toISOString(), text: time(p) }),
    el("div", { class: "card-wrap" + (isRead(p) ? " is-read" : ""), "data-key": keyOf(p) },
      el("a", { class: "card", href: href(p) },
        art(p),
        el("div", { class: "card-body" },
          el("div", { class: "meta" }, catTag(p.category), p.readingMinutes ? `${p.readingMinutes} min` : null, readBadge(p)),
          el("h3", { text: p.title }),
          p.summary ? el("p", { text: p.summary }) : null,
          el("div", { class: "meta" }, ...(p.tags || []).slice(0, 4).map((t) => "#" + t)))),
      cardActions(p)));
}

function leadCard(p) {
  return el("div", { class: "lead-wrap" + (isRead(p) ? " is-read" : ""), "data-key": keyOf(p) },
    el("a", { class: "lead-card", href: href(p), style: catStyle(p.category) },
      art(p),
      el("div", { class: "lead-body" },
        el("div", { class: "kicker", text: `À la une · ${cat(p.category).label} · ${time(p)}` }),
        el("h2", { text: p.title }),
        p.summary ? el("p", { text: p.summary }) : null,
        el("div", { class: "meta" }, p.readingMinutes ? `${p.readingMinutes} min de lecture` : null, ...(p.tags || []).slice(0, 3).map((t) => "#" + t)))),
    cardActions(p));
}

function setNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
}
function show(...nodes) {
  main.replaceChildren(...nodes);
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function chipsBar(onChange) {
  const ids = ["all", "unread", ...new Set(posts.map((p) => p.category))];
  const bar = el("div", { class: "chips", role: "group", "aria-label": "Filtrer par rubrique" });
  const paint = () => bar.replaceChildren(...ids.map((id) => {
    const b = el("button", { class: "chip", type: "button", "data-all": id === "all" || id === "unread" ? "" : null, style: id === "all" || id === "unread" ? null : catStyle(id), "aria-pressed": String(filter === id) }, id === "all" ? "Tout" : id === "unread" ? "Non lus" : `${cat(id).icon || ""} ${cat(id).label}`);
    b.onclick = () => { filter = id; paint(); onChange(); };
    return b;
  }));
  paint();
  return bar;
}

const daySection = (date, list, link = true) =>
  el("section", { class: "day" },
    el("h2", { class: "day-h" }, link ? el("a", { href: `#/d/${date}`, text: dayLabel(date) }) : dayLabel(date), el("span", { class: "count", text: plural(list.length, "article") })),
    el("div", { class: "rail" }, list.map(postRow)));

/* ---------- Pages ---------- */

function pageHome() {
  setNav("home");
  document.title = "Tech Daily — veille web, dev, devops, électronique";
  const today = days[0];
  const lead = today && [...today.posts].sort((a, b) => (b.importance || 1) - (a.importance || 1) || b.ts - a.ts)[0];
  const box = el("div");
  const more = el("button", { class: "more", type: "button", text: "Afficher les jours précédents" });
  more.onclick = () => { shownDays += 3; draw(); };
  function draw() {
    const vis = days.map((d) => ({ date: d.date, posts: d.posts.filter((p) => matches(p) && !(filter === "all" && p === lead)) })).filter((d) => d.posts.length);
    box.replaceChildren(...vis.slice(0, shownDays).map((d) => daySection(d.date, d.posts)), vis.length > shownDays ? more : el("span"));
    if (!vis.length) box.replaceChildren(el("div", { class: "empty", text: "Aucun article dans cette rubrique pour le moment." }));
  }
  draw();
  show(
    el("section", { class: "hero" },
      el("div", { class: "eyebrow" }, el("span", { class: "live" }), today ? `Dernière mise à jour · ${dayLabel(today.date)} · ${time(today.posts[0])}` : "En attente de la première édition"),
      el("h1", { text: "L'actualité tech, heure par heure." }),
      el("p", { class: "lead", text: `Web, informatique, DevOps et électronique : ${posts.length} articles synthétisés en français, avec leurs sources.` })),
    lead ? leadCard(lead) : null, chipsBar(draw), box);
}

function pageDay(date) {
  setNav("archive");
  const k = days.findIndex((d) => d.date === date);
  if (k < 0) return notFound();
  document.title = `${dayLabel(date)} — Tech Daily`;
  const newer = days[k - 1], older = days[k + 1];
  const box = el("div");
  const draw = () => box.replaceChildren(el("div", { class: "rail" }, days[k].posts.filter((p) => matches(p)).map(postRow)));
  draw();
  show(
    el("section", { class: "hero" }, el("div", { class: "eyebrow" }, `Archives · ${plural(days[k].posts.length, "article")}`), el("h1", { text: dayLabel(date), style: "text-transform:capitalize" })),
    el("div", { class: "daynav" },
      el("a", { class: "btn", href: older ? `#/d/${older.date}` : "#", "aria-disabled": String(!older) }, "← Jour précédent"),
      el("a", { class: "btn", href: newer ? `#/d/${newer.date}` : "#", "aria-disabled": String(!newer) }, "Jour suivant →"),
      el("a", { class: "btn", href: "#/archive" }, "Toutes les archives")),
    chipsBar(draw), box);
}

async function pagePost(edId, id) {
  setNav("archive");
  const e = await getJson(`data/editions/${edId}.json`);
  const p = e.posts.find((x) => x.id === id);
  if (!p) return notFound();
  const meta = posts.find((x) => x.edition === edId && x.id === id) || { ...p, edition: edId, ts: Date.parse(p.publishedAt || e.generatedAt) || 0, day: e.date };
  document.title = `${p.title} — Tech Daily`;
  const siblings = posts.filter((x) => x.day === meta.day);
  const k = siblings.findIndex((x) => x.edition === edId && x.id === id);
  const newer = siblings[k - 1], older = siblings[k + 1];
  const sources = (p.sources || []).filter((s) => safeUrl(s.url));
  const link = (x, label, cls = "") => el("a", { class: "btn " + cls, href: href(x) }, label);

  setRead(meta, true); // ouvrir un article = le marquer comme lu
  const readBtn = el("button", { class: "btn", type: "button" });
  const paintRead = () => { readBtn.textContent = isRead(meta) ? "✓ Lu · marquer non lu" : "Marquer comme lu"; };
  paintRead();
  readBtn.onclick = () => { setRead(meta, !isRead(meta)); paintRead(); };

  show(el("article", { class: "article", style: catStyle(p.category) },
    el("a", { class: "btn", href: `#/d/${meta.day}` }, "← ", dayLabel(meta.day)),
    el("div", { class: "actions" }, saveBtn(meta, true), shareBtn(meta, true), readBtn),
    el("div", { class: "meta", style: "margin-top:24px" }, catTag(p.category), el("time", { datetime: new Date(meta.ts).toISOString(), text: `${dayLabel(meta.day)} · ${time(meta)}` }), p.readingMinutes ? `${p.readingMinutes} min de lecture` : null),
    el("h1", { text: p.title }),
    p.summary ? el("p", { class: "lead", text: p.summary }) : null,
    art({ ...p, edition: edId }, { alt: p.cover?.alt || p.title }),
    p.cover?.credit ? el("p", { class: "credit", text: "Image : " + p.cover.credit }) : el("p", { class: "credit" }),
    renderBlocks(p.blocks),
    (p.tags || []).length ? el("div", { class: "meta", style: "margin-top:20px" }, ...p.tags.map((t) => "#" + t)) : null,
    sources.length ? el("section", { class: "sources" }, el("h2", { text: "Sources" }),
      el("ul", {}, sources.map((s) => el("li", {}, el("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer", text: s.title || s.url }), s.publisher ? ` — ${s.publisher}` : "")))) : null,
    el("nav", { class: "pager" }, older ? link(older, "← " + older.title) : el("span"), newer ? link(newer, newer.title + " →", "next") : null)));
}

function pageArchive(query = "") {
  setNav("archive");
  document.title = "Archives — Tech Daily";
  const input = el("input", { class: "search", type: "search", placeholder: "Rechercher un sujet, un outil, un tag…", "aria-label": "Rechercher dans les archives", value: query });
  const list = el("div");
  function draw() {
    const q = norm(input.value.trim());
    const nodes = [];
    if (q) {
      const hits = posts.filter((p) => norm([p.title, p.summary, (p.tags || []).join(" "), cat(p.category).label].join(" ")).includes(q));
      nodes.push(hits.length ? el("div", { class: "rail" }, hits.map(postRow)) : el("div", { class: "empty", text: "Aucun article ne correspond à cette recherche." }));
    } else {
      let month = "";
      for (const d of days) {
        const m = fmtMonth.format(new Date(d.date + "T12:00:00Z"));
        if (m !== month) { month = m; nodes.push(el("h2", { class: "month", text: m })); }
        nodes.push(el("a", { class: "ed", href: `#/d/${d.date}` },
          el("h3", { text: dayLabel(d.date) }),
          el("div", { class: "meta" }, ...[...new Set(d.posts.map((p) => p.category))].map(catTag), plural(d.posts.length, "article"))));
      }
      if (!nodes.length) nodes.push(el("div", { class: "empty", text: "Aucune archive pour le moment." }));
    }
    list.replaceChildren(...nodes);
  }
  input.addEventListener("input", draw);
  draw();
  show(el("section", { class: "hero" }, el("div", { class: "eyebrow", text: `${plural(posts.length, "article")} · ${plural(days.length, "jour")}` }), el("h1", { text: "Archives" })), input, list);
}

function pageSaved() {
  setNav("saved");
  document.title = "Favoris — Tech Daily";
  const list = posts.filter(isSaved);
  show(
    el("section", { class: "hero" }, el("div", { class: "eyebrow", text: "Stockés sur cet appareil" }), el("h1", { text: "Favoris" }),
      el("p", { class: "lead", text: list.length ? `${plural(list.length, "article")} enregistré${list.length > 1 ? "s" : ""}. Ils sont gardés dans ce navigateur uniquement.` : "" })),
    list.length ? el("div", { class: "rail" }, list.map(postRow))
      : el("div", { class: "empty" }, el("p", { text: "Aucun favori pour le moment. Utilise le marque-page d'une carte ou d'un article pour le retrouver ici." }), el("a", { class: "btn", href: "#/" }, "Parcourir les articles")));
}

function notFound() {
  show(el("div", { class: "error" }, el("p", { text: "Cette page n'existe pas ou n'existe plus." }), el("a", { class: "btn", href: "#/" }, "Revenir à l'accueil")));
}

/* ---------- Router ---------- */

async function route() {
  try {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return pageHome();
    if (parts[0] === "saved") return pageSaved();
    if (parts[0] === "archive") return pageArchive(new URLSearchParams(qs).get("q") || "");
    if (parts[0] === "d" && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "")) return pageDay(parts[1]);
    if (parts[0] === "p" && parts[1] && parts[2]) return await pagePost(parts[1], parts[2]);
    notFound();
  } catch (err) {
    console.error(err);
    show(el("div", { class: "error" }, el("p", { text: "Impossible de charger les données." }), el("p", { text: String(err.message) })));
  }
}

/* ---------- Thème ---------- */

const themeBtn = document.getElementById("theme");
const mq = matchMedia("(prefers-color-scheme: dark)");
const current = () => document.documentElement.dataset.theme || (mq.matches ? "dark" : "light");
function paintTheme() {
  const t = current();
  themeBtn.textContent = t === "dark" ? "☀️" : "🌙";
  themeBtn.setAttribute("aria-label", t === "dark" ? "Passer en thème clair" : "Passer en thème sombre");
}
themeBtn.onclick = () => {
  const t = current() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch {}
  paintTheme();
};
mq.addEventListener("change", paintTheme);
paintTheme();

/* ---------- Démarrage ---------- */

try {
  [index, { categories }] = await Promise.all([getJson("data/index.json"), getJson("data/categories.json")]);
  buildModel();
  paintNavCount();
  addEventListener("hashchange", route);
  route();
} catch (err) {
  show(el("div", { class: "error" }, el("p", { text: "Impossible de charger le blog." }), el("p", { text: String(err.message) })));
}
