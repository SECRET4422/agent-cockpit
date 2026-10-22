import http from 'node:http';
import { SessionStateManager } from './session-state.js';
export declare class ProxyGateway {
    private sessionState;
    private defaultUpstreamUrl;
    constructor(sessionState: SessionStateManager, defaultUpstreamUrl?: string);
    handleRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean;
    private forwardRequest;
    private parseUpstreamResponse;
}
