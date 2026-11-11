import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Build séparé de share.synco.one (page de téléchargement des liens,
 * synco_api vibe/features/DOWNLOAD_LINKS_FEATURE.md §8) :
 *
 *   npm run dev:share     http://localhost:5175/l/<id>#<secret>
 *   npm run build:share   → dist-share/
 *
 * Origine distincte de l'app : la page déchiffre un contenu choisi par un
 * tiers, elle ne doit jamais partager l'origine (stockage, session, clés)
 * de app.synco.one. Elle n'importe ni Keycloak ni sfetch, seulement la
 * cryptographie et le moteur de téléchargement (src/assets/utils/linkCrypto.ts,
 * src/services/transfers/chunkedDownloadCore.ts).
 */

const originOf = (raw: string | undefined): string => {
    try {
        const url = new URL(String(raw ?? '').trim());
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
    } catch {
        return '';
    }
};

/** CSP de la page : rien d'autre que ses propres fichiers, l'API et le CDN. */
function shareCspPlugin(): Plugin {
    let isProd = false;
    let env: Record<string, string> = {};
    return {
        name: 'share-csp',
        configResolved(config) {
            isProd = config.mode === 'production';
            env = config.env as Record<string, string>;
        },
        transformIndexHtml(html) {
            const connect = [originOf(env.VITE_API_URL), originOf(env.VITE_CDN_URL)].filter(Boolean).join(' ');
            const devConnect = isProd ? '' : ' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*';
            const csp = [
                "default-src 'none'",
                `script-src 'self'${isProd ? '' : " 'unsafe-inline' http://localhost:* https://localhost:*"}`,
                "worker-src 'self' blob:",
                `style-src 'self'${isProd ? '' : " 'unsafe-inline'"}`,
                "img-src 'self' data:",
                "font-src 'self'",
                `connect-src ${connect}${devConnect}`,
                "base-uri 'none'",
                "form-action 'none'",
                "object-src 'none'",
            ].join('; ');
            return html.split('__SHARE_CSP__').join(csp);
        },
    };
}

export default defineConfig({
    root: fileURLToPath(new URL('./share', import.meta.url)),
    // Mêmes fichiers .env que l'app (VITE_API_URL, VITE_CDN_URL, VITE_APP_URL).
    envDir: fileURLToPath(new URL('.', import.meta.url)),
    publicDir: false,
    plugins: [vue(), tailwindcss(), shareCspPlugin()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
        port: 5175,
        headers: {
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy': "frame-ancestors 'none';",
        },
    },
    build: {
        outDir: fileURLToPath(new URL('./dist-share', import.meta.url)),
        emptyOutDir: true,
        // Pas de sourcemap publique : rien à gagner à exposer le code source.
        sourcemap: false,
    },
});
