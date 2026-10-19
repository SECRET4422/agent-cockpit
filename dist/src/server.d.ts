import http from 'node:http';
import { SessionStateManager } from './engine/session-state.js';
export declare function createCockpitServer(sessionState: SessionStateManager, publicDir?: string): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
