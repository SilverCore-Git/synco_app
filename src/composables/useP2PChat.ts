
import { ref } from 'vue';

import { loadOrGenerateKeyPair, exportPublicKey, importPublicKey, getSharedKey, encryptMessage, decryptMessage } from '@/assets/utils/crypto';


const messages = ref<any[]>([]);


