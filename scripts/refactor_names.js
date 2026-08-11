import fs from 'fs';
import path from 'path';

function getAllVueFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];
    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllVueFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.vue')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });
    return arrayOfFiles;
}

const vueFiles = getAllVueFiles('/home/moi/Documents/GitHub/synco_app/src');
let replacedCount = 0;

const nameRegex = /([a-zA-Z0-9_?\.\[\]]*(?:user|recipient|sender|creator|assignee|author|p|me|m\.user|selectedUser)\??\.name\b)(?!\s*\()/g;

for (const file of vueFiles) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Split content before <script> to only affect <template>
    const scriptIndex = content.indexOf('<script');
    if (scriptIndex === -1) continue; // Skip if no script, or you could process the whole file

    const templatePart = content.substring(0, scriptIndex);
    const restPart = content.substring(scriptIndex);
    
    let newTemplatePart = templatePart.replace(nameRegex, (match, p1) => {
        if (match.includes('$p(')) return match;
        return `$p(${p1})`;
    });

    newTemplatePart = newTemplatePart.replace(/\$p\(\$p\((.*?)\)\)/g, '$p($1)');

    if (templatePart !== newTemplatePart) {
        const newContent = newTemplatePart + restPart;
        fs.writeFileSync(file, newContent, 'utf8');
        replacedCount++;
        console.log(`Replaced in ${file}`);
    }
}

console.log(`Finished processing. Updated ${replacedCount} files.`);
