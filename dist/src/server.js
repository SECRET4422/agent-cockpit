import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function createCockpitServer(sessionState, publicDir = path.resolve(__dirname, '../public')) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        // CORS headers for local agent hook integration
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        // 1. SSE Stream: /api/stream
        if (url.pathname === '/api/stream' && req.method === 'GET') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });
            // Send immediate state
            const initialPayload = JSON.stringify(sessionState.getTelemetry());
            res.write(`data: ${initialPayload}\n\n`);
            // Subscribe to live updates
            const unsubscribe = sessionState.subscribe((telemetry) => {
                res.write(`data: ${JSON.stringify(telemetry)}\n\n`);
            });
            req.on('close', () => {
                unsubscribe();
            });
            return;
        }
        // 2. State Snapshot: /api/state
        if (url.pathname === '/api/state' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(sessionState.getTelemetry()));
            return;
        }
        // 3. Ingest Event: POST /api/event
        if (url.pathname === '/api/event' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body || '{}');
                    const result = sessionState.ingestEvent(parsed);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, telemetry: result }));
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON', details: msg }));
                }
            });
            return;
        }
        // 4. Killswitch / Circuit Breaker Toggle: POST /api/killswitch
        if (url.pathname === '/api/killswitch' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body || '{}');
                    let result;
                    if (parsed.action === 'reset') {
                        result = sessionState.resetBreaker();
                    }
                    else {
                        result = sessionState.tripBreaker(parsed.reason || 'Manual User Killswitch Activated');
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, telemetry: result }));
                }
                catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to toggle killswitch' }));
                }
            });
            return;
        }
        // 5. Simulation Control: POST /api/simulate
        if (url.pathname === '/api/simulate' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body || '{}');
                    if (parsed.action === 'stop') {
                        sessionState.stopSimulation();
                    }
                    else {
                        sessionState.resetBreaker();
                        sessionState.startSimulation();
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                }
                catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Simulation trigger failed' }));
                }
            });
            return;
        }
        // 6. Static File Serving from public/
        let filePath = path.join(publicDir, url.pathname === '/' ? 'index.html' : url.pathname);
        // Prevent directory traversal
        if (!filePath.startsWith(publicDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                filePath = path.join(publicDir, 'index.html');
            }
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon',
            };
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            fs.readFile(filePath, (readErr, content) => {
                if (readErr) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            });
        });
    });
    return server;
}
