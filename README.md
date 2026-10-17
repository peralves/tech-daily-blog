# Tech Daily

Blog statique d'actualité **web, informatique, DevOps et électronique**, alimenté chaque jour à **6h** par une édition JSON créée par une **tâche planifiée Claude**. Hébergé sur GitHub Pages, sans build ni dépendance côté front.

## Fonctionnement

```
Tâche planifiée Claude (app Claude desktop, 6h)
  └─ recherche web → écrit data/editions/AAAA-MM-JJ.json (l'artefact du jour)
  └─ git commit + push sur main
GitHub Actions (pages.yml, au push)
  └─ valide les éditions, régénère data/index.json, déploie GitHub Pages
Front (index.html + assets/) : lit les JSON et les affiche
```

**Aucun secret dans le dépôt** : la tâche utilise la session Claude et l'authentification git/`gh` de la machine qui l'exécute. Le dépôt ne contient ni clé API ni token, et le workflow n'en utilise aucun.

- **Archives** : `#/archive` (liste par mois + recherche), navigation jour précédent/suivant.
- **Thème** clair/sombre (suit le système, bouton pour forcer), responsive mobile/desktop.

## Format de l'artefact

Voir [`schema/edition.schema.json`](schema/edition.schema.json). Une édition contient des `posts`, chacun composé de `blocks` typés (`paragraph`, `heading`, `list`, `quote`, `code`, `callout`, `image`, `link`, `table`, `keyvalue`).

Le schéma est **évolutif** :
- le front ignore les champs inconnus ; un bloc de type inconnu s'affiche via son champ `text`, sinon est ignoré ;
- nouvelle catégorie → une ligne dans [`data/categories.json`](data/categories.json) ;
- nouveau type de bloc → une entrée dans `renderers` de [`assets/blocks.js`](assets/blocks.js) ;
- `schemaVersion` permet de gérer de futures ruptures.

## Mise en route

1. **Settings → Pages → Source : GitHub Actions** (déjà fait).
2. Créer la tâche planifiée dans l'app Claude (voir `docs/scheduled-task.md`) : elle doit s'exécuter sur une machine connectée à GitHub (`gh auth login`). La machine/l'app doit être ouverte à 6h ; sinon la tâche tourne au prochain lancement.

## Développement local

```bash
npx serve .                     # le site est statique, fetch exige un serveur HTTP
node scripts/build-index.mjs    # valide les éditions et régénère data/index.json
```
