// Full WebSocket diagnostic test using socket.io-client
const { io } = require("socket.io-client");
const https = require("https");

// Get a Keycloak token using the admin client (which supports client_credentials)
// Then we need to impersonate or use a service account token
async function getKeycloakToken() {
    // Try using the API client with client_credentials first
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'silverteams_api_dev',
        client_secret: 'JyyeLuHNOIx3IrcIyMmzLUjS5ULhc8bG',
    });

    return new Promise((resolve, reject) => {
        const postData = params.toString();
        const options = {
            hostname: 'auth.silvercore.fr',
            path: '/realms/Synco/protocol/openid-connect/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        console.log('[AUTH] Got token via client_credentials, length:', json.access_token.length);
                        // Decode JWT to see sub claim
                        const payload = JSON.parse(Buffer.from(json.access_token.split('.')[1], 'base64').toString());
                        console.log('[AUTH] Token sub:', payload.sub);
                        console.log('[AUTH] Token azp:', payload.azp);
                        console.log('[AUTH] Token iss:', payload.iss);
                        resolve(json.access_token);
                    } else {
                        console.error('[AUTH] Response:', data.substring(0, 500));
                        reject(new Error('No access_token'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// Try password grant with the web app client (which is what the browser uses)
async function getKeycloakTokenPassword() {
    const params = new URLSearchParams({
        grant_type: 'password',
        client_id: 'silverteams_web_app_dev',
        username: 'moi',
        password: 'moimoimoi',
        scope: 'openid',
    });

    return new Promise((resolve, reject) => {
        const postData = params.toString();
        const options = {
            hostname: 'auth.silvercore.fr',
            path: '/realms/Synco/protocol/openid-connect/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.access_token) {
                        console.log('[AUTH] Got token via password grant, length:', json.access_token.length);
                        const payload = JSON.parse(Buffer.from(json.access_token.split('.')[1], 'base64').toString());
                        console.log('[AUTH] Token sub:', payload.sub);
                        resolve(json.access_token);
                    } else {
                        console.log('[AUTH] Password grant failed:', json.error, json.error_description);
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', (e) => resolve(null));
        req.write(postData);
        req.end();
    });
}

async function testSocket() {
    try {
        // Try password grant first, then client_credentials
        let token = await getKeycloakTokenPassword();
        if (!token) {
            console.log('[AUTH] Password grant failed, trying client_credentials...');
            token = await getKeycloakToken();
        }
        
        console.log('\n=== TEST 1: Direct polling+websocket to https://localhost:3467 ===');
        const socket1 = io('https://localhost:3467', {
            path: '/socket',
            auth: { token },
            transports: ['polling', 'websocket'],
            withCredentials: true,
            rejectUnauthorized: false,
            timeout: 10000,
        });
        
        socket1.on('connect', () => {
            console.log('[TEST 1] ✅ CONNECTED! ID:', socket1.id);
            console.log('[TEST 1] Transport:', socket1.io.engine.transport.name);
            socket1.disconnect();
            runTest2(token);
        });
        
        socket1.on('connect_error', (err) => {
            console.error('[TEST 1] ❌ FAILED:', err.message);
            socket1.disconnect();
            runTest2(token);
        });
        
    } catch (e) {
        console.error('[FATAL]', e.message);
        process.exit(1);
    }
}

function runTest2(token) {
    console.log('\n=== TEST 2: WebSocket-only to https://localhost:3467 ===');
    const socket2 = io('https://localhost:3467', {
        path: '/socket',
        auth: { token },
        transports: ['websocket'],
        withCredentials: true,
        rejectUnauthorized: false,
        timeout: 10000,
    });
    
    socket2.on('connect', () => {
        console.log('[TEST 2] ✅ CONNECTED! ID:', socket2.id);
        console.log('[TEST 2] Transport:', socket2.io.engine.transport.name);
        socket2.disconnect();
        runTest3(token);
    });
    
    socket2.on('connect_error', (err) => {
        console.error('[TEST 2] ❌ FAILED:', err.message);
        socket2.disconnect();
        runTest3(token);
    });
}

function runTest3(token) {
    console.log('\n=== TEST 3: Via Vite proxy at https://localhost:5174 ===');
    const socket3 = io('https://localhost:5174', {
        path: '/socket',
        auth: { token },
        transports: ['polling', 'websocket'],
        withCredentials: true,
        rejectUnauthorized: false,
        timeout: 10000,
    });
    
    socket3.on('connect', () => {
        console.log('[TEST 3] ✅ CONNECTED via proxy! ID:', socket3.id);
        console.log('[TEST 3] Transport:', socket3.io.engine.transport.name);
        socket3.disconnect();
        
        console.log('\n=== SUMMARY ===');
        console.log('Direct connection works. Browser issue is likely self-signed cert rejection.');
        console.log('Solution: Route through Vite proxy OR use mkcert for trusted certs.');
        process.exit(0);
    });
    
    socket3.on('connect_error', (err) => {
        console.error('[TEST 3] ❌ Proxy FAILED:', err.message);
        socket3.disconnect();
        
        console.log('\n=== SUMMARY ===');
        console.log('Vite proxy is not forwarding correctly.');
        process.exit(0);
    });
}

// Global timeout
setTimeout(() => {
    console.error('\n[TIMEOUT] Tests did not complete within 30s');
    process.exit(1);
}, 30000);

testSocket();
