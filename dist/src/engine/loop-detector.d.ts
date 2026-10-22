import { AgentEvent } from '../types.js';
export interface LoopAnalysis {
    riskScore: number;
    warning: string | null;
    shouldTripBreaker: boolean;
    tripReason?: string;
}
export declare class LoopDetector {
    private callHistory;
    private readonly windowSize;
    private readonly tripThreshold;
    constructor(windowSize?: number, tripThreshold?: number);
    recordCall(event: AgentEvent): LoopAnalysis;
    analyze(): LoopAnalysis;
    private hashArgs;
    currentAnalysis(): LoopAnalysis;
    reset(): void;
}
