// Config PeerJS partagée par les deux systèmes P2P de l'app (appels privés
// dans useSecurePeer.ts, sessions éphémères dans usePrivatMeet.ts).
//
// Volontairement STUN-only, sans serveur TURN : PeerJS retombe sinon sur sa
// config par défaut, qui inclut le serveur TURN public turn.peerjs.com — un
// relais tiers accepterait de faire transiter le trafic si la connexion
// directe échoue, ce qui contredit la promesse "peer-to-peer" affichée à
// l'utilisateur. Avec cette config, une connexion qui aboutit est donc
// garantie directe (au prix, en échange, d'un échec pur et simple sur les
// topologies réseau où seul un relais aurait permis de se connecter).
export const PEER_CONFIG = {
    sdpSemantics: 'unified-plan' as const,
    encodedInsertableStreams: true,
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all' as const,
    bundlePolicy: 'max-bundle' as const,
    rtcpMuxPolicy: 'require' as const
};
