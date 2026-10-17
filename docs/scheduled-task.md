# Tâche planifiée Claude : édition quotidienne

- **Identifiant** : `tech-daily-edition`
- **Planification** : toutes les 4 heures à 2h, 6h, 10h, 14h, 18h et 22h (heure locale, cron `0 2-22/4 * * *`)
- **Prompt** : stocké dans `~/.claude/scheduled-tasks/tech-daily-edition/SKILL.md` (il n'est pas dans ce dépôt)
- **Prérequis** : application Claude ouverte, `git` et `gh` authentifiés, copie locale du dépôt

## Ce que fait chaque exécution

1. Met à jour la copie locale du dépôt (`git pull --no-rebase`).
2. Lit le schéma, les rubriques et les articles des 3 derniers jours pour éviter les doublons.
3. Recherche l'actualité réelle et récente pour chaque rubrique (tech, IA, cybersécurité, science, géographie, écologie, énergie, bâtiment, mobilité, droit, politique, finance, crypto, bourse), uniquement ce qui est nouveau depuis la dernière édition.
4. Crée `data/editions/AAAA-MM-JJ-HHmm.json` (heure de Paris, jamais de remplacement d'une édition existante).
5. Pour chaque article, rédige en français : contexte et faits sourcés, exemples d'utilisation, chronologie, avis et vision, icône, illustration SVG, image de couverture de la source (`og:image` vérifiée), et 1 à 3 schémas par édition.
6. Vérifie le JSON, commit le seul nouveau fichier, `git pull --no-rebase` puis `git push origin main`. Le déploiement Pages démarre tout seul.

## Règles éditoriales

- Aucune information, chiffre, URL ou citation inventés ; faits sourcés distingués de l'analyse.
- Reformulation personnelle, citations de moins de 15 mots.
- `publishedAt` jamais postérieur à `generatedAt` ni futur : l'heure réelle est relevée avec la commande `date`.
- Aucun secret écrit dans le dépôt.
- Législation, réglementation, fiscalité et aides : toujours celles de la France, avec sources officielles françaises et date d'entrée en vigueur ; pas de conseil juridique personnalisé.
- Politique : neutre et équilibré, sources croisées. Finance, crypto, bourse : informatif uniquement, jamais de conseil d'investissement ni de prévision présentée comme certaine.
