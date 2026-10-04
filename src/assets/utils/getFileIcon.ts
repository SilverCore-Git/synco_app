/**
 * Icône (Bootstrap Icons) et couleur d'un fichier, d'après son nom puis son
 * type MIME.
 *
 * Ordre de résolution :
 *   1. nom de fichier exact (Dockerfile, Makefile, .gitignore…) ;
 *   2. double extension (.tar.gz, .d.ts…) puis extension ;
 *   3. préfixe ou fragment du type MIME (image/, video/, …/zip…) ;
 *   4. icône générique.
 *
 * Le type MIME vient du client et n'est qu'indicatif (cf. synco_api,
 * sanitizeMimeType) : l'extension, plus précise, passe en premier.
 *
 * Pour ajouter un format : l'ajouter à la liste `ext` du groupe concerné,
 * ou créer un groupe. Une même extension ne doit figurer qu'une fois (le
 * test getFileIcon.test.ts le vérifie, ainsi que l'existence des icônes).
 */

export interface FileIconInfo {
    icon: string;
    color: string;
}

interface IconGroup extends FileIconInfo {
    /** Extensions, sans le point, en minuscules. */
    ext: string[];
}

// ---------------------------------------------------------------------------
// Groupes par domaine. Les icônes « filetype-* » propres à un format priment
// sur l'icône de leur domaine (cf. SPECIFIC plus bas).
// ---------------------------------------------------------------------------

