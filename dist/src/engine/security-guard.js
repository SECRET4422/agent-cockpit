export class SecurityGuard {
    alerts = [];
    static DANGEROUS_PATTERNS = [
        {
            regex: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--force)\s+([~/]|\*)/i,
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
            regex: /(curl|wget)\s+.*\|\s*(bash|sh|zsh)/i,
            severity: 'high',
            rule: 'UNVERIFIED_REMOTE_EXEC',
            description: 'Piping remote web script directly into shell execution',
        },
        {
            regex: /(ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{48}|AIzaSy[a-zA-Z0-9_-]{33})/i,
            severity: 'high',
            rule: 'PLAINTEXT_SECRET_LEAK',
            description: 'Potential API key or secret token detected in command arguments',
        },
    ];
    inspectEvent(event) {
        const detected = [];
        // Check command line arguments in tool calls
        if (event.type === 'tool_call' && event.args) {
            const argsStr = JSON.stringify(event.args);
            for (const pattern of SecurityGuard.DANGEROUS_PATTERNS) {
                if (pattern.regex.test(argsStr)) {
                    const alert = {
                        id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        severity: pattern.severity,
                        rule: pattern.rule,
                        description: pattern.description,
                        timestamp: Date.now(),
                        target: event.tool,
                    };
                    detected.push(alert);
                    this.alerts.unshift(alert);
                }
            }
        }
        // Check sensitive file mutations
        if (event.type === 'file_mutation' && event.file) {
            const fileLower = event.file.toLowerCase();
            if (fileLower.endsWith('.env') ||
                fileLower.includes('.ssh/') ||
                fileLower.includes('.git/')) {
                const alert = {
                    id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    severity: 'medium',
                    rule: 'SENSITIVE_FILE_ACCESS',
                    description: `Direct mutation of sensitive repository file: ${event.file}`,
                    timestamp: Date.now(),
                    target: event.file,
                };
                detected.push(alert);
                this.alerts.unshift(alert);
            }
        }
        if (this.alerts.length > 50) {
            this.alerts = this.alerts.slice(0, 50);
        }
        return detected;
    }
    getAlerts() {
        return this.alerts;
    }
    reset() {
        this.alerts = [];
    }
}
