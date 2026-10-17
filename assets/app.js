import { el, renderBlocks, safeUrl } from "./blocks.js";

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
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
const catTag = (id) => el("span", { class: "tag", style: `--h:${cat(id).hue ?? 220}` }, cat(id).icon || "", " ", cat(id).label);

function postCard(p, top = false) {
  return el("a", { class: "card" + (top ? " top" : ""), href: `#/p/${p.edition}/${p.id}`, style: `--h:${cat(p.category).hue ?? 220}` },
    el("div", { class: "meta" }, catTag(p.category), el("time", { datetime: p.publishedAt, text: fmtTime.format(new Date(p.ts)) })),
    el("h3", { text: p.title }),
    p.summary ? el("p", { text: p.summary }) : null,
    el("div", { class: "meta" }, p.readingMinutes ? `${p.readingMinutes} min de lecture` : null, ...(p.tags || []).slice(0, 3).map((t) => "#" + t)));
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
  const bar = el("div", { class: "chips", role: "group", "aria-label": "Filtrer par catégorie" });
  const paint = () => bar.replaceChildren(...ids.map((id) => {
    const b = el("button", { class: "chip", type: "button", "aria-pressed": String(filter === id) }, id === "all" ? "Tout" : `${cat(id).icon || ""} ${cat(id).label}`);
    b.onclick = () => { filter = id; paint(); onChange(); };
    return b;
  }));
  paint();
  return bar;
}

const daySection = (date, list, link = true) =>
  el("section", { class: "day" },
    el("h2", { class: "day-h" }, link ? el("a", { href: `#/d/${date}`, text: dayLabel(date) }) : dayLabel(date), el("span", { class: "count", text: `${list.length} article${list.length > 1 ? "s" : ""}` })),
    el("div", { class: "grid" }, list.map((p) => postCard(p))));

/* ---------- Pages ---------- */

function pageHome() {
  setNav("home");
  document.title = "Tech Daily — veille web, dev, devops, électronique";
  const box = el("div");
  const more = el("button", { class: "btn more", type: "button", text: "Voir les jours précédents" });
  more.onclick = () => { shownDays += 3; draw(); };
  function draw() {
    const vis = days.map((d) => ({ date: d.date, posts: d.posts.filter((p) => filter === "all" || p.category === filter) })).filter((d) => d.posts.length);
    box.replaceChildren(...vis.slice(0, shownDays).map((d) => daySection(d.date, d.posts)), vis.length > shownDays ? more : el("span"));
    if (!vis.length) box.replaceChildren(el("div", { class: "empty", text: "Aucun article pour le moment." }));
  }
  draw();
  show(
    el("section", { class: "hero" }, el("h1", { text: "L'actualité tech, au fil de l'eau" }),
      el("p", { class: "lead", text: "Web, informatique, DevOps et électronique : tous les articles, horodatés, du plus récent au plus ancien." })),
    chipsBar(draw), box);
}

async function pageDay(date) {
  setNav("archive");
  const k = days.findIndex((d) => d.date === date);
  if (k < 0) return notFound();
  document.title = `${dayLabel(date)} — Tech Daily`;
  const newer = days[k - 1], older = days[k + 1];
  const eds = index.editions.filter((e) => e.posts.some((p) => fmtDayKey.format(new Date(Date.parse(p.publishedAt))) === date));
  const box = el("div");
  const draw = () => box.replaceChildren(el("div", { class: "grid" }, days[k].posts.filter((p) => filter === "all" || p.category === filter).map((p) => postCard(p))));
  draw();
  show(
    el("section", { class: "hero" }, el("div", { class: "eyebrow", text: "Édition du jour" }), el("h1", { text: dayLabel(date) }),
      ...eds.filter((e) => e.summary).map((e) => el("p", { class: "lead", text: e.summary }))),
    el("div", { class: "daynav" },
      el("a", { class: "btn", href: older ? `#/d/${older.date}` : "#", "aria-disabled": String(!older) }, "← Jour précédent"),
      el("a", { class: "btn", href: newer ? `#/d/${newer.date}` : "#", "aria-disabled": String(!newer) }, "Jour suivant →"),
      el("a", { class: "btn", href: "#/archive" }, "Archives")),
    chipsBar(draw), box);
}