const GROUPS: IconGroup[] = [
    // Images ----------------------------------------------------------------
    { icon: 'bi-file-earmark-image', color: 'text-(--primary)/60', ext: ['jpeg', 'jfif', 'webp', 'avif', 'ico', 'icns', 'tif', 'jxl', 'jp2', 'heif', 'qoi', 'tga', 'dds', 'exr', 'hdr', 'pcx', 'ppm', 'pgm', 'pbm'] },
    // Photos brutes d'appareils (RAW constructeurs)
    { icon: 'bi-camera', color: 'text-(--primary)/60', ext: ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'erf', 'kdc', 'mrw', 'iiq'] },
    // Dessin vectoriel et maquettage
    { icon: 'bi-vector-pen', color: 'text-amber-500', ext: ['eps', 'cdr', 'fig', 'xd', 'sketch', 'afdesign', 'svgz', 'emf', 'wmf', 'vsd', 'gvdesign'] },
    // Retouche et peinture numérique
    { icon: 'bi-palette', color: 'text-amber-500', ext: ['psb', 'xcf', 'kra', 'afphoto', 'procreate', 'clip', 'sai', 'ora', 'pdn', 'indd', 'idml', 'afpub'] },

    // Vidéo -----------------------------------------------------------------
    { icon: 'bi-file-earmark-play', color: 'text-purple-500', ext: ['mkv', 'avi', 'webm', 'wmv', 'flv', 'm4v', '3gp', '3g2', 'mpg', 'mpeg', 'm2ts', 'mts', 'vob', 'ogv', 'f4v', 'rm', 'rmvb', 'asf', 'mxf', 'divx', 'hevc', 'h264', 'h265', 'y4m'] },
    // Projets de montage vidéo
    { icon: 'bi-film', color: 'text-purple-500', ext: ['prproj', 'aep', 'drp', 'fcpbundle', 'fcpxml', 'veg', 'kdenlive', 'mlt', 'camproj', 'wlmp', 'imovieproj', 'resolve'] },
    // Sous-titres
    { icon: 'bi-badge-cc', color: 'text-purple-400', ext: ['srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv', 'ttml', 'dfxp', 'lrc', 'idx'] },

    // Audio -----------------------------------------------------------------
    { icon: 'bi-file-earmark-music', color: 'text-pink-400', ext: ['flac', 'ogg', 'oga', 'opus', 'm4a', 'wma', 'aiff', 'aif', 'alac', 'ape', 'amr', 'au', 'caf', 'dsf', 'dff', 'mka', 'mpc', 'wv', 'weba', 'spx', 'ra'] },
    // Partitions et MIDI
    { icon: 'bi-music-note-list', color: 'text-pink-400', ext: ['mid', 'midi', 'kar', 'mscz', 'mscx', 'musicxml', 'mxl', 'sib', 'gp', 'gp5', 'gp4', 'ly'] },
    // Projets de MAO (DAW) et banques de sons
    { icon: 'bi-sliders', color: 'text-pink-500', ext: ['als', 'alp', 'flp', 'logicx', 'ptx', 'ptf', 'rpp', 'cpr', 'song', 'band', 'aup', 'aup3', 'sesx', 'bwproject', 'reason', 'sf2', 'sfz', 'nki', 'fxp', 'vst', 'vst3'] },

    // 3D --------------------------------------------------------------------
    { icon: 'bi-box', color: 'text-cyan-500', ext: ['gltf', 'glb', 'obj', 'mtl', 'fbx', 'blend', 'blend1', 'dae', '3ds', 'max', 'ma', 'mb', 'c4d', 'lwo', 'lws', 'usd', 'usda', 'usdc', 'usdz', 'abc', 'ply', 'x3d', 'wrl', 'vrml', 'hip', 'hipnc', 'zpr', 'ztl', 'spp', 'sbsar', 'sbs', 'vox', 'pmx', 'mmd', 'x', 'b3d', 'off', 'splat'] },
    // CAO, BIM, mécanique
    { icon: 'bi-rulers', color: 'text-cyan-600', ext: ['step', 'stp', 'iges', 'igs', 'dwg', 'dxf', 'dwf', 'sldprt', 'sldasm', 'slddrw', 'f3d', 'f3z', 'ipt', 'iam', 'idw', 'catpart', 'catproduct', 'prt', 'x_t', 'x_b', 'sat', 'jt', 'skp', 'rvt', 'rfa', 'ifc', 'pln', '3dm', 'fcstd', 'scad', 'brd', 'sch', 'kicad_pcb', 'kicad_sch', 'gbr', 'dsn'] },
    // Impression 3D et usinage
    { icon: 'bi-printer', color: 'text-cyan-500', ext: ['stl', '3mf', 'amf', 'gcode', 'gco', 'ngc', 'bgcode', 'ctb', 'photon', 'sl1', 'cura', 'lys', 'chitubox'] },
    // Réalité virtuelle / augmentée
    { icon: 'bi-badge-vr', color: 'text-cyan-500', ext: ['reality', 'rcproject', 'arobject', 'vrm'] },

    // Systèmes d'exploitation, images disque et machines virtuelles ----------
    { icon: 'bi-disc', color: 'text-slate-400', ext: ['iso', 'img', 'dmg', 'toast', 'nrg', 'cue', 'mdf', 'mds', 'ccd', 'cdi', 'udf', 'wim', 'esd', 'swm', 'sparseimage', 'sparsebundle'] },
    { icon: 'bi-hdd-stack', color: 'text-slate-400', ext: ['vhd', 'vhdx', 'vmdk', 'vdi', 'qcow', 'qcow2', 'ova', 'ovf', 'vbox', 'vmx', 'vmsd', 'hdd', 'pvm', 'utm', 'raw-img'] },
    // Micrologiciels, ROM et images de cartes
    { icon: 'bi-motherboard', color: 'text-slate-400', ext: ['bin', 'hex', 'fw', 'rom', 'uf2', 'dfu', 'efi', 'cap', 'elf', 'srec', 'ihex', 'mbn', 'tar.md5'] },
    // Jeux et émulation
    { icon: 'bi-controller', color: 'text-violet-400', ext: ['nes', 'sfc', 'smc', 'gb', 'gbc', 'gba', 'n64', 'z64', 'v64', 'nds', 'cia', 'nsp', 'xci', 'wbfs', 'wad', 'gcm', 'rvz', 'cso', 'pbp', 'chd', 'sav', 'srm', 'unitypackage', 'uasset', 'umap', 'pak', 'vpk', 'bsp', 'love', 'rpgproject'] },

    // Exécutables, installateurs et paquets --------------------------------
    { icon: 'bi-windows', color: 'text-blue-400', ext: ['msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'com', 'scr', 'cpl', 'sys', 'drv', 'ocx', 'lnk'] },
    { icon: 'bi-apple', color: 'text-slate-300', ext: ['pkg', 'mpkg', 'ipa', 'app', 'xip', 'kext', 'plist', 'mobileconfig', 'shortcut', 'workflow'] },
    { icon: 'bi-android2', color: 'text-green-500', ext: ['apk', 'aab', 'apks', 'xapk', 'apkm', 'obb', 'dex', 'odex'] },
    { icon: 'bi-ubuntu', color: 'text-orange-500', ext: ['deb', 'rpm', 'appimage', 'snap', 'flatpak', 'flatpakref', 'run', 'pacman', 'ebuild', 'pkg.tar.zst', 'pkg.tar.xz'] },
    // Bibliothèques et code compilé
    { icon: 'bi-cpu', color: 'text-blue-400', ext: ['dll', 'so', 'dylib', 'lib', 'a', 'o', 'ko', 'wasm', 'class', 'jar', 'war', 'ear', 'pyc', 'pyo', 'pyd', 'beam', 'nupkg', 'gem', 'whl', 'egg', 'crx', 'xpi', 'vsix'] },

    // Archives ----------------------------------------------------------------
    { icon: 'bi-file-earmark-zip', color: 'text-yellow-500', ext: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz', 'tbz2', 'xz', 'txz', 'zst', 'tzst', 'lz', 'lz4', 'lzma', 'lzo', 'z', 'cab', 'arj', 'ace', 'zipx', 'sit', 'sitx', 'cpio', 'shar', 'br', 'zpaq', 'pea', 'alz', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst', 'part', 'r00', '001'] },

    // Documents ---------------------------------------------------------------
    { icon: 'bi-file-earmark-pdf', color: 'text-red-400', ext: ['xps', 'oxps'] },
    { icon: 'bi-file-earmark-word', color: 'text-blue-500', ext: ['dot', 'dotx', 'docm', 'dotm', 'odt', 'ott', 'rtf', 'pages', 'wpd', 'wps', 'abw', 'gdoc', 'hwp', 'fodt'] },
    { icon: 'bi-file-earmark-excel', color: 'text-green-500', ext: ['xlsm', 'xlsb', 'xlt', 'xltx', 'xltm', 'ods', 'ots', 'numbers', 'gsheet', 'fods', 'et', 'dif', 'slk'] },
    { icon: 'bi-file-earmark-ppt', color: 'text-orange-500', ext: ['pps', 'ppsx', 'pptm', 'pot', 'potx', 'odp', 'otp', 'gslides', 'fodp', 'dps'] },
    { icon: 'bi-file-earmark-text', color: 'text-(--text2)', ext: ['text', 'nfo', 'diz', 'me', '1st', 'utf8', 'wri'] },
    { icon: 'bi-book', color: 'text-amber-600', ext: ['epub', 'mobi', 'azw', 'azw3', 'kfx', 'fb2', 'djvu', 'djv', 'cbz', 'cbr', 'cb7', 'cbt', 'lit', 'ibooks', 'lrf', 'pdb-book'] },
    { icon: 'bi-journal-text', color: 'text-teal-500', ext: ['tex', 'ltx', 'sty', 'cls', 'bib', 'bst', 'rst', 'adoc', 'asciidoc', 'org', 'textile', 'wiki', 'mediawiki', 'pod', 'man', 'texi', 'typ', 'qmd', 'rmd'] },
    { icon: 'bi-journal-code', color: 'text-orange-400', ext: ['ipynb', 'nb', 'mlx', 'livemd', 'zpln', 'dib'] },
    { icon: 'bi-journal-bookmark', color: 'text-(--text2)', ext: ['log', 'out', 'err', 'trace', 'dmp', 'mdmp', 'crash', 'etl', 'evtx', 'har'] },
    { icon: 'bi-diagram-3', color: 'text-sky-500', ext: ['drawio', 'dio', 'vsdx', 'vsdm', 'puml', 'plantuml', 'mermaid', 'bpmn', 'graphml', 'gv', 'excalidraw', 'tldr', 'xmind', 'mm', 'opml', 'lucid', 'gliffy'] },

    // Code source -------------------------------------------------------------
    { icon: 'bi-file-earmark-code', color: 'text-indigo-400', ext: [
        // Web
        'htm', 'xhtml', 'mjs', 'cjs', 'ts', 'cts', 'vue', 'svelte', 'astro', 'less', 'styl', 'pcss', 'postcss', 'ejs', 'hbs', 'handlebars', 'mustache', 'pug', 'jade', 'njk', 'twig', 'liquid', 'erb', 'jsp', 'asp', 'aspx', 'cshtml', 'razor', 'blade.php', 'graphql', 'gql', 'wgsl', 'webmanifest',
        // Systèmes et compilés
        'c', 'h', 'cc', 'cpp', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'h++', 'ino', 'm', 'rs', 'go', 'zig', 'nim', 'v', 'd', 'odin', 'cr', 'pas', 'pp', 'dpr', 'f', 'f90', 'f95', 'for', 'ada', 'adb', 'ads', 'cob', 'cbl', 's', 'asm', 'nasm', 'ld', 'cu', 'cuh', 'cl', 'metal', 'glsl', 'vert', 'frag', 'geom', 'comp', 'hlsl', 'shader', 'usf', 'ush', 'mojo',
        // JVM, .NET, mobile
        'kt', 'kts', 'scala', 'sc', 'groovy', 'gradle', 'clj', 'cljs', 'cljc', 'edn', 'vb', 'fs', 'fsx', 'fsi', 'xaml', 'csproj', 'vbproj', 'fsproj', 'sln', 'swift', 'dart',         // Scripts
        'pyw', 'pyi', 'pyx', 'rbw', 'rake', 'gemspec', 'pl', 'pm', 't', 'lua', 'luau', 'tcl', 'r', 'jl', 'ex', 'exs', 'erl', 'hrl', 'hs', 'lhs', 'elm', 'ml', 'mli', 'ocaml', 're', 'rei', 'purs', 'lisp', 'lsp', 'el', 'scm', 'ss', 'rkt', 'fish', 'zsh', 'bash', 'ksh', 'csh', 'tcsh', 'ps1', 'psm1', 'psd1', 'bat', 'cmd', 'vbs', 'ahk', 'au3', 'applescript', 'scpt', 'awk', 'sed', 'coffee', 'ls', 'hx', 'gd', 'gdscript', 'sol', 'move', 'cairo', 'vy', 'prolog', 'pro', 'sas', 'stata', 'do', 'matlab', 'octave', 'wl', 'apl', 'bqn', 'raku', 'rakumod', 'p6', 'vim', 'nix', 'dhall', 'star', 'bzl', 'cmake', 'mk', 'mak', 'ninja', 'meson', 'just', 'tf', 'tfvars', 'hcl', 'bicep', 'jsonnet', 'libsonnet', 'rego', 'proto', 'thrift', 'avdl', 'capnp', 'fbs', 'smithy', 'wit', 'wat', 'll', 'mlir', 'vhdl', 'sv', 'svh', 'verilog', 'tla', 'lean', 'agda', 'idr', 'coq', 'thy', 'smt2',
        // Données structurées et diffs
        'jsonc', 'json5', 'jsonl', 'ndjson', 'xsd', 'xsl', 'xslt', 'dtd', 'wsdl', 'rss', 'atom', 'diff', 'patch', 'rej', 'http', 'rest', 'bru',
    ] },

    // Configuration -----------------------------------------------------------
    { icon: 'bi-gear', color: 'text-slate-400', ext: ['ini', 'cfg', 'conf', 'config', 'toml', 'properties', 'prefs', 'env', 'envrc', 'editorconfig', 'npmrc', 'yarnrc', 'babelrc', 'eslintrc', 'prettierrc', 'stylelintrc', 'browserslistrc', 'nvmrc', 'tool-versions', 'service', 'socket', 'timer', 'mount', 'desktop', 'reg', 'inf', 'manifest', 'lock', 'sum', 'mod', 'csproj.user', 'iml', 'code-workspace', 'sublime-project', 'kdl', 'nginx', 'htaccess', 'htpasswd', 'tmux', 'zshrc', 'bashrc', 'profile', 'gitconfig', 'gitattributes', 'gitmodules', 'dockerignore', 'hgignore', 'npmignore'] },

    // Données et bases de données --------------------------------------------
    { icon: 'bi-database', color: 'text-emerald-600', ext: ['sqlite', 'sqlite3', 'db', 'db3', 's3db', 'sl3', 'mdb', 'accdb', 'frm', 'ibd', 'myd', 'myi', 'dbf', 'fdb', 'gdb', 'ldf', 'ndf', 'bak', 'dump', 'pgdump', 'rdb', 'aof', 'realm', 'duckdb', 'kdb', 'lmdb', 'ldb', 'neo4j', 'cypher', 'prisma', 'dbml', 'psql'] },
    { icon: 'bi-table', color: 'text-emerald-500', ext: ['tsv', 'tab', 'parquet', 'avro', 'orc', 'feather', 'arrow', 'ipc', 'h5', 'hdf5', 'hdf', 'he5', 'nc', 'nc4', 'cdf', 'mat', 'npy', 'npz', 'pkl', 'pickle', 'joblib', 'rds', 'rdata', 'rda', 'dta', 'sas7bdat', 'xpt', 'fits', 'fit', 'fts', 'arff', 'libsvm', 'dat', 'data', 'zarr', 'tfrecord', 'lance'] },
    // Modèles d'IA et apprentissage automatique
    { icon: 'bi-robot', color: 'text-fuchsia-500', ext: ['safetensors', 'gguf', 'ggml', 'onnx', 'pt', 'pth', 'ckpt', 'tflite', 'pb', 'mlmodel', 'mlpackage', 'keras', 'caffemodel', 'mar', 'engine', 'trt', 'lora', 'nemo', 'llamafile'] },
    // Graphiques et statistiques
    { icon: 'bi-graph-up', color: 'text-emerald-500', ext: ['pbix', 'pbit', 'twb', 'twbx', 'qvw', 'qvf', 'sps', 'spv', 'jmp', 'mtw', 'opj', 'opju', 'pzfx', 'jasp', 'omv'] },
    // Sciences, santé et chimie
    { icon: 'bi-file-earmark-medical', color: 'text-rose-400', ext: ['dcm', 'dicom', 'nii', 'nrrd', 'mha', 'mhd', 'edf', 'bdf', 'gdf', 'fcs', 'pdb', 'mol', 'mol2', 'sdf', 'cif', 'mmcif', 'xyz', 'cml', 'smi', 'fasta', 'fa', 'fastq', 'fq', 'gbk', 'bam', 'sam', 'cram', 'bed', 'gff', 'gtf', 'wig', 'bigwig'] },

    // Polices -------------------------------------------------------------------
    { icon: 'bi-fonts', color: 'text-stone-400', ext: ['woff2', 'eot', 'pfb', 'pfm', 'afm', 'fon', 'fnt', 'ttc', 'otc', 'dfont', 'pcf', 'sfd', 'glyphs', 'ufo', 'vfc', 'fea'] },

    // Sécurité : clés, certificats, coffres --------------------------------------
    { icon: 'bi-shield-lock', color: 'text-yellow-600', ext: ['pem', 'crt', 'cer', 'der', 'csr', 'p7b', 'p7c', 'p7s', 'p8', 'p10', 'p12', 'pfx', 'jks', 'keystore', 'truststore', 'bks', 'pub', 'ppk', 'gpg', 'pgp', 'asc', 'sig', 'kdbx', '1pux', 'opvault', 'agilekeychain', 'age', 'jwk', 'jwks', 'ovpn', 'mobileprovision', 'provisionprofile', 'cert', 'spc', 'crl', 'ca-bundle', 'enc', 'aes', 'axx', 'hc', 'tc', 'luks', 'vault'] },

    // Géographie et cartographie ------------------------------------------------
    { icon: 'bi-geo-alt', color: 'text-lime-500', ext: ['gpx', 'kml', 'kmz', 'geojson', 'topojson', 'shp', 'shx', 'prj', 'qgz', 'qgs', 'mbtiles', 'pmtiles', 'osm', 'pbf', 'gpkg', 'tcx', 'igc', 'nmea', 'mxd', 'aprx', 'mif', 'dem', 'las', 'laz', 'e57', 'pts', 'ecw', 'sid', 'jgw'] },

    // Communication, agenda, contacts, liens ------------------------------------
    { icon: 'bi-envelope', color: 'text-sky-400', ext: ['eml', 'msg', 'mbox', 'mbx', 'emlx', 'pst', 'ost', 'olm', 'oft', 'p7m', 'tnef', 'dat-winmail'] },
    { icon: 'bi-calendar-event', color: 'text-sky-400', ext: ['ics', 'ical', 'icalendar', 'ifb', 'vcs'] },
    { icon: 'bi-person-vcard', color: 'text-sky-400', ext: ['vcf', 'vcard', 'ldif', 'contact', 'abbu'] },
    { icon: 'bi-link-45deg', color: 'text-sky-400', ext: ['url', 'webloc', 'website', 'inetloc'] },
    { icon: 'bi-magnet', color: 'text-red-500', ext: ['torrent', 'magnet', 'metalink', 'meta4', 'nzb'] },
    { icon: 'bi-globe', color: 'text-sky-500', ext: ['mht', 'mhtml', 'webarchive', 'maff', 'warc', 'wacz'] },

    // Traduction et internationalisation ----------------------------------------
    { icon: 'bi-translate', color: 'text-teal-400', ext: ['po', 'mo', 'xliff', 'xlf', 'tmx', 'tbx', 'arb', 'strings', 'stringsdict', 'resx', 'resw', 'qm', 'ftl', 'lang', 'mo-gettext'] },

    // Sauvegardes et fichiers temporaires --------------------------------------
    { icon: 'bi-archive', color: 'text-stone-400', ext: ['old', 'orig', 'tmp', 'temp', 'swp', 'swo', 'bkp', 'backup', 'bk', 'crdownload', 'download', 'partial', 'ds_store', 'thumbs', 'icloud'] },
];

