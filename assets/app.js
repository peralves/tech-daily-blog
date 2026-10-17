import { el, renderBlocks, safeUrl, illustration } from "./blocks.js?v=__V__";

const main = document.getElementById("main");
const cache = new Map();
let manifest, categories;
let allPosts = []; // tous les articles de toutes les éditions, du plus récent au plus ancien
let posts = [];   // ceux qui restent visibles après application des préférences
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

// Les données sont découpées par jour : data/index.json (manifeste léger : une ligne par jour) puis data/index/AAAA-MM-JJ.json
// chargé à la demande. Le site reste rapide même avec des milliers d'articles.
const loadedDays = new Set();
const loadingDays = new Map();
const clampTs = (v, e) => Math.min(Date.parse(v) || 0, Date.parse(e.generatedAt) || Infinity, Date.now()); // jamais dans le futur ni après la génération

async function loadDay(date) {
  if (loadedDays.has(date)) return;
  if (!loadingDays.has(date)) {
    loadingDays.set(date, (async () => {
      let shard = { editions: [] };
      try { shard = await getJson(`data/index/${date}.json`); } catch (err) { console.warn(err); }
      const add = shard.editions.flatMap((e) => e.posts.map((p) => ({ ...p, edition: e.id, day: e.date, ts: clampTs(p.publishedAt, e) })));
      allPosts.push(...add);
      allPosts.sort((a, b) => b.ts - a.ts);
      loadedDays.add(date);
      applyPrefs();
    })());
  }
  await loadingDays.get(date);
}
const loadDays = (dates) => Promise.all(dates.map(loadDay));

// Statistiques issues du manifeste (sans charger les jours) : tiennent compte des rubriques masquées.
const catCount = (d) => Object.entries(d.categories || {}).reduce((n, [id, c]) => n + (prefs.hidden.includes(id) ? 0 : c), 0);
const visibleDays = () => manifest.days.filter((d) => catCount(d) > 0);
const totalVisible = () => manifest.days.reduce((n, d) => n + catCount(d), 0);
const totalAll = () => manifest.days.reduce((n, d) => n + d.posts, 0);
const hiddenByCats = () => totalAll() - totalVisible();
function presentCats() {
  const s = new Set();
  manifest.days.forEach((d) => Object.keys(d.categories || {}).forEach((id) => s.add(id)));
  return [...categories.map((c) => c.id).filter((id) => s.has(id)), ...[...s].filter((id) => !categories.some((c) => c.id === id))];
}

/* ---------- Préférences (rubriques et mots masqués, localStorage) ---------- */

const PREFS_KEY = "td:prefs";
let prefs = { hidden: [], muted: [] };
try {
  const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  prefs = { hidden: Array.isArray(raw.hidden) ? raw.hidden.map(String) : [], muted: Array.isArray(raw.muted) ? raw.muted.map(String) : [] };
} catch {}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} }
const hasPrefs = () => prefs.hidden.length > 0 || prefs.muted.length > 0;
const isVisible = (p) => !prefs.hidden.includes(p.category)
  && !(prefs.muted.length && prefs.muted.some((w) => norm([p.title, p.summary, (p.tags || []).join(" ")].join(" ")).includes(w)));

