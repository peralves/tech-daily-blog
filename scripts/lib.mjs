import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EDITIONS_DIR = join(ROOT, "data", "editions");
export const INDEX_PATH = join(ROOT, "data", "index.json");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9-]+$/;

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function listEditions() {
  const files = (await readdir(EDITIONS_DIR)).filter((f) => DATE_RE.test(f.replace(/\.json$/, "")) && f.endsWith(".json"));
  const editions = [];
  for (const f of files) editions.push(await readJson(join(EDITIONS_DIR, f)));
  return editions.sort((a, b) => b.date.localeCompare(a.date));
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
  }
  return errors;
}

export async function buildIndex() {
  const editions = await listEditions();
  const index = {
    schemaVersion: "1.0",
    updatedAt: new Date().toISOString(),
    editions: editions.map((e) => ({
      date: e.date,
      title: e.title,
      summary: e.summary || "",
      posts: e.posts.map((p) => ({
        id: p.id,
        category: p.category,
        title: p.title,
        summary: p.summary || "",
        tags: p.tags || [],
        importance: p.importance || 1,
      })),
    })),
  };
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
  return index;
}
