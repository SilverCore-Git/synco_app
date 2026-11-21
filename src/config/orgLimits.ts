/**
 * Nombre maximal de membres d'une organisation (PC30).
 *
 * Valeur recopiée de synco_api `src/config/orgLimits.ts` (ORG_MEMBER_LIMIT), à garder synchronisée.
 * Le serveur reste l'autorité : la valeur qu'il expose (`config.memberLimit`) prime si elle diffère.
 */
export const ORG_MEMBER_LIMIT = 1000;

/** Code d'erreur renvoyé par l'API (409 `{ error: 'org_member_limit', limit }`). */
export const ORG_MEMBER_LIMIT_ERROR = 'org_member_limit';

interface OrgLimitSource {
  config?: { memberLimit?: number } | null;
  stats?: { memberCount?: number; pendingInviteCount?: number | null } | null;
}

/** Limite effective : celle du serveur si elle est valide, sinon la constante recopiée. */
export const getMemberLimit = (org?: OrgLimitSource | null): number => {
  const fromServer = org?.config?.memberLimit;
  return typeof fromServer === 'number' && Number.isFinite(fromServer) && fromServer > 0
    ? fromServer
    : ORG_MEMBER_LIMIT;
};

/** Places prises : membres + invitations nominatives en attente. */
export const getUsedSeats = (memberCount: number, pendingInviteCount: number): number =>
  Math.max(0, memberCount) + Math.max(0, pendingInviteCount);

/** Vrai si le corps de réponse est le refus `org_member_limit`. */
export const isMemberLimitError = (body: unknown): body is { error: typeof ORG_MEMBER_LIMIT_ERROR; limit?: number } =>
  typeof body === 'object' && body !== null && (body as { error?: unknown }).error === ORG_MEMBER_LIMIT_ERROR;

const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Message lisible du refus ; `limit` du corps de réponse prioritaire. */
export const memberLimitMessage = (limit: number = ORG_MEMBER_LIMIT): string =>
  `Cette organisation a atteint sa limite de ${fmt(limit)} membres (invitations en attente comprises). Retirez des membres ou révoquez des invitations pour continuer.`;

/** Message pour l'invité qui tente de rejoindre une organisation pleine. */
export const memberLimitMessageForInvitee = (limit: number = ORG_MEMBER_LIMIT): string =>
  `Cette organisation a atteint sa limite de ${fmt(limit)} membres : vous ne pouvez pas la rejoindre pour le moment. Contactez un administrateur de l'organisation.`;
