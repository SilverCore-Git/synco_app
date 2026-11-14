// Point d'entrée de la pop-up d'appel entrant (incoming-call.html) : rien d'autre que la carte, sans
// routeur ni session. Mêmes styles que l'app pour reprendre ses jetons de thème et ses boutons.
import { createApp } from 'vue';
import '../style.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import IncomingCallPopup from './IncomingCallPopup.vue';

createApp(IncomingCallPopup).mount('#app');