/**
 * Formats qui ont leur propre icône dans Bootstrap Icons (filetype-*) : plus
 * parlante que l'icône générique de leur domaine.
 */
const PDF: FileIconInfo = { icon: 'bi-filetype-pdf', color: 'text-red-400' };
const MARKDOWN: FileIconInfo = { icon: 'bi-markdown', color: 'text-sky-400' };
const JSON_ICON: FileIconInfo = { icon: 'bi-filetype-json', color: 'text-yellow-500' };
const XML: FileIconInfo = { icon: 'bi-filetype-xml', color: 'text-orange-400' };
const HTML: FileIconInfo = { icon: 'bi-filetype-html', color: 'text-orange-500' };

const SPECIFIC: Record<string, FileIconInfo> = {
    // Images
    png: { icon: 'bi-filetype-png', color: 'text-(--primary)/60' },
    jpg: { icon: 'bi-filetype-jpg', color: 'text-(--primary)/60' },
    gif: { icon: 'bi-filetype-gif', color: 'text-(--primary)/60' },
    bmp: { icon: 'bi-filetype-bmp', color: 'text-(--primary)/60' },
    tiff: { icon: 'bi-filetype-tiff', color: 'text-(--primary)/60' },
    heic: { icon: 'bi-filetype-heic', color: 'text-(--primary)/60' },
    raw: { icon: 'bi-filetype-raw', color: 'text-(--primary)/60' },
    svg: { icon: 'bi-filetype-svg', color: 'text-amber-500' },
    ai: { icon: 'bi-filetype-ai', color: 'text-amber-500' },
    psd: { icon: 'bi-filetype-psd', color: 'text-sky-500' },
    // Audio / vidéo
    mp3: { icon: 'bi-filetype-mp3', color: 'text-pink-400' },
    wav: { icon: 'bi-filetype-wav', color: 'text-pink-400' },
    aac: { icon: 'bi-filetype-aac', color: 'text-pink-400' },
    m4p: { icon: 'bi-filetype-m4p', color: 'text-pink-400' },
    mp4: { icon: 'bi-filetype-mp4', color: 'text-purple-500' },
    mov: { icon: 'bi-filetype-mov', color: 'text-purple-500' },
    // Documents
    pdf: PDF,
    doc: { icon: 'bi-filetype-doc', color: 'text-blue-500' },
    docx: { icon: 'bi-filetype-docx', color: 'text-blue-500' },
    xls: { icon: 'bi-filetype-xls', color: 'text-green-500' },
    xlsx: { icon: 'bi-filetype-xlsx', color: 'text-green-500' },
    csv: { icon: 'bi-filetype-csv', color: 'text-green-500' },
    ppt: { icon: 'bi-filetype-ppt', color: 'text-orange-500' },
    pptx: { icon: 'bi-filetype-pptx', color: 'text-orange-500' },
    txt: { icon: 'bi-filetype-txt', color: 'text-(--text2)' },
    md: MARKDOWN,
    markdown: MARKDOWN,
    mdx: { icon: 'bi-filetype-mdx', color: 'text-sky-400' },
    // Code
    js: { icon: 'bi-filetype-js', color: 'text-yellow-400' },
    jsx: { icon: 'bi-filetype-jsx', color: 'text-sky-400' },
    tsx: { icon: 'bi-filetype-tsx', color: 'text-sky-500' },
    py: { icon: 'bi-filetype-py', color: 'text-blue-400' },
    java: { icon: 'bi-filetype-java', color: 'text-orange-500' },
    php: { icon: 'bi-filetype-php', color: 'text-indigo-400' },
    rb: { icon: 'bi-filetype-rb', color: 'text-red-500' },
    cs: { icon: 'bi-filetype-cs', color: 'text-violet-500' },
    html: HTML,
    css: { icon: 'bi-filetype-css', color: 'text-blue-500' },
    scss: { icon: 'bi-filetype-scss', color: 'text-pink-500' },
    sass: { icon: 'bi-filetype-sass', color: 'text-pink-500' },
    json: JSON_ICON,
    xml: XML,
    yml: { icon: 'bi-filetype-yml', color: 'text-rose-400' },
    yaml: { icon: 'bi-filetype-yml', color: 'text-rose-400' },
    sql: { icon: 'bi-filetype-sql', color: 'text-emerald-600' },
    sh: { icon: 'bi-filetype-sh', color: 'text-green-400' },
    // Polices
    ttf: { icon: 'bi-filetype-ttf', color: 'text-stone-400' },
    otf: { icon: 'bi-filetype-otf', color: 'text-stone-400' },
    woff: { icon: 'bi-filetype-woff', color: 'text-stone-400' },
    // Exécutables
    exe: { icon: 'bi-filetype-exe', color: 'text-blue-400' },
    key: { icon: 'bi-filetype-key', color: 'text-yellow-600' },
};

