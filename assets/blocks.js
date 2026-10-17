// Renderers de blocs. Pour supporter un nouveau type : ajouter une entrée dans `renderers`.
// Tout est construit via le DOM / textContent : aucun HTML venant du JSON n'est interprété.

export function safeUrl(u) {
  try {
    const x = new URL(u, location.href);
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : null;
  } catch { return null; }
}

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  const wrap = props.class && /\bmeta\b/.test(props.class);
  for (const k of kids.flat()) if (k != null) n.append(wrap && typeof k === "string" ? el("span", { text: k }) : k);
  return n;
}

// Inline : **gras**, *italique*, `code`, [libellé](url)
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
export function inline(text) {
  const frag = document.createDocumentFragment();
  String(text ?? "").split(INLINE).forEach((part) => {
    if (!part) return;
    let m;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) frag.append(el("strong", { text: part.slice(2, -2) }));
    else if (part.startsWith("`") && part.endsWith("`") && part.length > 2) frag.append(el("code", { text: part.slice(1, -1) }));
    else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) frag.append(el("em", { text: part.slice(1, -1) }));
    else if ((m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)) && safeUrl(m[2])) frag.append(el("a", { href: safeUrl(m[2]), target: "_blank", rel: "noopener noreferrer", text: m[1] }));
    else frag.append(part);
  });
  return frag;
}

export const renderers = {
  paragraph: (b) => el("p", {}, inline(b.text)),
  heading: (b) => el(b.level >= 3 ? "h3" : "h2", {}, inline(b.text)),
  list: (b) => el(b.ordered ? "ol" : "ul", {}, (b.items || []).map((i) => el("li", {}, inline(i)))),
  quote: (b) => el("blockquote", {}, el("p", {}, inline(b.text)), b.author ? el("footer", { text: "— " + b.author }) : null),
  code: (b) => el("pre", {}, el("code", { text: b.code ?? b.text ?? "", "data-lang": b.language })),
  callout: (b) => el("div", { class: "callout " + (b.tone || "info"), role: "note" }, b.title || b.icon ? el("strong", { class: "t", text: [b.icon, b.title].filter(Boolean).join(" ") }) : null, el("span", {}, inline(b.text))),
  image: (b) => {
    const src = safeUrl(b.url);
    return src ? el("figure", {}, el("img", { src, alt: b.alt || "", loading: "lazy", referrerpolicy: "no-referrer" }), b.caption ? el("figcaption", { text: b.caption }) : null) : null;
  },
  link: (b) => {
    const href = safeUrl(b.url);
    return href ? el("a", { class: "linkblock", href, target: "_blank", rel: "noopener noreferrer", text: (b.label || b.title || href) + " ↗" }) : null;
  },
  table: (b) => el("div", { class: "table-wrap" }, el("table", {},
    b.headers ? el("thead", {}, el("tr", {}, b.headers.map((h) => el("th", {}, inline(h))))) : null,
    el("tbody", {}, (b.rows || []).map((r) => el("tr", {}, r.map((c) => el("td", {}, inline(c)))))))),
  keyvalue: (b) => el("dl", { class: "kv" }, (b.items || []).flatMap((i) => [el("dt", { text: i.label }), el("dd", {}, inline(i.value))])),
};

export function renderBlocks(blocks = []) {
  const root = el("div", { class: "body" });
  for (const b of blocks) {
    const fn = renderers[b?.type];
    // Type inconnu : repli sur le champ `text` s'il existe, sinon ignoré (schéma évolutif).
    const node = fn ? fn(b) : typeof b?.text === "string" ? renderers.paragraph(b) : null;
    if (node) root.append(node);
  }
  return root;
}

