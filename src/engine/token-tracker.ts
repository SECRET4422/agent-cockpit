import { TokenUsage } from '../types.js';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'claude-3-5-sonnet': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-opus': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'deepseek-v3': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek-r1': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
};

export class TokenTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private isEstimated = false;
  private recentTokenEvents: { timestamp: number; tokens: number; cost: number }[] = [];

  public recordUsage(tokens: TokenUsage): void {
    this.totalInputTokens += tokens.input;
    this.totalOutputTokens += tokens.output;
    this.totalCostUsd += tokens.costEstimate;
    if (tokens.isEstimated) {
      this.isEstimated = true;
    }

    const totalThisTurn = tokens.input + tokens.output;
    this.recentTokenEvents.push({
      timestamp: Date.now(),
      tokens: totalThisTurn,
      cost: tokens.costEstimate,
    });

    const cutoff = Date.now() - 60000;
    this.recentTokenEvents = this.recentTokenEvents.filter((e) => e.timestamp >= cutoff);
  }

  public estimateCost(input: number, output: number, model = 'claude-3-5-sonnet'): number {
    const pricing = DEFAULT_PRICING[model] || DEFAULT_PRICING['claude-3-5-sonnet'];
    const inputCost = (input / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (output / 1_000_000) * pricing.outputPerMillion;
    return inputCost + outputCost;
  }

  public getBurnRatePerMin(): number {
    const cutoff = Date.now() - 60000;
    const activeEvents = this.recentTokenEvents.filter((e) => e.timestamp >= cutoff);
    return activeEvents.reduce((acc, curr) => acc + curr.cost, 0);
  }

  public getSummary() {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      totalCostUsd: this.totalCostUsd,
      burnRatePerMin: this.getBurnRatePerMin(),
      isEstimated: this.isEstimated,
    };
  }

  public reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCostUsd = 0;
    this.isEstimated = false;
    this.recentTokenEvents = [];
  }
}
