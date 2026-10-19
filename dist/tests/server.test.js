import test from 'node:test';
import assert from 'node:assert';
import { SessionStateManager } from '../src/engine/session-state.js';
import { createCockpitServer } from '../src/server.js';
test('createCockpitServer - serves state and accepts event ingest', async () => {
    const sessionState = new SessionStateManager();
    const server = createCockpitServer(sessionState);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    try {
        // 1. Check /api/state
        const stateRes = await fetch(`${baseUrl}/api/state`);
        assert.strictEqual(stateRes.status, 200);
        const stateData = (await stateRes.json());
        assert.strictEqual(stateData.breakerTripped, false);
        assert.strictEqual(typeof stateData.loopRiskScore, 'number');
        // 2. Ingest event via POST /api/event
        const postRes = await fetch(`${baseUrl}/api/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentName: 'Cursor Agent',
                type: 'tool_call',
                tool: 'compile_code',
                args: { file: 'main.rs' },
            }),
        });
        assert.strictEqual(postRes.status, 200);
        const postData = (await postRes.json());
        assert.strictEqual(postData.success, true);
        assert.strictEqual(postData.telemetry.recentEvents.length, 1);
        assert.strictEqual(postData.telemetry.recentEvents[0].tool, 'compile_code');
        // 3. Trigger Killswitch via POST /api/killswitch
        const killRes = await fetch(`${baseUrl}/api/killswitch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'trip', reason: 'Automated test trip' }),
        });
        assert.strictEqual(killRes.status, 200);
        const killData = (await killRes.json());
        assert.strictEqual(killData.telemetry.breakerTripped, true);
        // 4. Reset Killswitch via POST /api/killswitch
        const resetRes = await fetch(`${baseUrl}/api/killswitch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reset' }),
        });
        assert.strictEqual(resetRes.status, 200);
        const resetData = (await resetRes.json());
        assert.strictEqual(resetData.telemetry.breakerTripped, false);
    }
    finally {
        server.close();
    }
});
