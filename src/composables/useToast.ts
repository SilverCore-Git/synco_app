import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  // Toasts génériques (validation, erreur réseau, etc.) ne doivent pas
  // sonner à chaque affichage — seuls certains toasts adossés à une vraie
  // notification serveur (ex: demande d'accès agenda) le demandent
  // explicitement, cf. showToastNotification() dans useNotification.ts.
  playSound?: boolean;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export const useToast = () => {

    const show = (message: string, type: Toast['type'] = 'success', duration = 3000, playSound = false) => {

        const id = nextId++;
        toasts.value.push({ id, message, type, duration, playSound });

        setTimeout(() => {
            remove(id);
        }, duration);
        
    };

    const remove = (id: number) => {
        toasts.value = toasts.value.filter(t => t.id !== id);
    };

    return { toasts, show, remove };

};