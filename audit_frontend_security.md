# 🛡️ Audit de Sécurité — Frontend `synco_app`

> **Date** : 16 Juillet 2026
> **Scope** : Tout le code source dans `synco_app/src/`
> **Auditeur** : Antigravity AI Security Audit

---

## Résumé Exécutif

Le frontend Synco est construit avec Vue 3 + TypeScript et implémente un système E2EE sophistiqué. Les bonnes pratiques incluent l'utilisation de DOMPurify pour le rendu Markdown, PKCE pour Keycloak, et un wrapper `sfetch` centralisé. Cependant, l'audit révèle **3 vulnérabilités hautes** et **10 vulnérabilités moyennes/basses** liées principalement au stockage de secrets dans le navigateur, à la gestion des clés cryptographiques, et à l'exposition d'informations de débogage.

| Sévérité | Nombre |
|----------|--------|
| 🔴 CRITIQUE | 1 |
| 🟠 HAUTE | 3 |
| 🟡 MOYENNE | 6 |
| 🔵 BASSE | 4 |

---

## 🔴 Vulnérabilité CRITIQUE

### CRIT-01 · Clé privée E2EE stockée en mémoire sans protection

**Fichier** : [crypto.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/utils/crypto.ts#L3-L6)

```typescript
export const privateKey = ref<CryptoKey | null>(null);
export const E2EEUnloked = computed(() => {
    return privateKey.value !== null && typeof privateKey.value === 'object';
});
```

> [!CAUTION]
> La clé privée RSA de l'utilisateur est stockée dans un `ref()` Vue exporté globalement. Elle est accessible depuis n'importe quel composant via un simple import, et surtout **depuis la console navigateur** via les Vue DevTools ou l'inspection mémoire JavaScript.

**Vecteurs d'exploitation** :
1. **Extension malveillante du navigateur** : Peut accéder à la mémoire JavaScript et extraire la clé
2. **XSS** : Si une faille XSS est trouvée (même si DOMPurify est utilisé), l'attaquant peut exfiltrer la clé privée
3. **Vue DevTools** : En mode dev, les devtools permettent d'inspecter tous les `ref()` dans le store

**Impact** : Compromission totale du E2EE de l'utilisateur — déchiffrement de tous les messages passés et futurs.

**Remédiation** :
1. Utiliser `CryptoKey` avec `extractable: false` quand possible (déjà fait pour `decryptUserPrivateKey` mais pas pour `setupFirstTimeSecurity`)
2. Encapsuler la clé dans un closure non-exportable au lieu d'un `ref()` global
3. Implémenter un auto-lock après inactivité (verrouillage automatique du E2EE)

```typescript
// ⚠️ Dans setupFirstTimeSecurity (L276-307), la clé est extractable:
const keyPair = await crypto.subtle.generateKey({
    name: "RSA-OAEP", modulusLength: 4096, ...
}, true, // ← extractable = true !
["encrypt", "decrypt"]);
```

La clé privée générée est `extractable: true` car elle doit être exportée en PKCS8 pour le chiffrement avec le PIN. Cependant, une fois exportée et chiffrée, la version en mémoire **n'a plus besoin d'être extractable**. Il faudrait ré-importer la clé avec `extractable: false` après l'export.

---

## 🟠 Vulnérabilités HAUTES

### HIGH-01 · userId stocké en localStorage (trust boundary compromise)

**Fichier** : [keycloak.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/keycloak.ts#L67)

```typescript
window.localStorage.setItem('userId', userInfo.sub);
```

**Utilisé dans** :
- [MembersSettings.vue](file:///home/moi/Documents/GitHub/synco_app/src/views/OrgSpace/views/settings/views/MembersSettings.vue) (L341) — Pour vérifier si l'utilisateur est admin
- [isAdmin.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/isAdmin.ts) (L5)
- [CreateNewSpace.vue](file:///home/moi/Documents/GitHub/synco_app/src/views/OrgSpace/components/popup/CreateNewSpace.vue) (L21)

> [!WARNING]
> Le `userId` dans `localStorage` peut être modifié par l'utilisateur via la console navigateur. Si des décisions d'autorisation côté frontend sont basées sur cette valeur, elles peuvent être contournées.

Le fichier `isAdmin.ts` utilise `localStorage.getItem('userId')` comme **fallback** si `user.value?.id` n'est pas disponible :

```typescript
const currentUserId = user.value?.id || localStorage.getItem('userId');
```

**Impact** : Un attaquant pourrait se faire passer pour un admin dans l'interface en modifiant le `userId` en localStorage, lui permettant de voir des fonctionnalités (boutons de suppression, paramètres) qui ne lui sont pas destinées. Les actions réelles échoueraient côté backend (grâce au JWT), mais cela expose la surface d'attaque et le fonctionnement interne.

**Remédiation** :
1. Ne jamais utiliser `localStorage.getItem('userId')` pour des vérifications d'autorisation
2. Toujours utiliser l'état Keycloak authentifié (`keycloak.subject` ou `user.value?.id`)
3. Si le stockage est nécessaire pour la persistance, utiliser `sessionStorage` au lieu de `localStorage`

---

### HIGH-02 · Token JWT dans la réponse WebSocket diagnostics

**Fichier** : [useWSocket.ts](file:///home/moi/Documents/GitHub/synco_app/src/composables/useWSocket.ts#L90-L102)

```typescript
console.warn('[WS] Connecting to:', socketUrl, 'with path:', socketPath);

// Diagnostic: test if the proxy/backend is reachable
try {
    const testUrl = (socketUrl || '') + socketPath + '/?EIO=4&transport=polling';
    console.warn('[WS] Proxy test:', testUrl);
    const res = await fetch(testUrl);
    const text = await res.text();
    console.warn('[WS] Proxy test result:', res.status, text.substring(0, 120));
} catch (proxyErr: any) { ... }

console.warn('[WS] Keycloak state:', {
    authenticated: keycloak.authenticated,
    tokenLength: keycloak.token?.length, // ← Fuit la taille du token
    subject: keycloak.subject             // ← Fuit l'identité
});
```

> [!WARNING]
> Le code de diagnostic WebSocket effectue un `fetch()` de test vers le backend **en clair** (sans token d'auth), ce qui pourrait exposer des informations sur l'infrastructure. De plus, il log les détails d'authentification Keycloak dans la console, visibles par n'importe quelle extension navigateur.

**Remédiation** : Supprimer tous les `console.warn` de diagnostic en production. Utiliser un flag `isDev` pour conditionner ces logs.

---

### HIGH-03 · Fallback transport polling uniquement (pas de WebSocket natif)

**Fichier** : [useWSocket.ts](file:///home/moi/Documents/GitHub/synco_app/src/composables/useWSocket.ts#L114)

```typescript
transports: ['polling'], // Force polling only to bypass Vite proxy WebSocket drop issues
```

> [!IMPORTANT]
> Le transport est forcé en `polling` uniquement, ce qui désactive les WebSocket natifs. Le polling HTTP est :
> - **Plus vulnérable** aux attaques de type session fixation/hijacking car chaque requête polling est une requête HTTP séparée
> - **Plus lent** et plus gourmand en ressources
> - **Moins sécurisé** car il augmente la surface d'attaque (chaque poll est une requête distincte pouvant être interceptée)

Ce commentaire indique que c'est un workaround pour un problème de proxy Vite en dev, mais ce code semble aussi être actif en production.

**Remédiation** : Utiliser `['websocket', 'polling']` en production pour bénéficier de la connexion WebSocket persistante.

---

## 🟡 Vulnérabilités MOYENNES

### MED-01 · v-html avec contenu SVG statique (risque faible mais non-conforme)

**Fichier** : [NotificationItem.vue](file:///home/moi/Documents/GitHub/synco_app/src/components/Notifications/NotificationItem.vue#L158)

```html
<div class="notification-icon" 
     v-html="getNotificationIcon(props.notification.type)"
```

Le contenu est un SVG généré par un switch/case sur un enum, donc le risque réel est faible. Cependant, le `type` vient du serveur. Si un attaquant peut injecter un type arbitraire, la branche `default` retourne un SVG statique sûr, mais l'utilisation de `v-html` reste non-conforme aux règles du projet.

**Remédiation** : Utiliser un composant Vue avec un `<template>` pour chaque icône au lieu de `v-html`.

---

### MED-02 · MarkdownRender.vue — DOMPurify bien utilisé mais `href` autorisé

**Fichier** : [MarkdownRender.vue](file:///home/moi/Documents/GitHub/synco_app/src/views/OrgSpace/views/MarkdownRender.vue#L20-L34)

```typescript
return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 
                   'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: ['href', 'target', 'class']
});
```

> [!NOTE]
> DOMPurify est correctement utilisé avec une allowlist stricte. C'est une bonne pratique. Cependant, `href` est autorisé sur les `<a>`, ce qui permet des liens `javascript:` potentiels.

**Remédiation** : Ajouter `ALLOWED_URI_REGEXP` pour n'autoriser que `https?://` :
```typescript
ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
```

---

### MED-03 · Pas de vérification de l'audience JWT côté frontend

**Fichier** : [keycloak.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/keycloak.ts#L4-L8)

```typescript
const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});
```

Le `clientId` n'a pas de vérification d'audience configurée. Si un autre service dans le même realm Keycloak émet des tokens, ils pourraient être acceptés par Synco.

---

### MED-04 · Token Keycloak dans un ref() global accessible

**Fichier** : [var.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/var.ts#L8)

```typescript
const kcToken = ref<string>('');
export { kcToken };
```

Le token JWT est stocké dans un `ref()` exporté et accessible à toute l'application. Les mêmes risques que CRIT-01 s'appliquent — extensions navigateur, XSS, DevTools.

---

### MED-05 · Pas de validation de la taille du message avant envoi

Dans les vues de chat (ChatView, ThreadView), le contenu du message est envoyé au WebSocket sans vérification de taille côté client. Bien que le backend ait une validation Zod qui limite à 10000 caractères pour les DM, les messages de thread n'ont aucune limite.

**Impact** : Un utilisateur peut envoyer des messages extrêmement longs, causant des problèmes de rendu et de performance pour tous les participants.

---

### MED-06 · Absence de Content Security Policy (CSP)

Le frontend ne définit pas de meta tag CSP ni de header CSP. Cela permet :
- Le chargement de scripts externes non autorisés
- L'exécution de `eval()` si une faille XSS est exploitée
- Le chargement de ressources depuis des origines non contrôlées

**Remédiation** : Ajouter un CSP strict dans `index.html` ou via la configuration du serveur de déploiement :
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; 
               connect-src 'self' https://api-synco.silvercore.fr wss://api-synco.silvercore.fr 
               https://auth.silvercore.fr;">
```

---

## 🔵 Vulnérabilités BASSES

### LOW-01 · Console logs de débogage excessifs

**Fichiers** : `useWSocket.ts`, `keycloak.ts`, `usePeer.ts`, `useLiveKit.ts`

De nombreux `console.log`, `console.warn` et `console.error` sont présents et actifs en production. Ils exposent :
- Les URLs d'infrastructure
- L'état d'authentification
- Les IDs utilisateur
- Les détails de connexion WebSocket

**Remédiation** : Utiliser un logger conditionnel (`if (import.meta.env.DEV)`) ou un plugin Vite pour supprimer les logs en production.

---

### LOW-02 · Pas de gestion du token expiré (silent re-auth)

**Fichier** : [keycloak.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/keycloak.ts#L18-L29)

```typescript
tokenRefreshInterval = setInterval(async () => {
    try {
        const refreshed = await keycloak.updateToken(30);
        // ...
    } catch (error) {
        console.error('[Keycloak] Erreur lors du rafraîchissement du token:', error);
        // ❌ Aucune action — l'utilisateur reste connecté avec un token expiré
    }
}, 30000);
```

Si le refresh token est expiré, l'utilisateur reste dans l'application avec un token invalide. Toutes les requêtes API échoueront en 401 silencieusement.

**Remédiation** : Rediriger vers la page de login Keycloak en cas d'erreur de refresh :
```typescript
catch (error) {
    console.error('Token refresh failed, redirecting to login');
    keycloak.login();
}
```

---

### LOW-03 · sfetch ne gère pas les erreurs HTTP

**Fichier** : [sfetch.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/utils/sfetch.ts)

Le wrapper `sfetch` ne vérifie pas le statut de la réponse. Si le serveur répond avec un 401/403/500, le code appelant doit manuellement vérifier `response.ok`. Cela augmente le risque d'oublier une vérification et de traiter silencieusement des réponses d'erreur comme des succès.

---

### LOW-04 · Pas de validation d'URL sur `VITE_API_URL`

**Fichier** : [sfetch.ts](file:///home/moi/Documents/GitHub/synco_app/src/assets/utils/sfetch.ts#L30)

```typescript
return await fetch(`${import.meta.env.VITE_API_URL}${url}`, { ... });
```

Si `VITE_API_URL` est compromis (via un `.env` modifié ou une variable d'environnement injectée au build), toutes les requêtes API seraient redirigées vers un serveur malveillant.

---

## 🔐 Points Positifs

| Aspect | Détails |
|--------|---------|
| ✅ E2EE bien conçu | RSA-OAEP 4096 bits + AES-GCM 256 bits, bon schéma hybride |
| ✅ DOMPurify | Utilisé correctement avec une allowlist stricte pour le Markdown |
| ✅ PKCE S256 | Keycloak utilise PKCE pour le flux d'authentification |
| ✅ PBKDF2 100k itérations | Dérivation de clé PIN avec un nombre d'itérations raisonnable |
| ✅ IV aléatoire | Chaque opération de chiffrement utilise un IV frais de 12 octets |
| ✅ Wrapper sfetch centralisé | Toutes les requêtes API passent par un point unique avec token auto-refresh |
| ✅ Pas de v-html dangereux | Sauf cas contrôlés (SVG statiques, DOMPurify) |

---

## 📋 Tableau Récapitulatif des Correctifs Prioritaires

| Priorité | ID | Description | Effort |
|----------|----|-------------|--------|
| 🔴 P0 | CRIT-01 | Protéger la clé privée E2EE en mémoire | 4h |
| 🟠 P1 | HIGH-01 | Supprimer la dépendance à localStorage pour l'auth | 1h |
| 🟠 P1 | HIGH-02 | Supprimer les logs de diagnostic en production | 30min |
| 🟠 P1 | HIGH-03 | Activer le transport WebSocket natif en prod | 15min |
| 🟡 P2 | MED-01 | Remplacer v-html par des composants | 30min |
| 🟡 P2 | MED-02 | Restreindre les URI autorisées dans DOMPurify | 10min |
| 🟡 P2 | MED-06 | Implémenter un CSP | 1h |
| 🟡 P2 | LOW-02 | Gérer le token expiré (redirect login) | 30min |
| 🟡 P2 | LOW-01 | Conditionner les logs au mode dev | 30min |
