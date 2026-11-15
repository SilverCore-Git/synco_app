import { user } from '@/assets/var';

/**
 * Texte affiché à la place d'un message qu'on n'arrive pas à déchiffrer.
 *
 * Les messages ne portent aucun marqueur de version E2EE (ni dans l'IV/nonce,
 * ni de `keyVersion` en base) : on ne peut pas savoir à coup sûr qu'un message
 * vient d'un compte passé en v4. On connaît en revanche la version du compte
 * qui lit : un compte encore en v3 qui échoue est, en pratique, presque
 * toujours face à un message envoyé depuis un compte v4 — on le dit en clair
 * plutôt qu'un « erreur de déchiffrement » qui fait croire à une panne.
 *
 * Préfixe de sel dupliqué de e2eeV4/runtime.ts (V4_SALT_PREFIX) : importer
 * runtime.ts ici créerait un cycle avec crypto.ts.
 */
const isV4Reader = (): boolean => !!user.value?.pinSalt?.startsWith('v4:');

export const undecryptableMessageText = (): string =>
    isV4Reader()
        ? "[🔒 Ce message n'est pas lisible sur cet appareil : il a été chiffré avec une clé que vous ne détenez pas (ancienne clé ou version de chiffrement différente).]"
        : "[🔒 Message illisible avec la version de chiffrement de votre compte (v3) : il a probablement été envoyé depuis un compte en chiffrement multi-appareil (v4). Passez en v4 dans Paramètres › Appareils.]";
