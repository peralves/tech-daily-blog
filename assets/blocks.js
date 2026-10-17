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
  keyvalue: (b) => el("dl", { class: "kv" }, (b.items || []).flatMap((i) => [el("dt", { text: i.label ?? i.key ?? i.name ?? i.term ?? "" }), el("dd", {}, inline(i.value))])),
  // Illustration SVG écrite par l'auteur (schéma, infographie). Rendue via <img> : aucun script ne peut s'exécuter.
  diagram: (b) => {
    const src = svgUrl(b.svg);
    return src ? el("figure", { class: "diagram" }, el("img", { src, alt: b.alt || b.caption || "Illustration", loading: "lazy" }), b.caption ? el("figcaption", { text: b.caption }) : null) : null;
  },
  // Avis / vision de la rédaction
  opinion: (b) => el("aside", { class: "opinion" },
    el("div", { class: "opinion-k", text: b.title || "Notre avis" }),
    ...(Array.isArray(b.paragraphs) ? b.paragraphs : [b.text]).filter(Boolean).map((t) => el("p", {}, inline(t))),
    b.verdict ? el("p", { class: "verdict" }, inline(b.verdict)) : null),
  // Exemples d'usage concrets : [{icon, title, text}]
  usecases: (b) => el("section", { class: "usecases" },
    el("h2", { text: b.title || "Exemples d'utilisation" }),
    el("div", { class: "uc-grid" }, (b.items || []).map((i) => el("div", { class: "uc" },
      el("span", { class: "uc-ico", "aria-hidden": "true", text: i.icon || "✦" }), el("h3", { text: i.title }), el("p", {}, inline(i.text)))))),
  // Évolution / jalons : [{label, text}]
  timeline: (b) => el("section", { class: "tl" },
    b.title ? el("h2", { text: b.title }) : null,
    el("ol", {}, (b.items || []).map((i) => el("li", {}, el("strong", { text: i.label }), el("span", {}, inline(i.text)))))),
};

