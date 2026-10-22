export declare class ProcessRunner {
    private activeProcess;
    private onOutputCallback?;
    runCommand(command: string, args?: string[], onOutput?: (text: string) => void): Promise<number>;
    getActivePid(): number | null;
    killProcess(): boolean;
}
