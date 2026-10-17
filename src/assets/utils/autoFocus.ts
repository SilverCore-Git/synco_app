// Appareil tactile sans survol (téléphone/tablette) : un focus programmatique
// y ouvre le clavier virtuel sans que l'utilisateur l'ait demandé. On le
// réserve donc aux appareils à pointeur précis ; sur mobile il faut taper
// dans le champ pour écrire.
export const canAutoFocus = (): boolean =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
        ? true
        : !window.matchMedia('(hover: none) and (pointer: coarse)').matches;

export const autoFocus = (el: { focus: () => void } | null | undefined): void => {
    if (canAutoFocus()) el?.focus();
};
