import * as acorn from 'acorn';
export class SecurityGuard {
    alerts = [];
    static DANGEROUS_COMMANDS = [
        {
            regex: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--force)\s+([~/]|\*|\.\s*$)/i,
            severity: 'critical',
            rule: 'DESTRUCTIVE_COMMAND',
            description: 'Potentially catastrophic recursive file deletion detected',
        },
        {
            regex: /(:(){ :\|:& };:|fork\(\))/i,
            severity: 'critical',
            rule: 'FORK_BOMB',
            description: 'System denial-of-service fork bomb pattern detected',
        },
        {
            regex: /(curl|wget)\s+[^|]+\|\s*(bash|sh|zsh|powershell)/i,
            severity: 'high',
            rule: 'UNVERIFIED_REMOTE_EXEC',
            description: 'Piping unverified remote web script directly into shell execution',
        },
        {
            regex: /dd\s+if=[^\s]+\s+of=\/dev\/(sd[a-z]|nvme[0-9]|disk)/i,
            severity: 'critical',
            rule: 'RAW_DISK_OVERWRITE',
            description: 'Attempting raw block-level disk overwrite',
        },
        {
            regex: /mkfs(\.[a-z0-9]+)?\s+\/dev\//i,
            severity: 'critical',
            rule: 'FILESYSTEM_FORMAT',
            description: 'Attempting filesystem format on block device',
        },
        {
            regex: /chmod\s+(-[a-zA-Z]*R\s+)?(777|000)\s+([~/]|\*)/i,
            severity: 'high',
            rule: 'INSECURE_PERMISSIONS',
            description: 'Broad root/home permission mutation detected',
        },
    ];
    static SECRET_PATTERNS = [
        {
            regex: /\b(sk-[a-zA-Z0-9]{20,}|sk-ant-[a-zA-Z0-9]{20,})\b/,
            rule: 'AI_PROVIDER_SECRET_LEAK',
            description: 'Exposed OpenAI / Anthropic API secret key detected in payload',
        },
        {
            regex: /\b(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,})\b/,
            rule: 'GITHUB_TOKEN_LEAK',
            description: 'Exposed GitHub Personal Access Token detected in payload',
        },
        {
            regex: /\b(AKIA[0-9A-Z]{16})\b/,
            rule: 'AWS_ACCESS_KEY_LEAK',
            description: 'Exposed AWS Access Key ID detected in payload',
        },
        {
            regex: /-----BEGIN[ A-Z0-9_-]*PRIVATE KEY-----/,
            rule: 'PRIVATE_KEY_LEAK',
            description: 'Unencrypted private cryptographic key material detected',
        },
        {
            regex: /(\.(env|pem|key)|id_rsa|id_ed25519|credentials\.json)\b/i,
            rule: 'SENSITIVE_FILE_ACCESS',
            description: 'Access or mutation of sensitive credential / dotfile detected',
        },
    ];
    inspectEvent(event) {
        const newAlerts = [];
        const textToScan = [];
        if (event.message)
            textToScan.push(event.message);
        if (event.file)
            textToScan.push(event.file);
        if (event.args) {
            try {
                textToScan.push(JSON.stringify(event.args));
            }
            catch { }
        }
        const fullContent = textToScan.join(' ');
        for (const pattern of SecurityGuard.DANGEROUS_COMMANDS) {
            if (pattern.regex.test(fullContent)) {
                newAlerts.push({
                    id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    severity: pattern.severity,
                    rule: pattern.rule,
                    description: pattern.description,
                    timestamp: Date.now(),
                    target: event.tool || event.file || 'shell_command',
                });
            }
        }
        for (const secret of SecurityGuard.SECRET_PATTERNS) {
            if (secret.regex.test(fullContent)) {
                newAlerts.push({
                    id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    severity: 'high',
                    rule: secret.rule,
                    description: secret.description,
                    timestamp: Date.now(),
                    target: event.tool || event.file || 'payload_content',
                });
            }
        }
        // AST-based inspection for code payloads / file mutations
        if (event.type === 'file_mutation' || (event.args && typeof event.args.content === 'string')) {
            const code = event.args?.content || event.args?.code;
            if (typeof code === 'string' && code.length > 0) {
                const astAlerts = this.inspectCodeAST(code, event.file || 'unknown');
                newAlerts.push(...astAlerts);
            }
        }
        this.alerts.push(...newAlerts);
        return newAlerts;
    }
    /**
     * Real AST Parser using Acorn to detect dangerous runtime patterns
     */
    inspectCodeAST(code, filename) {
        const alerts = [];
        try {
            const ast = acorn.parse(code, {
                ecmaVersion: 'latest',
                sourceType: 'module',
                locations: true,
            });
            const walk = (node) => {
                if (!node || typeof node !== 'object')
                    return;
                if (node.type === 'CallExpression') {
                    if (node.callee?.type === 'Identifier' && node.callee.name === 'eval') {
                        alerts.push({
                            id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            severity: 'high',
                            rule: 'AST_DYNAMIC_CODE_EVAL',
                            description: `Dangerous eval() execution detected in AST at line ${node.loc?.start?.line || '?'}`,
                            timestamp: Date.now(),
                            target: filename,
                            astContext: 'eval(...)',
                        });
                    }
                    if (node.callee?.type === 'MemberExpression' &&
                        (node.callee.property?.name === 'exec' || node.callee.property?.name === 'execSync')) {
                        alerts.push({
                            id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            severity: 'medium',
                            rule: 'AST_PROCESS_EXEC',
                            description: `Subprocess execution (${node.callee.property.name}) detected in AST at line ${node.loc?.start?.line || '?'}`,
                            timestamp: Date.now(),
                            target: filename,
                            astContext: `child_process.${node.callee.property.name}`,
                        });
                    }
                }
                if (node.type === 'NewExpression') {
                    if (node.callee?.type === 'Identifier' && node.callee.name === 'Function') {
                        alerts.push({
                            id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            severity: 'high',
                            rule: 'AST_FUNCTION_CONSTRUCTOR',
                            description: `Dynamic Function constructor invocation in AST at line ${node.loc?.start?.line || '?'}`,
                            timestamp: Date.now(),
                            target: filename,
                            astContext: 'new Function(...)',
                        });
                    }
                }
                for (const key of Object.keys(node)) {
                    if (key === 'loc' || key === 'range')
                        continue;
                    const child = node[key];
                    if (Array.isArray(child)) {
                        child.forEach(walk);
                    }
                    else if (child && typeof child === 'object') {
                        walk(child);
                    }
                }
            };
            walk(ast);
        }
        catch { }
        return alerts;
    }
    getAlerts() {
        return [...this.alerts];
    }
    clear() {
        this.alerts = [];
    }
}
