import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export const useToast = () => {

    const show = (message: string, type: Toast['type'] = 'success', duration = 3000) => {

        const id = nextId++;
        toasts.value.push({ id, message, type, duration });

        setTimeout(() => {
            remove(id);
        }, duration);
        
    };

    const remove = (id: number) => {
        toasts.value = toasts.value.filter(t => t.id !== id);
    };

    return { toasts, show, remove };

};