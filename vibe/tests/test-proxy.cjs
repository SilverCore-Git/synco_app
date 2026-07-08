// Test that Vite proxy correctly forwards Socket.IO with auth token
const { io } = require("socket.io-client");
const https = require("https");

async function getToken() {
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'silverteams_api_dev',
        client_secret: 'JyyeLuHNOIx3IrcIyMmzLUjS5ULhc8bG',
    });

    return new Promise((resolve, reject) => {
        const postData = params.toString();
        const req = https.request({
            hostname: 'auth.silvercore.fr',
            path: '/realms/Synco/protocol/openid-connect/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const json = JSON.parse(data);
                json.access_token ? resolve(json.access_token) : reject(json.error_description);
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    const token = await getToken();
    console.log('[AUTH] Token obtained');
    
    // Test via Vite proxy (the way the browser does it)
    console.log('\n=== Connecting via Vite proxy at https://localhost:5174 ===');
    const socket = io('https://localhost:5174', {
        path: '/socket',
        auth: { token },
        transports: ['polling'],
        withCredentials: true,
        rejectUnauthorized: false,
        timeout: 10000,
        reconnectionAttempts: 3,
    });
    
    socket.on('connect', () => {
        console.log('✅ CONNECTED via proxy! ID:', socket.id);
        console.log('Transport:', socket.io.engine.transport.name);
        socket.disconnect();
        process.exit(0);
    });
    
    socket.on('connect_error', (err) => {
        console.error('❌ Error:', err.message);
    });
    
    socket.io.on('reconnect_failed', () => {
        console.error('❌ All reconnection attempts failed');
        process.exit(1);
    });
    
    setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
}

main().catch(e => { console.error(e); process.exit(1); });
