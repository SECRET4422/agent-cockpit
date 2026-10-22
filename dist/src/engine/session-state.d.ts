import { AgentEvent, CockpitTelemetry } from '../types.js';
export declare class SessionStateManager {
    private startedAt;
    private activeAgent;
    private activeState;
    private loopDetector;
    private tokenTracker;
    private securityGuard;
    private recentEvents;
    private mutatedFilesSet;
    private breakerTripped;
    private breakerReason?;
    private subscribers;
    private simulationInterval;
    ingestEvent(rawEvent: Partial<AgentEvent>): CockpitTelemetry;
    tripBreaker(reason?: string): CockpitTelemetry;
    resetBreaker(): CockpitTelemetry;
    getTelemetry(): CockpitTelemetry;
    subscribe(callback: (data: CockpitTelemetry) => void): () => void;
    private notifySubscribers;
    /**
     * Starts a live flight simulation to showcase AgentCockpit's real-time detection
     */
    runFlightSimulation(): void;
    startSimulation(): void;
    stopSimulation(): void;
}
