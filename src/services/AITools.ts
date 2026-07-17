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
    }
];

// Helper to convert to a human readable description for the CPU prompt
export const getToolsSystemPrompt = () => {
    return availableTools.map(t => {
        const params = Object.keys(t.function.parameters.properties).map(k => `${k}: ${(t.function.parameters.properties as any)[k].type}`).join(', ');
        return `- ${t.function.name}(${params}): ${t.function.description}`;
    }).join('\n');
};
