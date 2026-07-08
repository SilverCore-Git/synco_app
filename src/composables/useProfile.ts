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
    
    // Check if we have enough space on the right, otherwise open on the left
    const spaceOnRight = window.innerWidth - rect.right;
    const cardWidth = 320; // Approx card width
    
    if (spaceOnRight > cardWidth + 20) {
        // Open to the right of the avatar
        profilePosition.value = {
            top: Math.max(20, Math.min(rect.top, window.innerHeight - 400)), // Prevent going off-screen vertically
            left: rect.right + 15,
            align: 'left'
        };
    } else {
        // Open to the left of the avatar
        profilePosition.value = {
            top: Math.max(20, Math.min(rect.top, window.innerHeight - 400)),
            left: rect.left - cardWidth - 15,
            align: 'right'
        };
    }
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
