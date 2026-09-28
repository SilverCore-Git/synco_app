/**
 * Accès à la documentation embarquée de Synco (dossier `doc/`), pour les outils
 * de Synco AI.
 *
 * Le glob est volontairement PARESSEUX (pas de `eager: true`) : Vite produit un
 * chunk séparé par fichier .md, chargé seulement quand l'IA demande réellement
 * ce chapitre. Avec `eager`, les ~165 Ko de markdown partiraient dans le bundle
 * principal et seraient téléchargés par tous les utilisateurs, y compris ceux
 * qui n'ouvrent jamais l'assistant.
 */
const docModules = import.meta.glob('../../doc/**/*.md', {
    query: '?raw',
    import: 'default',
}) as Record<string, () => Promise<string>>;

export type DocSection = 'guide' | 'securite';

export interface DocEntry {
    /** Chemin relatif à `doc/`, sans extension — ex: `01-demarrage`, `securite/05-fichiers-et-stockage`. */
    id: string;
    title: string;
    summary: string;
    section: DocSection;
}

/**
 * Titres et résumés servis dans l'index. Écrits à la main plutôt que dérivés du
 * contenu : les extraire imposerait de charger les 13 fichiers rien que pour
 * afficher la liste, ce qui annulerait le chargement paresseux ci-dessus. Un
 * fichier absent de cette table reste listé (titre dérivé du nom, cf.
 * `humanizeId`) — l'index ne peut donc pas devenir silencieusement incomplet si
 * quelqu'un ajoute un .md sans penser à cette table.
 */
