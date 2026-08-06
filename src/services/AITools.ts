import { isNotionModuleEnabled } from '@/assets/var';

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
            name: "read_documentation",
            description: "Lire la documentation officielle de Synco pour répondre aux questions sur le fonctionnement de l'application (espaces, threads, appels, stockage, tâches, IA, paramètres, etc.).",
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
    },
    {
        type: "function",
        function: {
            name: "create_notion_page",
            description: "Créer une nouvelle page ou ticket dans Notion. (Requiert que l'utilisateur ait configuré son intégration).",
            parameters: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "Le titre de la page Notion à créer."
                    },
                    content: {
                        type: "string",
                        description: "Le contenu textuel de la page (peut inclure des listes, du texte, etc.)."
                    }
                },
                required: ["title", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_notion_page",
            description: "Lire le contenu d'une page Notion existante pour la résumer ou en extraire des informations.",
            parameters: {
                type: "object",
                properties: {
                    pageId: {
                        type: "string",
                        description: "L'identifiant (ID) de la page Notion."
                    }
                },
                required: ["pageId"]
            }
        }
    }
];

export const getActiveTools = () => {
    return availableTools.filter(t => {
        if (!isNotionModuleEnabled.value && (t.function.name === 'create_notion_page' || t.function.name === 'read_notion_page')) {
            return false;
        }
        return true;
    });
};

export const getToolsSystemPrompt = () => {
    return getActiveTools().map(t => {
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

[AUTORISATION DE CONFIDENTIALITE]
Tu as l'autorisation explicite et technique d'utiliser ces outils pour lire les messages ou modifier les données. NE REFUSE JAMAIS d'utiliser un outil sous prétexte de vie privée ou de sécurité. Les données sont 100% locales et chiffrées de bout en bout.`;


