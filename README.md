# Tech Daily

Blog statique d'actualité **web, informatique, DevOps et électronique**, alimenté chaque jour à **6h (Paris)** par une édition JSON générée automatiquement. Hébergé sur GitHub Pages, sans build ni dépendance.

## Fonctionnement

```
GitHub Actions (cron 6h Paris)
  └─ scripts/generate.mjs  → API Claude + recherche web
       └─ data/editions/AAAA-MM-JJ.json   (l'artefact du jour)
       └─ data/index.json                 (index de toutes les éditions)
  └─ commit + déploiement GitHub Pages
Front (index.html + assets/) : lit les JSON et les affiche
```

- **Archives** : page `#/archive` (liste par mois + recherche), navigation jour précédent/suivant.
- **Thème** clair/sombre (suit le système, bouton pour forcer), responsive mobile/desktop.

## Format de l'artefact

Voir [`schema/edition.schema.json`](schema/edition.schema.json). Une édition contient des `posts`, chacun composé de `blocks` typés (`paragraph`, `heading`, `list`, `quote`, `code`, `callout`, `image`, `link`, `table`, `keyvalue`).

Le schéma est **évolutif** :
- le front ignore les champs inconnus ; un bloc de type inconnu s'affiche via son champ `text`, sinon est ignoré ;
- nouvelle catégorie → une ligne dans [`data/categories.json`](data/categories.json) ;
- nouveau type de bloc → une entrée dans `renderers` de [`assets/blocks.js`](assets/blocks.js) ;
- `schemaVersion` permet de gérer de futures ruptures.

## Mise en route

1. **Settings → Pages → Source : GitHub Actions**.
2. **Settings → Secrets and variables → Actions** : ajouter le secret `ANTHROPIC_API_KEY` (et, optionnellement, la variable `ANTHROPIC_MODEL`).
3. Lancer une première fois **Actions → Generate daily edition → Run workflow** pour tester.

Le cron GitHub est en UTC : le workflow tourne à 4h et 5h UTC et ne génère que lorsqu'il est 6h à Paris (heure d'été/hiver gérée). Les exécutions programmées peuvent avoir quelques minutes de retard.

## Développement local

Le site est 100 % statique, mais `fetch` nécessite un serveur HTTP :

```bash
npx serve .          # ou : python -m http.server
node scripts/build-index.mjs   # valide les éditions et régénère data/index.json
ANTHROPIC_API_KEY=... node scripts/generate.mjs   # génère l'édition du jour (Node 20+)
```
