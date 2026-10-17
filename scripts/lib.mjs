import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EDITIONS_DIR = join(ROOT, "data", "editions");
export const INDEX_PATH = join(ROOT, "data", "index.json");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Nom de fichier d'une édition : AAAA-MM-JJ.json ou AAAA-MM-JJ-HHmm.json (plusieurs générations par jour possibles)
const ID_RE = /^\d{4}-\d{2}-\d{2}(-\d{4})?$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function listEditions() {
  const files = (await readdir(EDITIONS_DIR)).filter((f) => f.endsWith(".json") && ID_RE.test(f.slice(0, -5)));
  const editions = [];
  for (const f of files) {
    const e = await readJson(join(EDITIONS_DIR, f));
    e.id = f.slice(0, -5); // l'identifiant d'une édition = son nom de fichier
    editions.push(e);
  }
  return editions.sort((a, b) => (b.generatedAt || b.id).localeCompare(a.generatedAt || a.id) || b.id.localeCompare(a.id));
}

/** Contrôle minimal (le front est tolérant, on vérifie juste l'essentiel). */
export function validateEdition(e) {
  const errors = [];
  if (!e || typeof e !== "object") return ["édition invalide"];
  if (!/^\d+\.\d+$/.test(e.schemaVersion || "")) errors.push("schemaVersion manquant ou invalide");
  if (!DATE_RE.test(e.date || "")) errors.push("date invalide");
  if (!e.title) errors.push("title manquant");
  if (!Array.isArray(e.posts) || !e.posts.length) errors.push("posts vide");
  const ids = new Set();
  for (const p of e.posts || []) {
    if (!SLUG_RE.test(p.id || "")) errors.push(`post.id invalide: ${p.id}`);
    if (ids.has(p.id)) errors.push(`post.id dupliqué: ${p.id}`);
    ids.add(p.id);
    if (!p.category) errors.push(`${p.id}: category manquante`);
    if (!p.title) errors.push(`${p.id}: title manquant`);
    if (!Array.isArray(p.blocks) || !p.blocks.length) errors.push(`${p.id}: blocks vide`);
    if (p.publishedAt && Number.isNaN(Date.parse(p.publishedAt))) errors.push(`${p.id}: publishedAt invalide`);
  }
  return errors;
}

// Un article ne peut pas être publié après la génération de son édition (ni dans le futur).
function clampTime(publishedAt, e) {
  const gen = Date.parse(e.generatedAt);
  const pub = Date.parse(publishedAt);
  const fallback = Number.isNaN(gen) ? Date.parse(`${e.date}T06:00:00Z`) : gen;
  const t = Number.isNaN(pub) ? fallback : Math.min(pub, Number.isNaN(gen) ? pub : gen);
  return new Date(Math.min(t, Date.now())).toISOString();
}

export const INDEX_DIR = join(ROOT, "data", "index");

// Découpage par période (un fichier par jour) : le site ne charge que les jours affichés.
//  - data/index.json            : manifeste léger, une ligne par jour (nombre d'articles, par rubrique) ;
//  - data/index/AAAA-MM-JJ.json : les éditions et les résumés d'articles de ce jour.
export async function buildIndex() {
  const editions = await listEditions();
  const byDate = new Map();
  for (const e of editions) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  await rm(INDEX_DIR, { recursive: true, force: true }); // pas de fichiers périmés
  await mkdir(INDEX_DIR, { recursive: true });

  const days = [];
  for (const [date, list] of [...byDate].sort((a, b) => b[0].localeCompare(a[0]))) {
    const shard = {
      schemaVersion: "2.0",
      date,
      editions: list.map((e) => ({
        id: e.id,
        date: e.date,
        generatedAt: e.generatedAt || null,
        title: e.title,
        summary: e.summary || "",
        posts: e.posts.map((p) => ({
          id: p.id,
          category: p.category,
          title: p.title,
          summary: p.summary || "",
          tags: p.tags || [],
          importance: p.importance || 1,
          readingMinutes: p.readingMinutes || null,
          icon: p.icon || null,
          // illustration SVG de couverture, embarquée seulement si elle est compacte
          illustration: p.illustration?.svg && p.illustration.svg.length <= 8000 ? { svg: p.illustration.svg } : null,
          cover: p.cover?.url ? { url: p.cover.url, alt: p.cover.alt || "" } : null,
          // horodatage de l'article ; à défaut, celui de la génération
          publishedAt: clampTime(p.publishedAt, e),
        })),
      })),
    };
    await writeFile(join(INDEX_DIR, `${date}.json`), JSON.stringify(shard));
    const categories = {};
    for (const e of list) for (const p of e.posts) categories[p.category] = (categories[p.category] || 0) + 1;
    days.push({ date, editions: list.length, posts: Object.values(categories).reduce((a, b) => a + b, 0), categories });
  }

  const manifest = { schemaVersion: "2.0", updatedAt: new Date().toISOString(), days };
  await writeFile(INDEX_PATH, JSON.stringify(manifest) + "\n");
  return manifest;
}
