// Valide toutes les éditions puis régénère data/index.json
import { listEditions, validateEdition, buildIndex } from "./lib.mjs";

let bad = 0;
for (const e of await listEditions()) {
  const errs = validateEdition(e);
  if (errs.length) {
    bad++;
    console.error(`✗ ${e.date}\n  - ${errs.join("\n  - ")}`);
  }
}
if (bad) process.exit(1);
const idx = await buildIndex();
console.log(`index.json : ${idx.editions.length} édition(s)`);