/** Noms de fichiers reconnus tels quels (sans extension significative). */
const BY_NAME: Record<string, FileIconInfo> = {
    dockerfile: { icon: 'bi-box-seam', color: 'text-sky-500' },
    containerfile: { icon: 'bi-box-seam', color: 'text-sky-500' },
    'docker-compose.yml': { icon: 'bi-boxes', color: 'text-sky-500' },
    'docker-compose.yaml': { icon: 'bi-boxes', color: 'text-sky-500' },
    'compose.yml': { icon: 'bi-boxes', color: 'text-sky-500' },
    'compose.yaml': { icon: 'bi-boxes', color: 'text-sky-500' },
    makefile: { icon: 'bi-hammer', color: 'text-orange-400' },
    gnumakefile: { icon: 'bi-hammer', color: 'text-orange-400' },
    cmakelists: { icon: 'bi-hammer', color: 'text-orange-400' },
    'cmakelists.txt': { icon: 'bi-hammer', color: 'text-orange-400' },
    justfile: { icon: 'bi-hammer', color: 'text-orange-400' },
    rakefile: { icon: 'bi-hammer', color: 'text-red-500' },
    gemfile: { icon: 'bi-gem', color: 'text-red-500' },
    procfile: { icon: 'bi-terminal', color: 'text-violet-400' },
    vagrantfile: { icon: 'bi-hdd-stack', color: 'text-sky-500' },
    jenkinsfile: { icon: 'bi-gear-wide-connected', color: 'text-slate-400' },
    '.gitignore': { icon: 'bi-git', color: 'text-orange-500' },
    '.gitattributes': { icon: 'bi-git', color: 'text-orange-500' },
    '.gitmodules': { icon: 'bi-git', color: 'text-orange-500' },
    '.gitkeep': { icon: 'bi-git', color: 'text-orange-500' },
    license: { icon: 'bi-patch-check', color: 'text-amber-500' },
    'license.md': { icon: 'bi-patch-check', color: 'text-amber-500' },
    'license.txt': { icon: 'bi-patch-check', color: 'text-amber-500' },
    licence: { icon: 'bi-patch-check', color: 'text-amber-500' },
    copying: { icon: 'bi-patch-check', color: 'text-amber-500' },
    readme: { icon: 'bi-info-circle', color: 'text-sky-400' },
    'readme.md': { icon: 'bi-info-circle', color: 'text-sky-400' },
    'readme.txt': { icon: 'bi-info-circle', color: 'text-sky-400' },
    changelog: { icon: 'bi-clock-history', color: 'text-sky-400' },
    'changelog.md': { icon: 'bi-clock-history', color: 'text-sky-400' },
    'package.json': { icon: 'bi-box2', color: 'text-red-500' },
    'package-lock.json': { icon: 'bi-lock', color: 'text-slate-400' },
    'bun.lock': { icon: 'bi-lock', color: 'text-slate-400' },
    'yarn.lock': { icon: 'bi-lock', color: 'text-slate-400' },
    'pnpm-lock.yaml': { icon: 'bi-lock', color: 'text-slate-400' },
    'cargo.toml': { icon: 'bi-box2', color: 'text-orange-600' },
    'cargo.lock': { icon: 'bi-lock', color: 'text-slate-400' },
    'go.mod': { icon: 'bi-box2', color: 'text-cyan-500' },
    'requirements.txt': { icon: 'bi-box2', color: 'text-blue-400' },
    'pyproject.toml': { icon: 'bi-box2', color: 'text-blue-400' },
    '.env': { icon: 'bi-key', color: 'text-yellow-600' },
    '.env.local': { icon: 'bi-key', color: 'text-yellow-600' },
    '.env.example': { icon: 'bi-key', color: 'text-yellow-600' },
    '.htaccess': { icon: 'bi-gear', color: 'text-slate-400' },
    id_rsa: { icon: 'bi-key-fill', color: 'text-yellow-600' },
    id_ed25519: { icon: 'bi-key-fill', color: 'text-yellow-600' },
    authorized_keys: { icon: 'bi-key-fill', color: 'text-yellow-600' },
    known_hosts: { icon: 'bi-key', color: 'text-yellow-600' },
};

