import { AgentEvent, CockpitTelemetry, SecurityAlert } from '../types.js';
import { LoopDetector } from './loop-detector.js';
import { TokenTracker } from './token-tracker.js';
import { SecurityGuard } from './security-guard.js';

export class SessionStateManager {
  private startedAt = Date.now();
  private activeAgent = 'Claude 3.5 Sonnet (Cursor)';
  private activeState: CockpitTelemetry['activeState'] = 'IDLE';
  private loopDetector = new LoopDetector();
  private tokenTracker = new TokenTracker();
  private securityGuard = new SecurityGuard();
  private recentEvents: AgentEvent[] = [];
  private mutatedFilesSet = new Set<string>();
  private breakerTripped = false;
  private breakerReason?: string;
  private subscribers: ((data: CockpitTelemetry) => void)[] = [];
  private simulationInterval: NodeJS.Timeout | null = null;

  public ingestEvent(rawEvent: Partial<AgentEvent>): CockpitTelemetry {
    if (this.breakerTripped) {
      // Breaker is active: do not accept file mutations or dangerous calls
      this.activeState = 'BREAKER_TRIPPED';
    }

    const event: AgentEvent = {
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

    // Update active agent if provided
    if (rawEvent.agentName) {
      this.activeAgent = rawEvent.agentName;
    }

    // Determine state
    if (this.breakerTripped) {
      this.activeState = 'BREAKER_TRIPPED';
    } else if (event.type === 'tool_call') {
      this.activeState = 'EXECUTING_TOOL';
    } else if (event.type === 'file_mutation') {
      this.activeState = 'ANALYZING_DIFF';
    } else if (event.type === 'thought') {
      this.activeState = 'REASONING';
    } else {
      this.activeState = 'IDLE';
    }

    // Mutated files
    if (event.file) {
      this.mutatedFilesSet.add(event.file);
    }

    // Tokens
    if (event.tokens) {
      this.tokenTracker.recordUsage(event.tokens);
    } else if (event.type === 'tool_call') {
      // Auto estimate moderate tokens per tool call
      const input = 1200 + Math.floor(Math.random() * 800);
      const output = 250 + Math.floor(Math.random() * 150);
      const cost = this.tokenTracker.estimateCost(input, output);
      this.tokenTracker.recordUsage({ input, output, costEstimate: cost });
    }

    // Security check
    this.securityGuard.inspectEvent(event);

    // Loop detection
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

  public tripBreaker(reason = 'Manual Emergency Killswitch Engaged'): CockpitTelemetry {
    this.breakerTripped = true;
    this.breakerReason = reason;
    this.activeState = 'BREAKER_TRIPPED';

    const tripEvent: AgentEvent = {
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

  public resetBreaker(): CockpitTelemetry {
    this.breakerTripped = false;
    this.breakerReason = undefined;
    this.activeState = 'IDLE';
    this.loopDetector.reset();

    const resetEvent: AgentEvent = {
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

  public getTelemetry(): CockpitTelemetry {
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
    };
  }

  public subscribe(callback: (data: CockpitTelemetry) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  private notifySubscribers(telemetry: CockpitTelemetry): void {
    for (const sub of this.subscribers) {
      try {
        sub(telemetry);
      } catch (err) {
        console.error('Subscriber notification error:', err);
      }
    }
  }

  /**
   * Starts a live flight simulation to showcase AgentCockpit's real-time detection
   */
  public startSimulation(): void {
    if (this.simulationInterval) return;

    const simulationSteps = [
      {
        type: 'thought' as const,
        message: 'Exploring codebase structure and package dependencies...',
      },
      {
        type: 'tool_call' as const,
        tool: 'read_dir',
        args: { path: './src' },
        message: 'Reading root directory manifest',
      },
      {
        type: 'thought' as const,
        message: 'Locating auth middleware and token validation routes.',
      },
      {
        type: 'tool_call' as const,
        tool: 'grep_search',
        args: { pattern: 'verifyToken', path: './src/middleware' },
        message: 'Searching for token validation functions',
      },
      {
        type: 'file_mutation' as const,
        file: 'src/middleware/auth.ts',
        message: 'Patched session expiration edge case in auth.ts',
      },
      {
        type: 'thought' as const,
        message: 'Running test runner to verify fix.',
      },
      // Now initiate a rapid loop!
      {
        type: 'tool_call' as const,
        tool: 'run_command',
        args: { command: 'npm test -- --filter=auth' },
        message: 'Executing test runner [Attempt 1]',
      },
      {
        type: 'tool_call' as const,
        tool: 'run_command',
        args: { command: 'npm test -- --filter=auth' },
        message: 'Executing test runner [Attempt 2]',
      },
      {
        type: 'tool_call' as const,
        tool: 'run_command',
        args: { command: 'npm test -- --filter=auth' },
        message: 'Executing test runner [Attempt 3]',
      },
      {
        type: 'tool_call' as const,
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
      } else {
        this.stopSimulation();
      }
    }, 1800);
  }

  public stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }
}
