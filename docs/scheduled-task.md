# Tâche planifiée Claude : édition quotidienne

Tâche `tech-daily-edition`, cron `0 6 * * *` (heure locale). Chaque exécution crée `data/editions/AAAA-MM-JJ-HHmm.json` : plusieurs éditions par jour possibles, tous les articles sont affichés, horodatés (`publishedAt`). Le prompt exécuté est stocké dans `~/.claude/scheduled-tasks/tech-daily-edition/SKILL.md`.

