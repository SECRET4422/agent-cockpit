export type EventType =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'file_mutation'
  | 'error'
  | 'alert'
  | 'breaker_tripped'
  | 'proxy_request'
  | 'proxy_blocked';

export interface TokenUsage {
  input: number;
  output: number;
  costEstimate: number; // in USD
  isEstimated?: boolean; // false when reported by provider API, true if heuristic
  model?: string;
  provider?: string;
}

export interface SecurityAlert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  rule: string;
  description: string;
  timestamp: number;
  target?: string;
  astContext?: string;
}

export interface AgentEvent {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  type: EventType;
  message?: string;
  tool?: string;
  args?: Record<string, unknown>;
  file?: string;
  tokens?: TokenUsage;
  durationMs?: number;
  status?: 'running' | 'completed' | 'failed' | 'tripped';
}

export interface ProxyMetrics {
  totalRequests: number;
  blockedRequests: number;
  activeProvider: string;
  upstreamUrl: string;
  lastInterceptedTool?: string;
}

export interface CockpitTelemetry {
  sessionStartedAt: number;
  uptimeSeconds: number;
  activeAgent: string;
  activeState: 'IDLE' | 'REASONING' | 'EXECUTING_TOOL' | 'ANALYZING_DIFF' | 'BREAKER_TRIPPED';
  totalEvents: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
    isEstimated: boolean;
  };
  totalCostUsd: number;
  burnRatePerMin: number;
  loopRiskScore: number; // 0 - 100
  loopWarning: string | null;
  breakerTripped: boolean;
  breakerReason?: string;
  recentEvents: AgentEvent[];
  mutatedFiles: string[];
  securityAlerts: SecurityAlert[];
  proxyMetrics?: ProxyMetrics;
  activeChildPid?: number | null;
}