/** Repli sur le type MIME, du plus précis au plus général. */
const BY_MIME: [test: (mime: string) => boolean, info: FileIconInfo][] = [
    [(m) => m === 'application/pdf', PDF],
    [(m) => m.includes('wordprocessingml') || m.includes('msword') || m.includes('opendocument.text'), { icon: 'bi-file-earmark-word', color: 'text-blue-500' }],
    [(m) => m.includes('spreadsheetml') || m.includes('ms-excel') || m.includes('opendocument.spreadsheet') || m === 'text/csv', { icon: 'bi-file-earmark-excel', color: 'text-green-500' }],
    [(m) => m.includes('presentationml') || m.includes('ms-powerpoint') || m.includes('opendocument.presentation'), { icon: 'bi-file-earmark-ppt', color: 'text-orange-500' }],
    [(m) => m.startsWith('image/'), { icon: 'bi-file-earmark-image', color: 'text-(--primary)/60' }],
    [(m) => m.startsWith('video/'), { icon: 'bi-file-earmark-play', color: 'text-purple-500' }],
    [(m) => m.startsWith('audio/'), { icon: 'bi-file-earmark-music', color: 'text-pink-400' }],
    [(m) => m.startsWith('model/') || m.includes('gltf'), { icon: 'bi-box', color: 'text-cyan-500' }],
    [(m) => m.startsWith('font/') || m.includes('font-'), { icon: 'bi-fonts', color: 'text-stone-400' }],
    [(m) => /zip|rar|7z|x-tar|gzip|bzip|x-xz|zstd|compress|archive/.test(m), { icon: 'bi-file-earmark-zip', color: 'text-yellow-500' }],
    [(m) => m.includes('iso9660') || m.includes('diskimage') || m.includes('apple-diskimage'), { icon: 'bi-disc', color: 'text-slate-400' }],
    [(m) => m.includes('msdownload') || m.includes('ms-installer') || m.includes('executable') || m.includes('x-msi'), { icon: 'bi-windows', color: 'text-blue-400' }],
    [(m) => m.includes('android.package'), { icon: 'bi-android2', color: 'text-green-500' }],
    [(m) => m.includes('debian') || m.includes('x-rpm') || m.includes('appimage'), { icon: 'bi-ubuntu', color: 'text-orange-500' }],
    [(m) => m.includes('epub') || m.includes('mobipocket') || m.includes('djvu'), { icon: 'bi-book', color: 'text-amber-600' }],
    [(m) => m.includes('sqlite') || m.includes('x-sql') || m.includes('database'), { icon: 'bi-database', color: 'text-emerald-600' }],
    [(m) => m.includes('x-pem') || m.includes('x509') || m.includes('pkcs') || m.includes('pgp'), { icon: 'bi-shield-lock', color: 'text-yellow-600' }],
    [(m) => m === 'message/rfc822' || m.includes('ms-outlook'), { icon: 'bi-envelope', color: 'text-sky-400' }],
    [(m) => m === 'text/calendar', { icon: 'bi-calendar-event', color: 'text-sky-400' }],
    [(m) => m.includes('vcard'), { icon: 'bi-person-vcard', color: 'text-sky-400' }],
    [(m) => m === 'text/markdown' || m === 'text/x-markdown', MARKDOWN],
    [(m) => m.includes('json'), JSON_ICON],
    [(m) => m.includes('xml'), XML],
    [(m) => m.includes('javascript') || m.includes('typescript') || m.includes('x-sh') || m.includes('x-python') || m.startsWith('text/x-'), { icon: 'bi-file-earmark-code', color: 'text-indigo-400' }],
    [(m) => m === 'text/html', HTML],
    [(m) => m.startsWith('text/'), { icon: 'bi-file-earmark-text', color: 'text-(--text2)' }],
];

