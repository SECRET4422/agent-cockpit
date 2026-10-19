import { AgentEvent } from '../types.js';

export interface LoopAnalysis {
  riskScore: number; // 0 to 100
  warning: string | null;
  shouldTripBreaker: boolean;
  tripReason?: string;
}

export class LoopDetector {
  private callHistory: { tool: string; argsHash: string; timestamp: number }[] = [];
  private readonly windowSize: number;
  private readonly tripThreshold: number;

  constructor(windowSize = 15, tripThreshold = 80) {
    this.windowSize = windowSize;
    this.tripThreshold = tripThreshold;
  }

  public recordCall(event: AgentEvent): LoopAnalysis {
    if (event.type !== 'tool_call' || !event.tool) {
      return this.currentAnalysis();
    }

    const argsHash = this.hashArgs(event.args || {});
    this.callHistory.push({
      tool: event.tool,
      argsHash,
      timestamp: event.timestamp,
    });

    if (this.callHistory.length > this.windowSize) {
      this.callHistory.shift();
    }

    return this.currentAnalysis();
  }

  public analyze(): LoopAnalysis {
    return this.currentAnalysis();
  }

  public reset(): void {
    this.callHistory = [];
  }

  private hashArgs(args: Record<string, unknown>): string {
    try {
      return JSON.stringify(args, Object.keys(args).sort());
    } catch {
      return String(args);
    }
  }

  private currentAnalysis(): LoopAnalysis {
    if (this.callHistory.length < 2) {
      return { riskScore: 0, warning: null, shouldTripBreaker: false };
    }

    let consecutiveDuplicates = 1;
    const last = this.callHistory[this.callHistory.length - 1];

    for (let i = this.callHistory.length - 2; i >= 0; i--) {
      const prev = this.callHistory[i];
      if (prev.tool === last.tool && prev.argsHash === last.argsHash) {
        consecutiveDuplicates++;
      } else {
        break;
      }
    }

    // Direct repetition check
    if (consecutiveDuplicates >= 4) {
      return {
        riskScore: 100,
        warning: `CRITICAL: Tool '${last.tool}' invoked ${consecutiveDuplicates} times with identical arguments!`,
        shouldTripBreaker: true,
        tripReason: `Runaway loop: '${last.tool}' repeated ${consecutiveDuplicates}x with identical args`,
      };
    } else if (consecutiveDuplicates === 3) {
      return {
        riskScore: 85,
        warning: `WARNING: Tool '${last.tool}' invoked 3 consecutive times with identical arguments.`,
        shouldTripBreaker: this.tripThreshold <= 85,
        tripReason: `Repetitive tool call: '${last.tool}' repeated 3x`,
      };
    } else if (consecutiveDuplicates === 2) {
      return {
        riskScore: 40,
        warning: `Potential loop: '${last.tool}' repeated 2 consecutive times.`,
        shouldTripBreaker: false,
      };
    }

    // Cyclic pattern check (e.g. A -> B -> A -> B)
    if (this.callHistory.length >= 4) {
      const len = this.callHistory.length;
      const c1 = this.callHistory[len - 1];
      const c2 = this.callHistory[len - 2];
      const c3 = this.callHistory[len - 3];
      const c4 = this.callHistory[len - 4];

      if (
        c1.tool === c3.tool &&
        c1.argsHash === c3.argsHash &&
        c2.tool === c4.tool &&
        c2.argsHash === c4.argsHash
      ) {
        return {
          riskScore: 90,
          warning: `CRITICAL: 2-step oscillation loop detected: [${c2.tool} <-> ${c1.tool}]`,
          shouldTripBreaker: true,
          tripReason: `Alternating cyclic loop detected between '${c2.tool}' and '${c1.tool}'`,
        };
      }
    }

    return { riskScore: 10, warning: null, shouldTripBreaker: false };
  }
}
