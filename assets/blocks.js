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

// Illustration générée : dégradé à la teinte de la catégorie + formes + icône (emoji) de l'article.
// Si l'article fournit une image de couverture valide, elle est utilisée ; sinon (ou si elle échoue) on retombe sur l'illustration.
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }
export function illustration({ icon, hue = 220, seed = "", cover = null, alt = "", cls = "" }) {
  const h = hash(seed);
  const art = el("div", { class: "art " + cls, "aria-hidden": cover ? null : "true", style: `--h:${hue};--x:${h % 70}%;--y:${(h >> 7) % 70}%;--r:${(h >> 3) % 360}deg` },
    el("span", { class: "art-icon", text: icon || "📰" }));
  const src = cover && safeUrl(cover);
  if (src) {
    const img = el("img", { src, alt, loading: "lazy", referrerpolicy: "no-referrer" });
    img.onerror = () => img.remove();
    art.classList.add("has-cover");
    art.append(img);
    art.setAttribute("role", "img");
    art.setAttribute("aria-label", alt);
  }
  return art;
}
