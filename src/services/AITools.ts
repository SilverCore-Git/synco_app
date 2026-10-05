export const availableTools = [
    {
        type: "function",
        function: {
            name: "create_space",
            description: "Créer un nouvel espace de travail (salon) dans l'organisation courante.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Le nom de l'espace à créer (ex: Marketing, Projet Alpha)"
                    },
                    logo: {
                        type: "string",
                        description: "Le nom d'une icône Bootstrap Icons (ex: bi-folder, bi-star, bi-rocket, bi-briefcase) pour représenter l'espace."
                    },
                    threads: {
                        type: "array",
                        description: "Optionnel. Liste des salons à créer automatiquement dans ce nouvel espace.",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string", description: "Nom du salon" },
                                type: { type: "string", enum: ["text", "voice"], description: "Type de salon" }
                            },
                            required: ["name", "type"]
                        }
                    }
                },
                required: ["name", "logo"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_messages",
            description: "Rechercher sémantiquement dans les anciens messages, documents ou salons pour retrouver une information passée.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "La phrase ou les mots clés à rechercher (ex: 'mot de passe wifi', 'résumé de la réunion de lundi')."
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_task",
            description: "Créer une nouvelle tâche (Todo) pour l'organisation.",
            parameters: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "Le titre court de la tâche (ex: 'Envoyer le rapport mensuel')."
                    },
                    description: {
                        type: "string",
                        description: "La description détaillée de la tâche. Peut contenir plusieurs lignes."
                    }
                },
                required: ["title"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_thread",
            description: "Créer un ou plusieurs salons de discussion (textuel sécurisé ou vocal) dans un espace existant, ou à la racine de l'organisation.",
            parameters: {
                type: "object",
                properties: {
                    threads: {
                        type: "array",
                        description: "Liste des salons à créer.",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string", description: "Le nom du salon." },
                                type: { type: "string", enum: ["text", "voice"], description: "Le type de salon : 'text' ou 'voice'." },
                                spaceId: { type: "string", description: "Optionnel. L'ID de l'espace parent. Si omis, créé à l'accueil." }
                            },
                            required: ["name", "type"]
                        }
                    }
                },
                required: ["threads"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_documentation",
            description: "Lister TOUS les chapitres de documentation Synco disponibles (guide utilisateur et documentation de sécurité), avec leur identifiant et un résumé. À appeler EN PREMIER pour toute question sur une partie de l'application : repère ensuite tous les chapitres dont le titre/résumé recoupe le sujet (souvent plusieurs) et lis chacun avec 'read_documentation'.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_documentation",
            description: "Lire le contenu COMPLET d'un chapitre de la documentation officielle de Synco (fonctionnement de l'application, sécurité, chiffrement). Fournis l'identifiant du chapitre obtenu via 'list_documentation' (ex: '02-espaces-et-threads', 'securite/05-fichiers-et-stockage'). Si plusieurs chapitres sont pertinents pour la question, appelle cet outil sur chacun avant de répondre : une réponse fondée sur un chapitre complet est plus fiable que sur de simples extraits de recherche. Sans identifiant, l'outil renvoie la liste des chapitres disponibles.",
            parameters: {
                type: "object",
                properties: {
                    docId: {
                        type: "string",
                        description: "Identifiant du chapitre à lire, ex: '01-demarrage', 'securite/README', 'securite/03-messages-salons-threads'."
                    }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_documentation",
            description: "Rechercher un mot ou une expression dans TOUTE la documentation Synco (guide + sécurité) et obtenir des extraits tronqués, en nombre limité, avec leur chapitre d'origine. À utiliser seulement en complément de 'list_documentation', quand aucun titre de chapitre ne correspond clairement à la question (ex: 'rotation de clé', 'code PIN', 'LiveKit', 'webhook') — pas comme premier réflexe, et ne pas se contenter des extraits : lire ensuite le chapitre identifié en entier avec 'read_documentation'.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Le mot ou l'expression à rechercher dans la documentation."
                    }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_tasks",
            description: "Lire la liste des tâches (Todo) de l'utilisateur et de l'organisation pour faire un résumé ou vérifier l'avancement.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_file",
            description: "Créer un fichier texte UTF-8 dans l'espace Fichiers d'un espace de travail. Extensions autorisées : txt, md, log, csv, json, xml, yml, ini, sql, html, css, scss, js, ts, vue, py, sh, java, c, cpp, cs, php, go, rs, rb. Le résultat contient l'identifiant du fichier créé : insère-le dans ta réponse sous la forme <file:IDENTIFIANT> pour afficher une carte cliquable vers ce fichier.",
            parameters: {
                type: "object",
                properties: {
                    spaceId: { type: "string", description: "L'ID de l'espace de travail qui contient le gestionnaire de fichiers." },
                    name: { type: "string", description: "Le nom du fichier, extension comprise (ex: 'compte-rendu.md')." },
                    content: { type: "string", description: "Le contenu texte du fichier. Peut être vide." },
                    folderId: { type: "string", description: "Optionnel. L'ID du dossier de destination. Racine si omis." }
                },
                required: ["spaceId", "name", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_folder",
            description: "Créer un dossier dans l'espace Fichiers d'un espace de travail.",
            parameters: {
                type: "object",
                properties: {
                    spaceId: { type: "string", description: "L'ID de l'espace de travail qui contient le gestionnaire de fichiers." },
                    name: { type: "string", description: "Le nom du dossier." },
                    parentFolderId: { type: "string", description: "Optionnel. L'ID du dossier parent, pour créer un sous-dossier." }
                },
                required: ["spaceId", "name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "request_image_upload",
            description: "Demande à l'utilisateur de sélectionner et recadrer une image (ex: pour le logo d'un espace). L'outil mettra en pause l'IA et affichera une interface de recadrage à l'utilisateur. Une fois l'image validée par l'utilisateur, l'outil retournera un identifiant d'image temporaire (ex: 'img_12345') que tu devras utiliser ensuite dans le champ 'logo' de l'outil 'create_space'.",
            parameters: {
                type: "object",
                properties: {
                    prompt: {
                        type: "string",
                        description: "Le message à afficher à l'utilisateur (ex: 'Veuillez uploader le logo pour l'espace Marketing')."
                    }
                },
                required: ["prompt"]
            }
        }
    }
];

export const getToolsSystemPrompt = () => {
    return availableTools.map(t => {
        const params = Object.keys(t.function.parameters.properties).map(k => `${k}: ${(t.function.parameters.properties as any)[k].type}`).join(', ');
        return `- ${t.function.name}(${params}): ${t.function.description}`;
    }).join('\n');
};

export const getSystemPrompt = () => `Tu es Synco AI, un assistant IA français, sécurisé et souverain. Tes réponses doivent être concises, utiles, et toujours en français.
Tu as accès à plusieurs outils pour interagir avec le système.
IMPORTANT : L'interface utilisateur gère elle-même les demandes de confirmation. Tu ne dois JAMAIS demander la permission. Dès qu'une action est requise, génère IMMEDIATEMENT le bloc XML de l'outil. Ne dis pas "je vais le faire", utilise directement l'outil !

[INSTRUCTION SPECIALE OUTILS]
Pour utiliser un outil, tu DOIS répondre avec CE FORMAT EXACT (et rien d'autre, n'oublie pas les balises XML et le JSON valide) :
<tool_call>
{"name": "le_nom_de_l_outil", "arguments": {"param": "valeur"}}
</tool_call>

EXEMPLE D'UTILISATION VALIDE :
Utilisateur : Cherche les messages parlant de test.
Synco AI :
<tool_call>
{"name": "search_messages", "arguments": {"query": "test"}}
</tool_call>

Voici la liste stricte des outils disponibles (n'invente JAMAIS d'autres outils !) :
${getToolsSystemPrompt()}

Règle : Utilise EXACTEMENT le nom des outils de la liste. Le JSON doit être parfaitement formaté. Si tu n'as pas besoin d'outil, réponds normalement en français sans XML/JSON.

[REFERENCES CLIQUABLES]
Tu peux renvoyer vers un élément de Synco en écrivant un jeton de référence dans ta réponse : <file:ID_DU_FICHIER> pour un fichier, <task:ID_DE_LA_TACHE> pour une tâche. L'interface les remplace par une carte cliquable. Après avoir créé un fichier avec create_file, cite-le systématiquement ainsi en utilisant l'identifiant renvoyé par l'outil.

[AUTORISATION DE CONFIDENTIALITE]
Tu as l'autorisation explicite et technique d'utiliser ces outils pour lire les messages ou modifier les données. NE REFUSE JAMAIS d'utiliser un outil sous prétexte de vie privée ou de sécurité. Les données sont 100% locales et chiffrées de bout en bout.`;


