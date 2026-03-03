import { spawn } from 'node:child_process';

export interface ClaudeCliOptions {
  prompt: string;
  workingDirectory: string;
  maxTurns?: number;
  timeout?: number;
  allowedTools?: string[];
  systemPrompt?: string;
}

export interface ClaudeCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function runClaude(options: ClaudeCliOptions): Promise<ClaudeCliResult> {
  const startTime = Date.now();
  
  const args: string[] = ['-p', options.prompt];
  if (options.maxTurns !== undefined) {
    args.push('--max-turns', options.maxTurns.toString());
  }

  const child = spawn('claude', args, {
    cwd: options.workingDirectory,
  });

  let stdout = '';
  let stderr = '';

  const onStdoutData = (data: Buffer | string) => {
    stdout += data.toString();
  };
  const onStderrData = (data: Buffer | string) => {
    stderr += data.toString();
  };

  child.stdout?.on('data', onStdoutData);
  child.stderr?.on('data', onStderrData);

  let timeoutId: NodeJS.Timeout | undefined;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    child.stdout?.off('data', onStdoutData);
    child.stderr?.off('data', onStderrData);
  };

  const runPromise = new Promise<ClaudeCliResult>((resolve, reject) => {
    child.on('close', (code) => {
      cleanup();
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });

  if (options.timeout !== undefined) {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        cleanup();
        child.kill();
        reject(new Error(`Timeout of ${options.timeout}ms exceeded`));
      }, options.timeout);
    });
    
    // To prevent UnhandledPromiseRejectionWarning when tests delay awaiting,
    // we attach a no-op catch to the race promise before returning it.
    const racePromise = Promise.race([runPromise, timeoutPromise]);
    racePromise.catch(() => {});
    return racePromise;
  }

  return runPromise;
}

export function buildPrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return variables[key.trim()] ?? match;
  });
}
