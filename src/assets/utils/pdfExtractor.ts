import * as pdfjsLib from 'pdfjs-dist';

// Configurer le worker pour pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export async function extractTextFromPDF(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        // Extraction de texte seulement : aucun besoin d'évaluer du JS, des
        // polices compilées ou du scripting PDF sur un fichier potentiellement
        // piégé déposé par un tiers (audit FX7).
        const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
            //isEvalSupported: false,
            enableXfa: false,
            disableFontFace: true,
        }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + ' ';
        }
        
        return fullText.trim();
    } catch (e) {
        console.error("[PDF Extractor] Error extracting text from PDF:", e);
        return "";
    }
}