const DEFAULT_ICON: FileIconInfo = { icon: 'bi-file-earmark', color: 'text-(--text2)' };

/** Extension → icône, construit une fois. */
export const ICONS_BY_EXTENSION: ReadonlyMap<string, FileIconInfo> = (() => {
    const map = new Map<string, FileIconInfo>();
    for (const group of GROUPS) {
        for (const ext of group.ext) map.set(ext, { icon: group.icon, color: group.color });
    }
    for (const [ext, info] of Object.entries(SPECIFIC)) map.set(ext, info);
    return map;
})();

/** Exposé pour les tests (unicité des extensions, existence des icônes). */
export const ICON_TABLES = { GROUPS, SPECIFIC, BY_NAME, BY_MIME, DEFAULT_ICON };

/** Icône d'un nom de fichier et d'un type MIME. */
export function getFileIconFor(fileName: string, mimeType?: string | null): FileIconInfo {
    const name = (fileName || '').trim().toLowerCase();
    const base = name.slice(name.lastIndexOf('/') + 1);

    const byName = BY_NAME[base];
    if (byName) return byName;

    const parts = base.split('.');
    if (parts.length > 1) {
        // Double extension d'abord (archive.tar.gz, paquet.pkg.tar.zst)…
        for (let i = 1; i < parts.length - 1; i++) {
            const compound = ICONS_BY_EXTENSION.get(parts.slice(i).join('.'));
            if (compound) return compound;
        }
        // … puis la dernière.
        const info = ICONS_BY_EXTENSION.get(parts[parts.length - 1]!);
        if (info) return info;
    }

    const mime = (mimeType || '').toLowerCase().split(';')[0]!.trim();
    if (mime) {
        for (const [test, info] of BY_MIME) {
            if (test(mime)) return info;
        }
    }
    return DEFAULT_ICON;
}

/** Icône d'un fichier stocké (ou de tout objet { originalName, mimeType }). */
export const getFileInfo = (file: { originalName: string; mimeType?: string | null }): FileIconInfo =>
    getFileIconFor(file.originalName, file.mimeType);
