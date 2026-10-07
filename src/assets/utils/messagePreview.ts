// Aperçu compact d'un message cité (bannière de réponse, citation au-dessus
// d'un message) : uniquement la première ligne, coupée si trop longue, avec
// "…" dès qu'il manque du contenu. Opère sur le texte brut plutôt que sur le
// rendu MarkdownRender — un <div> line-clamp-1 autour d'un rendu markdown ne
// tronque pas correctement dès que le markdown produit un élément bloc
// imbriqué (liste, citation, plusieurs paragraphes) : -webkit-line-clamp ne
// compte alors cet élément que comme une seule "ligne" et l'affiche en
// entier, quelle que soit sa hauteur réelle.
export const messagePreview = (content: string | null | undefined, maxLength = 160): string => {
  if (!content) return '';

  const newlineIndex = content.indexOf('\n');
  const firstLine = (newlineIndex === -1 ? content : content.slice(0, newlineIndex)).trim();
  const hasMore = newlineIndex !== -1 || firstLine.length > maxLength;
  const clipped = firstLine.length > maxLength ? firstLine.slice(0, maxLength).trimEnd() : firstLine;

  return hasMore ? `${clipped}…` : clipped;
};
