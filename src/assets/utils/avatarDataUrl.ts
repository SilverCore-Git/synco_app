/**
 * Réduit un canvas recadré en data URL carrée, prête à être stockée telle
 * quelle en base (même convention que `User.avatarUrl` et
 * `Organization.logo`, qui sont déjà des data URL).
 *
 * La réduction n'est pas cosmétique : le canvas rendu par le recadreur est à
 * la résolution de la source, donc une photo de téléphone produirait une
 * data URL de plusieurs mégaoctets qui partirait dans le corps JSON de
 * chaque mise à jour du webhook.
 *
 * Une image déjà plus petite que `maxSize` n'est jamais agrandie : ça ne
 * ferait que gonfler le poids sans ajouter de détail.
 */
export function canvasToAvatarDataUrl(
    source: HTMLCanvasElement,
    maxSize: number = 256,
    quality: number = 0.85
): string {

    const size = Math.min(maxSize, source.width, source.height);

    if (size <= 0) throw new Error('Recadrage vide');

    const output = document.createElement('canvas');
    output.width = size;
    output.height = size;

    const ctx = output.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');

    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, size, size);

    return output.toDataURL('image/jpeg', quality);

}
