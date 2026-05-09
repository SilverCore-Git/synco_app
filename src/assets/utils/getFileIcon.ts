import type { StoredFile } from "@/types/types";

export const getFileInfo = (file: StoredFile) => {

    const name = file.originalName.toLowerCase();
    const mime = file.mimeType.toLowerCase();

    if (mime.startsWith('image/')) 
        return { icon: 'bi-image', color: 'text-(--primary)/60' };
    
    if (mime.includes('pdf')) 
        return { icon: 'bi-file-earmark-pdf', color: 'text-red-400' };
    
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('tar')) 
        return { icon: 'bi-file-earmark-zip', color: 'text-yellow-500' };
    
    if (mime.includes('application/x-msdownload') || name.endsWith('.exe') || name.endsWith('.msi') || name.endsWith('.rpm') || name.endsWith('.dmg') || name.endsWith('.appimage') || name.endsWith('deb')) 
        return { icon: 'bi-terminal-fill', color: 'text-blue-400' };
    
    if (mime.startsWith('text/') || mime.includes('javascript') || mime.includes('json') || mime.includes('typescript')) 
        return { icon: 'bi-file-earmark-code', color: 'text-indigo-400' };
    
    if (mime.includes('word') || mime.includes('officedocument.wordprocessingml')) 
        return { icon: 'bi-file-earmark-word', color: 'text-blue-500' };
    
    if (mime.includes('excel') || mime.includes('spreadsheetml') || mime.includes('csv')) 
        return { icon: 'bi-file-earmark-excel', color: 'text-green-500' };
    
    if (mime.includes('powerpoint') || mime.includes('presentationml')) 
        return { icon: 'bi-file-earmark-ppt', color: 'text-orange-500' };
    
    if (mime.startsWith('video/')) 
        return { icon: 'bi-play-btn', color: 'text-purple-400' };
    
    if (mime.startsWith('audio/')) 
        return { icon: 'bi-music-note-beamed', color: 'text-pink-400' };

    return { icon: 'bi-file-earmark', color: 'text-(--text)/40' };

};