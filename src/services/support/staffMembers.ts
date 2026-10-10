import { shallowRef, watch } from 'vue';
import { user } from '@/assets/var';
import type { SupportStaffMember } from '@/types/support';
import { supportApi } from './api';
import { rememberSignKey } from './keys';

/**
 * Membres de l'équipe support (GET /api/support/staff/members, équipe
 * uniquement), partagés par tous les écrans : mentions du canal INTERNAL,
 * listes de transfert/d'assignation, noms dans l'indicateur de frappe.
 */

export const staffMembers = shallowRef<SupportStaffMember[]>([]);
let loaded = false;
let inflight: Promise<SupportStaffMember[]> | null = null;

watch(() => user.value?.id, () => {
    staffMembers.value = [];
    loaded = false;
    inflight = null;
});

export function loadStaffMembers(force = false): Promise<SupportStaffMember[]> {
    if (loaded && !force) return Promise.resolve(staffMembers.value);
    if (inflight && !force) return inflight;
    const p = supportApi.listStaffMembers()
        .then((list) => {
            staffMembers.value = list;
            loaded = true;
            // Si l'API fournit un jour les clés de signature, elles servent
            // à vérifier les enveloppes des clés INTERNAL.
            for (const m of list) rememberSignKey(m.id, m.publicSignKey);
            return list;
        })
        .finally(() => { if (inflight === p) inflight = null; });
    inflight = p;
    return p;
}
