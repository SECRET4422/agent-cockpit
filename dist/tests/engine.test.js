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
        agentId: 'a',
        agentName: 'Test',
        type: 'tool_call',
        tool: 'read_file',
        args: { path: 'a.ts' },
    });
    const res = detector.recordCall({
        id: '2',
        timestamp: Date.now(),
        agentId: 'a',
        agentName: 'Test',
        type: 'tool_call',
        tool: 'grep_search',
        args: { pattern: 'test' },
    });
    assert.strictEqual(res.shouldTripBreaker, false);
    assert.strictEqual(res.riskScore, 0);
});
test('LoopDetector - consecutive identical calls should escalate and trip breaker', () => {
    const detector = new LoopDetector();
    for (let i = 0; i < 3; i++) {
        detector.recordCall({
            id: `${i}`,
            timestamp: Date.now(),
            agentId: 'a',
            agentName: 'Test',
            type: 'tool_call',
            tool: 'run_command',
            args: { cmd: 'cargo test' },
        });
    }
    const trip = detector.analyze();
    assert.strictEqual(trip.shouldTripBreaker, true);
    assert.ok(trip.riskScore >= 80);
});
test('LoopDetector - cyclic oscillation (A -> B -> A -> B) trips breaker', () => {
    const detector = new LoopDetector();
    const sequence = ['edit_file', 'npm_test', 'edit_file', 'npm_test'];
    for (let i = 0; i < sequence.length; i++) {
        detector.recordCall({
            id: `${i}`,
            timestamp: Date.now(),
            agentId: 'a',
            agentName: 'Test',
            type: 'tool_call',
            tool: sequence[i],
            args: { file: 'index.ts' },
        });
    }
    const trip = detector.analyze();
    assert.strictEqual(trip.shouldTripBreaker, true);
    assert.ok(trip.riskScore >= 80);
    assert.ok(trip.tripReason?.includes('Oscillation cycle detected'));
});
test('LoopDetector - 3-step cycle (A -> B -> C -> A -> B -> C) trips breaker', () => {
    const detector = new LoopDetector();
    const sequence = ['read_file', 'edit_file', 'npm_test', 'read_file', 'edit_file', 'npm_test'];
    for (let i = 0; i < sequence.length; i++) {
        detector.recordCall({
            id: `${i}`,
            timestamp: Date.now(),
            agentId: 'a',
            agentName: 'Test',
            type: 'tool_call',
            tool: sequence[i],
            args: { file: 'main.py' },
        });
    }
    const trip = detector.analyze();
    assert.strictEqual(trip.shouldTripBreaker, true);
    assert.ok(trip.riskScore >= 80);
    assert.ok(trip.tripReason?.includes('3-step cyclic execution'));
});
test('TokenTracker - computes exact token sums and honest cost estimations', () => {
    const tracker = new TokenTracker();
    tracker.recordUsage({
        input: 1_000_000,
        output: 100_000,
        costEstimate: tracker.estimateCost(1_000_000, 100_000, 'gpt-4o'),
        isEstimated: false,
    });
    const summary = tracker.getSummary();
    assert.strictEqual(summary.inputTokens, 1_000_000);
    assert.strictEqual(summary.outputTokens, 100_000);
    assert.strictEqual(summary.totalTokens, 1_100_000);
    // GPT-4o: $2.50 in, $10.00/M out => 2.50 + 1.00 = $3.50
    assert.strictEqual(Math.round(summary.totalCostUsd * 100) / 100, 3.5);
    assert.strictEqual(summary.isEstimated, false);
});
test('SecurityGuard - Acorn AST parser detects dangerous dynamic eval and processes', () => {
    const guard = new SecurityGuard();
    const dangerousCode = `
    const userPayload = "alert(1)";
    eval(userPayload);
    const child = require("child_process");
    child.exec("rm -rf /tmp/data");
  `;
    const alerts = guard.inspectCodeAST(dangerousCode, 'sandbox.js');
    assert.ok(alerts.some((a) => a.rule === 'AST_DYNAMIC_CODE_EVAL'));
    assert.ok(alerts.some((a) => a.rule === 'AST_PROCESS_EXEC'));
});
test('SecurityGuard - flags catastrophic shell deletions and secrets', () => {
    const guard = new SecurityGuard();
    const alerts = guard.inspectEvent({
        id: '1',
        timestamp: Date.now(),
        agentId: 'a',
        agentName: 'Test',
        type: 'tool_call',
        tool: 'run_command',
        args: { cmd: 'rm -rf /' },
    });
    assert.ok(alerts.some((a) => a.rule === 'DESTRUCTIVE_COMMAND'));
    const secretAlerts = guard.inspectEvent({
        id: '2',
        timestamp: Date.now(),
        agentId: 'a',
        agentName: 'Test',
        type: 'tool_call',
        tool: 'read_file',
        args: { file: '.env.production' },
    });
    assert.ok(secretAlerts.some((a) => a.rule === 'SENSITIVE_FILE_ACCESS'));
});
test('SessionStateManager - manages state, trips breaker, and resets', () => {
    const state = new SessionStateManager();
    assert.strictEqual(state.isBreakerTripped(), false);
    state.tripBreaker('Manual trip');
    assert.strictEqual(state.isBreakerTripped(), true);
    assert.strictEqual(state.getTelemetry().activeState, 'BREAKER_TRIPPED');
    state.resetBreaker();
    assert.strictEqual(state.isBreakerTripped(), false);
    assert.strictEqual(state.getTelemetry().activeState, 'IDLE');
});
