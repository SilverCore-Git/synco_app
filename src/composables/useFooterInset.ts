import { ref, watch, nextTick, onBeforeUnmount, type Ref } from "vue";

// Le footer d'un chat (bandeau de réponse, fichiers joints, zone de saisie
// multi-ligne…) est en `absolute` par-dessus la liste des messages : sa hauteur
// varie. On la mesure pour réserver autant d'espace sous la liste, sinon les
// derniers messages passent dessous. Quand le footer grandit, on décale aussi
// le scroll d'autant pour que le bas de la conversation reste visible.
const useFooterInset = (
    footerRef: Ref<HTMLElement | null>,
    containerRef: Ref<HTMLElement | null>,
    initial: number,
) => {

    const footerHeight = ref<number>(initial);
    let observer: ResizeObserver | null = null;

    const onResize = (entries: ResizeObserverEntry[]) => {
        const el = entries[0]?.target as HTMLElement | undefined;
        if (!el) return;

        const next = el.offsetHeight;
        const delta = next - footerHeight.value;
        footerHeight.value = next;

        if (delta > 0) {
            // Après le rendu de la nouvelle marge, sinon le scroll est borné
            // par l'ancienne hauteur du conteneur.
            nextTick(() => {
                if (containerRef.value) containerRef.value.scrollTop += delta;
            });
        }
    };

    watch(footerRef, (el, old) => {
        if (old) observer?.unobserve(old);
        if (!el) return;
        observer ??= new ResizeObserver(onResize);
        observer.observe(el);
    }, { immediate: true });

    onBeforeUnmount(() => {
        observer?.disconnect();
        observer = null;
    });

    return { footerHeight };
};

export default useFooterInset;
