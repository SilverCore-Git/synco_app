// Appui long tactile — l'équivalent mobile du survol desktop. Uniquement sur
// les événements touch : à la souris, rien ne change (la barre d'actions au
// survol reste le chemin). Le délai s'annule si le doigt glisse, pour qu'un
// défilement de la liste ne déclenche jamais l'action.

const MOVE_TOLERANCE = 10;

export function useLongPress(onLongPress: () => void, delay = 450) {

    let timer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0;
    let startY = 0;
    let touching = false;
    let fired = false;

    const clear = () => {
        clearTimeout(timer);
        timer = undefined;
    };

    const onTouchstart = (e: TouchEvent) => {
        clear();
        fired = false;
        if (e.touches.length !== 1) return;
        touching = true;
        const t = e.touches[0]!;
        startX = t.clientX;
        startY = t.clientY;
        timer = setTimeout(() => {
            timer = undefined;
            fired = true;
            navigator.vibrate?.(10);
            onLongPress();
        }, delay);
    };

    const onTouchmove = (e: TouchEvent) => {
        if (!timer) return;
        const t = e.touches[0];
        if (!t || Math.hypot(t.clientX - startX, t.clientY - startY) > MOVE_TOLERANCE) clear();
    };

    const onTouchend = (e: TouchEvent) => {
        clear();
        touching = false;
        // Sans ça, le navigateur synthétise un clic en relâchant le doigt :
        // il atterrirait sur un lien, une mention ou le fond du sheet à peine
        // ouvert.
        if (fired) {
            e.preventDefault();
            fired = false;
        }
    };

    // Android ouvre son menu contextuel natif (copier le lien, image...) au
    // même moment que notre appui long : on le coupe pendant un toucher, et
    // seulement là — le clic droit à la souris garde son menu.
    const onContextmenu = (e: Event) => {
        if (touching || fired) e.preventDefault();
    };

    return { onTouchstart, onTouchmove, onTouchend, onContextmenu };
}
