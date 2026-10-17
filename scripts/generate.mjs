// Génère l'édition du jour via l'API Claude + recherche web, puis met à jour l'index.
// Env : ANTHROPIC_API_KEY (requis), ANTHROPIC_MODEL (défaut claude-sonnet-5-5), EDITION_DATE (défaut: aujourd'hui, Europe/Paris), FORCE=1
import { writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, EDITIONS_DIR, listEditions, readJson, validateEdition, buildIndex } from "./lib.mjs";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
if (!API_KEY) throw new Error("ANTHROPIC_API_KEY manquant");

const date = process.env.EDITION_DATE || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const outPath = join(EDITIONS_DIR, `${date}.json`);
const exists = await access(outPath).then(() => true, () => false);
if (exists && process.env.FORCE !== "1") {
  console.log(`Édition ${date} déjà présente, rien à faire (FORCE=1 pour écraser).`);
  process.exit(0);
}

// Angle éditorial différent selon le jour de la semaine, pour varier les éditions.
const ANGLES = [
  "Dimanche : prendre du recul — tendances de fond, retours d'expérience, lectures longues.",
  "Lundi : sorties et releases de la semaine (frameworks, outils, OS, firmwares).",
  "Mardi : sécurité et fiabilité (CVE notables, incidents, post-mortems).",
  "Mercredi : tutoriels et bonnes pratiques, outils open source à découvrir.",
  "Jeudi : cloud, Kubernetes, CI/CD, observabilité, plateformes d'ingénierie.",
  "Vendredi : électronique et matériel (microcontrôleurs, SBC, semi-conducteurs, makers) et IA embarquée.",
  "Samedi : projets de la communauté, hacks, retrocomputing, idées à tester le week-end.",
];
const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

const categories = (await readJson(join(ROOT, "data", "categories.json"))).categories;
const schema = await readFile(join(ROOT, "schema", "edition.schema.json"), "utf8");
const recent = (await listEditions()).slice(0, 7).flatMap((e) => e.posts.map((p) => `- ${p.title}`)).join("\n") || "(aucun)";

const system = `Tu es le rédacteur en chef d'un blog quotidien francophone de veille technologique. Tu produis UNE édition au format JSON strict, conforme au schéma fourni.
Règles :
- Utilise l'outil de recherche web pour ne traiter que des actualités RÉELLES et récentes (idéalement des dernières 48h, sinon de la semaine). N'invente jamais un fait, un chiffre, une URL ou une citation.
- Chaque article cite 1 à 3 sources avec leur URL exacte issue de tes recherches.
- Rédige en français, de façon claire et synthétique, avec ta propre formulation (pas de copier-coller de sources, citations de moins de 15 mots).
- 3 à 4 articles par catégorie, 1 à 3 minutes de lecture chacun. Mets importance 5 aux 1 ou 2 sujets majeurs.
- Utilise des blocs variés : paragraph, heading, list, code (si utile), callout, table, quote, keyvalue.
- Évite les sujets déjà traités récemment (liste fournie) sauf nouveau développement important.
- Réponds uniquement avec l'objet JSON, sans texte autour ni balises markdown.`;

const user = `Date de l'édition : ${date}
Angle du jour : ${ANGLES[weekday]}
Catégories (champ "category" = id) : ${JSON.stringify(categories.map(({ id, label }) => ({ id, label })))}
Articles récents à ne pas répéter :
${recent}

Schéma JSON de l'édition :
${schema}

Mets schemaVersion à "1.0", date à "${date}". Ajoute "highlights" (3 à 5 points) et un "summary" de l'édition.`;

async function call(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Les outils serveur peuvent renvoyer pause_turn : on relance pour poursuivre.
const messages = [{ role: "user", content: user }];
let reply = await call(messages);
for (let i = 0; reply.stop_reason === "pause_turn" && i < 8; i++) {
  messages.push({ role: "assistant", content: reply.content });
  reply = await call(messages);
}
if (reply.stop_reason === "max_tokens") throw new Error("Réponse tronquée (max_tokens)");

const text = reply.content.filter((b) => b.type === "text").map((b) => b.text).join("");
const start = text.indexOf("{");
const end = text.lastIndexOf("}");
if (start < 0 || end < start) throw new Error("Aucun JSON dans la réponse :\n" + text.slice(0, 500));
const edition = JSON.parse(text.slice(start, end + 1));

// Normalisation
edition.schemaVersion = "1.0";
edition.date = date;
edition.generatedAt = new Date().toISOString();
edition.meta = { ...(edition.meta || {}), model: MODEL, angle: ANGLES[weekday] };
const seen = new Set();
const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "article";
for (const p of edition.posts || []) {
  let id = slug(p.id || p.title);
  while (seen.has(id)) id += "-2";
  seen.add(id);
  p.id = id;
  p.sources = (p.sources || []).filter((s) => /^https?:\/\//i.test(s.url || ""));
}

const errors = validateEdition(edition);
if (errors.length) throw new Error("Édition invalide :\n- " + errors.join("\n- "));

await writeFile(outPath, JSON.stringify(edition, null, 2) + "\n");
const idx = await buildIndex();
console.log(`✓ ${outPath} (${edition.posts.length} articles) — ${idx.editions.length} éditions au total`);