// ---------- Illustrations ----------
// Couverture : image réelle de l'article si fournie (og:image de la source), sinon illustration SVG générée
// à partir de la catégorie (motif) et du titre (graine) : réseau (web), code (dev), pipeline (devops), circuit (électronique).
function rng(seed) {
  let a = 2166136261;
  for (const c of String(seed)) a = Math.imul(a ^ c.codePointAt(0), 16777619);
  return () => { a += 0x6d2b79f5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (n) => Math.round(n * 10) / 10;

const motifs = {
  web(r) {
    const pts = Array.from({ length: 11 }, () => [f(40 + r() * 560), f(30 + r() * 300), f(3 + r() * 6)]);
    let s = "";
    pts.forEach((a, i) => pts.slice(i + 1).forEach((b) => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 170) s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" opacity=".35"/>`; }));
    pts.forEach(([x, y, k], i) => { s += `<circle cx="${x}" cy="${y}" r="${k}" fill="currentColor" stroke="none" opacity="${i % 3 ? .6 : 1}"/>`; if (i % 4 === 0) s += `<circle cx="${x}" cy="${y}" r="${k + 9}" opacity=".4"/>`; });
    return s;
  },
  dev(r) {
    let s = "", y = 46;
    for (let i = 0; i < 9; i++, y += 31) {
      const indent = Math.floor(r() * 3) * 28, w = 50 + r() * 230;
      s += `<rect x="${60 + indent}" y="${y}" width="${f(w)}" height="10" rx="5" fill="currentColor" stroke="none" opacity="${i % 3 === 0 ? .9 : .35}"/>`;
      if (r() > .5) s += `<rect x="${f(70 + indent + w)}" y="${y}" width="${f(24 + r() * 70)}" height="10" rx="5" fill="currentColor" stroke="none" opacity=".18"/>`;
    }
    return s + `<text x="470" y="250" font-size="190" font-family="monospace" fill="currentColor" stroke="none" opacity=".16">{}</text>`;
  },
  devops(r) {
    const n = 4, y = 150 + (r() - .5) * 40;
    let s = "";
    for (let i = 0; i < n; i++) {
      const x = 50 + i * 150, yy = f(y + (i % 2 ? -40 : 30) * r());
      s += `<rect x="${x}" y="${yy - 28}" width="100" height="56" rx="14" opacity="${i === n - 1 ? 1 : .7}"/><circle cx="${x + 22}" cy="${yy}" r="6" fill="currentColor" stroke="none"/><line x1="${x + 40}" y1="${yy}" x2="${x + 80}" y2="${yy}" opacity=".5"/>`;
      if (i < n - 1) s += `<path d="M${x + 100} ${yy} C ${x + 125} ${yy}, ${x + 125} ${f(y)}, ${x + 150} ${f(y)}" opacity=".5"/>`;
    }
    return s + `<path d="M70 300 H570" stroke-dasharray="3 9" opacity=".4"/><path d="M570 300 l-10 -7 v14z" fill="currentColor" stroke="none" opacity=".5"/>`;
  },
  electronique(r) {
    let s = `<rect x="250" y="120" width="140" height="120" rx="14"/><rect x="278" y="148" width="84" height="64" rx="8" opacity=".5"/>`;
    for (let i = 0; i < 6; i++) {
      const y = 140 + i * 18, x2 = f(40 + r() * 120), x3 = f(480 + r() * 120);
      s += `<path d="M250 ${y} H${x2 + 100} V${f(y + (r() - .5) * 120)} H${x2}" opacity=".6"/><circle cx="${x2}" cy="${f(y + (r() - .5) * 0)}" r="5" fill="currentColor" stroke="none"/>`;
      s += `<path d="M390 ${y} H${x3 - 60} V${f(y + (r() - .5) * 120)} H${x3}" opacity=".6"/><circle cx="${x3}" cy="${f(y)}" r="5" fill="currentColor" stroke="none"/>`;
    }
    return s;
  },
};
motifs.default = motifs.web;

export function illustration({ icon, hue = 220, seed = "", cover = null, alt = "", motif = "web", cls = "" }) {
  const r = rng(seed);
  const art = el("div", { class: "art " + cls, style: `--h:${hue};--gx:${Math.floor(r() * 80)}%;--gy:${Math.floor(r() * 80)}%` });
  const svg = el("div", { class: "art-svg", "aria-hidden": "true" });
  svg.innerHTML = `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(motifs[motif] || motifs.default)(r)}</svg>`;
  art.append(svg, el("span", { class: "art-chip", "aria-hidden": "true", text: icon || "📰" }));
  const src = cover && safeUrl(cover);
  if (src) {
    const img = el("img", { src, alt, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    img.onerror = () => img.remove();
    art.append(img);
  }
  return art;
}
