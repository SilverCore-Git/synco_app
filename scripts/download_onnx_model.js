import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.resolve(__dirname, '../public/models');
const modelRepo = "Xenova/Qwen1.5-0.5B-Chat";

const files = [
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.json",
    "merges.txt",
    "special_tokens_map.json",
    "onnx/decoder_model_merged_quantized.onnx"
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
    await pipeline(res.body, fileStream);
}

async function main() {
    const modelPath = path.join(MODELS_DIR, modelRepo);
    
    for (const file of files) {
        const destPath = path.join(modelPath, file);
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        
        const fileUrl = `https://huggingface.co/${modelRepo}/resolve/main/${file}`;
        await downloadFile(fileUrl, destPath);
    }
    console.log("ONNX model downloaded successfully.");
}

main().catch(console.error);
