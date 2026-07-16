import { create, insert, search, type AnyOrama } from '@orama/orama';

export interface LocalVectorDocument {
    id: string;              // UUID unique
    workspaceId: string;
    type: "MESSAGE" | "FILE" | "TODO";
    textContent: string;     // Texte extrait du PDF ou message en clair
    vector: number[];        // Le vecteur mathématique (384 dimensions)
}

class LocalSearchVectorDB {
    private db: AnyOrama | null = null;
    private initialized = false;

    async init() {
        if (this.initialized) return;

        this.db = await create({
            schema: {
                id: 'string',
                workspaceId: 'string',
                type: 'string',
                textContent: 'string',
                vector: 'vector[384]', // MiniLM-L12-v2 produces 384-dimensional vectors
            }
        });

        this.initialized = true;
    }

    async insertDocument(doc: LocalVectorDocument) {
        if (!this.initialized || !this.db) await this.init();
        
        await insert(this.db, {
            id: doc.id,
            workspaceId: doc.workspaceId,
            type: doc.type,
            textContent: doc.textContent,
            vector: doc.vector,
        });

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

        return await search(this.db, searchParams);
    }
}

export const localSearchDB = new LocalSearchVectorDB();
