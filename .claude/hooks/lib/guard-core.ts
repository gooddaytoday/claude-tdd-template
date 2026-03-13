/**
 * TDD Guard Core — shared guard logic extracted from prevent-test-edit.ts
 *
 * Exports constants, types, and pure functions used by both the hook entrypoint
 * and any consumer that needs guard state or path-classification without the
 * full hook runtime (e.g. tests, other hooks, scripts).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync, renameSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface GuardState {
  activeSubagent: string;
  lastUpdated: string;
  sessionId?: string;
}

type GuardStateFile = GuardState | Record<string, GuardState>;

export interface ViolationEvent {
  timestamp: string;
  agent: string;
  attempted_action: string;
  target_file: string;
  blocked: boolean;
  reason: string;
  command_hash?: string;
  command_length?: number;
  environment?: 'claude-code' | 'cursor';
}

export const ALLOWED_TEST_WRITERS = ['tdd-test-writer', 'main'];

export const STATE_FILE = '.claude/.guard-state.json';

export const STATE_TTL_MS = 2 * 60 * 60 * 1000;

export const PROTECTED_TEST_PATHS = /(?:^|[\\/])tests[\\/]/;

export const JEST_CONFIG_PATHS = /(?:^|[\\/])jest(?:\.[^/\\]*)?\.config\.[jt]s$/;

export const ENFORCEMENT_PATHS = /(?:^|[\\/])\.claude[\\/](?:hooks|skills|settings\.json)/;

export const BASH_WRITE_TEST_PATTERNS: RegExp[] = [
  /(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*tests[\\/]/,
  /\b(?:cp|mv)\b.*\btests[\\/]/,
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s*(?:''|"")?|--in-place(?:=(?:''|"")?)?\s+).*tests[\\/]/,
  /\b(?:echo|printf)\b.*(?:>>?|tee\s)\s*['"]?[^\s'"]*tests[\\/]/,
  /\bcat\b.*(?:>>?)\s+['"]?[^\s'"]*tests[\\/]/,
  /\b(?:touch|mkdir)\b.*\btests[\\/]/,
];

export const BASH_WRITE_JEST_PATTERNS: RegExp[] = [
  /(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
  /\b(?:cp|mv)\b.*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s*(?:''|"")?|--in-place(?:=(?:''|"")?)?\s+).*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
  /\b(?:touch|mkdir)\b.*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
];

export const BASH_WRITE_ENFORCEMENT_PATTERNS: RegExp[] = [
  /(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*\.claude[\\/](?:hooks|skills)[\\/]/,
  /(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*\.claude[\\/]settings\.json/,
  /\b(?:cp|mv)\b.*\.claude[\\/](?:hooks|skills)[\\/]/,
  /\b(?:cp|mv)\b.*\.claude[\\/]settings\.json/,
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s*(?:''|"")?|--in-place(?:=(?:''|"")?)?\s+).*\.claude[\\/](?:hooks|skills)[\\/]/,
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s*(?:''|"")?|--in-place(?:=(?:''|"")?)?\s+).*\.claude[\\/]settings\.json/,
  /\b(?:touch|mkdir)\b.*\.claude[\\/](?:hooks|skills)[\\/]/,
  /\b(?:touch|mkdir)\b.*\.claude[\\/]settings\.json/,
];

export const SKIP_PATTERNS = /\b(?:describe|it|test)\.(?:skip|only)\b|\bx(?:describe|it|test)\b|\bif\s*\(\s*false\s*\)/;

const STATE_LOCK_SUFFIX = '.lock';
const STATE_LOCK_STALE_MS = 1000;

export function detectEnvironment(): 'claude-code' | 'cursor' {
  return process.env.CURSOR_VERSION ? 'cursor' : 'claude-code';
}

export function getProjectRoot(): string {
  let cwd = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(cwd, '.claude'))) {
      return cwd;
    }
    const parent = join(cwd, '..');
    if (parent === cwd) break;
    cwd = parent;
  }
  return process.cwd();
}

export function redactSensitiveSegment(value: string): string {
  let sanitized = value;

  sanitized = sanitized.replace(
    /\b([A-Za-z_][A-Za-z0-9_]*(?:token|secret|password|passwd|key))=([^\s]+)/gi,
    '$1=<REDACTED>'
  );
  sanitized = sanitized.replace(
    /\b(--?(?:token|secret|password|passwd|key))(?:=|\s+)([^\s]+)/gi,
    '$1=<REDACTED>'
  );
  sanitized = sanitized.replace(/\b(Bearer)\s+([^\s]+)/gi, '$1 <REDACTED>');

  return sanitized;
}

export function sanitizeCommand(command: string): Pick<ViolationEvent, 'target_file' | 'command_hash' | 'command_length'> {
  const normalized = command.replace(/\s+/g, ' ').trim();
  const prefix = redactSensitiveSegment(normalized.slice(0, 20));
  const suffix = redactSensitiveSegment(normalized.slice(-20));
  const commandHash = createHash('sha256').update(command).digest('hex');

  return {
    target_file: `cmd_sha256:${commandHash};len:${command.length};prefix:${prefix};suffix:${suffix}`,
    command_hash: commandHash,
    command_length: command.length,
  };
}

export function logViolationEvent(event: ViolationEvent): void {
  try {
    const projectRoot = getProjectRoot();
    const logPath = join(projectRoot, 'airefinement/artifacts/traces/violations.jsonl');
    mkdirSync(dirname(logPath), { recursive: true });
    const enrichedEvent = { ...event, environment: event.environment || detectEnvironment() };
    appendFileSync(logPath, JSON.stringify(enrichedEvent) + '\n');
  } catch {
    // Telemetry must not break guard logic
  }
}

function unknownState(): GuardState {
  return { activeSubagent: 'unknown', lastUpdated: new Date().toISOString() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGuardState(value: unknown): value is GuardState {
  return (
    isRecord(value) &&
    typeof value.activeSubagent === 'string' &&
    typeof value.lastUpdated === 'string' &&
    (value.sessionId === undefined || typeof value.sessionId === 'string')
  );
}

function isExpiredState(state: GuardState): boolean {
  const parsedTime = new Date(state.lastUpdated).getTime();
  const age = Date.now() - parsedTime;
  return Number.isNaN(age) || age < 0 || age > STATE_TTL_MS;
}

function parseStateFile(content: string): GuardStateFile | null {
  const parsed = JSON.parse(content) as unknown;
  if (isGuardState(parsed)) {
    return parsed;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return {};
  }

  const stateMap: Record<string, GuardState> = {};
  for (const [key, value] of entries) {
    if (!isGuardState(value)) {
      return null;
    }
    stateMap[key] = value;
  }

  return stateMap;
}

function selectSessionState(stateFile: GuardStateFile, sessionId?: string): GuardState | null {
  if (isGuardState(stateFile)) {
    if (sessionId && stateFile.sessionId && stateFile.sessionId !== sessionId) {
      return null;
    }
    return stateFile;
  }

  if (sessionId) {
    if (stateFile[sessionId]) {
      return stateFile[sessionId];
    }

    const defaultState = stateFile.__default__;
    if (defaultState && defaultState.sessionId === undefined && Object.keys(stateFile).length === 1) {
      return defaultState;
    }

    return null;
  }

  if (stateFile.__default__) {
    return stateFile.__default__;
  }

  const entries = Object.values(stateFile);
  if (entries.length === 1) {
    return entries[0];
  }

  return null;
}

function pruneExpiredStateEntries(stateFile: GuardStateFile): Record<string, GuardState> {
  if (!isGuardState(stateFile)) {
    return Object.fromEntries(
      Object.entries(stateFile).filter(([, value]) => !isExpiredState(value))
    );
  }

  if (isExpiredState(stateFile)) {
    return {};
  }

  const bucketKey = stateFile.sessionId ?? '__default__';
  return { [bucketKey]: stateFile };
}

function waitForLockRetry(delayMs: number): void {
  const end = Date.now() + delayMs;
  while (Date.now() < end) {
    // Busy wait for a very short interval to serialize sync hook writes.
  }
}

function clearStaleStateLock(lockPath: string): void {
  try {
    const age = Date.now() - statSync(lockPath).mtimeMs;
    if (!Number.isNaN(age) && age > STATE_LOCK_STALE_MS) {
      rmSync(lockPath, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup only.
  }
}

function withStateFileLock<T>(statePath: string, action: () => T): T {
  const lockPath = `${statePath}${STATE_LOCK_SUFFIX}`;
  const deadline = Date.now() + 250;

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      clearStaleStateLock(lockPath);

      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EEXIST' ||
        Date.now() >= deadline
      ) {
        throw error;
      }

      waitForLockRetry(10);
    }
  }

  try {
    return action();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function readState(sessionId?: string): GuardState {
  const projectRoot = getProjectRoot();
  const statePath = join(projectRoot, STATE_FILE);
  try {
    if (existsSync(statePath)) {
      const content = readFileSync(statePath, 'utf-8');
      const stateFile = parseStateFile(content);
      if (!stateFile) {
        return unknownState();
      }

      const state = selectSessionState(stateFile, sessionId);
      if (!state || isExpiredState(state)) {
        return unknownState();
      }

      return state;
    }
  } catch {
    // Fall through to fail-closed default
  }
  return unknownState();
}

export function writeState(state: GuardState): void {
  const projectRoot = getProjectRoot();
  const statePath = join(projectRoot, STATE_FILE);
  try {
    withStateFileLock(statePath, () => {
      let stateMap: Record<string, GuardState> = {};

      if (existsSync(statePath)) {
        const existing = parseStateFile(readFileSync(statePath, 'utf-8'));
        if (existing) {
          stateMap = pruneExpiredStateEntries(existing);
        }
      }

      const bucketKey = state.sessionId ?? '__default__';
      stateMap[bucketKey] = state;
      const tempPath = `${statePath}.${process.pid}.tmp`;
      writeFileSync(tempPath, JSON.stringify(stateMap, null, 2), 'utf-8');
      renameSync(tempPath, statePath);
    });
  } catch {
    // Silent fail - state tracking is best-effort on write
  }
}

export function extractSubagentName(toolInput: Record<string, unknown>): string | null {
  const name = toolInput.subagent_type as string | undefined;
  return name || null;
}

export function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const cleaned = normalized.replace(/^(?:\.+\/)+/, '');
  return cleaned.replace(/^\/+/, '');
}

export function isTestFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalizePath(filePath);
  return PROTECTED_TEST_PATHS.test(withoutLeadingSlash) || PROTECTED_TEST_PATHS.test(normalized);
}

export function isJestConfigFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalizePath(filePath);
  return JEST_CONFIG_PATHS.test(withoutLeadingSlash) || JEST_CONFIG_PATHS.test(normalized);
}

export function isEnforcementFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalizePath(filePath);
  return ENFORCEMENT_PATHS.test(withoutLeadingSlash) || ENFORCEMENT_PATHS.test(normalized);
}

export function contentHasSkipPatterns(content: string): boolean {
  return SKIP_PATTERNS.test(content);
}

export function bashCommandWritesToTests(command: string): boolean {
  return BASH_WRITE_TEST_PATTERNS.some(pattern => pattern.test(command));
}

export function bashCommandWritesToJestConfig(command: string): boolean {
  return BASH_WRITE_JEST_PATTERNS.some(pattern => pattern.test(command));
}

export function bashCommandWritesToEnforcementFiles(command: string): boolean {
  return BASH_WRITE_ENFORCEMENT_PATTERNS.some(pattern => pattern.test(command));
}
