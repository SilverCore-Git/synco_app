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
            description: "Créer un nouveau salon de discussion (textuel sécurisé ou vocal) dans un espace existant, ou à la racine de l'organisation.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Le nom du salon."
                    },
                    type: {
                        type: "string",
                        description: "Le type de salon : 'text' pour un chat textuel, 'voice' pour un salon vocal.",
                        enum: ["text", "voice"]
                    },
                    spaceId: {
                        type: "string",
                        description: "Optionnel. L'ID de l'espace parent. Si omis, le salon sera créé à l'accueil."
                    }
                },
                required: ["name", "type"]
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
    }
];

// Helper to convert to a human readable description for the CPU prompt
export const getToolsSystemPrompt = () => {
    return availableTools.map(t => {
        const params = Object.keys(t.function.parameters.properties).map(k => `${k}: ${(t.function.parameters.properties as any)[k].type}`).join(', ');
        return `- ${t.function.name}(${params}): ${t.function.description}`;
    }).join('\n');
};
