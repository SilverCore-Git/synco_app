// Bascule sur import.meta.env.DEV (le flag natif de Vite, toujours correct
// dans un build de prod) plutôt que sur une variable d'environnement
// custom comme VITE_DEV — ce genre de flag manuel s'est déjà révélé
// mal configuré en pratique (ex: VITE_DEV=false laissé dans un .env de dev
// local), et une simple faute de frappe dans un .env de prod suffirait à
// laisser tout ce tracing de développement fuiter dans la console des
// utilisateurs finaux.
const isDev = import.meta.env.DEV;

// Pour le traçage/diagnostic de routine (pas de vraies erreurs ni de vrais
// avertissements opérationnels, qui doivent eux rester visibles en prod —
// cf. console.error/console.warn, laissés tels quels dans tout le code).
export const debugLog = (...args: unknown[]): void => {
    if (isDev) console.log(...args);
};

export const debugWarn = (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
};
