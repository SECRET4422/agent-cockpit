import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { SessionStateManager } from '../src/engine/session-state.js';
import { createCockpitServer } from '../src/server.js';
import { ProxyGateway } from '../src/engine/proxy-gateway.js';
import type { AddressInfo } from 'node:net';

test('ProxyGateway - forwards AI requests, intercepts tools, and blocks when breaker trips', async () => {
  // 1. Start a mock upstream AI server (e.g. OpenAI / Anthropic)
  let upstreamCalls = 0;
  const mockUpstream = http.createServer((req, res) => {
    upstreamCalls++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-test-123',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Running code search...',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'grep_search',
                    arguments: JSON.stringify({ pattern: 'verifyAuth' }),
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 1540,
          completion_tokens: 180,
          total_tokens: 1720,
        },
      })
    );
  });

  await new Promise<void>((resolve) => mockUpstream.listen(0, resolve));
  const upstreamPort = (mockUpstream.address() as AddressInfo).port;
  const mockUpstreamUrl = `http://localhost:${upstreamPort}/v1`;

  // 2. Start Cockpit server with ProxyGateway pointed at mock upstream
  const sessionState = new SessionStateManager();
  const proxy = new ProxyGateway(sessionState, mockUpstreamUrl);
  const cockpitServer = createCockpitServer(sessionState, undefined, proxy);

  await new Promise<void>((resolve) => cockpitServer.listen(0, resolve));
  const cockpitPort = (cockpitServer.address() as AddressInfo).port;
  const proxyUrl = `http://localhost:${cockpitPort}/v1/chat/completions`;

  try {
    // 3. Send proxy request
    const proxyRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
        'x-upstream-url': mockUpstreamUrl,
        Connection: 'close',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Find auth functions' }],
      }),
    });

    assert.strictEqual(proxyRes.status, 200);
    const data = (await proxyRes.json()) as any;
    assert.strictEqual(data.id, 'chatcmpl-test-123');
    assert.strictEqual(upstreamCalls, 1);

    // Verify token tracking captured exact provider numbers (NO Math.random)
    const telemetry = sessionState.getTelemetry();
    assert.strictEqual(telemetry.totalTokens.input, 1540);
    assert.strictEqual(telemetry.totalTokens.output, 180);
    assert.strictEqual(telemetry.totalTokens.total, 1720);
    assert.strictEqual(telemetry.totalTokens.isEstimated, false);

    // Verify tool call was intercepted into event stream
    assert.ok(telemetry.recentEvents.some((e) => e.tool === 'grep_search'));

    // 4. Trip the breaker manually and verify next request is BLOCKED with 429
    sessionState.tripBreaker('Runaway recursion test');
    assert.strictEqual(sessionState.isBreakerTripped(), true);

    const blockedRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key',
        'x-upstream-url': mockUpstreamUrl,
        Connection: 'close',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Repeat tool call' }],
      }),
    });

    assert.strictEqual(blockedRes.status, 429);
    const blockedData = (await blockedRes.json()) as any;
    assert.strictEqual(blockedData.error.code, 'LOOP_CIRCUIT_TRIPPED');
    assert.ok(blockedData.error.message.includes('Circuit Breaker Engaged'));

    // Upstream should NOT have received the second call
    assert.strictEqual(upstreamCalls, 1);
  } finally {
    await new Promise<void>((resolve) => mockUpstream.close(() => resolve()));
    await new Promise<void>((resolve) => cockpitServer.close(() => resolve()));
  }
});
