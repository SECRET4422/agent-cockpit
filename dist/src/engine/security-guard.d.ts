import { AgentEvent, SecurityAlert } from '../types.js';
export declare class SecurityGuard {
    private alerts;
    private static DANGEROUS_COMMANDS;
    private static SECRET_PATTERNS;
    inspectEvent(event: AgentEvent): SecurityAlert[];
    /**
     * Real AST Parser using Acorn to detect dangerous runtime patterns
     */
    inspectCodeAST(code: string, filename: string): SecurityAlert[];
    getAlerts(): SecurityAlert[];
    clear(): void;
}