const DOC_META: Record<string, { title: string; summary: string }> = {
    'index': {
        title: "Centre d'aide — sommaire",
        summary: "Point d'entrée de la documentation utilisateur.",
    },
    '01-demarrage': {
        title: 'Bien débuter avec Synco',
        summary: 'Connexion, invitations, navigation entre organisations.',
    },
    '02-espaces-et-threads': {
        title: 'Espaces, Threads et messagerie',
        summary: 'Utiliser le chat chiffré de bout en bout, organiser espaces et salons.',
    },
    '03-appels-vocaux-et-visio': {
        title: 'Appels vocaux et vidéo',
        summary: 'Appels privés en P2P et salons vocaux de groupe.',
    },
    '04-fichiers-et-stockage': {
        title: 'Fichiers et stockage',
        summary: 'Gérer les documents, dossiers et permissions de fichiers.',
    },
    '05-gestion-des-taches': {
        title: 'Gestion des tâches (Todo)',
        summary: 'Tableaux Kanban, tags, assignations, pièces jointes.',
    },
    '06-assistant-ia': {
        title: 'Assistant IA et recherche sémantique',
        summary: "Configurer et utiliser Synco AI, fournisseurs disponibles, recherche.",
    },
    '07-parametres-organisation': {
        title: "Paramètres d'organisation",
        summary: 'Administration, membres, rôles et permissions.',
    },
    '08-webhooks': {
        title: 'Webhooks',
        summary: 'Laisser un outil extérieur poster dans un salon, signature HMAC.',
    },

    // --- Documentation de sécurité (rapport daté du 28/09/2026) ---
    'securite/README': {
        title: 'Sécurité — synthèse et index',
        summary:
            "Vue d'ensemble du chiffrement Synco : tableau récapitulatif de ce qui est chiffré de bout en bout (E2EE) versus chiffré uniquement côté base de données, et inventaire des primitives cryptographiques. À LIRE EN PREMIER pour toute question de sécurité.",
    },
    'securite/01-fondations-cryptographiques': {
        title: 'Sécurité — fondations cryptographiques',
        summary:
            'Paire de clés RSA-4096 de chaque utilisateur, code PIN (schémas legacy/v2/v3), dérivation de la clé maître, verrou anti-force-brute côté serveur, vérification Trust-On-First-Use des clés publiques, perte de données en cas de PIN oublié.',
    },
    'securite/02-chiffrement-base-de-donnees': {
        title: 'Sécurité — chiffrement côté base de données',
        summary:
            "Chiffrement au repos (prisma-field-encryption) : inventaire exhaustif des champs chiffrés et non chiffrés, ce que cette couche protège et ne protège pas, clés maîtres serveur.",
    },
    'securite/03-messages-salons-threads': {
        title: 'Sécurité — messages de salons (Threads)',
        summary:
            "Chiffrement E2EE des messages de salon via la ThreadKey, distribution et redistribution des clés, métadonnées exposées, réactions emoji non chiffrées, absence de rotation de clé.",
    },
    'securite/04-messages-prives-dm': {
        title: 'Sécurité — messages privés (DM)',
        summary:
            "Enveloppe hybride RSA+AES par message, double scellement expéditeur/destinataire, clé de conversation pour les pièces jointes, vérification de changement de clé.",
    },
    'securite/05-fichiers-et-stockage': {
        title: 'Sécurité — fichiers et stockage',
        summary:
            "Double couche de chiffrement des fichiers (serveur + E2EE), WorkspaceKey et FileKey, cas où les fichiers ne sont PAS chiffrés de bout en bout, édition OnlyOffice, filigrane.",
    },
    'securite/06-appels-prives-p2p': {
        title: 'Sécurité — appels privés P2P',
        summary:
            "Appels 1-à-1 en pair-à-pair : accord de clé ECDH éphémère, surchiffrement de chaque trame média, empreinte de vérification, absence de serveur relais TURN.",
    },
    'securite/07-salons-vocaux-livekit': {
        title: 'Sécurité — salons vocaux (LiveKit)',
        summary:
            "Appels de groupe via SFU LiveKit, chiffrement E2EE adossé à la ThreadKey du salon, cas de dégradation (invité sans clé), ce que le serveur voit malgré tout.",
    },
    'securite/08-sessions-ephemeres': {
        title: 'Sécurité — sessions éphémères',
        summary:
            "Conversations sans aucune persistance : canal P2P direct, clés jetables par session, transfert de fichiers chiffré, purge mémoire à la fermeture.",
    },
    'securite/09-taches-agenda-calendrier': {
        title: 'Sécurité — tâches, agenda et calendrier',
        summary:
            "Modules qui ne sont PAS chiffrés de bout en bout et pourquoi, synchronisation Google Calendar et ICS, flux .ics public, protection des jetons OAuth.",
    },
    'securite/10-assistant-ia-et-recherche': {
        title: 'Sécurité — assistant IA et recherche',
        summary:
            "Confidentialité selon le fournisseur d'IA choisi, clé de session IA par organisation, passerelle auto-hébergée, index de recherche sémantique chiffré.",
    },
    'securite/11-webhooks-notifications-presence': {
        title: 'Sécurité — webhooks, notifications, présence',
        summary:
            "Signature HMAC des webhooks, chiffrement ECDH, contenu réellement envoyé aux notifications push Apple/Google, revalidation des sessions WebSocket.",
    },
    'securite/12-perimetre-limites-modele-de-menace': {
        title: 'Sécurité — périmètre, limites et modèle de menace',
        summary:
            "Ce que le chiffrement ne protège PAS, dégradations silencieuses, fuites de métadonnées, absence de rotation de clé, et ce qu'il est honnête d'affirmer publiquement.",
    },
};

