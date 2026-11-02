# NF3 — Aperçus de liens automatiques : chaque URL d'un message chiffré (DM compris) est transmise au serveur

|  |  |
|---|---|
| **Sévérité** | 🟡 Moyenne |
| **OWASP** | A04:2021 — Insecure Design · A02:2021 — Cryptographic Failures (fuite hors du canal chiffré) |
| **CWE** | CWE-359 — Exposure of Private Personal Information · CWE-201 — Insertion of Sensitive Information Into Sent Data |
| **Fichiers** | [`src/composables/useLinkPreview.ts:11-37`](../../src/composables/useLinkPreview.ts) · [`src/views/OrgSpace/components/common/LinkPreview.vue:3-4`, `:35-60`](../../src/views/OrgSpace/components/common/LinkPreview.vue) · [`ChatMessage.vue:202`](../../src/views/OrgSpace/components/common/ChatMessage.vue) · [`ThreadMessage.vue:231`](../../src/views/OrgSpace/components/common/ThreadMessage.vue) · API : `synco_api/src/routes/linkPreview.ts` |
| **CVSS 3.1 (estimé)** | 5.7 — `AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:N/A:N` (attaquant = serveur ou personne qui lit ses journaux) |
| **Statut** | ⚠️ confirmé par revue de code — fonctionnalité ajoutée après le 01/10 |

---

## Description et localisation

Le composant `LinkPreview` est rendu pour **chaque message affiché**, en salon (`ThreadMessage.vue:231`) comme en DM (`ChatMessage.vue:202`). Il extrait la première URL du texte **déchiffré** et appelle immédiatement l'API :

```ts
// useLinkPreview.ts:25
async function fetchPreview(url: string) {
    const res = await sfetch(`/api/link-preview?url=${encodeURIComponent(url)}`);   // jeton Keycloak joint
    ...
}
// LinkPreview.vue:35
const url = computed(() => extractFirstUrl(props.content));
watch(url, (u) => { if (u) load(u); }, { immediate: true });
```

Il n'y a ni consentement, ni réglage pour désactiver la fonction, ni distinction entre salon et DM, ni exclusion des URL qui portent elles-mêmes des secrets (liens d'invitation, liens de partage avec jeton, URL signées S3/GCS, liens de réinitialisation, `https://…/#clé`). Seul le fragment `#` n'est pas transmis au serveur distant par la bibliothèque HTTP ; il est en revanche bien envoyé à synco_api dans le paramètre `url`.

Le commentaire de `linkPreview.ts` (« *synco_api … ne reçoit et ne journalise que ce lien, jamais le message* ») présente ce point comme protecteur. Mais pour une messagerie E2EE, **le lien est souvent le contenu sensible** du message.

Il y a aussi un effet « accusé de lecture ». Comme l'appel est déclenché à l'affichage, le **premier** destinataire qui ouvre la conversation provoque un `GET` depuis le serveur Synco vers l'URL. Un expéditeur qui insère une URL unique vers son serveur apprend donc quand le message a été lu. Le cache partagé côté serveur (1 h) et côté client (session) limite cet effet au premier lecteur.

Enfin, la carte d'aperçu pointe vers `og:url`, une valeur choisie par la page distante, et non vers l'URL réellement écrite dans le message (`LinkPreview.vue:3-4`). La page `https://docs.exemple.fr/x` peut annoncer `og:url = https://phish.tld/login` avec un titre et une image crédibles : le clic sur la carte mène ailleurs que le lien affiché.

## Impact

- **Rupture de la confidentialité E2EE** pour toutes les URL échangées : le serveur reconstitue, par utilisateur (le jeton identifie l'appelant), les liens que chacun reçoit en DM ou en salon, avec horodatage. Pour un produit qui promet que le serveur ne voit pas le contenu, c'est une fuite majeure de métadonnées, et souvent de contenu (URL porteuses de secrets).
- **Accusé de lecture / pistage** contrôlé par l'expéditeur.
- **Hameçonnage** par décalage entre le lien affiché et la destination de la carte.

## Preuve de concept / scénario d'exploitation

```text
1. Alice envoie en DM à Bob : « voici le lien de partage : https://drive.exemple.fr/s/AbC123?token=SECRET »
2. Bob ouvre la conversation → son client appelle
   GET /api/link-preview?url=https%3A%2F%2Fdrive.exemple.fr%2Fs%2FAbC123%3Ftoken%3DSECRET
   (Authorization: Bearer <jeton de Bob>)
3. synco_api (ou un journal d'accès / reverse proxy qui conserve la query string) connaît le secret,
   et le serveur Synco télécharge lui-même la page de partage.
```

## Recommandation de remédiation

1. **Désactiver par défaut**, au minimum en DM et dans les salons privés. Proposer un réglage utilisateur explicite, et un réglage d'organisation pour l'interdire.
2. Si la fonction est conservée : générer l'aperçu **côté expéditeur**, au moment de l'envoi et sur action explicite (« ajouter un aperçu »), puis **chiffrer l'aperçu avec le message**. C'est le modèle de Signal : le destinataire ne fait aucune requête.
3. Ne jamais transmettre de query string ni de fragment : `new URL(u); u.search = ''; u.hash = ''` avant l'appel. Ignorer les URL contenant des marqueurs de secret (`token`, `sig`, `X-Amz-`, `code`, `key`…).
4. Faire pointer la carte vers l'URL **écrite dans le message**, jamais vers `og:url` ; afficher le domaine réel sous le titre.
5. Côté API, passer le paramètre en `POST` (corps JSON) pour qu'il n'apparaisse dans aucun journal d'accès intermédiaire.
