# 🚀 AgentCockpit

> **Real-time visual telemetry HUD, AI reverse-proxy gateway, and autonomous circuit breaker for AI coding agents (Cursor, Claude Code, Aider, OpenMausBot).**

[![CI & Quality Gate](https://github.com/SECRET4422/agent-cockpit/actions/workflows/ci.yml/badge.svg)](https://github.com/SECRET4422/agent-cockpit/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@ssgk4422/agent-cockpit.svg)](https://www.npmjs.com/package/@ssgk4422/agent-cockpit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

![AgentCockpit HUD Banner](assets/banner.jpg)

---

## ⚡ The Problem: Runaway Agent Loops & Burn

Autonomous coding agents are powerful, but when they hit unexpected compiler errors or failing unit tests, they can fall into **oscillation traps**:
- ❌ **Runaway Loop Burn:** Agents repeat identical commands or oscillate between failing tests, burning **$10–$50** before you notice.
- ❌ **Blind Token Velocity:** No real-time visibility into $/min burn rate or prompt saturation.
- ❌ **Destructive Commands:** Unchecked shell commands or sensitive `.env` file mutations happen before you can hit `Ctrl+C`.

## 🛰️ The Solution: AgentCockpit

**`AgentCockpit`** is a cyberpunk glassmorphic local HUD running on `localhost:3333` that provides:
1. **AI Reverse Proxy Gateway (`localhost:3333/v1`):** Point any agent (Cursor, Aider, Python scripts) to the proxy. It inspects requests, extracts **real provider token metrics**, and **physically blocks requests (HTTP 429)** when a runaway loop occurs.
2. **Real-Time Loop Recurrence Radar:** Sliding-window hash analysis detecting immediate repeats ($A \rightarrow A$), 2-step oscillations ($A \rightarrow B \rightarrow A \rightarrow B$), and 3-step cycles ($A \rightarrow B \rightarrow C \rightarrow A \rightarrow B \rightarrow C$).
3. **AST & Command Security Gate:** Acorn-powered AST analysis detecting dangerous `eval()`, dynamic `Function()`, and `child_process` execution in code diffs, alongside destructive shell command interception.
4. **Physical Process Runner:** `agent-cockpit run -- <command>` to monitor and terminate process trees on circuit-breaker trips.

```
                     ┌───────────────────────────────────────────────┐
                     │          Autonomous AI Agent                  │
                     │   (Cursor / Claude Code / OpenMausBot / Aider)│
                     └───────────────────────┬───────────────────────┘
                                             │
                        ┌────────────────────┴────────────────────┐
                        │ Point API Base:                         │ Manual Ingest:
                        │ OPENAI_BASE_URL=http://localhost:3333/v1│ POST /api/event
                        ▼                                         ▼
                     ┌─────────────────────────────────────────────────────────┐
                     │          AgentCockpit Local Gateway (:3333)             │
                     │                                                         │
                     │  ┌──────────────────┐  ┌─────────────────────────────┐  │
                     │  │   LoopBreaker    │  │   Real Token Ledger         │  │
                     │  │  Recurrence Radar│  │   (Provider usage metadata) │  │
                     │  └────────┬─────────┘  └─────────────────────────────┘  │
                     │           │ Critical Loop Trip (>80%)                   │
                     │           ▼                                             │
                     │  ┌──────────────────┐  ┌─────────────────────────────┐  │
                     │  │ HTTP 429 Blocker │  │   Acorn AST Security Gate   │  │
                     │  │  (HALTS AGENT)   │  │  (eval, child_process, keys)│  │
                     │  └──────────────────┘  └─────────────────────────────┘  │
                     └───────────────────────┬─────────────────────────────────┘
                                             │ SSE Stream
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │     Glassmorphic Live Browser Telemetry HUD   │
                     │             http://localhost:3333             │
                     └───────────────────────────────────────────────┘
```

---

## ⚡ Quickstart

Launch the visual cockpit instantly with zero setup:

```bash
# Launch interactive HUD with live simulated agent flight
npx @ssgk4422/agent-cockpit --demo
```

Or run standard monitoring & proxy mode on port 3333:

```bash
npx @ssgk4422/agent-cockpit --port 3333
```

Your browser will automatically open to `http://localhost:3333`.

---

## 🔌 Connecting Your Agent (Real Protection)

### Method 1: Transparent AI Reverse Proxy (Recommended)
Point your coding agent (Cursor, Aider, Cline, LangChain, CrewAI) to the Cockpit gateway:

```bash
export OPENAI_BASE_URL="http://localhost:3333/v1"
```

* **How it protects:** The gateway forwards requests to the upstream provider (e.g. OpenAI/Anthropic), extracts exact token usage, and monitors tool call recurrence.
* **How it halts loops:** When a loop is detected, the gateway immediately returns `HTTP 429 (Circuit Breaker Tripped)`. The agent's next API turn is rejected, **physically stopping the agent**.

### Method 2: Monitored Process Execution
Run any agent or script under the Cockpit process runner:

```bash
npx @ssgk4422/agent-cockpit run -- npm test
# Or run your Python agent
npx @ssgk4422/agent-cockpit run -- python agent.py
```
When the circuit breaker trips or you click **"EMERGENCY TRIP"** on the dashboard, Cockpit immediately terminates the child process hierarchy.

### Method 3: Direct Event Ingestion (cURL / Python / Node)
```bash
curl -X POST http://localhost:3333/api/event \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "Cursor Agent",
    "type": "tool_call",
    "tool": "edit_file",
    "args": { "file": "src/auth.ts" }
  }'
```

---

## 🛠️ Features

### 1. 🎯 Real-Time Loop Recurrence Radar
- Sliding-window hash analysis of tool call signatures and arguments.
- Detects immediate duplicate repetitions, 2-step oscillation loops ($A \rightarrow B \rightarrow A \rightarrow B$), and 3-step cycles ($A \rightarrow B \rightarrow C \rightarrow A \rightarrow B \rightarrow C$).
- Visual Risk Meter:
  - **0% – 39%:** `NOMINAL` (Green)
  - **40% – 79%:** `ELEVATED` (Amber)
  - **80% – 100%:** `CRITICAL` (Red - Breaker Trips & Blocks Traffic)

### 2. ⚡ Real Token Velocity & Cost Accounting
- Real-time speedometer tracking token spend in **$/minute** and **tokens/second**.
- Exact token ledger reading real `prompt_tokens` and `completion_tokens` from provider metadata (NO fabricated numbers).
- Configured for frontier models (Claude 3.5 Sonnet, GPT-4o, GPT-4o-mini, DeepSeek V3, DeepSeek R1).

### 3. 🚨 1-Click Emergency Freeze Killswitch
- Prominent glowing killswitch toggle in the HUD header.
- Instantly halts event ingestion, sets agent state to `BREAKER_TRIPPED`, and blocks outgoing proxy calls.
- 1-click **Reset & Resume** button once you inspect the code diff.

### 4. 🛡️ Acorn AST & Shell Security Gate
- Real AST analysis using Acorn to detect dangerous `eval()`, dynamic `Function()`, and `child_process` execution.
- Intercepts catastrophic shell patterns (`rm -rf /`, fork bombs, curl-pipe-sh).
- Scans payloads for leaked credentials (OpenAI/Anthropic keys, AWS keys, GitHub tokens, private keys).

---

## 🧪 Testing & Verification

```bash
# Clone the repository
git clone https://github.com/SECRET4422/agent-cockpit.git
cd agent-cockpit

# Install and build
npm install
npm run build

# Run test suite
npm test
```

All test suites verify loop detection accuracy, token cost math, AST security guards, HTTP/SSE endpoints, and the AI Reverse Proxy Gateway.

---

## 🏛️ Engineered by AlphaTech Studio

Built by **Prabhakar Pal** ([@SECRET4422](https://github.com/SECRET4422)) at [**AlphaTech Studio**](https://alphatech.studio).

Complements our open-source agent reliability stack:
- [`loopbreaker`](https://github.com/SECRET4422/loopbreaker) — Autonomous AI bug-loop interrupter & circuit breaker.
- [`guardrail-mcp`](https://github.com/SECRET4422/guardrail-mcp) — Enterprise multi-language security & AST policy gate.
- [`visual-smoke`](https://github.com/SECRET4422/visual-smoke) — Zero-code automated localhost visual smoke testing & invariant guard.
- [`vision-craft`](https://github.com/SECRET4422/vision-craft) — Screenshot-to-Fullstack live sandbox with 1:1 ghost diffs.
- [`mcp-deep-research-server`](https://github.com/SECRET4422/mcp-deep-research-server) — Autonomous deep web research & synthesis engine.

---

## 📄 License

MIT © [Prabhakar Pal](https://github.com/SECRET4422) · [AlphaTech Studio](https://alphatech.studio)
