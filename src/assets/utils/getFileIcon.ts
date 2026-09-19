import type { StoredFile } from "@/types/types";

export const getFileInfo = (file: StoredFile) => {

    const name = file.originalName.toLowerCase();
    const mime = file.mimeType.toLowerCase();

    // IMAGES
    if (mime.startsWith('image/')) 
        return { icon: 'bi-image', color: 'text-(--primary)/60' };
    
    // VIDÉOS
    if (
        mime.startsWith('video/') || 
        name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.mov') || 
        name.endsWith('.avi') || name.endsWith('.webm') || name.endsWith('.wmv') || 
        name.endsWith('.flv') || name.endsWith('.m4v') || name.endsWith('.3gp')
    ) {
        return { icon: 'bi-file-earmark-play', color: 'text-purple-500' };
    }
    
    // FICHIERS 3D & CAO
    if (
        mime.includes('model/') || mime.includes('x-glbf') || mime.includes('gltf') ||
        name.endsWith('.gltf') || name.endsWith('.glb') || 
        name.endsWith('.obj') || name.endsWith('.stl') || 
        name.endsWith('.fbx') || name.endsWith('.blend') || 
        name.endsWith('.dae') || name.endsWith('.3ds') || 
        name.endsWith('.ply') || name.endsWith('.step') || name.endsWith('.stp') ||
        name.endsWith('.iges') || name.endsWith('.igs') || name.endsWith('.dwg') || name.endsWith('.dxf')
    ) {
        return { icon: 'bi-box-seam', color: 'text-cyan-500' };
    }

    // AUDIOS
    if (mime.startsWith('audio/') || name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.flac') || name.endsWith('.ogg') || name.endsWith('.m4a')) 
        return { icon: 'bi-music-note-beamed', color: 'text-pink-400' };
    
    // DOCUMENTS & SUITE OFFICE
    if (mime.includes('pdf')) 
        return { icon: 'bi-file-earmark-pdf', color: 'text-red-400' };
    
    if (mime.includes('word') || mime.includes('officedocument.wordprocessingml') || name.endsWith('.odt')) 
        return { icon: 'bi-file-earmark-word', color: 'text-blue-500' };
    
    if (mime.includes('excel') || mime.includes('spreadsheetml') || mime.includes('csv') || name.endsWith('.ods')) 
        return { icon: 'bi-file-earmark-excel', color: 'text-green-500' };
    
    if (mime.includes('powerpoint') || mime.includes('presentationml') || name.endsWith('.odp')) 
        return { icon: 'bi-file-earmark-ppt', color: 'text-orange-500' };

    // ARCHIVES & COMPRESSIONS
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('tar') || mime.includes('gzip')) 
        return { icon: 'bi-file-earmark-zip', color: 'text-yellow-500' };
    
    // EXÉCUTABLES & INSTALLATEURS
    if (mime.includes('application/x-msdownload') || name.endsWith('.exe') || name.endsWith('.msi') || name.endsWith('.rpm') || name.endsWith('.dmg') || name.endsWith('.appimage') || name.endsWith('.deb')) 
        return { icon: 'bi-terminal-fill', color: 'text-blue-400' };
    
    // MARKDOWN
    if (name.endsWith('.md') || name.endsWith('.markdown'))
        return { icon: 'bi-markdown', color: 'text-sky-400' };

    // CODE, SCRIPTS & TEXTE
    if (mime.startsWith('text/') || mime.includes('javascript') || mime.includes('json') || mime.includes('typescript') || name.endsWith('.sh') || name.endsWith('.bash') || name.endsWith('.yaml') || name.endsWith('.yml'))
        return { icon: 'bi-file-earmark-code', color: 'text-indigo-400' };

    // DESIGN VECTORIEL / MAQUETTAGE (Figma, Illustrator, SVG autonome)
    if (name.endsWith('.ai') || name.endsWith('.fig') || name.endsWith('.xd') || name.endsWith('.psd'))
        return { icon: 'bi-vector-pen', color: 'text-amber-500' };

    // BASES DE DONNÉES / BACKUPS
    if (name.endsWith('.sql') || name.endsWith('.sqlite') || name.endsWith('.db'))
        return { icon: 'bi-database', color: 'text-emerald-600' };

    // PAR DÉFAUT
    return { icon: 'bi-file-earmark', color: 'text-(--text2)' };

};