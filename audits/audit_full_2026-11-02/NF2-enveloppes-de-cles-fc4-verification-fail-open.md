# NF2 — Enveloppes de clés signées (FC4 §2) : vérification « fail-open » et TOFU sans vérification hors bande

|  |  |
|---|---|
| **Sévérité** | 🟠 Élevée |
| **OWASP** | A02:2021 — Cryptographic Failures · A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-347 — Improper Verification of Cryptographic Signature · CWE-636 — Not Failing Securely ('Failing Open') · CWE-322 — Key Exchange without Entity Authentication |
| **Fichiers** | [`src/assets/utils/keyEnvelope.ts:94-116`](../../src/assets/utils/keyEnvelope.ts) · [`src/assets/utils/keyTrust.ts:173-196`](../../src/assets/utils/keyTrust.ts) · [`src/assets/utils/keyEnvelope.test.ts:73-77`](../../src/assets/utils/keyEnvelope.test.ts) · appelants : `workspaceCrypto.ts:108`, `dmCrypto.ts:45`, `fileKeys.ts:57`, `useLiveKit.ts:168`, `AiSessionKeyService.ts` · API : `synco_api/src/routes/dmKeys.ts:73-107` (signature optionnelle) |
| **CVSS 3.1 (estimé)** | 7.4 — `AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:N` |
| **Statut** | ⚠️ confirmé par revue de code — correctif **FC4** du 01/10 incomplet |

---

## Description et localisation

L'enveloppe FC4 §2 devait combler le trou de FC4 : faire confiance à la toute première clé symétrique vue pour un contexte. Le créateur signe `(ctx, version, commitment)` avec sa clé d'identité ECDSA ; le destinataire vérifie avant d'adopter la clé. Le point d'appel unique côté réception laisse cependant passer trois cas sans aucune vérification :

```ts
// keyEnvelope.ts:94
export async function verifyKeyEnvelopeIfPresent(rawKey, ctx, version, data) {
    if (!data.creatorId || !data.commitment || !data.signature) return;     // (1) enveloppe absente → acceptée

    const creatorSignKey = lookupCreatorSignKey(data.creatorId);
    if (!creatorSignKey) {
        console.warn(`… enveloppe non vérifiée.`);
        return;                                                              // (2) créateur hors annuaire local → acceptée
    }
    const trustedSignKey = await requireTrustedSignKey(data.creatorId, creatorSignKey);   // (3) TOFU
    await verifyKeyEnvelope(rawKey, {...}, trustedSignKey);
}

// keyTrust.ts:173
export async function requireTrustedSignKey(userId, publicSignKeyJWK) {
    const pinned = await readPinnedSignKey(userId);
    if (!pinned) { await set(signNs() + userId, jwk); return jwk; }          // première vue : épinglée sans preuve
    ...
}
```

1. **Enveloppe absente.** Côté API, `commitment` et `signature` sont optionnels (`signature ?? null`, par exemple [`dmKeys.ts:101`](../../../synco_api/src/routes/dmKeys.ts)). Il suffit au serveur de ne pas renvoyer ces champs, ou à un client modifié de ne pas les envoyer, pour que le destinataire adopte la clé. Ce comportement est figé par un test unitaire ([`keyEnvelope.test.ts:76-77`](../../src/assets/utils/keyEnvelope.test.ts)) : il s'agit d'une décision de rétrocompatibilité, sans date de fin.
2. **Créateur inconnu de l'annuaire local.** `lookupCreatorSignKey` ne cherche que dans `openedOrg.value.members`. Un `creatorId` hors de l'org ouverte (DM avec un membre d'une autre org, session IA ouverte depuis un autre contexte) donne `null`, et la clé est acceptée.
3. **TOFU sur la clé de signature, servie par le serveur.** L'annuaire vient de `GET /api/orgs/:orgId`. Pour tout couple (observateur, créateur) jamais vu sur cet appareil (nouveau membre, nouvel appareil, cache IndexedDB purgé, navigation privée), le serveur peut servir **sa propre** `publicSignKey` pour le créateur, signer une clé de son choix, et le client l'épingle définitivement.

Aucune vérification hors bande n'existe pour les clés d'identité (RSA ou ECDSA). Le SAS existe seulement pour les appels P2P ([`CallOverlay.vue:563`](../../src/components/peer/CallOverlay.vue)). Il n'y a ni « numéro de sécurité », ni QR code, ni empreinte affichée dans le profil.

## Impact

Dans le modèle de menace de Synco (serveur non fiable), le serveur garde un chemin générique pour faire adopter à un client une clé symétrique qu'il connaît, et donc lire les messages futurs d'un espace, d'un salon, d'un DM, d'une session IA ou d'un appel LiveKit (la `ThreadKey` sert de clé média) :

- immédiatement, par le cas (1), sans aucune condition ;
- de façon indétectable, par le cas (3), pour tout nouveau membre ou nouvel appareil.

Un membre malveillant (client modifié) peut aussi exploiter le cas (1) là où il est créateur légitime d'une clé. Les upserts serveur QW5/QW6 sont désormais « create-only », ce qui limite ce volet aux clés qu'il crée lui-même.

## Preuve de concept / scénario d'exploitation

```text
Serveur compromis, cible : espace « Direction » (D), nouveau membre Eve qui vient d'arriver.
1. Le serveur génère K' (AES-256), la scelle pour la clé publique RSA d'Eve.
2. GET /api/spaces/D/key pour Eve → { encryptedKey: seal(K'), version: 1 }   (sans creatorId/commitment/signature)
3. workspaceCrypto.ts:108 → verifyKeyEnvelopeIfPresent(...) retourne sans rien vérifier.
4. keyPinning épingle K' pour (space:D, v1) chez Eve ; Eve chiffre ses messages avec K'.
   Le serveur, qui connaît K', les lit. Les autres membres (qui ont K) ne voient qu'un « message
   indéchiffrable » d'Eve, ce que l'UI attribue à un retard de distribution de clé.
```

Variante du cas (3) : le serveur sert `publicSignKey = clé du serveur` pour le créateur légitime, avec une enveloppe valide pour K'. La vérification réussit.

## Recommandation de remédiation

1. **Fermer le cas (1)** : tout compte migré FC4 (`publicSignKey` présent) doit **toujours** signer. Le client refuse une clé sans enveloppe dès que le créateur annoncé ou l'émetteur possède une `publicSignKey`. Côté API, rendre `commitment`/`signature` obligatoires dès que l'appelant a une `publicSignKey`. Fixer une date butoir après laquelle une enveloppe absente est refusée partout.
2. **Fermer le cas (2)** : résoudre la clé de signature du créateur par un appel dédié (`GET /api/users/:id`), puis la soumettre au même TOFU. Ne jamais accepter silencieusement.
3. **Rendre le TOFU vérifiable** : afficher une empreinte d'identité (hash de `publicKey` + `publicSignKey`) dans le profil de chaque membre, avec un flux « vérifier en personne / par QR » et un état « vérifié » persistant. Alerter en cas de changement d'une identité vérifiée. Le minimum : badge « non vérifié » sur les espaces et DM dont un membre n'a jamais été vérifié.
4. À moyen terme : journal de transparence des clés (à la manière de Key Transparency / CONIKS), qui empêche le serveur de servir des clés différentes à des observateurs différents sans être détecté.
5. Remplacer le test qui fige la tolérance (`keyEnvelope.test.ts:73-77`) par un test qui exige le refus pour un émetteur migré.
