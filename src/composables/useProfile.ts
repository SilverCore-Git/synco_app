import { ref } from 'vue';
import type { User } from '@/types/types';

const profileUser = ref<User | null>(null);
const isProfileOpen = ref<boolean>(false);
const profilePosition = ref<{ top: number; left: number; align: 'left' | 'right' } | null>(null);

// Ouvrir le profil d'un utilisateur
export const openProfile = (userToShow: User, event?: MouseEvent) => {
  profileUser.value = userToShow;
  
  if (event && event.currentTarget) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    const cardWidth = 320; 
    const cardHeight = 450; // Approximative max height
    
    let top = rect.top;
    if (top + cardHeight > window.innerHeight - 20) {
        top = window.innerHeight - cardHeight - 20;
    }
    top = Math.max(20, top);
    
    let left = rect.right + 15;
    let align: 'left' | 'right' = 'left';
    
    if (left + cardWidth > window.innerWidth - 20) {
        left = rect.left - cardWidth - 15;
        align = 'right';
        if (left < 20) {
            // Screen too narrow to place on sides, center horizontally
            left = (window.innerWidth - cardWidth) / 2;
        }
    }
    
    profilePosition.value = { top, left, align };
  } else {
    profilePosition.value = null; // Centered fallback
  }
  
  isProfileOpen.value = true;
};

// Fermer le profil
export const closeProfile = () => {
  profileUser.value = null;
  isProfileOpen.value = false;
  // We don't reset position here to allow smooth out-animation
};

// Basculer le profil
export const toggleProfile = (userToShow: User | null, event?: MouseEvent) => {
  if (isProfileOpen.value && profileUser.value?.id === userToShow?.id) {
    closeProfile();
  } else if (userToShow) {
    openProfile(userToShow, event);
  } else {
    closeProfile();
  }
};

export { profileUser, isProfileOpen, profilePosition };
