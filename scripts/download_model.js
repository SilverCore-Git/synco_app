import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BASE_URL = `https://huggingface.co/${MODEL_NAME}/resolve/main/`;
const DEST_DIR = path.join(__dirname, '../public/models', MODEL_NAME);

const files = [
    'config.json',
    'tokenizer_config.json',
    'tokenizer.json',
    'special_tokens_map.json',
    'vocab.txt',
    'onnx/model_quantized.onnx' // default for web
];

const downloadFile = (file) => {
    return new Promise((resolve, reject) => {
        const url = BASE_URL + file;
        const dest = path.join(DEST_DIR, file);
        
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        
        const fileStream = fs.createWriteStream(dest);
        console.log(`Downloading ${file}...`);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirect
                https.get(response.headers.location, (res2) => {
                    res2.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        console.log(`Downloaded ${file}`);
                        resolve();
                    });
                }).on('error', reject);
            } else {
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`Downloaded ${file}`);
                    resolve();
                });
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

const run = async () => {
    console.log(`Starting local download of ${MODEL_NAME}`);
    fs.mkdirSync(DEST_DIR, { recursive: true });
    
    for (const file of files) {
        try {
            await downloadFile(file);
        } catch (e) {
            console.error(`Error downloading ${file}:`, e);
        }
    }
    console.log("Model downloaded successfully into public/models/");
};

run();
