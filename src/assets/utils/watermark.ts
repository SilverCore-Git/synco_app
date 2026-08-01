import { PDFDocument, rgb, degrees } from 'pdf-lib';

export async function watermarkImageLocal(file: File, text: string): Promise<File> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Canvas context not available'));

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Watermark styling
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.font = 'bold 40px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // We need to draw a repeating pattern.
            // Using a pattern canvas
            const patternCanvas = document.createElement('canvas');
            patternCanvas.width = 350;
            patternCanvas.height = 200;
            const pCtx = patternCanvas.getContext('2d');
            if (pCtx) {
                pCtx.translate(patternCanvas.width / 2, patternCanvas.height / 2);
                pCtx.rotate((-30 * Math.PI) / 180);
                pCtx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                pCtx.font = 'bold 40px sans-serif';
                pCtx.textAlign = 'center';
                pCtx.textBaseline = 'middle';
                pCtx.fillText(text, 0, 0);
            }

            const pattern = ctx.createPattern(patternCanvas, 'repeat');
            if (pattern) {
                ctx.fillStyle = pattern;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            canvas.toBlob(async (blob) => {
                if (!blob) return reject(new Error('Blob creation failed'));
                URL.revokeObjectURL(objectUrl);
                
                // Append binary signature
                const signature = new TextEncoder().encode(`[SYNCO_WM]${text} by Synco[/SYNCO_WM]`);
                const finalBlob = new Blob([blob, signature], { type: file.type });
                
                // Create new file
                let newName = file.name;
                const extIndex = newName.lastIndexOf('.');
                if (extIndex !== -1) {
                    newName = `${newName.substring(0, extIndex)} - filigrané${newName.substring(extIndex)}`;
                } else {
                    newName += ' - filigrané';
                }

                resolve(new File([finalBlob], newName, { type: file.type }));
            }, file.type);
        };

        img.onerror = (e) => reject(e);
        img.src = objectUrl;
    });
}

export async function watermarkPDFLocal(file: File, text: string): Promise<File> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    const pages = pdfDoc.getPages();
    
    for (const page of pages) {
        const { width, height } = page.getSize();
        const fontSize = 35;
        
        const stepX = 250;
        const stepY = 150;
        
        for (let x = -width; x < width * 2; x += stepX) {
            for (let y = -height; y < height * 2; y += stepY) {
                page.drawText(text, {
                    x: x,
                    y: y,
                    size: fontSize,
                    color: rgb(0.5, 0.5, 0.5),
                    opacity: 0.25,
                    rotate: degrees(-30),
                });
            }
        }
    }

    const watermarkedPdfBytes = await pdfDoc.save();
    
    const signature = new TextEncoder().encode(`[SYNCO_WM]${text} by Synco[/SYNCO_WM]`);
    const finalBytes = new Uint8Array(watermarkedPdfBytes.length + signature.length);
    finalBytes.set(watermarkedPdfBytes);
    finalBytes.set(signature, watermarkedPdfBytes.length);

    let newName = file.name;
    const extIndex = newName.lastIndexOf('.');
    if (extIndex !== -1) {
        newName = `${newName.substring(0, extIndex)} - filigrané${newName.substring(extIndex)}`;
    } else {
        newName += ' - filigrané';
    }

    const finalBlob = new Blob([finalBytes], { type: file.type });
    return new File([finalBlob], newName, { type: file.type });
}

export async function verifyWatermarkLocal(file: File): Promise<{ found: boolean, text?: string }> {
    const buffer = await file.arrayBuffer();
    
    // Read the last 1MB max to avoid memory issues on huge files
    const chunkSize = Math.min(buffer.byteLength, 1024 * 1024);
    const tailBuffer = buffer.slice(buffer.byteLength - chunkSize);
    
    const fileStr = new TextDecoder('utf-8').decode(tailBuffer);

    const startIndex = fileStr.lastIndexOf('[SYNCO_WM]');
    const endIndex = fileStr.lastIndexOf('[/SYNCO_WM]');

    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        const watermarkText = fileStr.substring(startIndex + 10, endIndex);
        return { found: true, text: watermarkText };
    }

    return { found: false };
}
