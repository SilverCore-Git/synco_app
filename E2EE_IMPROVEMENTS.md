# Améliorations du système E2EE pour les appels P2P

## Problèmes résolus

### 1. Bouton d'appel
- **Problème** : Bouton manquant ou mal positionné
- **Solution** : Le bouton est maintenant bien visible dans ChatView.vue, positionné à gauche de l'ellipsis avec un tooltip "Appeler"

### 2. Erreurs PeerJS
- **Problèmes** :
  - "Lost connection to server"
  - "Cannot connect to new Peer after disconnecting from server"
  - "L'appel n'a pas pu être établi"
- **Solutions** :
  - Meilleure gestion de la reconnexion avec `cleanupPeer()` avant de recréer
  - Attente de la reconnexion avant de démarrer un appel
  - Initialisation automatique du peer si non initialisé
  - Vérification qu'aucun appel n'est déjà en cours avant d'en lancer un nouveau

### 3. Duplication de l'UI d'appel
- **Problème** : L'UI s'ouvrait deux fois
- **Solution** : Vérification dans `startCall()` qu'aucun appel n'est déjà actif

### 4. Deux popups draggable
- **Problème** : Deux fenêtres draggable quand on minimise
- **Solution** : Ajout d'une clé unique pour DraggableWindow basée sur le peerId

### 5. Ratio 16:9
- **Statut** : Déjà correct (320x180px)

### 6. Overlay "appel en cours" inutile
- **Solution** : Suppression du texte "En appel..." de la fenêtre minimisée, gardé seulement l'icône animée

## Améliorations de sécurité E2EE

### 1. Perfect Forward Secrecy
- Chaque appel a maintenant un `callId` unique : `${peerId}-${Date.now()}-${randomString}`
- Cela empêche la réutilisation des clés entre différents appels

### 2. Protection contre les replay attacks
- Validation du timestamp des messages d'échange de clés
- Rejet des messages vieux de plus de 30 secondes

### 3. Protection contre la confusion de session
- Vérification que le `callId` dans les messages correspond à la session actuelle
- Prévention des attaques de type session hijacking

### 4. Timeout pour l'échange de clés
- Timeout de 10 secondes pour l'échange de clés E2EE
- Si le timeout expire, la session est marquée comme échouée
- Etat : `encrypted: false, authenticated: false, fingerprint: 'TIMEOUT'`

### 5. Gestion des erreurs améliorée
- Try/catch autour de toutes les opérations d'échange de clés
- En cas d'erreur, la session est marquée avec `fingerprint: 'ERROR'`
- Les timeouts sont nettoyés proprement

### 6. Nettoyage des ressources
- Clear des timeouts quand un appel se termine
- Nettoyage complet des sessions dans `cleanupCall()`
- Nouvelle fonction `cleanupPeer()` pour la gestion manuelle

### 7. Logs de sécurité
- Ajout de logs pour suivre l'état de l'E2EE :
  - `[SECURE-PEER] Key exchange completed`
  - `[SECURE-PEER] Key exchange completed and authenticated`
  - `[SECURE-PEER] Key exchange timeout`
  - `[SECURE-PEER] CallId mismatch, possible session hijacking attempt`
  - `[SECURE-PEER] Rejecting old key exchange message (possible replay attack)`

## Architecture technique

### Protocole E2EE
1. **Échange de clés publiques** : ECDH P-256 via data channel
2. **Dérivation de clé** : HKDF avec SHA-256
3. **Chiffrement** : AES-GCM pour les messages (implémentation partielle, à compléter)
4. **Authentification** : Fingerprint basé sur SHA-256 de la clé de session

### États de sécurité
- `encrypted: false` - Pas de clé E2EE établie
- `encrypted: true, authenticated: false` - Clé établie, attente de confirmation
- `encrypted: true, authenticated: true` - E2EE pleinement opérationnel
- `fingerprint: 'TIMEOUT'` - Timeout de l'échange de clés
- `fingerprint: 'ERROR'` - Erreur lors de l'échange

## Prochaines étapes suggérées

1. **Implémenter le chiffrement des flux media** : Actuellement, seul le signaling est sécurisé avec E2EE. Les flux audio/vidéo utilisent DTLS-SRTP (chiffrement au niveau transport), mais pour une sécurité maximale, considérer :
   - SRTP avec clés dérivées via ECDH
   - Ou utiliser WebRTC Insertable Streams pour chiffrer au niveau application

2. **Authentification manuelle** : Implémenter un système de vérification du fingerprint par l'utilisateur (Short Authentication String - SAS)

3. **rotation des clés** : Changement périodique des clés pendant les appels longs

4. **Audit de sécurité** : Faire auditer le code par un expert en cryptographie
