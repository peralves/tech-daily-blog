# Tech Daily

Blog d'actualité en français : **tech** (web, informatique, IA, cybersécurité, DevOps, électronique), **science et espace, géographie, écologie, énergie, bâtiment, mobilité et automobile, droit et numérique, politique, finance, crypto et bourse**. Toute législation ou aide publique évoquée concerne la France. Toutes les 4 heures, une **tâche planifiée Claude** recherche l'actualité et publie une édition au format JSON ; le site statique la lit et l'affiche. Hébergé sur GitHub Pages, sans build ni dépendance côté front.

**Site** : https://peralves.github.io/tech-daily-blog/

## Fonctionnalités

- **Fil horodaté** : tous les articles de toutes les éditions, du plus récent au plus ancien, groupés par jour, avec l'heure de publication. Un article « à la une » en tête.
- **Articles détaillés** : contexte, exemples d'utilisation, chronologie, avis et vision de la rédaction, sources cliquables.
- **Illustrations** : image de couverture de la source quand elle existe, illustration SVG générée par article, schémas explicatifs, icônes.
- **Archives** : liste par jour et par mois, recherche plein texte, navigation jour précédent/suivant (`#/archive`).
- **Favoris, lu/non lu, partage** : marque-page, état « lu » (filtre « Non lus ») et copie du lien, stockés dans le `localStorage` du navigateur (rien n'est envoyé nulle part).
- **Préférences** : page « Préférences » pour masquer des rubriques (ex. la politique) ou des mots-clés ; appliqué au fil, aux archives et à la recherche, stocké dans le navigateur. Les rubriques sensibles (finance, crypto, bourse) affichent un avertissement « pas un conseil en investissement ».
- **Design** : thème clair/sombre (suit le système, bouton pour forcer), responsive mobile et ordinateur, accents de couleur par rubrique.

## Fonctionnement

```
Tâche planifiée Claude (app Claude desktop, toutes les 4 h : 2h, 6h, 10h, 14h, 18h, 22h)
  └─ recherche web, rédaction, illustrations SVG
  └─ écrit data/editions/AAAA-MM-JJ-HHmm.json  (l'artefact)
  └─ git commit + push sur main
GitHub Actions (.github/workflows/pages.yml, à chaque push)
  └─ node scripts/build-index.mjs : valide les éditions, régénère data/index.json
  └─ versionne les fichiers statiques (anti-cache) et déploie GitHub Pages
Front (index.html + assets/) : charge data/index.json, puis une édition à l'ouverture d'un article
```

Plusieurs éditions par jour sont possibles : chaque fichier est indépendant et tous les articles sont affichés.

## Arborescence

| Chemin | Rôle |
| --- | --- |
| `index.html`, `assets/` | Front statique (`app.js` : routeur et pages, `blocks.js` : rendu des blocs et illustrations, `style.css`, `theme.js`) |
| `data/editions/` | Une édition JSON par génération |
| `data/index.json` | Index de toutes les éditions (généré au déploiement) |
| `data/categories.json` | Rubriques : id, libellé, icône, teinte, avertissement éventuel |
| `schema/edition.schema.json` | Schéma JSON de l'artefact |
| `scripts/` | `build-index.mjs` (validation et index), `lib.mjs` |
| `.github/workflows/pages.yml` | Déploiement GitHub Pages |
| `docs/scheduled-task.md` | Description de la tâche planifiée |

## Format de l'artefact

Voir [`schema/edition.schema.json`](schema/edition.schema.json). Une édition (`schemaVersion`, `date`, `generatedAt`, `title`, `summary`, `highlights`, `posts`) contient des articles ; chaque article a notamment `id`, `category`, `title`, `summary`, `tags`, `importance`, `readingMinutes`, `publishedAt`, `icon`, `illustration` (SVG), `cover` (image de la source), `sources` et des `blocks` typés.

Blocs disponibles : `paragraph`, `heading`, `list`, `quote`, `code`, `callout`, `image`, `link`, `table`, `keyvalue`, `diagram` (SVG), `opinion`, `usecases`, `timeline`.

Le schéma est **évolutif** :

- le front ignore les champs inconnus ; un bloc de type inconnu s'affiche via son champ `text`, sinon il est ignoré ;
- nouvelle rubrique → une ligne dans `data/categories.json` ;
- nouveau type de bloc → une entrée dans `renderers` de `assets/blocks.js` ;
- `schemaVersion` permet de gérer de futures ruptures ;
- un `publishedAt` postérieur à `generatedAt` (ou futur) est plafonné à l'affichage.

## Sécurité et confidentialité

- **Aucun secret dans le dépôt** : la tâche s'appuie sur la session Claude et sur l'authentification `git`/`gh` de la machine qui l'exécute. Le workflow n'utilise aucun secret et n'a que des droits de lecture, plus le déploiement Pages.
- **Contenu non interprété** : les textes sont insérés via `textContent` ; les SVG sont affichés dans des balises `<img>` (aucun script ne s'exécute) et refusés s'ils contiennent `<script>` ou `foreignObject` ; les URL sont limitées à `http(s)`.
- **Politique CSP** (meta) : scripts uniquement depuis le site, pas de script inline ; segments d'URL validés avant tout chargement de fichier.
- **Vie privée** : pas de cookie ni de suivi. Les favoris et le suivi des lectures restent dans le navigateur. Les couvertures (sites sources) et les polices (Google Fonts) sont chargées depuis des serveurs tiers, sans référent.
- Les commits utilisent l'adresse `noreply` GitHub.

## Mise en route

1. **Settings → Pages → Source : GitHub Actions**.
2. Créer la tâche planifiée dans l'app Claude (voir [`docs/scheduled-task.md`](docs/scheduled-task.md)). La machine doit avoir `git` et `gh` authentifiés (`gh auth login`) et l'application doit être ouverte aux heures prévues ; sinon la tâche s'exécute au prochain lancement.
3. Option : activer « Keep my email private » sur GitHub pour que les commits de la tâche n'exposent pas d'adresse personnelle.

## Développement local

```bash
npx serve .                    # le site est statique, fetch exige un serveur HTTP
node scripts/build-index.mjs   # valide les éditions et régénère data/index.json
```

Les fichiers statiques contiennent un marqueur `__V__` remplacé au déploiement par le SHA du commit, pour éviter les caches périmés.
