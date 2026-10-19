import { TokenUsage } from '../types.js';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'claude-3-5-sonnet': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'deepseek-v3': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
};

export class TokenTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private recentTokenEvents: { timestamp: number; tokens: number; cost: number }[] = [];

  public recordUsage(tokens: TokenUsage): void {
    this.totalInputTokens += tokens.input;
    this.totalOutputTokens += tokens.output;
    this.totalCostUsd += tokens.costEstimate;

    const now = Date.now();
    this.recentTokenEvents.push({
      timestamp: now,
      tokens: tokens.input + tokens.output,
      cost: tokens.costEstimate,
    });

    this.pruneOldEvents(now);
  }

  public getSummary() {
    this.pruneOldEvents(Date.now());
    const burnRatePerMin = this.calculateBurnRate();

    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      totalCostUsd: Number(this.totalCostUsd.toFixed(4)),
      burnRatePerMin: Number(burnRatePerMin.toFixed(4)),
    };
  }

  public estimateCost(input: number, output: number, model = 'claude-3-5-sonnet'): number {
    const pricing = DEFAULT_PRICING[model] || DEFAULT_PRICING['claude-3-5-sonnet'];
    const cost =
      (input / 1_000_000) * pricing.inputPerMillion +
      (output / 1_000_000) * pricing.outputPerMillion;
    return Number(cost.toFixed(5));
  }

  public reset(): void {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.totalCostUsd = 0;
    this.recentTokenEvents = [];
  }

  private pruneOldEvents(now: number): void {
    const windowMs = 60 * 1000; // 1 minute sliding window
    this.recentTokenEvents = this.recentTokenEvents.filter(
      (e) => now - e.timestamp <= windowMs
    );
  }

  private calculateBurnRate(): number {
    if (this.recentTokenEvents.length === 0) return 0;
    const costInWindow = this.recentTokenEvents.reduce((acc, e) => acc + e.cost, 0);
    return costInWindow; // USD burned per minute
  }
}
