import { ref } from 'vue';
import type { User } from '@/types/types';

// État du profil ouvert
const profileUser = ref<User | null>(null);
const isProfileOpen = ref<boolean>(false);

// Ouvrir le profil d'un utilisateur
export const openProfile = (userToShow: User) => {
  profileUser.value = userToShow;
  isProfileOpen.value = true;
};

// Fermer le profil
export const closeProfile = () => {
  profileUser.value = null;
  isProfileOpen.value = false;
};

// Basculer le profil
export const toggleProfile = (userToShow: User | null) => {
  if (isProfileOpen.value && profileUser.value?.id === userToShow?.id) {
    closeProfile();
  } else if (userToShow) {
    openProfile(userToShow);
  } else {
    closeProfile();
  }
};

export { profileUser, isProfileOpen };
