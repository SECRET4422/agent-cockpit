// AgentCockpit Live Telemetry Engine

let currentTelemetry = null;
let currentFilter = 'all';
let isSimulating = false;

// Audio alerts via Web Audio API
function playAlertSound(type = 'blip') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'trip') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    }
  } catch {
    // Audio context may require user interaction first
  }
}

// Format duration
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Format numbers
function formatNum(num) {
  return new Intl.NumberFormat().format(num);
}

// Initialize SSE Stream
function connectStream() {
  const eventSource = new EventSource('/api/stream');

  eventSource.onmessage = (event) => {
    try {
      const telemetry = JSON.parse(event.data);
      updateDashboard(telemetry);
    } catch (err) {
      console.error('Error parsing telemetry SSE:', err);
    }
  };

  eventSource.onerror = () => {
    document.getElementById('flightStatusBadge').className = 'flight-status-badge';
    document.getElementById('flightStatusText').textContent = 'RECONNECTING...';
    eventSource.close();
    setTimeout(connectStream, 2000);
  };
}

// Update DOM components
function updateDashboard(t) {
  const prevTripped = currentTelemetry ? currentTelemetry.breakerTripped : false;
  currentTelemetry = t;

  // 1. Header & Status
  document.getElementById('uptimeText').textContent = formatUptime(t.uptimeSeconds || 0);

  const statusBadge = document.getElementById('flightStatusBadge');
  const statusText = document.getElementById('flightStatusText');

  if (t.breakerTripped) {
    statusBadge.className = 'flight-status-badge tripped';
    statusText.textContent = 'BREAKER TRIPPED · FROZEN';
    if (!prevTripped) playAlertSound('trip');
  } else {
    statusBadge.className = 'flight-status-badge';
    statusText.textContent = `${t.activeState} · ACTIVE`;
  }

  // 2. Emergency Banner
  const emergencyBanner = document.getElementById('emergencyBanner');
  const emergencyReason = document.getElementById('emergencyReason');
  if (t.breakerTripped) {
    emergencyBanner.classList.remove('hidden');
    emergencyReason.textContent = t.breakerReason || 'Runaway repetitive loop pattern intercepted.';
  } else {
    emergencyBanner.classList.add('hidden');
  }

  // 3. Risk Meter
  const riskVal = document.getElementById('riskValue');
  const riskBar = document.getElementById('riskBar');
  const riskBadge = document.getElementById('riskBadge');
  const riskFootnote = document.getElementById('riskFootnote');

  riskVal.textContent = t.loopRiskScore;
  riskBar.style.width = `${Math.min(100, t.loopRiskScore)}%`;

  if (t.loopRiskScore >= 80) {
    riskVal.style.color = 'var(--accent-red)';
    riskBar.style.background = 'var(--accent-red)';
    riskBadge.textContent = 'CRITICAL';
    riskBadge.style.color = 'var(--accent-red)';
  } else if (t.loopRiskScore >= 40) {
    riskVal.style.color = 'var(--accent-amber)';
    riskBar.style.background = 'var(--accent-amber)';
    riskBadge.textContent = 'ELEVATED';
    riskBadge.style.color = 'var(--accent-amber)';
  } else {
    riskVal.style.color = 'var(--accent-green)';
    riskBar.style.background = 'var(--accent-green)';
    riskBadge.textContent = 'NOMINAL';
    riskBadge.style.color = 'var(--accent-green)';
  }

  riskFootnote.textContent = t.loopWarning || 'Sliding window: Nominal execution telemetry';

  // 4. Token Burn Velocity
  document.getElementById('burnRateVal').textContent = `$${t.burnRatePerMin.toFixed(3)}`;
  document.getElementById('tokenRateFootnote').textContent = `Est. $${(t.burnRatePerMin * 60).toFixed(2)} / hr burn rate`;

  // 5. Total Session Cost
  document.getElementById('totalTokensVal').textContent = formatNum(t.totalTokens.total);
  document.getElementById('totalCostVal').textContent = `($${t.totalCostUsd.toFixed(4)})`;
  document.getElementById('tokenSplitFootnote').textContent = `In: ${formatNum(t.totalTokens.input)} · Out: ${formatNum(t.totalTokens.output)}`;

  // 6. Active Agent
  document.getElementById('activeAgentName').textContent = t.activeAgent || 'Autonomous Agent';
  document.getElementById('filesMutatedFootnote').textContent = `${t.mutatedFiles.length} files modified`;

  // 7. Event Counter
  document.getElementById('eventCounter').textContent = `${t.recentEvents.length} Events`;

  // 8. Render Events Feed
  renderEventsFeed(t.recentEvents);

  // 9. Render Call Recurrence Radar
  renderRadarStack(t.recentEvents);

  // 10. Render Mutated Files
  renderMutatedFiles(t.mutatedFiles);
}

