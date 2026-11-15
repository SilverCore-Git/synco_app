class SoundManager {
  private audioContext: AudioContext | null = null;
  private soundMap: Map<string, AudioBuffer> = new Map();
  private lastPlayed: Map<string, number> = new Map();
  private isInitialized = false;

  // Dictionnaire des sons disponibles
  public readonly SOUNDS: Record<string, string> = {
    // Famille « bulle » : une bulle qui monte = une arrivée, une bulle qui
    // descend = un départ. Sons synthétisés pour Synco, sans licence tierce.
    notification: '/sounds/notification.mp3',
    // Message direct : trois bulles au lieu de deux.
    mention: '/sounds/mention.mp3',
    call_incoming: '/sounds/call_incoming.mp3',
    // Quelqu'un rejoint le salon vocal.
    call_join: '/sounds/call_join.mp3',
    // Fin d'appel : déconnexion volontaire, expulsion ou coupure, en salon
    // vocal LiveKit comme en appel P2P ; aussi quand quelqu'un quitte le salon.
    call_disconnect: '/sounds/call_disconnect.mp3',
    mute: '/sounds/mute.mp3',
    unmute: '/sounds/unmute.mp3',
    // La tonalité d'attente (call_outgoing.mp3) et la sonnerie tournent en
    // boucle via un élément <audio> dans useSecurePeer / usePrivatMeet.
  };

  /**
   * Initialise le contexte audio et précharge les sons.
   * Doit être appelé lors d'une interaction utilisateur (ex: clic) pour contourner le blocage Autoplay.
   */
  public async init() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      // Déverrouiller le contexte audio sur les navigateurs stricts
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.isInitialized = true;
      this.preloadAll();
      
    } catch (e) {
      console.error('[SoundService] Échec de l\'initialisation de l\'AudioContext', e);
    }
  }

  /**
   * Lance le téléchargement en mémoire de tous les sons définis dans SOUNDS
   */
  private async preloadAll() {
    if (!this.audioContext) return;

    for (const [name, path] of Object.entries(this.SOUNDS)) {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          console.warn(`[SoundService] Fichier audio introuvable : ${path}`);
          continue;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundMap.set(name, audioBuffer);
      } catch (err) {
        console.error(`[SoundService] Erreur lors du préchargement de ${name}:`, err);
      }
    }
  }

  /**
   * Joue un son préchargé avec un système d'anti-spam (debounce).
   * @param name Nom du son (ex: 'notification')
   * @param throttleMs Temps minimum entre deux lectures identiques (défaut: 500ms)
   */
  public play(name: string, throttleMs: number = 500) {
    if (!this.isInitialized || !this.audioContext) return;

    // Vérification Anti-Spam
    const now = Date.now();
    const lastPlayedTime = this.lastPlayed.get(name) || 0;
    
    if (now - lastPlayedTime < throttleMs) {
      return; // Ignorer si le son a été joué trop récemment
    }

    this.lastPlayed.set(name, now);

    const buffer = this.soundMap.get(name);
    if (!buffer) {
      console.warn(`[SoundService] Le son "${name}" n'est pas chargé ou n'existe pas.`);
      return;
    }

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch (err) {
      console.error(`[SoundService] Erreur lors de la lecture de ${name}:`, err);
    }
  }
}

// Export en singleton
export const SoundService = new SoundManager();
