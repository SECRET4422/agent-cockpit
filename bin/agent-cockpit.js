#!/usr/bin/env node

import { SessionStateManager } from '../dist/src/engine/session-state.js';
import { createCockpitServer } from '../dist/src/server.js';
import { ProcessRunner } from '../dist/src/engine/process-runner.js';
import { exec } from 'node:child_process';

const args = process.argv.slice(2);
let port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3333;
let demoMode = false;
let autoOpen = true;
let isRunMode = false;
let runCmd = '';
let runArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--port') {
    port = parseInt(args[i + 1], 10) || 3333;
    i++;
  } else if (args[i] === '-d' || args[i] === '--demo') {
    demoMode = true;
  } else if (args[i] === '--no-open') {
    autoOpen = false;
  } else if (args[i] === 'run') {
    isRunMode = true;
    const remaining = args.slice(i + 1);
    if (remaining[0] === '--') remaining.shift();
    runCmd = remaining[0];
    runArgs = remaining.slice(1);
    break;
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log(`
  🚀 AgentCockpit - Real-Time Visual Telemetry & Circuit Breaker for AI Agents
  
  Usage:
    npx @ssgk4422/agent-cockpit [options]
    agent-cockpit [options]
    agent-cockpit run -- <command> [args...]

  Options:
    -p, --port <number>    Port to listen on (default: 3333, or $PORT)
    -d, --demo             Launch with live simulated flight session
    --no-open              Do not automatically open browser on start
    -h, --help             Show this help guide

  Commands:
    run -- <command>       Execute child process with active circuit-breaker guard

  Examples:
    npx @ssgk4422/agent-cockpit --demo
    npx @ssgk4422/agent-cockpit --port 5050
    npx @ssgk4422/agent-cockpit run -- npm test
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
  ║   🚀  A G E N T   C O C K P I T   v1.1.0                      ║
  ║   Visual Telemetry HUD & Autonomous Circuit Breaker           ║
  ║                                                                ║
  ╚════════════════════════════════════════════════════════════════╝

  🛰️  Telemetry HUD:     ${url}
  📡  Event Ingest API:  ${url}/api/event (POST)
  🔌  AI Reverse Proxy:  ${url}/v1 (OpenAI/Anthropic Gateway)
  🛡️  Loop Breaker:      ACTIVE (Sliding Window Hash Analysis)
  ⚡  Token Velocity:    ONLINE (Real Provider Ledger)
  ${demoMode ? '🎮  Flight Demo:       SIMULATION ACTIVE' : isRunMode ? '🏃  Execution Mode:    RUNNING SUBPROCESS' : '🛑  Flight Status:     LISTENING FOR AGENTS'}

  Press Ctrl+C to terminate cockpit server.
  `);

  if (demoMode) {
    sessionState.startSimulation();
  }

  if (isRunMode && runCmd) {
    const runner = new ProcessRunner();
    sessionState.setActiveChildPid(runner.getActivePid());

    console.log(`Spawning monitored process: ${runCmd} ${runArgs.join(' ')}`);
    runner
      .runCommand(runCmd, runArgs, (output) => {
        sessionState.ingestEvent({
          agentName: `Monitored Process: ${runCmd}`,
          type: 'tool_call',
          tool: runCmd,
          message: output.slice(0, 300),
        });
      })
      .then((code) => {
        console.log(`Process completed with exit code: ${code}`);
        process.exit(code);
      })
      .catch((err) => {
        console.error('Process execution error:', err);
        process.exit(1);
      });
  }

  if (autoOpen && !isRunMode) {
    const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCmd} ${url}`);
  }
});
