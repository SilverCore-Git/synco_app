// Registre central des caches de clés en mémoire (audit FC10).
//
// Avant ce fichier, seul threadKeyCache.ts réagissait au verrouillage E2EE
// (watch(E2EEUnloked, ...)) : workspaceKeyCache, dmKeyCache et le cache de
// clés de session IA survivaient à un "Verrouiller" manuel
// (UserSettings.vue), restant utilisables tant que la page restait ouverte.
// Chaque module qui garde une clé déchiffrée en mémoire s'enregistre ici une
// fois ; crypto.ts#lockSecurity() vide tout le monde d'un coup, sans que
// crypto.ts ait besoin de connaître ces modules (qui, eux, importent déjà
// crypto.ts — un import dans l'autre sens créerait un cycle).
type Clearer = () => void;

const clearers = new Set<Clearer>();

export const registerKeyCache = (c: Clearer): void => {
    clearers.add(c);
};

export const clearAllKeyCaches = (): void => {
    clearers.forEach((c) => c());
};
