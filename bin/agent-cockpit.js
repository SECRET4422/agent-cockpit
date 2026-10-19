#!/usr/bin/env node

import { exec } from 'node:child_process';
import { SessionStateManager } from '../dist/src/engine/session-state.js';
import { createCockpitServer } from '../dist/src/server.js';

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
  🚀 AgentCockpit - Real-Time Visual Telemetry & Circuit Breaker for AI Agents
  
  Usage:
    agent-cockpit [options]
    npx agent-cockpit [options]

  Options:
    -p, --port <number>    Port to listen on (default: 4040)
    -d, --demo             Launch with live simulated flight session
    --no-open              Do not automatically open browser on start
    -h, --help             Show this help guide

  Examples:
    npx agent-cockpit --demo
    npx agent-cockpit --port 5050
  `);
  process.exit(0);
}

let port = 4040;
const portIdx = args.findIndex((a) => a === '-p' || a === '--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  port = parseInt(args[portIdx + 1], 10) || 4040;
}

const isDemo = args.includes('-d') || args.includes('--demo');
const noOpen = args.includes('--no-open');

const sessionState = new SessionStateManager();
const server = createCockpitServer(sessionState);

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  
  console.log('\x1b[36m' + `
  █████╗  ██████╗ ███████╗███╗   ██╗████████╗    ██████╗ ██████╗  ██████╗██╗  ██╗██████╗ ██╗████████╗
 ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝   ██╔════╝██╔═══██╗██╔════╝██║ ██╔╝██╔══██╗██║╚══██╔══╝
 ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║      ██║     ██║   ██║██║     █████╔╝ ██████╔╝██║   ██║   
 ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║      ██║     ██║   ██║██║     ██╔═██╗ ██╔═══╝ ██║   ██║   
 ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║      ╚██████╗╚██████╔╝╚██████╗██║  ██╗██║     ██║   ██║   
 ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝       ╚═════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   
  ` + '\x1b[0m');

  console.log('\x1b[32m' + `  [LIVE] Visual HUD active on: ${url}` + '\x1b[0m');
  console.log('\x1b[90m' + `  [INGEST] Agent event endpoint: POST ${url}/api/event` + '\x1b[0m');
  console.log('\x1b[90m' + `  [SAFETY] LoopBreaker engine armed & monitoring recurrence.` + '\x1b[0m');

  if (isDemo) {
    console.log('\x1b[33m' + `  [SIMULATION] Demo flight sequence initiated...` + '\x1b[0m');
    sessionState.startSimulation();
  }

  console.log('\n  Press Ctrl+C to disconnect HUD.\n');

  if (!noOpen) {
    const startCmd =
      process.platform === 'win32'
        ? `start ${url}`
        : process.platform === 'darwin'
        ? `open ${url}`
        : `xdg-open ${url}`;
    exec(startCmd, () => {});
  }
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('\n  AgentCockpit telemetry offline.');
    process.exit(0);
  });
});
