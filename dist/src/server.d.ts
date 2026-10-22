import http from 'node:http';
import { SessionStateManager } from './engine/session-state.js';
import { ProxyGateway } from './engine/proxy-gateway.js';
export declare function createCockpitServer(sessionState: SessionStateManager, publicDir?: string, proxyGateway?: ProxyGateway): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
