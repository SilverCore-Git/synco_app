// Écriture d'archives ZIP côté client.
//
// Les fichiers du gestionnaire sont chiffrés de bout en bout : le serveur ne
// peut pas les lire, donc il ne peut pas construire l'archive. Le zip est donc
// assemblé ici, après déchiffrement local.
//
// Pas de dépendance : le conteneur ZIP est écrit à la main et la compression
// utilise CompressionStream('deflate-raw'), natif dans les navigateurs récents.
// Sans lui (ou si la compression ne gagne rien), l'entrée est stockée telle
// quelle (méthode STORE), ce qui reste une archive ZIP parfaitement valide.

export interface ZipEntry {
    // Chemin dans l'archive, séparé par des '/' (ex: "Rapports/2026/bilan.pdf").
    // Un chemin terminé par '/' crée un dossier vide.
    path: string;
    data?: Blob;
    // Passer false pour forcer le stockage sans compression (fichiers déjà
    // compressés : images, vidéos, archives...).
    compress?: boolean;
}

// Champs de taille sur 32 bits : au-delà il faudrait l'extension ZIP64.
export const ZIP_MAX_BYTES = 0xFFFFFFFF;

let crcTable: Uint32Array | null = null;

const getCrcTable = (): Uint32Array => {

    if (crcTable) return crcTable;

    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i++)
    {
        let c = i;
        for (let bit = 0; bit < 8; bit++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }

    crcTable = table;
    return table;

};

const crc32 = (bytes: Uint8Array): number => {

    const table = getCrcTable();
    let crc = 0xFFFFFFFF;

    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ bytes[i]!) & 0xFF]!;
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;

};

// Horodatage au format MS-DOS attendu par le ZIP (résolution : 2 secondes).
const dosDateTime = (date: Date) => {

    const year = Math.max(1980, date.getFullYear());

    return {
        time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2))) & 0xFFFF,
        date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF,
    };

};

const deflateRaw = async (bytes: Uint8Array): Promise<Uint8Array | null> => {

    if (typeof CompressionStream === 'undefined') return null;

    try {
        const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) {
        // Navigateur sans 'deflate-raw' : on retombe sur le stockage brut.
        console.warn("deflate-raw unavailable, storing uncompressed", e);
        return null;
    }

};

// Au-delà, le gain de compression ne justifie pas le coût CPU/mémoire (l'entrée
// est dupliquée en mémoire le temps de comparer les deux tailles).
const MAX_COMPRESS_BYTES = 32 * 1024 * 1024;

export const createZipBlob = async (entries: ZipEntry[]): Promise<Blob> => {

    const encoder = new TextEncoder();
    const parts: BlobPart[] = [];
    const centralRecords: Uint8Array[] = [];

    let offset = 0;
    const { time, date } = dosDateTime(new Date());

    for (const entry of entries)
    {
        const isDirectory = entry.path.endsWith('/');
        const nameBytes = encoder.encode(entry.path);

        const raw = (!isDirectory && entry.data)
            ? new Uint8Array(await entry.data.arrayBuffer())
            : new Uint8Array(0);

        const crc = crc32(raw);

        let method = 0;
        // Type large volontairement : le résultat de CompressionStream n'est pas
        // typé Uint8Array<ArrayBuffer> comme l'entrée.
        let payload: Uint8Array = raw;

        if (entry.compress !== false && raw.length > 0 && raw.length <= MAX_COMPRESS_BYTES)
        {
            const deflated = await deflateRaw(raw);
            if (deflated && deflated.length < raw.length)
            {
                method = 8;
                payload = deflated;
            }
        }

        // En-tête local : 30 octets + nom
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);

        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);        // version minimale
        localView.setUint16(6, 0x0800, true);    // bit 11 : nom de fichier en UTF-8
        localView.setUint16(8, method, true);
        localView.setUint16(10, time, true);
        localView.setUint16(12, date, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, payload.length, true);
        localView.setUint32(22, raw.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);        // pas de champ "extra"
        localHeader.set(nameBytes, 30);

        // Entrée du répertoire central : 46 octets + nom
        const centralRecord = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralRecord.buffer);

        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);      // version utilisée
        centralView.setUint16(6, 20, true);      // version minimale
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, method, true);
        centralView.setUint16(12, time, true);
        centralView.setUint16(14, date, true);
        centralView.setUint32(16, crc, true);
        centralView.setUint32(20, payload.length, true);
        centralView.setUint32(24, raw.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);      // extra
        centralView.setUint16(32, 0, true);      // commentaire
        centralView.setUint16(34, 0, true);      // disque de départ
        centralView.setUint16(36, 0, true);      // attributs internes
        centralView.setUint32(38, isDirectory ? 0x10 : 0, true); // attributs externes (bit "répertoire")
        centralView.setUint32(42, offset, true);
        centralRecord.set(nameBytes, 46);

        parts.push(localHeader as BlobPart);
        if (payload.length > 0) parts.push(payload as BlobPart);
        centralRecords.push(centralRecord);

        offset += localHeader.length + payload.length;
    }

    const centralSize = centralRecords.reduce((total, record) => total + record.length, 0);

    // Fin du répertoire central : 22 octets
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);

    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);               // numéro de disque
    endView.setUint16(6, 0, true);               // disque du répertoire central
    endView.setUint16(8, centralRecords.length, true);
    endView.setUint16(10, centralRecords.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);              // commentaire

    for (const record of centralRecords) parts.push(record as BlobPart);
    parts.push(end as BlobPart);

    return new Blob(parts, { type: 'application/zip' });

};