// Recalcule les listes affichées (accueil, jours, archives) à partir des préférences.
function applyPrefs() {
  posts = allPosts.filter(isVisible);
  const byDay = new Map();
  for (const p of posts) {
    if (!byDay.has(p.day)) byDay.set(p.day, []);
    byDay.get(p.day).push(p);
  }
  days = [...byDay].map(([date, list]) => ({ date, posts: list }));
  if (!["all", "unread"].includes(filter) && !presentCats().includes(filter)) filter = "all";
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
  main.replaceChildren(...nodes.filter(Boolean)); // ignore les null (sinon affichés comme du texte)
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function chipsBar(onChange) {
  const ids = ["all", "unread", ...presentCats().filter((id) => !prefs.hidden.includes(id))];
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

async function pageHome() {
  setNav("home");
  document.title = "Tech Daily — l'actualité, heure par heure";
  const dates = () => visibleDays().map((d) => d.date);
  await loadDays(dates().slice(0, shownDays));
  const today = days[0];
  const lead = today && [...today.posts].sort((a, b) => (b.importance || 1) - (a.importance || 1) || b.ts - a.ts)[0];
  const box = el("div");
  const more = el("button", { class: "more", type: "button", text: "Afficher les jours précédents" });
  more.onclick = async () => {
    more.disabled = true; more.textContent = "Chargement…";
    shownDays += 3;
    await loadDays(dates().slice(0, shownDays));
    draw();
  };
  function draw() {
    const shown = new Set(dates().slice(0, shownDays));
    const vis = days.filter((d) => shown.has(d.date)).map((d) => ({ date: d.date, posts: d.posts.filter((p) => matches(p) && !(filter === "all" && p === lead)) })).filter((d) => d.posts.length);
    const hasMore = dates().length > shownDays;
    const nodes = vis.map((d) => daySection(d.date, d.posts));
    if (!vis.length) nodes.push(el("div", { class: "empty", text: hasMore ? "Aucun article correspondant sur les derniers jours." : "Aucun article correspondant pour le moment." }));
    if (hasMore) { more.disabled = false; more.textContent = "Afficher les jours précédents"; nodes.push(more); }
    box.replaceChildren(...nodes);
  }
  draw();
  show(
    el("section", { class: "hero" },
      el("div", { class: "eyebrow" }, el("span", { class: "live" }), today ? `Dernière mise à jour · ${dayLabel(today.date)} · ${time(today.posts[0])}` : "En attente de la première édition"),
      el("h1", { text: "L'actualité, heure par heure." }),
      el("p", { class: "lead", text: `Tech, IA, science, énergie, bâtiment, droit, monde et marchés : ${plural(totalVisible(), "article")} synthétisés en français, avec leurs sources.` })),
    prefsNote(), lead ? leadCard(lead) : null, chipsBar(draw), box);
}

async function pageDay(date) {
  setNav("archive");
  const all = visibleDays().map((d) => d.date);
  if (!manifest.days.some((d) => d.date === date)) return notFound();
  await loadDay(date);
  document.title = `${dayLabel(date)} — Tech Daily`;
  const k = all.indexOf(date);
  const newer = k > 0 ? all[k - 1] : null, older = k >= 0 && k < all.length - 1 ? all[k + 1] : null;
  const list = posts.filter((p) => p.day === date);
  const box = el("div");
  const draw = () => box.replaceChildren(el("div", { class: "rail" }, list.filter((p) => matches(p)).map(postRow)));
  draw();
  show(
    el("section", { class: "hero" }, el("div", { class: "eyebrow" }, `Archives · ${plural(list.length, "article")}`), el("h1", { text: dayLabel(date), style: "text-transform:capitalize" })),
    el("div", { class: "daynav" },
      el("a", { class: "btn", href: older ? `#/d/${older}` : "#", "aria-disabled": String(!older) }, "← Jour précédent"),
      el("a", { class: "btn", href: newer ? `#/d/${newer}` : "#", "aria-disabled": String(!newer) }, "Jour suivant →"),
      el("a", { class: "btn", href: "#/archive" }, "Toutes les archives")),
    chipsBar(draw), box);
}

async function pagePost(edId, id) {
  setNav("archive");
  const e = await getJson(`data/editions/${edId}.json`);
  const p = e.posts.find((x) => x.id === id);
  if (!p) return notFound();
  await loadDay(edId.slice(0, 10)); // le jour de l'édition, pour l'horodatage et la navigation précédent/suivant
  const meta = allPosts.find((x) => x.edition === edId && x.id === id) || { ...p, edition: edId, ts: Date.parse(p.publishedAt || e.generatedAt) || 0, day: e.date };
  document.title = `${p.title} — Tech Daily`;
  // Précédent/suivant : uniquement les articles visibles selon les préférences (et l'article courant).
  const siblings = allPosts.filter((x) => x.day === meta.day && (isVisible(x) || (x.edition === edId && x.id === id)));
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
    cat(p.category).disclaimer ? el("p", { class: "disclaimer", role: "note", text: "⚠️ " + cat(p.category).disclaimer }) : null,
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
  let run = 0;
  // La liste des jours vient du manifeste (aucun jour à charger). La recherche charge les jours un par un, du plus récent au plus ancien.
  async function draw() {
    const q = norm(input.value.trim());
    const token = ++run;
    if (q) {
      const dates = visibleDays().map((d) => d.date);
      const pending = dates.filter((d) => !loadedDays.has(d));
      if (pending.length) {
        list.replaceChildren(el("div", { class: "empty", text: `Recherche dans ${plural(dates.length, "jour")}…` }));
        for (let i = 0; i < pending.length; i += 6) {
          await loadDays(pending.slice(i, i + 6));
          if (token !== run) return; // une saisie plus récente a pris le relais
        }
      }
      const hits = posts.filter((p) => norm([p.title, p.summary, (p.tags || []).join(" "), cat(p.category).label].join(" ")).includes(q));
      list.replaceChildren(hits.length ? el("div", { class: "rail" }, hits.slice(0, 60).map(postRow)) : el("div", { class: "empty", text: "Aucun article ne correspond à cette recherche." }),
        hits.length > 60 ? el("p", { class: "pref-help", text: `${hits.length} résultats : affinez la recherche pour voir les suivants.` }) : null);
      return;
    }
    const nodes = [];
    let month = "";
    for (const d of visibleDays()) {
      const m = fmtMonth.format(new Date(d.date + "T12:00:00Z"));
      if (m !== month) { month = m; nodes.push(el("h2", { class: "month", text: m })); }
      const ids = Object.keys(d.categories || {}).filter((id) => !prefs.hidden.includes(id));
      nodes.push(el("a", { class: "ed", href: `#/d/${d.date}` },
        el("h3", { text: dayLabel(d.date) }),
        el("div", { class: "meta" }, ...ids.map(catTag), plural(catCount(d), "article"))));
    }
    if (!nodes.length) nodes.push(el("div", { class: "empty", text: "Aucune archive pour le moment." }));
    list.replaceChildren(...nodes);
  }
  input.addEventListener("input", draw);
  draw();
  show(el("section", { class: "hero" }, el("div", { class: "eyebrow", text: `${plural(totalVisible(), "article")} · ${plural(visibleDays().length, "jour")}` }), el("h1", { text: "Archives" })), input, list);
}

async function pageSaved() {
  setNav("saved");
  document.title = "Favoris — Tech Daily";
  await loadDays([...new Set([...saved].map((k) => k.slice(0, 10)))]);
  const list = allPosts.filter(isSaved); // les favoris restent visibles même si leur rubrique est masquée
  show(
    el("section", { class: "hero" }, el("div", { class: "eyebrow", text: "Stockés sur cet appareil" }), el("h1", { text: "Favoris" }),
      el("p", { class: "lead", text: list.length ? `${plural(list.length, "article")} enregistré${list.length > 1 ? "s" : ""}. Ils sont gardés dans ce navigateur uniquement.` : "" })),
    list.length ? el("div", { class: "rail" }, list.map(postRow))
      : el("div", { class: "empty" }, el("p", { text: "Aucun favori pour le moment. Utilise le marque-page d'une carte ou d'un article pour le retrouver ici." }), el("a", { class: "btn", href: "#/" }, "Parcourir les articles")));
}

// Bandeau affiché quand des préférences masquent une partie des articles.
function prefsNote() {
  const hidden = hiddenByCats();
  if (!hasPrefs()) return null;
  return el("p", { class: "prefs-note" },
    hidden ? `${plural(hidden, "article")} masqué${hidden > 1 ? "s" : ""} par vos préférences. ` : "Vos préférences sont actives. ",
    el("a", { href: "#/settings", text: "Modifier" }));
}

function pageSettings() {
  setNav("settings");
  document.title = "Préférences — Tech Daily";
  const known = new Set(categories.map((c) => c.id));
  const extra = presentCats().filter((id) => !known.has(id)).map((id) => cat(id));
  const rows = el("div", { class: "pref-list" });
  const summary = el("p", { class: "lead" });

  const refresh = () => {
    applyPrefs();
    paintSummary();
  };
  const paintSummary = () => {
    const hidden = hiddenByCats();
    summary.textContent = hasPrefs()
      ? `${plural(totalVisible(), "article")} affichés${hidden ? `, ${plural(hidden, "article")} masqué${hidden > 1 ? "s" : ""} par rubrique` : ""}${prefs.muted.length ? ", plus ceux qui contiennent un mot masqué" : ""}.`
      : "Aucun filtre : tous les articles sont affichés.";
  };

  for (const c of [...categories, ...extra]) {
    const count = manifest.days.reduce((n, d) => n + ((d.categories || {})[c.id] || 0), 0);
    const input = el("input", { type: "checkbox", role: "switch", id: `pref-${c.id}` });
    input.checked = !prefs.hidden.includes(c.id);
    input.onchange = () => {
      prefs.hidden = input.checked ? prefs.hidden.filter((x) => x !== c.id) : [...new Set([...prefs.hidden, c.id])];
      savePrefs();
      refresh();
    };
    rows.append(el("label", { class: "pref-row", for: `pref-${c.id}`, style: `--h:${c.hue ?? 220}` },
      el("span", { class: "pref-ico", "aria-hidden": "true", text: c.icon || "📄" }),
      el("span", { class: "pref-name" }, el("strong", { text: c.label }), el("small", { text: count ? plural(count, "article") : "pas encore d'article" })),
      input, el("span", { class: "switch", "aria-hidden": "true" })));
  }

  const words = el("input", { class: "search", type: "text", id: "pref-words", placeholder: "ex. élection, bitcoin, NFT", "aria-describedby": "pref-words-help", value: prefs.muted.join(", ") });
  words.oninput = () => {
    prefs.muted = [...new Set(words.value.split(",").map((w) => norm(w.trim())).filter((w) => w.length >= 2))];
    savePrefs();
    refresh();
  };
  const reset = el("button", { class: "btn", type: "button", text: "Tout réafficher" });
  reset.onclick = () => {
    prefs = { hidden: [], muted: [] };
    savePrefs();
    applyPrefs();
    pageSettings();
    toast("Préférences réinitialisées");
  };
  paintSummary();

  show(
    el("section", { class: "hero" }, el("div", { class: "eyebrow", text: "Stockées sur cet appareil" }), el("h1", { text: "Préférences" }), summary),
    el("h2", { class: "pref-h", text: "Rubriques" }),
    el("p", { class: "pref-help", text: "Désactive une rubrique pour ne plus voir ses articles dans le fil, les archives et la recherche." }),
    rows,
    el("h2", { class: "pref-h", text: "Mots masqués" }),
    el("p", { class: "pref-help", id: "pref-words-help", text: "Les articles dont le titre, le résumé ou les tags contiennent l'un de ces mots (séparés par des virgules) sont masqués." }),
    words,
    el("div", { class: "actions" }, reset, el("a", { class: "btn", href: "#/" }, "Retour au fil")));
}

function notFound() {
  show(el("div", { class: "error" }, el("p", { text: "Cette page n'existe pas ou n'existe plus." }), el("a", { class: "btn", href: "#/" }, "Revenir à l'accueil")));
}

/* ---------- Router ---------- */

async function route() {
  try {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return await pageHome();
    if (parts[0] === "saved") return await pageSaved();
    if (parts[0] === "settings") return pageSettings();
    if (parts[0] === "archive") return pageArchive(new URLSearchParams(qs).get("q") || "");
    if (parts[0] === "d" && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "")) return await pageDay(parts[1]);
    // Les segments d'URL servent à construire un chemin de fichier : on n'accepte que le format attendu.
    if (parts[0] === "p" && /^\d{4}-\d{2}-\d{2}(-\d{4})?$/.test(parts[1] || "") && /^[a-z0-9-]+$/.test(parts[2] || "")) return await pagePost(parts[1], parts[2]);
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
  [manifest, { categories }] = await Promise.all([getJson("data/index.json"), getJson("data/categories.json")]);
  paintNavCount();
  addEventListener("hashchange", route);
  route();
} catch (err) {
  show(el("div", { class: "error" }, el("p", { text: "Impossible de charger le blog." }), el("p", { text: String(err.message) })));
}
