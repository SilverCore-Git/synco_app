/**
 * Mention « avec Synco AI » sous un message écrit par l'agent (12 §4.3, PC88) et avertissement « Texte non
 * confirmé par <nom> » d'un message autonome dont la déclaration du texte ne se vérifie pas (12 §10.7, PC100). Pur :
 * testé sans DOM. Texte seulement, jamais de HTML.
 */
import type { AgentMark } from '@/assets/utils/messageAuth';
import { isD3Nonce } from '@/assets/utils/agentMessage';

type AuthState = 'legacy' | 'unsigned' | 'verified' | 'invalid' | undefined;

export interface AgentMarkView {
    label: string;
    tooltip: string;
    /** Avertissement visible (couleur d'alerte), un seul pour toutes les raisons (PC100). */
    warning: string | null;
    /** Raison interne, dans les détails seulement. */
    detail: string | null;
}

const REASONS: Record<string, string> = {
    absent: 'aucune déclaration jointe au message',
    invalid_declaration: 'déclaration illisible',
    signer_unavailable: "clés de l'expéditeur indisponibles",
    signer_mismatch: "déclaration signée par quelqu'un d'autre",
    kind_mismatch: 'envoi et modification confondus',
    target_mismatch: 'salon, message ou réponse différents de ce qui a été accepté',
    bad_signature: 'signature de la déclaration invalide',
    invalid_envelope: 'contenu chiffré mal formé',
    text_mismatch: 'texte différent de celui accepté',
    replayed: "déclaration déjà utilisée par un autre message",
};

/**
 * Marque d'un message de salon (`agentMark` posé au déchiffrement) ou d'un MP (`d3` d'auteur `ai`, lisible au format
 * du nonce une fois le message authentifié). `null` : message écrit à la main, ou `invalid` (déjà masqué).
 */
export function agentMarkView(input: { mark?: AgentMark; nonce?: string | null; authState?: AuthState; senderName?: string | null }): AgentMarkView | null {
    if (input.authState === 'invalid') return null;
    const name = input.senderName?.trim() || "l'utilisateur";
    const mark: AgentMark | undefined = input.mark
        ?? (input.nonce && isD3Nonce(input.nonce) && (input.authState === 'verified' || input.authState === 'unsigned') ? { author: 'ai' } : undefined);
    if (!mark) return null;
    const unverifiedKey = input.authState === 'unsigned' ? ' (non vérifié)' : '';
    if (mark.author === 'ai') {
        return { label: `avec Synco AI${unverifiedKey}`, tooltip: `Écrit par Synco AI, envoyé par ${name}.`, warning: null, detail: null };
    }
    const warning = mark.text === 'text_unverified' ? `Texte non confirmé par ${name} : il peut différer de ce qu'il a accepté` : null;
    return {
        label: `avec Synco AI · mode autonome${unverifiedKey}`,
        tooltip: `Écrit et envoyé par l'agent de ${name} pendant son absence.`,
        warning,
        detail: warning && mark.reason ? `Détail : ${REASONS[mark.reason] ?? mark.reason}.` : null,
    };
}

/** Marque compacte des aperçus (message cité) : même famille, sans le détail. */
export function agentPreviewMark(input: Parameters<typeof agentMarkView>[0]): { title: string; warning: boolean } | null {
    const v = agentMarkView(input);
    return v ? { title: v.warning ?? v.label, warning: v.warning !== null } : null;
}
