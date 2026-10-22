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
    private isEstimated;
    private recentTokenEvents;
    recordUsage(tokens: TokenUsage): void;
    estimateCost(input: number, output: number, model?: string): number;
    getBurnRatePerMin(): number;
    getSummary(): {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        totalCostUsd: number;
        burnRatePerMin: number;
        isEstimated: boolean;
    };
    reset(): void;
}
