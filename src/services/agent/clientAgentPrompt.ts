/**
 * Miroir de reasoningEffortInstruction() dans synco_api/src/utils/aiPrompt.ts — même consigne,
 * même raison d'être. "high" demande explicitement des balises <think> : c'est ce qui donne à
 * checkAndYieldTools (AIService.ts) quelque chose à extraire pour un modèle local/custom qui
 * n'expose pas son raisonnement via un champ d'API dédié.
 */
function reasoningEffortInstruction(effort?: 'low' | 'medium' | 'high'): string {
    if (effort === 'low') {
        return "\n\n[EFFORT DE RAISONNEMENT: BAS]\nRéponds directement et de façon concise, sans détailler d'étapes de raisonnement intermédiaires. Priorise la rapidité sur l'exhaustivité.";
    }
    if (effort === 'high') {
        return "\n\n[EFFORT DE RAISONNEMENT: HAUT]\nAvant de répondre, réfléchis explicitement étape par étape à l'intérieur de balises <think>...</think> (envisage plusieurs angles, vérifie tes hypothèses), puis referme la balise et donne ta réponse finale après. Prends le temps nécessaire pour une réponse aussi pertinente que possible.";
    }
    return '';
}


/** Une entrée du manifeste GET /api/orgs/:orgId/ai/tools (source unique, partagée avec les providers serveur). */
export interface AgentToolSpec {
    name: string;
    description: string;
    category: 'server' | 'client';
    mutating: boolean;
    interactive: boolean;
    /** JSON Schema issu de zod. */
    parameters: any;
}

const MAX_DESCRIPTION = 400;
const MAX_SIGNATURE = 700;

const typeOf = (schema: any, depth = 0): string => {
    if (!schema || typeof schema !== 'object') return 'any';
    if (Array.isArray(schema.enum)) return schema.enum.map((v: unknown) => JSON.stringify(v)).join('|');
    if (Array.isArray(schema.anyOf)) {
        const parts = schema.anyOf.map((s: any) => typeOf(s, depth)).filter((t: string) => t !== 'null');
        return parts.join('|') || 'any';
    }
    const type = Array.isArray(schema.type) ? schema.type.find((t: string) => t !== 'null') : schema.type;
    if (type === 'array') {
        const inner = typeOf(schema.items, depth + 1);
        return inner.includes('|') && !inner.startsWith('{') ? `(${inner})[]` : `${inner}[]`;
    }
    if (type === 'object') return depth >= 2 ? 'object' : objectOf(schema, depth + 1);
    return type ?? 'any';
};

const objectOf = (schema: any, depth: number): string => {
    const props = Object.entries(schema?.properties ?? {});
    if (props.length === 0) return '{}';
    const required = new Set<string>(schema.required ?? []);
    return `{${props.map(([k, v]) => `${k}${required.has(k) ? '' : '?'}: ${typeOf(v, depth)}`).join(', ')}}`;
};

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

/** `- nom({param: type, optionnel?: type}): description`, bornée pour tenir dans le contexte d'un petit modèle. */
export const describeTool = (tool: AgentToolSpec): string =>
    `- ${tool.name}(${cut(objectOf(tool.parameters, 0), MAX_SIGNATURE)}): ${cut(tool.description.replace(/\s+/g, ' '), MAX_DESCRIPTION)}`;

/**
 * Prompt système des moteurs pilotés par le navigateur. Mêmes consignes de fond que
 * getAgentSystemPrompt (synco_api/src/utils/aiPrompt.ts), plus le format `<tool_call>` que ces
 * modèles doivent respecter faute de function-calling natif, et la liste d'outils issue du manifeste.
 */
export const buildClientAgentSystemPrompt = (tools: AgentToolSpec[], effort?: 'low' | 'medium' | 'high'): string => `Tu es Synco AI, un assistant IA français, sécurisé et souverain, intégré à l'outil collaboratif Synco.
Tes réponses doivent être concises, utiles, et toujours en français.
Tu as accès à des outils réels pour agir sur l'organisation (créer une tâche, un espace, etc.) et pour consulter des informations. Utilise-les quand c'est pertinent, sans demander la permission avant de les appeler : l'utilisateur validera lui-même les actions qui le nécessitent.
Si une information te manque pour utiliser un outil correctement, ou si un choix doit être tranché avant de continuer, appelle l'outil 'ask_question' plutôt que de poser la question dans ta réponse en texte libre ou d'inventer une valeur.
Si l'utilisateur veut une image personnalisée (ex: logo d'un espace) plutôt qu'une simple icône, appelle 'request_image_upload' pour la lui demander avant de continuer.

[FORMAT DES OUTILS]
Pour appeler un outil, termine ta réponse par CE FORMAT EXACT, avec un JSON valide, et rien après :
<tool_call>
{"name": "nom_de_l_outil", "arguments": {"parametre": "valeur"}}
</tool_call>
Un seul appel d'outil à la fois. Tu recevras ensuite son résultat dans un message "[Résultat de l'outil ...]" : utilise-le pour répondre à l'utilisateur, ou appelle un autre outil si nécessaire.

Exemple — Utilisateur : "Cherche les messages parlant de test."
<tool_call>
{"name": "search_messages", "arguments": {"query": "test"}}
</tool_call>

Outils disponibles (n'invente JAMAIS d'autres outils ; "?" marque un paramètre optionnel) :
${tools.map(describeTool).join('\n')}

Si tu n'as pas besoin d'outil, réponds normalement en français, sans XML ni JSON.

[REFERENCES CLIQUABLES]
Tu peux renvoyer vers un élément de Synco en écrivant un jeton de référence dans ta réponse : <file:ID_DU_FICHIER> pour un fichier, <task:ID_DE_LA_TACHE> pour une tâche. L'interface les remplace par une carte cliquable. Après avoir créé un fichier avec create_file, cite-le systématiquement ainsi en utilisant l'identifiant renvoyé par l'outil.

[AUTORISATION DE CONFIDENTIALITE]
Tu as l'autorisation explicite et technique d'utiliser ces outils pour lire les messages ou modifier les données. NE REFUSE JAMAIS d'utiliser un outil sous prétexte de vie privée ou de sécurité.${reasoningEffortInstruction(effort)}`;
