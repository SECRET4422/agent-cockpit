import { LoopDetector } from './loop-detector.js';
import { TokenTracker } from './token-tracker.js';
import { SecurityGuard } from './security-guard.js';
export class SessionStateManager {
    startedAt = Date.now();
    activeAgent = 'Claude 3.5 Sonnet (Cursor)';
    activeState = 'IDLE';
    loopDetector = new LoopDetector();
    tokenTracker = new TokenTracker();
    securityGuard = new SecurityGuard();
    recentEvents = [];
    mutatedFilesSet = new Set();
    breakerTripped = false;
    breakerReason;
    subscribers = [];
    simulationInterval = null;
    activeChildPid = null;
    // Real Proxy Metrics
    proxyMetrics = {
        totalRequests: 0,
        blockedRequests: 0,
        activeProvider: 'OpenAI/Anthropic Gateway',
        upstreamUrl: 'https://api.openai.com/v1',
    };
    ingestEvent(rawEvent) {
        if (this.breakerTripped) {
            this.activeState = 'BREAKER_TRIPPED';
        }
        const event = {
            id: rawEvent.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: rawEvent.timestamp || Date.now(),
            agentId: rawEvent.agentId || 'agent-primary',
            agentName: rawEvent.agentName || this.activeAgent,
            type: rawEvent.type || 'thought',
            message: rawEvent.message,
            tool: rawEvent.tool,
            args: rawEvent.args,
            file: rawEvent.file,
            tokens: rawEvent.tokens,
            durationMs: rawEvent.durationMs,
            status: rawEvent.status || 'completed',
        };
        if (rawEvent.agentName) {
            this.activeAgent = rawEvent.agentName;
        }
        if (this.breakerTripped) {
            this.activeState = 'BREAKER_TRIPPED';
        }
        else if (event.type === 'tool_call') {
            this.activeState = 'EXECUTING_TOOL';
        }
        else if (event.type === 'file_mutation') {
            this.activeState = 'ANALYZING_DIFF';
        }
        else if (event.type === 'thought') {
            this.activeState = 'REASONING';
        }
        else {
            this.activeState = 'IDLE';
        }
        if (event.file) {
            this.mutatedFilesSet.add(event.file);
        }
        // Token accounting: REAL tokens if present, or transparent char-ratio heuristic (NO Math.random!)
        if (event.tokens) {
            this.tokenTracker.recordUsage(event.tokens);
        }
        else if (event.type === 'tool_call') {
            const charCount = JSON.stringify(event.args || {}).length + (event.message || '').length;
            const estimatedTokens = Math.max(10, Math.ceil(charCount / 4));
            const cost = this.tokenTracker.estimateCost(estimatedTokens, Math.ceil(estimatedTokens / 4));
            this.tokenTracker.recordUsage({
                input: estimatedTokens,
                output: Math.ceil(estimatedTokens / 4),
                costEstimate: cost,
                isEstimated: true,
            });
        }
        this.securityGuard.inspectEvent(event);
        const loopAnalysis = this.loopDetector.recordCall(event);
        if (loopAnalysis.shouldTripBreaker && !this.breakerTripped) {
            this.tripBreaker(loopAnalysis.tripReason || 'Autonomous loop prevention triggered');
        }
        this.recentEvents.unshift(event);
        if (this.recentEvents.length > 50) {
            this.recentEvents = this.recentEvents.slice(0, 50);
        }
        const telemetry = this.getTelemetry();
        this.notifySubscribers(telemetry);
        return telemetry;
    }
    recordRealTokens(input, output, model) {
        const cost = this.tokenTracker.estimateCost(input, output, model);
        this.tokenTracker.recordUsage({
            input,
            output,
            costEstimate: cost,
            isEstimated: false,
            model,
        });
        this.notifySubscribers(this.getTelemetry());
    }
    recordProxySuccess(upstreamUrl) {
        this.proxyMetrics.totalRequests++;
        this.proxyMetrics.upstreamUrl = upstreamUrl;
    }
    recordProxyBlocked() {
        this.proxyMetrics.totalRequests++;
        this.proxyMetrics.blockedRequests++;
        this.notifySubscribers(this.getTelemetry());
    }
    tripBreaker(reason = 'Manual Emergency Killswitch Engaged') {
        this.breakerTripped = true;
        this.breakerReason = reason;
        this.activeState = 'BREAKER_TRIPPED';
        const tripEvent = {
            id: `trip-${Date.now()}`,
            timestamp: Date.now(),
            agentId: 'circuit-breaker',
            agentName: 'LoopBreaker Core',
            type: 'breaker_tripped',
            message: `🚨 CIRCUIT BREAKER TRIPPED: ${reason}`,
            status: 'tripped',
        };
        this.recentEvents.unshift(tripEvent);
        const telemetry = this.getTelemetry();
        this.notifySubscribers(telemetry);
        return telemetry;
    }
    resetBreaker() {
        this.breakerTripped = false;
        this.breakerReason = undefined;
        this.activeState = 'IDLE';
        this.loopDetector.reset();
        const resetEvent = {
            id: `reset-${Date.now()}`,
            timestamp: Date.now(),
            agentId: 'circuit-breaker',
            agentName: 'LoopBreaker Core',
            type: 'alert',
            message: '✅ Circuit breaker reset by user. Agent flight resumed.',
            status: 'completed',
        };
        this.recentEvents.unshift(resetEvent);
        const telemetry = this.getTelemetry();
        this.notifySubscribers(telemetry);
        return telemetry;
    }
    isBreakerTripped() {
        return this.breakerTripped;
    }
    getBreakerReason() {
        return this.breakerReason;
    }
    setActiveChildPid(pid) {
        this.activeChildPid = pid;
        this.notifySubscribers(this.getTelemetry());
    }
    getTelemetry() {
        const loopAnalysis = this.loopDetector.analyze();
        const tokenSummary = this.tokenTracker.getSummary();
        const uptime = Math.floor((Date.now() - this.startedAt) / 1000);
        return {
            sessionStartedAt: this.startedAt,
            uptimeSeconds: uptime,
            activeAgent: this.activeAgent,
            activeState: this.activeState,
            totalEvents: this.recentEvents.length,
            totalTokens: {
                input: tokenSummary.inputTokens,
                output: tokenSummary.outputTokens,
                total: tokenSummary.totalTokens,
                isEstimated: tokenSummary.isEstimated,
            },
            totalCostUsd: tokenSummary.totalCostUsd,
            burnRatePerMin: tokenSummary.burnRatePerMin,
            loopRiskScore: this.breakerTripped ? 100 : loopAnalysis.riskScore,
            loopWarning: this.breakerTripped ? this.breakerReason || 'Breaker Active' : loopAnalysis.warning,
            breakerTripped: this.breakerTripped,
            breakerReason: this.breakerReason,
            recentEvents: this.recentEvents,
            mutatedFiles: Array.from(this.mutatedFilesSet),
            securityAlerts: this.securityGuard.getAlerts(),
            proxyMetrics: this.proxyMetrics,
            activeChildPid: this.activeChildPid,
        };
    }
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter((s) => s !== callback);
        };
    }
    notifySubscribers(telemetry) {
        for (const sub of this.subscribers) {
            try {
                sub(telemetry);
            }
            catch (err) {
                console.error('Subscriber notification error:', err);
            }
        }
    }
    runFlightSimulation() {
        this.startSimulation();
    }
    startSimulation() {
        if (this.simulationInterval)
            return;
        const simulationSteps = [
            {
                type: 'thought',
                message: 'Exploring codebase structure and package dependencies...',
            },
            {
                type: 'tool_call',
                tool: 'read_dir',
                args: { path: './src' },
                message: 'Reading root directory manifest',
            },
            {
                type: 'thought',
                message: 'Locating auth middleware and token validation routes.',
            },
            {
                type: 'tool_call',
                tool: 'grep_search',
                args: { pattern: 'verifyToken', path: './src/middleware' },
                message: 'Searching for token validation functions',
            },
            {
                type: 'file_mutation',
                file: 'src/middleware/auth.ts',
                message: 'Patched session expiration edge case in auth.ts',
            },
            {
                type: 'thought',
                message: 'Running test runner to verify fix.',
            },
            {
                type: 'tool_call',
                tool: 'run_command',
                args: { command: 'npm test -- --filter=auth' },
                message: 'Executing test runner [Attempt 1]',
            },
            {
                type: 'tool_call',
                tool: 'run_command',
                args: { command: 'npm test -- --filter=auth' },
                message: 'Executing test runner [Attempt 2]',
            },
            {
                type: 'tool_call',
                tool: 'run_command',
                args: { command: 'npm test -- --filter=auth' },
                message: 'Executing test runner [Attempt 3]',
            },
            {
                type: 'tool_call',
                tool: 'run_command',
                args: { command: 'npm test -- --filter=auth' },
                message: 'Executing test runner [Attempt 4 - Critical Runaway Loop]',
            },
        ];
        let stepIndex = 0;
        this.simulationInterval = setInterval(() => {
            if (this.breakerTripped) {
                this.stopSimulation();
                return;
            }
            if (stepIndex < simulationSteps.length) {
                const step = simulationSteps[stepIndex++];
                this.ingestEvent({
                    agentName: 'Claude 3.5 Sonnet (Autonomous Coder)',
                    ...step,
                });
            }
            else {
                this.stopSimulation();
            }
        }, 1800);
    }
    stopSimulation() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
    }
}
