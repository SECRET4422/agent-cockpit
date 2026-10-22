import test from 'node:test';
import assert from 'node:assert';
import { SessionStateManager } from '../src/engine/session-state.js';
import { createCockpitServer } from '../src/server.js';
import type { AddressInfo } from 'node:net';

test('createCockpitServer - serves state and accepts event ingest', async () => {
  const sessionState = new SessionStateManager();
  const server = createCockpitServer(sessionState);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Check /api/state
    const stateRes = await fetch(`${baseUrl}/api/state`, {
      headers: { Connection: 'close' },
    });
    assert.strictEqual(stateRes.status, 200);
    const stateData = (await stateRes.json()) as any;
    assert.strictEqual(stateData.breakerTripped, false);
    assert.strictEqual(typeof stateData.loopRiskScore, 'number');

    // 2. Ingest event via POST /api/event
    const postRes = await fetch(`${baseUrl}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({
        agentName: 'Cursor Agent',
        type: 'tool_call',
        tool: 'compile_code',
        args: { file: 'main.rs' },
      }),
    });
    assert.strictEqual(postRes.status, 200);
    const postData = (await postRes.json()) as any;
    assert.strictEqual(postData.success, true);
    assert.strictEqual(postData.telemetry.recentEvents.length, 1);
    assert.strictEqual(postData.telemetry.recentEvents[0].tool, 'compile_code');

    // 3. Trigger Killswitch via POST /api/killswitch
    const killRes = await fetch(`${baseUrl}/api/killswitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ action: 'trip', reason: 'Automated test trip' }),
    });
    assert.strictEqual(killRes.status, 200);
    const killData = (await killRes.json()) as any;
    assert.strictEqual(killData.telemetry.breakerTripped, true);

    // 4. Reset Killswitch via POST /api/killswitch
    const resetRes = await fetch(`${baseUrl}/api/killswitch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ action: 'reset' }),
    });
    assert.strictEqual(resetRes.status, 200);
    const resetData = (await resetRes.json()) as any;
    assert.strictEqual(resetData.telemetry.breakerTripped, false);
  } finally {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('createCockpitServer - serves index.html and static assets without 404', async () => {
  const sessionState = new SessionStateManager();
  const server = createCockpitServer(sessionState);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const rootRes = await fetch(`${baseUrl}/`, { headers: { Connection: 'close' } });
    assert.strictEqual(rootRes.status, 200);
    const rootText = await rootRes.text();
    assert.ok(rootText.includes('AgentCockpit'));
    assert.ok(rootText.includes('LOOP RISK RADAR'));

    const cssRes = await fetch(`${baseUrl}/style.css`, { headers: { Connection: 'close' } });
    assert.strictEqual(cssRes.status, 200);

    const jsRes = await fetch(`${baseUrl}/app.js`, { headers: { Connection: 'close' } });
    assert.strictEqual(jsRes.status, 200);

    const simStart = await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ action: 'start' }),
    });
    assert.strictEqual(simStart.status, 200);

    const simStop = await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ action: 'stop' }),
    });
    assert.strictEqual(simStop.status, 200);
  } finally {
    if (typeof (server as any).closeAllConnections === 'function') {
      (server as any).closeAllConnections();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