export function svgUrl(svg) {
  if (typeof svg !== "string") return null;
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s) || s.length > 80000 || /<script|<foreignObject|javascript:/i.test(s)) return null;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
}

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
  geographie(r) { // globe, méridiens et repères
    let s = `<circle cx="320" cy="180" r="110"/><ellipse cx="320" cy="180" rx="45" ry="110" opacity=".6"/><ellipse cx="320" cy="180" rx="90" ry="110" opacity=".4"/><path d="M210 180H430M230 120H410M230 240H410" opacity=".5"/>`;
    for (let i = 0; i < 3; i++) { const x = f(250 + r() * 140), y = f(110 + r() * 140); s += `<circle cx="${x}" cy="${y}" r="7" fill="currentColor" stroke="none"/><circle cx="${x}" cy="${y}" r="16" opacity=".5"/>`; }
    return s;
  },
  ecologie(r) { // feuilles et nervures
    let s = "";
    for (let i = 0; i < 5; i++) { const x = 150 + i * 85, h = 70 + r() * 90, w = 28 + r() * 16; s += `<path d="M${x} 300 C${x - w} ${300 - h * .5} ${x - w * .4} ${300 - h} ${x} ${300 - h - 20} C${x + w * .4} ${300 - h} ${x + w} ${300 - h * .5} ${x} 300z" opacity="${.45 + i * .1}"/><path d="M${x} 300V${300 - h}" opacity=".5"/>`; }
    return s + `<circle cx="${f(480 + r() * 80)}" cy="90" r="34" opacity=".7"/>`;
  },
  politique(r) { // fronton et colonnes
    let s = `<path d="M170 140L320 80L470 140z"/><path d="M185 150H455"/><path d="M170 285H470"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="${195 + i * 52}" y="165" width="22" height="105" rx="4" opacity="${.55 + r() * .4}"/>`;
    return s + `<circle cx="320" cy="122" r="9" fill="currentColor" stroke="none"/>`;
  },
  finance(r) { // barres, courbe et pièce
    let s = "";
    for (let i = 0; i < 7; i++) { const h = 40 + r() * 140; s += `<rect x="${130 + i * 48}" y="${290 - h}" width="30" height="${f(h)}" rx="6" opacity="${.35 + i * .08}"/>`; }
    return s + `<path d="M135 250L230 200L300 220L400 140L470 110" stroke-width="4"/><circle cx="500" cy="100" r="30"/><path d="M490 100h20M500 90v20" opacity=".7"/>`;
  },
  crypto(r) { // hexagones chaînés
    let s = "";
    for (let i = 0; i < 4; i++) { const x = 160 + i * 105, y = 180 + (i % 2 ? -40 : 30) + (r() - .5) * 30; s += `<path d="M${x} ${y - 46}l40 23v46l-40 23-40-23v-46z" opacity="${.5 + i * .15}"/><circle cx="${x}" cy="${f(y)}" r="7" fill="currentColor" stroke="none"/>`; if (i < 3) s += `<path d="M${x + 40} ${f(y)}L${x + 65} ${f(y + (i % 2 ? 70 : -70))}" stroke-dasharray="4 6" opacity=".6"/>`; }
    return s;
  },
  bourse(r) { // chandeliers japonais
    let s = "", y = 180;
    for (let i = 0; i < 10; i++) { const d = (r() - .5) * 70, y2 = Math.max(110, Math.min(250, y + d)), top = Math.min(y, y2), h = Math.abs(y2 - y) + 12, x = 135 + i * 40; s += `<path d="M${x} ${f(top - 22)}V${f(top + h + 22)}" opacity=".6"/><rect x="${x - 11}" y="${f(top)}" width="22" height="${f(h)}" rx="3" ${d < 0 ? 'fill="currentColor" stroke="none" opacity=".9"' : 'opacity=".8"'}/>`; y = y2; }
    return s;
  },
  ia(r) { // réseau de neurones en couches
    const layers = [[150, 3], [260, 5], [380, 5], [490, 3]];
    const pts = layers.map(([x, n]) => Array.from({ length: n }, (_, i) => [x, f(180 + (i - (n - 1) / 2) * 52 + (r() - .5) * 10)]));
    let s = "";
    for (let l = 0; l < pts.length - 1; l++) pts[l].forEach((a) => pts[l + 1].forEach((b) => { s += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" opacity="${f(.12 + r() * .3)}"/>`; }));
    pts.flat().forEach(([x, y], i) => { s += `<circle cx="${x}" cy="${y}" r="${i % 4 === 0 ? 11 : 8}" fill="currentColor" stroke="none" opacity="${f(.55 + r() * .4)}"/>`; });
    return s;
  },
  cybersecurite(r) { // cadenas et grille de données
    let s = `<rect x="250" y="170" width="140" height="110" rx="16"/><path d="M280 170v-38a40 40 0 0 1 80 0v38"/><circle cx="320" cy="215" r="13" fill="currentColor" stroke="none"/><path d="M320 226v22" stroke-width="5"/>`;
    for (let i = 0; i < 8; i++) { const y = 70 + i * 32; s += `<path d="M70 ${y}h${f(40 + r() * 90)}M${f(470 + r() * 40)} ${y}h${f(40 + r() * 80)}" opacity="${f(.2 + r() * .4)}"/>`; }
    return s;
  },
  science(r) { // planète, anneau, orbite et étoiles
    let s = `<circle cx="320" cy="185" r="72"/><ellipse cx="320" cy="185" rx="150" ry="36" transform="rotate(-18 320 185)" opacity=".7"/><circle cx="${f(430 + r() * 40)}" cy="110" r="10" fill="currentColor" stroke="none"/>`;
    for (let i = 0; i < 14; i++) s += `<circle cx="${f(60 + r() * 520)}" cy="${f(40 + r() * 280)}" r="${f(1.5 + r() * 2.5)}" fill="currentColor" stroke="none" opacity="${f(.3 + r() * .6)}"/>`;
    return s;
  },
  batiment(r) { // grue et immeubles
    let s = `<path d="M180 300V110M180 110H430M180 140l60-30M430 110v50" /><path d="M430 160v28" stroke-dasharray="4 5"/><rect x="415" y="188" width="30" height="20" rx="3"/>`;
    for (let i = 0; i < 4; i++) { const h = 70 + r() * 110, x = 250 + i * 70; s += `<rect x="${x}" y="${f(300 - h)}" width="52" height="${f(h)}" rx="3" opacity="${f(.4 + i * .15)}"/><path d="M${x + 12} ${f(300 - h + 18)}h28M${x + 12} ${f(300 - h + 40)}h28" opacity=".5"/>`; }
    return s + `<path d="M100 300H540" />`;
  },
  energie(r) { // éclair et éolienne
    let s = `<path d="M330 70L255 195h60l-25 95 95-135h-62l30-85z" fill="currentColor" fill-opacity=".9" stroke="none"/>`;
    s += `<path d="M470 290V190M470 190l0-55M470 190l48 28M470 190l-48 28"/><circle cx="470" cy="190" r="8" fill="currentColor" stroke="none"/>`;
    for (let i = 0; i < 6; i++) s += `<circle cx="${f(70 + r() * 150)}" cy="${f(90 + r() * 200)}" r="${f(3 + r() * 5)}" opacity="${f(.2 + r() * .4)}"/>`;
    return s;
  },
  mobilite(r) { // voiture, route et éclair de recharge
    let s = `<path d="M130 235V205c0-14 8-24 22-27l50-12 28-38c6-8 14-12 24-12h110c12 0 22 5 29 14l36 38 46 10c15 3 23 13 23 28v31z"/><circle cx="210" cy="240" r="30" fill="currentColor" fill-opacity=".25"/><circle cx="440" cy="240" r="30" fill="currentColor" fill-opacity=".25"/><path d="M290 130l-26 44M360 120v48" opacity=".6"/>`;
    s += `<path d="M70 296H570" stroke-dasharray="26 18" opacity=".55"/><path d="M510 90l-18 30h22l-14 28" stroke-width="4"/>`;
    return s;
  },
  droit(r) { // balance de la justice
    let s = `<path d="M320 90V280M270 280H370M200 130H440"/><circle cx="320" cy="90" r="8" fill="currentColor" stroke="none"/><path d="M200 130L150 220H250z M440 130L390 220H490z" opacity=".8"/><path d="M150 220a50 22 0 0 0 100 0M390 220a50 22 0 0 0 100 0"/>`;
    for (let i = 0; i < 3; i++) s += `<path d="M${f(90 + r() * 50)} ${60 + i * 30}h${f(30 + r() * 40)}" opacity="${f(.2 + r() * .3)}"/>`;
    return s;
  },
};
motifs.default = motifs.web;

export function illustration({ icon, hue = 220, seed = "", cover = null, svg = null, alt = "", motif = "web", cls = "" }) {
  const r = rng(seed);
  const art = el("div", { class: "art " + cls, style: `--h:${hue};--gx:${Math.floor(r() * 80)}%;--gy:${Math.floor(r() * 80)}%` });
  const layer = el("div", { class: "art-svg", "aria-hidden": "true" });
  layer.innerHTML = `<svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${(motifs[motif] || motifs.default)(r)}</svg>`;
  art.append(layer, el("span", { class: "art-chip", "aria-hidden": "true", text: icon || "📰" }));
  const src = svgUrl(svg) || (cover && safeUrl(cover));
  if (src) {
    const img = el("img", { src, alt, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    img.onerror = () => img.remove();
    art.append(img);
  }
  return art;
}
