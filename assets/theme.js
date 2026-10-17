// Appliqué avant le rendu pour éviter un flash de thème (chargé en synchrone, sans script inline : compatible CSP).
try { var t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) {}
