// Formats de fichiers texte que le gestionnaire de fichiers sait créer.
//
// La liste est volontairement limitée au texte UTF-8 : un fichier créé ici doit
// pouvoir être relu ET réédité dans FileViewer.vue. Deux contraintes en
// découlent :
//   - le mimeType doit satisfaire son `isTextFile` (text/*, application/json,
//     application/xml, application/javascript, application/x-sh, ou *sql*) ;
//   - l'extension doit être reconnue par son `getMonacoLanguage`, sinon
//     l'éditeur tombe en texte brut (acceptable, mais moins utile).

export type TextFileGroup = 'Texte' | 'Données' | 'Web' | 'Code';

export interface TextFileFormat {
    /** Extension sans le point, en minuscules. */
    ext: string;
    label: string;
    mimeType: string;
    icon: string;
}

export const TEXT_FILE_FORMATS: TextFileFormat[] = [
    // Texte
    { ext: 'txt',  label: 'Texte brut',   mimeType: 'text/plain',        icon: 'bi-file-earmark-text' },
    { ext: 'md',   label: 'Markdown',     mimeType: 'text/markdown',     icon: 'bi-markdown' },
    { ext: 'log',  label: 'Journal',      mimeType: 'text/plain',        icon: 'bi-file-earmark-text' },
    // Données
    { ext: 'csv',  label: 'CSV',          mimeType: 'text/csv',          icon: 'bi-filetype-csv' },
    { ext: 'json', label: 'JSON',         mimeType: 'application/json',  icon: 'bi-filetype-json' },
    { ext: 'xml',  label: 'XML',          mimeType: 'application/xml',   icon: 'bi-filetype-xml' },
    { ext: 'yml',  label: 'YAML',         mimeType: 'text/yaml',         icon: 'bi-file-earmark-code' },
    { ext: 'ini',  label: 'INI',          mimeType: 'text/plain',        icon: 'bi-file-earmark-code' },
    { ext: 'sql',  label: 'SQL',          mimeType: 'text/x-sql',        icon: 'bi-filetype-sql' },
    // Web
    { ext: 'html', label: 'HTML',         mimeType: 'text/html',         icon: 'bi-filetype-html' },
    { ext: 'css',  label: 'CSS',          mimeType: 'text/css',          icon: 'bi-filetype-css' },
    { ext: 'scss', label: 'SCSS',         mimeType: 'text/x-scss',       icon: 'bi-filetype-scss' },
    { ext: 'js',   label: 'JavaScript',   mimeType: 'text/javascript',   icon: 'bi-filetype-js' },
    { ext: 'ts',   label: 'TypeScript',   mimeType: 'text/typescript',   icon: 'bi-filetype-tsx' },
    { ext: 'vue',  label: 'Vue',          mimeType: 'text/plain',        icon: 'bi-file-earmark-code' },
    // Code
    { ext: 'py',   label: 'Python',       mimeType: 'text/x-python',     icon: 'bi-filetype-py' },
    { ext: 'sh',   label: 'Shell',        mimeType: 'text/x-sh',         icon: 'bi-terminal' },
    { ext: 'java', label: 'Java',         mimeType: 'text/x-java-source',icon: 'bi-filetype-java' },
    { ext: 'c',    label: 'C',            mimeType: 'text/x-c',          icon: 'bi-file-earmark-code' },
    { ext: 'cpp',  label: 'C++',          mimeType: 'text/x-c++src',     icon: 'bi-file-earmark-code' },
    { ext: 'cs',   label: 'C#',           mimeType: 'text/x-csharp',     icon: 'bi-filetype-cs' },
    { ext: 'php',  label: 'PHP',          mimeType: 'text/x-php',        icon: 'bi-filetype-php' },
    { ext: 'go',   label: 'Go',           mimeType: 'text/x-go',         icon: 'bi-file-earmark-code' },
    { ext: 'rs',   label: 'Rust',         mimeType: 'text/x-rust',       icon: 'bi-file-earmark-code' },
    { ext: 'rb',   label: 'Ruby',         mimeType: 'text/x-ruby',       icon: 'bi-filetype-rb' },
];

// Regroupement pour l'affichage (optgroup) — l'ordre du tableau ci-dessus fait foi.
export const TEXT_FILE_GROUPS: { group: TextFileGroup; formats: TextFileFormat[] }[] = [
    { group: 'Texte',   formats: ['txt', 'md', 'log'] },
    { group: 'Données', formats: ['csv', 'json', 'xml', 'yml', 'ini', 'sql'] },
    { group: 'Web',     formats: ['html', 'css', 'scss', 'js', 'ts', 'vue'] },
    { group: 'Code',    formats: ['py', 'sh', 'java', 'c', 'cpp', 'cs', 'php', 'go', 'rs', 'rb'] },
].map(({ group, formats }) => ({
    group: group as TextFileGroup,
    formats: formats.map(ext => TEXT_FILE_FORMATS.find(f => f.ext === ext)!),
}));

export const findTextFormat = (ext: string): TextFileFormat | undefined => {
    return TEXT_FILE_FORMATS.find(f => f.ext === ext.replace(/^\./, '').toLowerCase());
};

export const extensionOf = (fileName: string): string => {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : '';
};

export const SUPPORTED_EXTENSIONS_LABEL = TEXT_FILE_FORMATS.map(f => `.${f.ext}`).join(', ');

// Construit le nom final : "notes" + txt -> "notes.txt", et ne double pas
// l'extension si l'utilisateur (ou l'IA) l'a déjà écrite.
export const buildFileName = (baseName: string, ext: string): string => {
    const clean = baseName.trim().replace(/[\/\\:*?"<>|]+/g, '-');
    const extension = ext.replace(/^\./, '').toLowerCase();
    return extensionOf(clean) === extension ? clean : `${clean}.${extension}`;
};
