import { TokenUsage } from '../types.js';
export interface ModelPricing {
    inputPerMillion: number;
    outputPerMillion: number;
}
export declare const DEFAULT_PRICING: Record<string, ModelPricing>;
export declare class TokenTracker {
    private totalInputTokens;
    private totalOutputTokens;
    private totalCostUsd;
    private recentTokenEvents;
    recordUsage(tokens: TokenUsage): void;
    getSummary(): {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        totalCostUsd: number;
        burnRatePerMin: number;
    };
    estimateCost(input: number, output: number, model?: string): number;
    reset(): void;
    private pruneOldEvents;
    private calculateBurnRate;
}
