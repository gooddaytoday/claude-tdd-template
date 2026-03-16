import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.join(process.cwd(), 'AGENTS.md');

function readFile(): string {
  return fs.readFileSync(FILE_PATH, 'utf-8');
}

describe('AGENTS.md', () => {
  let content: string | null = null;

  beforeAll(() => {
    try {
      content = readFile();
    } catch {
      // file doesn't exist yet — tests will fail below
    }
  });

  describe('file exists', () => {
    it('can be read without throwing', () => {
      expect(content).not.toBeNull();
    });
  });

  describe('main structure', () => {
    it('contains main title "# Agent Instructions"', () => {
      expect(content?.includes('# Agent Instructions')).toBe(true);
    });

    it('contains section "## Source of Truth"', () => {
      expect(content?.includes('## Source of Truth')).toBe(true);
    });

    it('contains section "## Cursor IDE Setup"', () => {
      expect(content?.includes('## Cursor IDE Setup')).toBe(true);
    });

    it('contains section "## Task Master"', () => {
      expect(content?.includes('## Task Master')).toBe(true);
    });
  });

  describe('TDD skill references', () => {
    it('contains reference to .claude/skills/tdd-integration/skill.md (orchestrator)', () => {
      expect(content?.includes('.claude/skills/tdd-integration/skill.md')).toBe(true);
    });

    it('contains reference to .claude/hooks/prevent-test-edit.ts (guard hook)', () => {
      expect(content?.includes('.claude/hooks/prevent-test-edit.ts')).toBe(true);
    });

    it('contains reference to .claude/skills/tdd-integration/policies/ (policies)', () => {
      expect(content?.includes('.claude/skills/tdd-integration/policies/')).toBe(true);
    });
  });

  describe('Cursor IDE references', () => {
    it('contains reference to .cursor/mcp.json (MCP config)', () => {
      expect(content?.includes('.cursor/mcp.json')).toBe(true);
    });
  });

  describe('cross-platform references', () => {
    it('contains reference to CLAUDE.md', () => {
      expect(content?.includes('CLAUDE.md')).toBe(true);
    });
  });

  describe('no duplication of CLAUDE.md content', () => {
    it('does NOT contain "TDD Philosophy" (not duplicating CLAUDE.md)', () => {
      expect(content?.includes('TDD Philosophy')).toBe(false);
    });

    it('does NOT contain "Module Documentation" (not duplicating CLAUDE.md)', () => {
      expect(content?.includes('Module Documentation')).toBe(false);
    });
  });
});