/** `securite/05-fichiers-et-stockage` -> `Fichiers et stockage` (repli quand DOC_META ne connaît pas l'id). */
function humanizeId(id: string): string {
    const base = id.split('/').pop() || id;
    const withoutIndex = base.replace(/^\d+-/, '');
    const spaced = withoutIndex.replace(/-/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function pathToId(path: string): string {
    return path.replace(/^.*\/doc\//, '').replace(/\.md$/, '');
}

function sectionOf(id: string): DocSection {
    return id.startsWith('securite/') ? 'securite' : 'guide';
}

/** Catalogue complet, trié : le guide d'abord, la sécurité ensuite, par id. */
export function listDocumentation(): DocEntry[] {
    return Object.keys(docModules)
        .map(pathToId)
        .map((id) => {
            const meta = DOC_META[id];
            return {
                id,
                title: meta?.title ?? humanizeId(id),
                summary: meta?.summary ?? '',
                section: sectionOf(id),
            };
        })
        .sort((a, b) => {
            if (a.section !== b.section) return a.section === 'guide' ? -1 : 1;
            return a.id.localeCompare(b.id);
        });
}

/**
 * Résolution tolérante d'un identifiant fourni par un LLM : un modèle rend
 * volontiers `05-fichiers-et-stockage.md`, `doc/securite/05-fichiers`, ou juste
 * `05-fichiers-et-stockage` là où l'id exact est `securite/05-fichiers-et-stockage`.
 * Échouer sur ces variantes ferait boucler le modèle sur un outil qui « ne marche
 * pas » alors que le chapitre existe.
 */
function resolveDocId(requested: string): string | null {
    const ids = Object.keys(docModules).map(pathToId);

    const cleaned = requested
        .trim()
        .replace(/\.md$/i, '')
        .replace(/^\.?\/?(doc\/)?/i, '')
        .replace(/^\/+/, '');

    if (ids.includes(cleaned)) return cleaned;

    const lower = cleaned.toLowerCase();
    const exactCase = ids.find((id) => id.toLowerCase() === lower);
    if (exactCase) return exactCase;

    // Suffixe : `05-fichiers-et-stockage` -> `securite/05-fichiers-et-stockage`,
    // accepté seulement si UNE seule entrée correspond (sinon c'est ambigu).
    const suffix = ids.filter((id) => id.toLowerCase().endsWith('/' + lower));
    if (suffix.length === 1) return suffix[0]!;

    const partial = ids.filter((id) => id.toLowerCase().includes(lower));
    if (partial.length === 1) return partial[0]!;

    return null;
}

function loaderFor(id: string): (() => Promise<string>) | null {
    const path = Object.keys(docModules).find((p) => pathToId(p) === id);
    return path ? docModules[path]! : null;
}

export interface ReadDocResult {
    id: string;
    title: string;
    section: DocSection;
    content: string;
}

/** Charge un chapitre précis. Lève si l'identifiant est introuvable ou ambigu. */
export async function readDocumentation(docId: string): Promise<ReadDocResult> {
    const id = resolveDocId(docId);

    if (!id) {
        const known = listDocumentation()
            .map((d) => `- ${d.id} : ${d.title}`)
            .join('\n');
        throw new Error(
            `Chapitre de documentation introuvable : "${docId}".\n` +
            `Identifiants valides :\n${known}`
        );
    }

    const loader = loaderFor(id);
    if (!loader) throw new Error(`Chapitre de documentation illisible : "${id}".`);

    const content = await loader();
    const meta = DOC_META[id];

    return {
        id,
        title: meta?.title ?? humanizeId(id),
        section: sectionOf(id),
        content,
    };
}

export interface DocSearchHit {
    docId: string;
    title: string;
    /** Titre de section (`##`) le plus proche au-dessus de l'extrait, pour situer le passage. */
    heading: string;
    excerpt: string;
    occurrences: number;
}

function deaccent(s: string): string {
    // ̀-ͯ = bloc des diacritiques combinants isolés par NFD.
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const EXCERPT_RADIUS = 320;
const MAX_HITS_PER_DOC = 2;

/**
 * Recherche plein texte dans toute la documentation. Charge tous les chapitres
 * (c'est une action explicite de l'IA, pas un coût au démarrage) et renvoie des
 * extraits bornés plutôt que les documents entiers, pour que le résultat reste
 * assimilable par un modèle à petit contexte.
 */
export async function searchDocumentation(query: string, maxResults = 6): Promise<DocSearchHit[]> {
    const needle = deaccent(query.trim());
    if (!needle) return [];

    const entries = listDocumentation();
    const hits: DocSearchHit[] = [];

    for (const entry of entries) {
        const loader = loaderFor(entry.id);
        if (!loader) continue;

        const content = await loader();
        const haystack = deaccent(content);

        let from = 0;
        let found = 0;
        let occurrences = 0;

        // Comptage complet des occurrences (sert au tri), mais on ne matérialise
        // qu'un nombre borné d'extraits par document.
        let countFrom = 0;
        while (true) {
            const at = haystack.indexOf(needle, countFrom);
            if (at === -1) break;
            occurrences++;
            countFrom = at + needle.length;
        }

        while (found < MAX_HITS_PER_DOC) {
            const at = haystack.indexOf(needle, from);
            if (at === -1) break;

            const start = Math.max(0, at - EXCERPT_RADIUS);
            const end = Math.min(content.length, at + needle.length + EXCERPT_RADIUS);

            const before = content.slice(0, at);
            const headings = [...before.matchAll(/^#{1,6} (.+)$/gm)];
            const heading = headings.length ? headings[headings.length - 1]![1]!.trim() : entry.title;

            hits.push({
                docId: entry.id,
                title: entry.title,
                heading,
                excerpt:
                    (start > 0 ? '…' : '') +
                    content.slice(start, end).trim() +
                    (end < content.length ? '…' : ''),
                occurrences,
            });

            found++;
            from = at + needle.length;
        }
    }

    return hits
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, maxResults);
}

/** Noms des outils de documentation exposés à Synco AI. */
export const DOCUMENTATION_TOOL_NAMES = [
    'list_documentation',
    'read_documentation',
    'search_documentation',
] as const;

export function isDocumentationTool(name: string): boolean {
    return (DOCUMENTATION_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Exécute un des trois outils de documentation et renvoie un résultat prêt à
 * être injecté dans la conversation. Factorisé ici parce que OrgAI.vue possède
 * DEUX boucles d'agent distinctes (client pour les providers local/custom,
 * serveur pour gateway/OpenAI/Mistral/Gemini) qui doivent se comporter à
 * l'identique sur ces outils.
 */
export async function runDocumentationTool(name: string, args: any = {}): Promise<any> {
    if (name === 'list_documentation') {
        return {
            chapitres: listDocumentation(),
            note: "Utilise 'read_documentation' avec le champ 'id' d'un chapitre pour en lire le contenu.",
        };
    }

    if (name === 'read_documentation') {
        const docId = typeof args?.docId === 'string' ? args.docId.trim() : '';

        // Sans identifiant, on renvoie l'index plutôt que la documentation
        // entière : le corpus fait ~165 Ko, ce qui saturerait le contexte d'un
        // modèle local. C'est aussi ce que faisait l'ancienne version de cet
        // outil (dump complet), d'où ce garde-fou explicite.
        if (!docId) {
            return {
                chapitres: listDocumentation(),
                note: "Aucun chapitre demandé. Rappelle 'read_documentation' en précisant 'docId', ou utilise 'search_documentation' si tu cherches une information précise.",
            };
        }

        const doc = await readDocumentation(docId);
        return { id: doc.id, titre: doc.title, section: doc.section, contenu: doc.content };
    }

    if (name === 'search_documentation') {
        const query = typeof args?.query === 'string' ? args.query.trim() : '';
        if (!query) throw new Error("Le paramètre 'query' est requis pour search_documentation.");

        const hits = await searchDocumentation(query);
        if (hits.length === 0) {
            return {
                query,
                resultats: [],
                note: "Aucun extrait trouvé. Essaie d'autres mots-clés, ou liste les chapitres avec 'list_documentation'.",
            };
        }

        return {
            query,
            resultats: hits,
            note: "Utilise 'read_documentation' avec un 'docId' ci-dessus pour lire le chapitre complet.",
        };
    }

    throw new Error(`Outil de documentation inconnu : ${name}`);
}
