import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { SessionStateManager } from './session-state.js';

export class ProxyGateway {
  private sessionState: SessionStateManager;
  private defaultUpstreamUrl: string;

  constructor(sessionState: SessionStateManager, defaultUpstreamUrl = 'https://api.openai.com/v1') {
    this.sessionState = sessionState;
    this.defaultUpstreamUrl = process.env.UPSTREAM_API_BASE || defaultUpstreamUrl;
  }

  public handleRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const url = new URL(req.url || '/', 'http://localhost');

    // Only route /v1/* requests
    if (!url.pathname.startsWith('/v1/')) {
      return false;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-upstream-url',
      });
      res.end();
      return true;
    }

    // 1. HARD CIRCUIT BREAKER ENFORCEMENT
    if (this.sessionState.isBreakerTripped()) {
      this.sessionState.recordProxyBlocked();
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        JSON.stringify({
          error: {
            message:
              '🚨 AgentCockpit Circuit Breaker Engaged: ' +
              (this.sessionState.getBreakerReason() ||
                'Runaway recursive loop detected! Execution blocked to prevent credit burn.'),
            type: 'circuit_breaker_tripped',
            code: 'LOOP_CIRCUIT_TRIPPED',
          },
        })
      );
      return true;
    }

    // 2. Buffer request body
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      this.forwardRequest(req, res, url, body);
    });

    return true;
  }

  private forwardRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    body: string
  ): void {
    const targetBase = (req.headers['x-upstream-url'] as string) || this.defaultUpstreamUrl;
    let targetUrl: URL;
    try {
      targetUrl = new URL(url.pathname + url.search, targetBase);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid upstream URL configured' }));
      return;
    }

    // Inspect outgoing payload for tools / thoughts
    try {
      if (body) {
        const parsed = JSON.parse(body);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          const lastMsg = parsed.messages[parsed.messages.length - 1];
          if (lastMsg) {
            this.sessionState.ingestEvent({
              agentName: parsed.model || 'Proxy Agent',
              type: lastMsg.role === 'tool' ? 'tool_result' : 'thought',
              message:
                typeof lastMsg.content === 'string'
                  ? lastMsg.content.slice(0, 300)
                  : 'Outgoing message payload',
            });
          }
        }
      }
    } catch {}

    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const outgoingHeaders = { ...req.headers };
    delete outgoingHeaders['host'];
    delete outgoingHeaders['x-upstream-url'];

    const proxyReq = client.request(
      targetUrl,
      {
        method: req.method,
        headers: outgoingHeaders,
      },
      (upstreamRes) => {
        // Relay status and headers
        res.writeHead(upstreamRes.statusCode || 200, {
          ...upstreamRes.headers,
          'Access-Control-Allow-Origin': '*',
        });

        let responseBody = '';
        upstreamRes.on('data', (chunk) => {
          res.write(chunk);
          responseBody += chunk.toString();
        });

        upstreamRes.on('end', () => {
          res.end();
          this.parseUpstreamResponse(responseBody, targetBase);
        });
      }
    );

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            message: 'AgentCockpit Proxy failed to reach upstream: ' + err.message,
            type: 'proxy_connection_error',
          },
        })
      );
    });

    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  }

  private parseUpstreamResponse(body: string, upstreamUrl: string): void {
    try {
      const parsed = JSON.parse(body);
      this.sessionState.recordProxySuccess(upstreamUrl);

      // Extract real token usage
      if (parsed.usage) {
        const input = parsed.usage.prompt_tokens || 0;
        const output = parsed.usage.completion_tokens || 0;
        const model = parsed.model || 'claude-3-5-sonnet';
        this.sessionState.recordRealTokens(input, output, model);
      }

      // Check tool calls from assistant response
      const choice = parsed.choices?.[0];
      if (choice?.message?.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(toolCall.function?.arguments || '{}');
          } catch {}

          this.sessionState.ingestEvent({
            agentName: parsed.model || 'Proxy Agent',
            type: 'tool_call',
            tool: toolCall.function?.name || 'unknown_tool',
            args,
            tokens: { input: 0, output: 0, costEstimate: 0, isEstimated: false },
          });
        }
      }
    } catch {
      // Streamed responses or non-JSON are handled safely
    }
  }
}
