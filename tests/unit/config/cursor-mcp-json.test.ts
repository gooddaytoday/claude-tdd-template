import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.join(process.cwd(), '.cursor/mcp.json');

function readFile(): string {
  return fs.readFileSync(FILE_PATH, 'utf-8');
}

interface McpServerConfig {
  command?: string;
  args?: unknown[];
  env?: Record<string, unknown>;
}

interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

describe('.cursor/mcp.json', () => {
  let content: string | null = null;
  let parsed: McpConfig | null = null;

  beforeAll(() => {
    try {
      content = readFile();
      parsed = JSON.parse(content) as McpConfig;
    } catch {
      // file doesn't exist or invalid JSON — tests will fail below
    }
  });

  describe('file exists', () => {
    it('can be read without throwing', () => {
      expect(content).not.toBeNull();
    });
  });

  describe('valid JSON', () => {
    it('content is parseable JSON', () => {
      expect(parsed).not.toBeNull();
    });
  });

  describe('top-level structure', () => {
    it('has property "mcpServers"', () => {
      expect(parsed?.mcpServers).toBeDefined();
    });

    it('"mcpServers" is an object', () => {
      expect(typeof parsed?.mcpServers).toBe('object');
      expect(parsed?.mcpServers).not.toBeNull();
    });
  });

  describe('mcpServers.taskmaster-ai', () => {
    let server: McpServerConfig | undefined;

    beforeAll(() => {
      server = parsed?.mcpServers?.['taskmaster-ai'];
    });

    it('has property "taskmaster-ai"', () => {
      expect(server).toBeDefined();
    });

    it('command equals "npx"', () => {
      expect(server?.command).toBe('npx');
    });

    it('args is an array', () => {
      expect(Array.isArray(server?.args)).toBe(true);
    });

    it('args contains "task-master-ai"', () => {
      expect(server?.args).toContain('task-master-ai');
    });

    it('args contains "-y"', () => {
      expect(server?.args).toContain('-y');
    });

    it('env is an object', () => {
      expect(typeof server?.env).toBe('object');
      expect(server?.env).not.toBeNull();
    });

    it('env has property "ANTHROPIC_API_KEY"', () => {
      expect(server?.env).toHaveProperty('ANTHROPIC_API_KEY');
    });
  });
});
