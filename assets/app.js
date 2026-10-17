import { el, renderBlocks, safeUrl } from "./blocks.js";

const main = document.getElementById("main");
const cache = new Map();
let index, categories;
let filter = "all";

const fmtLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const d = (s) => new Date(s + "T12:00:00Z");
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const j = await r.json();
  cache.set(url, j);
  return j;
}
const getEdition = (date) => getJson(`data/editions/${date}.json`);

function cat(id) {
  return categories.find((c) => c.id === id) || { id, label: id, icon: "📄", hue: 220 };
}
function catTag(id) {
  const c = cat(id);
  return el("span", { class: "tag", style: `--h:${c.hue ?? 220}` }, c.icon || "", " ", c.label);
}

function postCard(date, p, top = false) {
  const a = el("a", { class: "card" + (top ? " top" : ""), href: `#/d/${date}/${p.id}`, style: `--h:${cat(p.category).hue ?? 220}` },
    el("div", {}, catTag(p.category)),
    el("h3", { text: p.title }),
    p.summary ? el("p", { text: p.summary }) : null,
    el("div", { class: "meta" }, p.readingMinutes ? `${p.readingMinutes} min de lecture` : null, ...(p.tags || []).slice(0, 3).map((t) => "#" + t)));
  return a;
}

function setNav(name) {
  document.querySelectorAll("[data-nav]").forEach((a) => (a.dataset.nav === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
}
function show(...nodes) {
  main.replaceChildren(...nodes);
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

/* ---------- Pages ---------- */

async function pageEdition(date) {
  setNav(date === index.editions[0]?.date ? "home" : "archive");
  const e = await getEdition(date);
  document.title = `${e.title} — Tech Daily`;
  const dates = index.editions.map((x) => x.date);
  const i = dates.indexOf(date);
  const newer = dates[i - 1], older = dates[i + 1];

  const present = [...new Set(e.posts.map((p) => p.category))];
  const chips = el("div", { class: "chips", role: "group", "aria-label": "Filtrer par catégorie" },
    ["all", ...present].map((id) => {
      const b = el("button", { class: "chip", type: "button", "aria-pressed": String(filter === id) }, id === "all" ? "Tout" : `${cat(id).icon || ""} ${cat(id).label}`);
      b.onclick = () => { filter = id; draw(); };
      return b;
    }));
  const gridBox = el("div");
  function draw() {
    chips.querySelectorAll(".chip").forEach((b, k) => b.setAttribute("aria-pressed", String(["all", ...present][k] === filter)));
    const posts = e.posts.filter((p) => filter === "all" || p.category === filter).sort((a, b) => (b.importance || 1) - (a.importance || 1));
    gridBox.replaceChildren(el("div", { class: "grid" }, posts.map((p, k) => postCard(date, p, k === 0 && filter === "all" && (p.importance || 1) >= 4))));
  }
  draw();

  show(
    el("section", { class: "hero" },
      el("div", { class: "eyebrow", text: fmtLong.format(d(date)) }),
      el("h1", { text: e.title }),
      e.summary ? el("p", { class: "lead", text: e.summary }) : null,
      e.highlights?.length ? el("ul", { class: "highlights" }, e.highlights.map((h) => el("li", { text: h }))) : null),
    el("div", { class: "daynav" },
      el("a", { class: "btn", href: older ? `#/d/${older}` : "#", "aria-disabled": String(!older) }, "← Jour précédent"),
      el("a", { class: "btn", href: newer ? `#/d/${newer}` : "#", "aria-disabled": String(!newer) }, "Jour suivant →"),
      el("a", { class: "btn", href: "#/archive" }, "Toutes les éditions")),
    chips, gridBox);
}

async function pagePost(date, id) {
  setNav("archive");
  const e = await getEdition(date);
  const p = e.posts.find((x) => x.id === id);
  if (!p) return notFound();
  document.title = `${p.title} — Tech Daily`;
  const k = e.posts.findIndex((x) => x.id === id);
  const prev = e.posts[k - 1], next = e.posts[k + 1];
  const cover = p.cover && safeUrl(p.cover.url);
  const sources = (p.sources || []).filter((s) => safeUrl(s.url));

  show(el("article", { class: "article", style: `--h:${cat(p.category).hue ?? 220}` },
    el("a", { class: "btn", href: `#/d/${date}` }, "← ", fmtLong.format(d(date))),
    el("div", { style: "margin-top:20px" }, catTag(p.category)),
    el("h1", { text: p.title }),
    p.summary ? el("p", { class: "lead", text: p.summary }) : null,
    el("div", { class: "meta" }, p.readingMinutes ? `${p.readingMinutes} min de lecture` : null, ...(p.tags || []).map((t) => "#" + t)),
    cover ? el("img", { class: "cover", src: cover, alt: p.cover.alt || "", referrerpolicy: "no-referrer" }) : null,
    el("div", { style: "margin-top:24px" }, renderBlocks(p.blocks)),
    sources.length ? el("section", { class: "sources" }, el("h2", { text: "Sources" }),
      el("ul", {}, sources.map((s) => el("li", {}, el("a", { href: safeUrl(s.url), target: "_blank", rel: "noopener noreferrer", text: s.title || s.url }), s.publisher ? ` — ${s.publisher}` : "")))) : null,
    el("nav", { class: "pager" },
      prev ? el("a", { class: "btn", href: `#/d/${date}/${prev.id}` }, "← " + prev.title) : el("span"),
      next ? el("a", { class: "btn", href: `#/d/${date}/${next.id}` }, next.title + " →") : null)));
}

function pageArchive(query = "") {
  setNav("archive");
  document.title = "Archives — Tech Daily";
  const input = el("input", { class: "search", type: "search", placeholder: "Rechercher dans toutes les éditions…", "aria-label": "Rechercher", value: query });
  const list = el("div");
  function draw() {
    const q = norm(input.value.trim());
    const nodes = [];
    let month = "";
    for (const e of index.editions) {
      const hits = q ? e.posts.filter((p) => norm([p.title, p.summary, (p.tags || []).join(" "), p.category].join(" ")).includes(q)) : [];
      if (q && !hits.length && !norm(e.title + e.summary).includes(q)) continue;
      const m = fmtMonth.format(d(e.date));
      if (m !== month) { month = m; nodes.push(el("h2", { class: "month", text: m })); }
      nodes.push(el("a", { class: "ed", href: `#/d/${e.date}` },
        el("h3", { text: `${fmtLong.format(d(e.date))} — ${e.title}` }),
        el("p", { text: q && hits.length ? hits.map((h) => h.title).join(" · ") : e.summary }),
        el("div", { class: "meta", style: "margin-top:8px" }, ...[...new Set(e.posts.map((p) => p.category))].map((c) => catTag(c)), `${e.posts.length} articles`)));
    }
    list.replaceChildren(...(nodes.length ? nodes : [el("div", { class: "empty", text: "Aucun résultat." })]));
  }
  input.addEventListener("input", draw);
  draw();
  show(el("section", { class: "hero" }, el("h1", { text: "Archives" }), el("p", { class: "lead", text: `${index.editions.length} édition(s) disponibles.` })), input, list);
}

function notFound() {
  show(el("div", { class: "error" }, el("p", { text: "Page introuvable." }), el("a", { class: "btn", href: "#/" }, "Retour à l'accueil")));
}

/* ---------- Router ---------- */

async function route() {
  try {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) return await pageEdition(index.editions[0].date);
    if (parts[0] === "archive") return pageArchive(new URLSearchParams(qs).get("q") || "");
    if (parts[0] === "d" && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || "")) {
      if (!index.editions.some((e) => e.date === parts[1])) return notFound();
      return parts[2] ? await pagePost(parts[1], parts[2]) : await pageEdition(parts[1]);
    }
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
  addEventListener("hashchange", route);
  route();
} catch (err) {
  show(el("div", { class: "error" }, el("p", { text: "Impossible de charger le blog." }), el("p", { text: String(err.message) })));
}
