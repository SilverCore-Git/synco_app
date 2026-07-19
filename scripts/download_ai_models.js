import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.resolve(__dirname, '../public/models');
const WASM_DIR = path.resolve(MODELS_DIR, 'wasm');

const models = [
    {
        id: "SmolLM2-135M-Instruct-q0f16-MLC",
        hfRepo: "mlc-ai/SmolLM2-135M-Instruct-q0f16-MLC",
        wasmUrl: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/SmolLM2-135M-Instruct-q0f16_cs1k-webgpu.wasm",
        wasmName: "SmolLM2-135M-Instruct-q0f16_cs1k-webgpu.wasm"
    },
    {
        id: "Qwen2-1.5B-Instruct-q4f16_1-MLC",
        hfRepo: "mlc-ai/Qwen2-1.5B-Instruct-q4f16_1-MLC",
        wasmUrl: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
        wasmName: "Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm"
    },
    {
        id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
        hfRepo: "mlc-ai/Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
        wasmUrl: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Mistral-7B-Instruct-v0.3-q4f16_1_cs1k-webgpu.wasm",
        wasmName: "Mistral-7B-Instruct-v0.3-q4f16_1_cs1k-webgpu.wasm"
    }
];

async function downloadFile(url, dest) {
    if (fs.existsSync(dest)) {
        console.log(`[SKIP] Already exists: ${dest}`);
        return;
    }
    
    console.log(`[DOWNLOAD] ${url} -> ${dest}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    
    const fileStream = fs.createWriteStream(dest);
    // Use Web Streams API to Node.js stream
    await pipeline(res.body, fileStream);
}

async function fetchHfTree(repo) {
    const res = await fetch(`https://huggingface.co/api/models/${repo}/tree/main`);
    if (!res.ok) throw new Error(`Failed to fetch tree for ${repo}: ${res.statusText}`);
    return res.json();
}

async function main() {
    if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });
    if (!fs.existsSync(WASM_DIR)) fs.mkdirSync(WASM_DIR, { recursive: true });

    for (const model of models) {
        console.log(`\n=== Processing Model: ${model.id} ===`);
        const modelPath = path.join(MODELS_DIR, model.id, 'resolve', 'main');
        if (!fs.existsSync(modelPath)) fs.mkdirSync(modelPath, { recursive: true });

        // 1. Download HuggingFace files
        console.log("Fetching repository tree...");
        const files = await fetchHfTree(model.hfRepo);
        
        for (const file of files) {
            if (file.type !== 'file') continue;
            // Skip large git objects if any, usually HF tree only returns repo files
            if (file.path.startsWith('.')) continue; // skip .gitattributes etc.
            if (file.path.endsWith('.md')) continue; // skip README
            
            const fileUrl = `https://huggingface.co/${model.hfRepo}/resolve/main/${file.path}`;
            const destPath = path.join(modelPath, file.path);
            await downloadFile(fileUrl, destPath);
        }

        // 2. Download WASM library
        console.log("\nDownloading WASM library...");
        const wasmDest = path.join(WASM_DIR, model.wasmName);
        await downloadFile(model.wasmUrl, wasmDest);

        console.log(`=== Done: ${model.id} ===\n`);
    }
}

main().catch(console.error);
