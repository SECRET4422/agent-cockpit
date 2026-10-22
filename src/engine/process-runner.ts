import { spawn, ChildProcess } from 'node:child_process';

export class ProcessRunner {
  private activeProcess: ChildProcess | null = null;
  private onOutputCallback?: (text: string) => void;

  public runCommand(
    command: string,
    args: string[] = [],
    onOutput?: (text: string) => void
  ): Promise<number> {
    this.onOutputCallback = onOutput;

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArg = isWindows ? '/c' : '-c';
      const fullCmd = [command, ...args].join(' ');

      this.activeProcess = spawn(shell, [shellArg, fullCmd], {
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      this.activeProcess.stdout?.on('data', (data) => {
        const str = data.toString();
        process.stdout.write(str);
        if (this.onOutputCallback) this.onOutputCallback(str);
      });

      this.activeProcess.stderr?.on('data', (data) => {
        const str = data.toString();
        process.stderr.write(str);
        if (this.onOutputCallback) this.onOutputCallback(str);
      });

      this.activeProcess.on('close', (code) => {
        this.activeProcess = null;
        resolve(code || 0);
      });

      this.activeProcess.on('error', (err) => {
        this.activeProcess = null;
        reject(err);
      });
    });
  }

  public getActivePid(): number | null {
    return this.activeProcess?.pid || null;
  }

  public killProcess(): boolean {
    if (!this.activeProcess || !this.activeProcess.pid) {
      return false;
    }

    try {
      const pid = this.activeProcess.pid;
      if (process.platform === 'win32') {
        const { execSync } = require('node:child_process');
        execSync(`taskkill /pid ${pid} /T /F`);
      } else {
        process.kill(-pid, 'SIGTERM');
      }
      this.activeProcess = null;
      return true;
    } catch {
      try {
        if (this.activeProcess) {
          this.activeProcess.kill('SIGKILL');
        }
        this.activeProcess = null;
        return true;
      } catch {
        return false;
      }
    }
  }
}
