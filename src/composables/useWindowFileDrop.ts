import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

// Zone de dépôt de fichiers couvrant toute la fenêtre (et pas seulement le
// composer). Les dépôts déjà pris en charge par un élément plus précis
// (handler avec .prevent) sont ignorés pour ne pas être traités deux fois.
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
        if (!enabled() || !hasFiles(e) || e.defaultPrevented) return;
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
        window.addEventListener('dragenter', onEnter);
        window.addEventListener('dragover', onOver);
        window.addEventListener('dragleave', onLeave);
        window.addEventListener('drop', onDrop);
        window.addEventListener('dragend', reset);
    });
    onBeforeUnmount(() => {
        window.removeEventListener('dragenter', onEnter);
        window.removeEventListener('dragover', onOver);
        window.removeEventListener('dragleave', onLeave);
        window.removeEventListener('drop', onDrop);
        window.removeEventListener('dragend', reset);
    });

    return { isDragging };
}
