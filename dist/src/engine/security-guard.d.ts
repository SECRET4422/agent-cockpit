import { AgentEvent, SecurityAlert } from '../types.js';
export declare class SecurityGuard {
    private alerts;
    private static DANGEROUS_PATTERNS;
    inspectEvent(event: AgentEvent): SecurityAlert[];
    getAlerts(): SecurityAlert[];
    reset(): void;
}
