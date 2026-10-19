import test from 'node:test';
import assert from 'node:assert';
import { LoopDetector } from '../src/engine/loop-detector.js';
import { TokenTracker } from '../src/engine/token-tracker.js';
import { SecurityGuard } from '../src/engine/security-guard.js';
import { SessionStateManager } from '../src/engine/session-state.js';

test('LoopDetector - nominal non-repeating calls should have low risk', () => {
  const detector = new LoopDetector();
  detector.recordCall({
    id: '1',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call',
    tool: 'read_file',
    args: { path: 'a.ts' },
  });
  detector.recordCall({
    id: '2',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call',
    tool: 'read_file',
    args: { path: 'b.ts' },
  });
  const res = detector.recordCall({
    id: '3',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call',
    tool: 'grep_search',
    args: { query: 'foo' },
  });

  assert.strictEqual(res.shouldTripBreaker, false);
  assert.ok(res.riskScore <= 20);
});

test('LoopDetector - consecutive identical calls should escalate and trip breaker', () => {
  const detector = new LoopDetector();
  const makeCall = () => ({
    id: String(Math.random()),
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call' as const,
    tool: 'run_command',
    args: { cmd: 'npm test' },
  });

  detector.recordCall(makeCall());
  const r2 = detector.recordCall(makeCall());
  assert.strictEqual(r2.riskScore, 40);

  const r3 = detector.recordCall(makeCall());
  assert.strictEqual(r3.riskScore, 85);

  const r4 = detector.recordCall(makeCall());
  assert.strictEqual(r4.riskScore, 100);
  assert.strictEqual(r4.shouldTripBreaker, true);
  assert.ok(r4.tripReason?.includes('Runaway loop'));
});

test('LoopDetector - cyclic oscillation (A -> B -> A -> B) trips breaker', () => {
  const detector = new LoopDetector();
  const callA = {
    id: 'a',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call' as const,
    tool: 'toolA',
    args: { x: 1 },
  };
  const callB = {
    id: 'b',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call' as const,
    tool: 'toolB',
    args: { y: 2 },
  };

  detector.recordCall(callA);
  detector.recordCall(callB);
  detector.recordCall(callA);
  const res = detector.recordCall(callB);

  assert.strictEqual(res.riskScore, 90);
  assert.strictEqual(res.shouldTripBreaker, true);
  assert.ok(res.tripReason?.includes('Alternating cyclic loop'));
});

test('TokenTracker - computes token sums and cost estimations', () => {
  const tracker = new TokenTracker();
  tracker.recordUsage({ input: 10000, output: 2000, costEstimate: 0.06 });
  const summary = tracker.getSummary();

  assert.strictEqual(summary.inputTokens, 10000);
  assert.strictEqual(summary.outputTokens, 2000);
  assert.strictEqual(summary.totalTokens, 12000);
  assert.strictEqual(summary.totalCostUsd, 0.06);
});

test('SecurityGuard - flags catastrophic shell deletions and secrets', () => {
  const guard = new SecurityGuard();
  const badEvent = {
    id: 'sec-1',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'tool_call' as const,
    tool: 'run_command',
    args: { cmd: 'rm -rf /' },
  };

  const alerts = guard.inspectEvent(badEvent);
  assert.ok(alerts.length > 0);
  assert.strictEqual(alerts[0].rule, 'DESTRUCTIVE_COMMAND');
  assert.strictEqual(alerts[0].severity, 'critical');

  const fileEvent = {
    id: 'sec-2',
    timestamp: Date.now(),
    agentId: 'test',
    agentName: 'TestAgent',
    type: 'file_mutation' as const,
    file: 'backend/.env',
  };
  const fileAlerts = guard.inspectEvent(fileEvent);
  assert.ok(fileAlerts.length > 0);
  assert.strictEqual(fileAlerts[0].rule, 'SENSITIVE_FILE_ACCESS');
});

test('SessionStateManager - manages state, trips breaker, and resets', () => {
  const manager = new SessionStateManager();
  const telemetry = manager.ingestEvent({
    type: 'tool_call',
    tool: 'fetch_data',
    args: { id: 100 },
  });

  assert.strictEqual(telemetry.activeState, 'EXECUTING_TOOL');
  assert.strictEqual(telemetry.breakerTripped, false);

  // Manual Trip
  const tripped = manager.tripBreaker('Manual intervention test');
  assert.strictEqual(tripped.breakerTripped, true);
  assert.strictEqual(tripped.activeState, 'BREAKER_TRIPPED');

  // Reset
  const reset = manager.resetBreaker();
  assert.strictEqual(reset.breakerTripped, false);
});
