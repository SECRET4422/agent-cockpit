#!/usr/bin/env node

import { SessionStateManager } from '../dist/src/engine/session-state.js';
import { createCockpitServer } from '../dist/src/server.js';
import { exec } from 'node:child_process';

const args = process.argv.slice(2);
let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
let demoMode = false;
let autoOpen = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--port') {
    port = parseInt(args[i + 1], 10) || 3333;
    i++;
  } else if (args[i] === '-d' || args[i] === '--demo') {
    demoMode = true;
  } else if (args[i] === '--no-open') {
    autoOpen = false;
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log(`
  🚀 AgentCockpit - Real-Time Visual Telemetry & Circuit Breaker for AI Agents
  
  Usage:
    npx @ssgk4422/agent-cockpit [options]
    agent-cockpit [options]

  Options:
    -p, --port <number>    Port to listen on (default: 3333)
    -d, --demo             Launch with live simulated flight session
    --no-open              Do not automatically open browser on start
    -h, --help             Show this help guide

  Examples:
    npx @ssgk4422/agent-cockpit --demo
    npx @ssgk4422/agent-cockpit --port 5050
  `);
    process.exit(0);
  }
}

const sessionState = new SessionStateManager();
const server = createCockpitServer(sessionState);

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`
  ╔════════════════════════════════════════════════════════════════╗
  ║                                                                ║
  ║   🚀  A G E N T   C O C K P I T   v1.0.0                      ║
  ║   Visual Telemetry HUD & Autonomous Circuit Breaker           ║
  ║                                                                ║
  ╚════════════════════════════════════════════════════════════════╝

  🛰️  Telemetry HUD:     ${url}
  📡  Event Ingest API:  ${url}/api/event (POST)
  🛡️  Loop Breaker:      ACTIVE (Sliding Window Hash Analysis)
  ⚡  Token Velocity:    ONLINE
  ${demoMode ? '🎮  Flight Demo:       SIMULATION ACTIVE' : '🛑  Flight Status:     LISTENING FOR AGENTS'}

  Press Ctrl+C to terminate cockpit server.
  `);

  if (demoMode) {
  if (typeof sessionState.startSimulation === 'function') {
    sessionState.startSimulation();
  } else if (typeof sessionState.runFlightSimulation === 'function') {
    sessionState.runFlightSimulation();
  }
  }

  if (autoOpen) {
    const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCmd} ${url}`);
  }
});