async function pagePost(edId, id) {
  setNav("archive");
  const e = await getJson(`data/editions/${edId}.json`);
  const p = e.posts.find((x) => x.id === id);
  if (!p) return notFound();
  const meta = posts.find((x) => x.edition === edId && x.id === id);
  const ts = meta?.ts || Date.parse(p.publishedAt || e.generatedAt) || 0;
  document.title = `${p.title} — Tech Daily`;
  const siblings = posts.filter((x) => x.day === meta?.day);
  const k = siblings.findIndex((x) => x.edition === edId && x.id === id);
  const newer = siblings[k - 1], older = siblings[k + 1];
  const cover = p.cover && safeUrl(p.cover.url);
  const sources = (p.sources || []).filter((s) => safeUrl(s.url));
  const link = (x, label) => el("a", { class: "btn", href: `#/p/${x.edition}/${x.id}` }, label);

  show(el("article", { class: "article", style: `--h:${cat(p.category).hue ?? 220}` },
    el("a", { class: "btn", href: `#/d/${meta?.day || e.date}` }, "← ", dayLabel(meta?.day || e.date)),
    el("div", { class: "meta", style: "margin-top:20px" }, catTag(p.category),
      ts ? el("time", { datetime: new Date(ts).toISOString(), text: `${dayLabel(meta.day)} à ${fmtTime.format(new Date(ts))}` }) : null),
    el("h1", { text: p.title }),
    p.summary ? el("p", { class: "lead", text: p.summary }) : null,
    el("div", { class: "meta" }, p.readingMinutes ? `${p.readingMinutes} min de lecture` : null, ...(p.tags || []).map((t) => "#" + t)),
    cover ? el("img", { class: "cover", src: cover, alt: p.cover.alt || "", referrerpolicy: "no-referrer" }) : null,
    el("div", { style: "margin-top:24px" }, renderBlocks(p.blocks)),
    sources.length ? el("section", { class: "sources" }, el("h2", { text: "Sources" }),
      el("ul", {}, sources.map((s) => el("li", {}, el("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer", text: s.title || s.url }), s.publisher ? ` — ${s.publisher}` : "")))) : null,
    el("nav", { class: "pager" }, older ? link(older, "← " + older.title) : el("span"), newer ? link(newer, newer.title + " →") : null)));
}

function pageArchive(query = "") {
  setNav("archive");
  document.title = "Archives — Tech Daily";
  const input = el("input", { class: "search", type: "search", placeholder: "Rechercher dans tous les articles…", "aria-label": "Rechercher", value: query });
  const list = el("div");
  function draw() {
    const q = norm(input.value.trim());
    const nodes = [];
    if (q) {
      const hits = posts.filter((p) => norm([p.title, p.summary, (p.tags || []).join(" "), cat(p.category).label].join(" ")).includes(q));
      nodes.push(hits.length ? el("div", { class: "grid" }, hits.map((p) => postCard(p))) : el("div", { class: "empty", text: "Aucun résultat." }));
    } else {
      let month = "";
      for (const d of days) {
        const m = fmtMonth.format(new Date(d.date + "T12:00:00Z"));
        if (m !== month) { month = m; nodes.push(el("h2", { class: "month", text: m })); }
        nodes.push(el("a", { class: "ed", href: `#/d/${d.date}` },
          el("h3", { text: dayLabel(d.date) }),
          el("div", { class: "meta", style: "margin-top:8px" }, ...[...new Set(d.posts.map((p) => p.category))].map(catTag), `${d.posts.length} article${d.posts.length > 1 ? "s" : ""}`)));
      }
      if (!nodes.length) nodes.push(el("div", { class: "empty", text: "Aucune archive." }));
    }
    list.replaceChildren(...nodes);
  }
  input.addEventListener("input", draw);
  draw();
  show(el("section", { class: "hero" }, el("h1", { text: "Archives" }), el("p", { class: "lead", text: `${posts.length} articles sur ${days.length} jour(s).` })), input, list);
}

function notFound() {
  show(el("div", { class: "error" }, el("p", { text: "Page introuvable." }), el("a", { class: "btn", href: "#/" }, "Retour à l'accueil")));
}

/* ---------- Router ---------- */

async function route() {
  try {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return pageHome();
    if (parts[0] === "archive") return pageArchive(new URLSearchParams(qs).get("q") || "");
    if (parts[0] === "d" && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "")) return await pageDay(parts[1]);
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
