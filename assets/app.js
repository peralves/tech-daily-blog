import { el, renderBlocks, safeUrl, illustration } from "./blocks.js";

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
  posts = index.editions.flatMap((e) => e.posts.map((p) => ({ ...p, edition: e.id, ts: Date.parse(p.publishedAt) || 0 })));
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
const art = (p, extra = {}) => illustration({ icon: p.icon || cat(p.category).icon, hue: cat(p.category).hue, motif: p.category, seed: p.edition + p.id, cover: p.cover?.url, alt: p.cover?.alt || p.title, ...extra });
const href = (p) => `#/p/${p.edition}/${p.id}`;

function postRow(p) {
  return el("div", { class: "row", style: catStyle(p.category) },
    el("time", { class: "row-time", datetime: p.publishedAt, text: time(p) }),
    el("a", { class: "card", href: href(p) },
      art(p),
      el("div", { class: "card-body" },
        el("div", { class: "meta" }, catTag(p.category), p.readingMinutes ? `${p.readingMinutes} min` : null),
        el("h3", { text: p.title }),
        p.summary ? el("p", { text: p.summary }) : null,
        el("div", { class: "meta" }, ...(p.tags || []).slice(0, 4).map((t) => "#" + t)))));
}

function leadCard(p) {
  return el("a", { class: "lead-card", href: href(p), style: catStyle(p.category) },
    art(p),
    el("div", { class: "lead-body" },
      el("div", { class: "kicker", text: `À la une · ${cat(p.category).label} · ${time(p)}` }),
      el("h2", { text: p.title }),
      p.summary ? el("p", { text: p.summary }) : null,
      el("div", { class: "meta" }, p.readingMinutes ? `${p.readingMinutes} min de lecture` : null, ...(p.tags || []).slice(0, 3).map((t) => "#" + t))));
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
  const ids = ["all", ...new Set(posts.map((p) => p.category))];
  const bar = el("div", { class: "chips", role: "group", "aria-label": "Filtrer par rubrique" });
  const paint = () => bar.replaceChildren(...ids.map((id) => {
    const b = el("button", { class: "chip", type: "button", "data-all": id === "all" ? "" : null, style: id === "all" ? null : catStyle(id), "aria-pressed": String(filter === id) }, id === "all" ? "Tout" : `${cat(id).icon || ""} ${cat(id).label}`);
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
    const vis = days.map((d) => ({ date: d.date, posts: d.posts.filter((p) => (filter === "all" || p.category === filter) && !(filter === "all" && p === lead)) })).filter((d) => d.posts.length);
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
  const draw = () => box.replaceChildren(el("div", { class: "rail" }, days[k].posts.filter((p) => filter === "all" || p.category === filter).map(postRow)));
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

  show(el("article", { class: "article", style: catStyle(p.category) },
    el("a", { class: "btn", href: `#/d/${meta.day}` }, "← ", dayLabel(meta.day)),
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

function notFound() {
  show(el("div", { class: "error" }, el("p", { text: "Cette page n'existe pas ou n'existe plus." }), el("a", { class: "btn", href: "#/" }, "Revenir à l'accueil")));
}

/* ---------- Router ---------- */

async function route() {
  try {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return pageHome();
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
  addEventListener("hashchange", route);
  route();
} catch (err) {
  show(el("div", { class: "error" }, el("p", { text: "Impossible de charger le blog." }), el("p", { text: String(err.message) })));
}
