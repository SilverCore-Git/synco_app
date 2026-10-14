// Prépare un miroir des modèles IA locaux (servi via VITE_LOCAL_AI_MODELS_URL).
// Doit rester aligné sur src/services/localLLM/catalog.ts.
// Usage : node scripts/download_ai_models.js [f16|f32] [dossier_de_sortie]
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const precisionArg = process.argv[2];
const MODELS_DIR = path.resolve(process.argv[3] || path.resolve(__dirname, '../public/models'));
const WASM_DIR = path.resolve(MODELS_DIR, 'wasm');
const WASM_BASE = 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base';

const families = [
    'Mistral-7B-Instruct-v0.3-{p}_1-MLC',
    'Ministral-3-3B-Instruct-2512-BF16-{p}_1-MLC',
    'SmolLM2-1.7B-Instruct-{p}_1-MLC',
];
const precisions = precisionArg ? [precisionArg] : ['f16', 'f32'];

const models = families.flatMap(f => precisions.map(p => {
    const id = f.replace('{p}', `q4${p}`);
    return { id, hfRepo: `mlc-ai/${id}`, wasmName: `${id.replace(/-MLC$/, '')}_cs1k-webgpu.wasm` };
}));

async function downloadFile(url, dest) {
    if (fs.existsSync(dest)) {
        console.log(`[SKIP] ${path.basename(dest)}`);
        return;
    }
    console.log(`[DOWNLOAD] ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Écriture atomique : un fichier interrompu ne doit pas être pris pour complet au prochain lancement.
    const tmp = `${dest}.part`;
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
}

async function fetchHfTree(repo) {
    const res = await fetch(`https://huggingface.co/api/models/${repo}/tree/main`);
    if (!res.ok) throw new Error(`Failed to fetch tree for ${repo}: ${res.statusText}`);
    return res.json();
}

async function main() {
    fs.mkdirSync(WASM_DIR, { recursive: true });

    for (const model of models) {
        console.log(`\n=== ${model.id} ===`);
        const modelPath = path.join(MODELS_DIR, model.id, 'resolve', 'main');
        const files = (await fetchHfTree(model.hfRepo))
            .filter(f => f.type === 'file' && !f.path.startsWith('.') && !f.path.endsWith('.md'));

        // 4 téléchargements simultanés par modèle.
        const queue = [...files];
        await Promise.all(Array.from({ length: 4 }, async () => {
            for (let f = queue.shift(); f; f = queue.shift()) {
                await downloadFile(`https://huggingface.co/${model.hfRepo}/resolve/main/${f.path}`, path.join(modelPath, f.path));
            }
        }));

        await downloadFile(`${WASM_BASE}/${model.wasmName}`, path.join(WASM_DIR, model.wasmName));
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
