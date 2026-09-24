/**
 * Convertit un fichier image en data URL carrée, redimensionnée et compressée,
 * prête à être stockée telle quelle en base (même convention que
 * `User.avatarUrl` et `Organization.logo`, qui sont déjà des data URL).
 *
 * Le redimensionnement n'est pas cosmétique : sans lui, une photo de
 * téléphone produit une data URL de plusieurs mégaoctets qui partirait dans
 * le corps JSON de chaque création/mise à jour de webhook.
 *
 * L'image est recadrée au centre pour rester carrée (l'avatar est affiché en
 * rond partout), puis exportée en JPEG.
 */
export async function imageToAvatarDataUrl(
    file: File,
    size: number = 256,
    quality: number = 0.85
): Promise<string> {

    const objectUrl = URL.createObjectURL(file);

    try {

        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Image illisible"));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas indisponible");

        // Recadrage centré sur le plus petit côté (équivalent object-fit: cover).
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sx = (image.naturalWidth - side) / 2;
        const sy = (image.naturalHeight - side) / 2;

        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);

        return canvas.toDataURL('image/jpeg', quality);

    } finally {
        URL.revokeObjectURL(objectUrl);
    }

}
