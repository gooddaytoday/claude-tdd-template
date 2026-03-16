import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.join(process.cwd(), '.cursor/rules/tdd-guard.mdc');

function readFile(): string {
  return fs.readFileSync(FILE_PATH, 'utf-8');
}

function parseFrontmatter(content: string): { frontmatter: string; body: string } {
  const parts = content.split('---');
  if (parts.length < 3) {
    return { frontmatter: '', body: content };
  }
  return {
    frontmatter: parts[1],
    body: parts.slice(2).join('---'),
  };
}

describe('tdd-guard.mdc', () => {
  let content: string;
  let frontmatter: string;
  let body: string;

  beforeAll(() => {
    content = readFile();
    const parsed = parseFrontmatter(content);
    frontmatter = parsed.frontmatter;
    body = parsed.body;
  });

  describe('file exists', () => {
    it('can be read without throwing', () => {
      expect(() => readFile()).not.toThrow();
    });
  });

  describe('frontmatter', () => {
    it('contains alwaysApply: true', () => {
      expect(frontmatter).toContain('alwaysApply: true');
    });
  });

  describe('section headers', () => {
    it('contains main title "TDD Guard Policy"', () => {
      expect(body).toContain('TDD Guard Policy');
    });

    it('contains section "Absolute Rules"', () => {
      expect(body).toContain('Absolute Rules');
    });

    it('contains section "Phase Permissions"', () => {
      expect(body).toContain('Phase Permissions');
    });

    it('contains section "Source of Truth"', () => {
      expect(body).toContain('Source of Truth');
    });
  });

  describe('Absolute Rules — 5 NEVER rules', () => {
    it('mentions tests/** (never modify test files)', () => {
      expect(body).toContain('tests/**');
    });

    it('mentions .skip (never add skip patterns)', () => {
      expect(body).toContain('.skip');
    });

    it('mentions .claude/hooks (never modify enforcement files during TDD)', () => {
      expect(body).toContain('.claude/hooks');
    });

    it('mentions implementation before failing test rule', () => {
      const hasImplementationRule =
        body.includes('implementation') || body.includes('failing test');
      expect(hasImplementationRule).toBe(true);
    });

    it('mentions skip phases / gate conditions rule', () => {
      const hasPhaseRule = body.includes('skip phases') || body.includes('gate conditions');
      expect(hasPhaseRule).toBe(true);
    });
  });

  describe('Phase Permissions table — all 7 roles', () => {
    const roles = [
      'tdd-test-writer',
      'tdd-implementer',
      'tdd-refactorer',
      'tdd-code-reviewer',
      'tdd-architect-reviewer',
      'tdd-documenter',
      'tdd-telemetry-reporter',
    ];

    roles.forEach((role) => {
      it(`contains role "${role}"`, () => {
        expect(body).toContain(role);
      });
    });
  });

  describe('Source of Truth references', () => {
    it('references guard-rules.md', () => {
      expect(body).toContain('guard-rules.md');
    });

    it('references skill.md', () => {
      expect(body).toContain('skill.md');
    });
  });
});