function renderEventsFeed(events) {
  const feed = document.getElementById('eventsFeed');
  if (!events || events.length === 0) {
    return;
  }

  const filtered = events.filter((e) => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'breaker') return e.type === 'breaker_tripped' || e.type === 'alert';
    return e.type === currentFilter;
  });

  if (filtered.length === 0) {
    feed.innerHTML = `<div class="feed-empty-state"><p>No events matching filter: <b>${currentFilter}</b></p></div>`;
    return;
  }

  const icons = {
    tool_call: '⚙️',
    tool_result: '📥',
    thought: '🧠',
    file_mutation: '📝',
    breaker_tripped: '🚨',
    alert: '⚠️',
    error: '❌',
  };

  feed.innerHTML = filtered
    .map((e) => {
      const timeStr = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let codeSnippet = '';
      if (e.args) {
        codeSnippet = `<div class="event-code-snippet">${escapeHtml(JSON.stringify(e.args))}</div>`;
      } else if (e.file) {
        codeSnippet = `<div class="event-code-snippet">${escapeHtml(e.file)}</div>`;
      }

      return `
        <div class="event-item ${e.type}">
          <div class="event-icon">${icons[e.type] || '•'}</div>
          <div class="event-body">
            <div class="event-meta">
              <span class="event-type-badge">${e.tool ? `${e.tool}` : e.type}</span>
              <span class="event-time">${timeStr}</span>
            </div>
            <div class="event-msg">${escapeHtml(e.message || (e.tool ? `Invoked ${e.tool}` : 'Telemetry event recorded'))}</div>
            ${codeSnippet}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderRadarStack(events) {
  const stack = document.getElementById('radarStack');
  const toolCalls = (events || []).filter((e) => e.type === 'tool_call' && e.tool).slice(0, 5);

  if (toolCalls.length === 0) {
    stack.innerHTML = '<div class="radar-empty">Zero tool calls in sliding window</div>';
    return;
  }

  // Count consecutive duplicates
  stack.innerHTML = toolCalls
    .map((call, idx, arr) => {
      const isRepeat = idx > 0 && arr[idx - 1].tool === call.tool;
      return `
        <div class="radar-call-item ${isRepeat ? 'repeated' : ''}">
          <span>⚙️ ${escapeHtml(call.tool)}</span>
          ${isRepeat ? '<span class="repeat-badge">RECURSION RISK</span>' : '<span style="color:var(--text-muted);font-size:0.7rem">OK</span>'}
        </div>
      `;
    })
    .join('');
}

function renderMutatedFiles(files) {
  const list = document.getElementById('fileList');
  const countTag = document.getElementById('mutatedCount');
  countTag.textContent = files.length;

  if (!files || files.length === 0) {
    list.innerHTML = '<li class="file-empty">No files touched yet</li>';
    return;
  }

  list.innerHTML = files.map((f) => `<li>📄 ${escapeHtml(f)}</li>`).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  connectStream();

  // Filter Pills
  document.querySelectorAll('.filter-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pills .pill').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (currentTelemetry) renderEventsFeed(currentTelemetry.recentEvents);
    });
  });

  // Simulate Flight Button
  const simBtn = document.getElementById('simBtn');
  const simText = document.getElementById('simBtnText');
  simBtn.addEventListener('click', async () => {
    playAlertSound('blip');
    isSimulating = !isSimulating;
    if (isSimulating) {
      simText.textContent = 'Stop Simulation';
      simBtn.classList.add('btn-warning');
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
    } else {
      simText.textContent = 'Simulate Flight';
      simBtn.classList.remove('btn-warning');
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    }
  });

  // Emergency Killswitch Button
  const killswitchBtn = document.getElementById('killswitchBtn');
  killswitchBtn.addEventListener('click', async () => {
    playAlertSound('trip');
    await fetch('/api/killswitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'trip', reason: 'User Manual Emergency Killswitch Engaged' }),
    });
  });

  // Reset Breaker Button
  const resetBreakerBtn = document.getElementById('resetBreakerBtn');
  resetBreakerBtn.addEventListener('click', async () => {
    playAlertSound('blip');
    await fetch('/api/killswitch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    });
  });
});
