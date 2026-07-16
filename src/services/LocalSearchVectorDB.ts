import { create, insert, search, type AnyOrama } from '@orama/orama';

export interface LocalVectorDocument {
    id: string;              // UUID unique
    workspaceId: string;
    type: "MESSAGE" | "FILE" | "TODO";
    textContent: string;     // Texte extrait du PDF ou message en clair
    vector: number[];        // Le vecteur mathématique (384 dimensions)
    metadata?: any;          // Pour stocker threadId, etc.
}

class LocalSearchVectorDB {
    private db: AnyOrama | null = null;
    private initialized = false;

    async init() {
        if (this.initialized) return;

        this.db = await create({
            schema: {
                id: 'string',
                workspaceId: 'enum', // 'enum' empêche la tokenisation (match exact)
                type: 'enum',
                textContent: 'string',
                vector: 'vector[384]', // MiniLM-L12-v2 produces 384-dimensional vectors
                metadata: 'string'
            }
        });

        this.initialized = true;
    }

    async insertDocument(doc: LocalVectorDocument) {
        if (!this.initialized || !this.db) await this.init();
        
        await insert(this.db!, {
            id: doc.id,
            workspaceId: doc.workspaceId,
            type: doc.type,
            textContent: doc.textContent,
            vector: doc.vector,
            metadata: doc.metadata ? JSON.stringify(doc.metadata) : undefined
        });
        console.log("[LocalSearchVectorDB] Inserted doc:", doc.id, "workspace:", doc.workspaceId);

    }

    async searchByVector(vector: number[], workspaceId?: string, limit = 10) {
        if (!this.initialized || !this.db) await this.init();

        const searchParams: any = {
            mode: 'vector',
            vector: {
                value: vector,
                property: 'vector',
            },
            limit,
        };

        if (workspaceId) {
            searchParams.where = { workspaceId };
        }

        console.log("[LocalSearchVectorDB] searching with params:", searchParams);
        const searchResult = await search(this.db!, searchParams);
        console.log("[LocalSearchVectorDB] raw hits:", searchResult.hits.length);

        // Parser le metadata de chaque hit
        const results = searchResult.hits.map(hit => {
            const document = hit.document as any;
            if (document.metadata) {
                try {
                    document.metadata = JSON.parse(document.metadata);
                } catch (e) {}
            }
            return {
                ...document,
                score: hit.score
            };
        });

        return results;
    }
}

export const localSearchDB = new LocalSearchVectorDB();
