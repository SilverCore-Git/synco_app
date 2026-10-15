import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

// Zone de dépôt de fichiers couvrant toute la fenêtre (et pas seulement le
// composer). Un dépôt déjà pris en charge par un élément plus précis
// (drop avec .prevent) est ignoré pour ne pas être traités deux fois.
export default function useWindowFileDrop(onFiles: (files: FileList) => void, enabled: () => boolean = () => true): { isDragging: Ref<boolean> } {
    const isDragging = ref(false);
    let depth = 0;

    const reset = () => { depth = 0; isDragging.value = false; };

    const onEnter = (e: DragEvent) => {
        if (!enabled() || !hasFiles(e)) return;
        depth++;
        isDragging.value = true;
    };
    const onOver = (e: DragEvent) => {
        if (!enabled() || !hasFiles(e)) return;
        e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
        if (!hasFiles(e)) return;
        depth = Math.max(0, depth - 1);
        if (depth === 0) isDragging.value = false;
    };
    const onDrop = (e: DragEvent) => {
        const wasDragging = isDragging.value;
        reset();
        if (!enabled() || !wasDragging || e.defaultPrevented || !e.dataTransfer?.files?.length) return;
        e.preventDefault();
        onFiles(e.dataTransfer.files);
    };

    onMounted(() => {
        // enter/over/leave en capture : aucun composant intermédiaire ne peut
        // les avaler (stopPropagation) avant qu'on affiche la zone de dépôt.
        window.addEventListener('dragenter', onEnter, true);
        window.addEventListener('dragover', onOver, true);
        window.addEventListener('dragleave', onLeave, true);
        window.addEventListener('drop', onDrop);
        window.addEventListener('dragend', reset);
    });
    onBeforeUnmount(() => {
        window.removeEventListener('dragenter', onEnter, true);
        window.removeEventListener('dragover', onOver, true);
        window.removeEventListener('dragleave', onLeave, true);
        window.removeEventListener('drop', onDrop);
        window.removeEventListener('dragend', reset);
    });

    return { isDragging };
}
