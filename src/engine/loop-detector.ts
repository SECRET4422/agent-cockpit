import { AgentEvent } from '../types.js';
import crypto from 'node:crypto';

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

  constructor(windowSize = 20, tripThreshold = 80) {
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
      timestamp: event.timestamp || Date.now(),
    });

    if (this.callHistory.length > this.windowSize) {
      this.callHistory.shift();
    }

    return this.analyze();
  }

  public analyze(): LoopAnalysis {
    if (this.callHistory.length < 2) {
      return {
        riskScore: 0,
        warning: 'Nominal execution',
        shouldTripBreaker: false,
      };
    }

    let riskScore = 0;
    let warning: string | null = null;
    let tripReason: string | undefined;

    const len = this.callHistory.length;
    const last = this.callHistory[len - 1];

    // 1. Consecutive identical call detection
    let consecutiveIdentical = 1;
    for (let i = len - 2; i >= 0; i--) {
      if (this.callHistory[i].tool === last.tool && this.callHistory[i].argsHash === last.argsHash) {
        consecutiveIdentical++;
      } else {
        break;
      }
    }

    if (consecutiveIdentical >= 4) {
      riskScore = 100;
      tripReason = `Repetitive tool call: '${last.tool}' repeated ${consecutiveIdentical}x identically`;
    } else if (consecutiveIdentical === 3) {
      riskScore = 85;
      tripReason = `Repetitive tool call: '${last.tool}' repeated 3x`;
    } else if (consecutiveIdentical === 2) {
      riskScore = 40;
      warning = `Tool '${last.tool}' repeated with identical arguments`;
    }

    // 2. 2-Step cyclic oscillation detection (A -> B -> A -> B)
    if (len >= 4 && riskScore < 80) {
      const a1 = this.callHistory[len - 1];
      const b1 = this.callHistory[len - 2];
      const a2 = this.callHistory[len - 3];
      const b2 = this.callHistory[len - 4];

      if (
        a1.tool === a2.tool &&
        a1.argsHash === a2.argsHash &&
        b1.tool === b2.tool &&
        b1.argsHash === b2.argsHash &&
        a1.tool !== b1.tool
      ) {
        riskScore = 90;
        tripReason = `Oscillation cycle detected between '${a1.tool}' and '${b1.tool}'`;
      }
    }

    // 3. 3-Step cyclic loop detection (A -> B -> C -> A -> B -> C)
    if (len >= 6 && riskScore < 80) {
      const a1 = this.callHistory[len - 1];
      const b1 = this.callHistory[len - 2];
      const c1 = this.callHistory[len - 3];
      const a2 = this.callHistory[len - 4];
      const b2 = this.callHistory[len - 5];
      const c2 = this.callHistory[len - 6];

      if (a1.tool === a2.tool && b1.tool === b2.tool && c1.tool === c2.tool) {
        riskScore = 85;
        tripReason = `3-step cyclic execution pattern detected: [${c1.tool} -> ${b1.tool} -> ${a1.tool}]`;
      }
    }

    const shouldTripBreaker = riskScore >= this.tripThreshold;
    if (shouldTripBreaker && !warning) {
      warning = tripReason || 'Autonomous loop prevention triggered';
    }

    return {
      riskScore,
      warning,
      shouldTripBreaker,
      tripReason,
    };
  }

  private hashArgs(args: Record<string, unknown>): string {
    try {
      const str = JSON.stringify(args, Object.keys(args).sort());
      return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
    } catch {
      return 'hash_err';
    }
  }

  public currentAnalysis(): LoopAnalysis {
    return this.analyze();
  }

  public reset(): void {
    this.callHistory = [];
  }
}
