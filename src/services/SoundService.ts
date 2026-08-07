class SoundManager {
  private audioContext: AudioContext | null = null;
  private soundMap: Map<string, AudioBuffer> = new Map();
  private lastPlayed: Map<string, number> = new Map();
  private isInitialized = false;

  // Dictionnaire des sons disponibles
  public readonly SOUNDS: Record<string, string> = {
    notification: '/sounds/notification.mp3',
    call_incoming: '/sounds/call_incoming.mp3',
    // call_outgoing: '/sounds/call_outgoing.mp3',
    // ... ajoutez d'autres sons ici
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
