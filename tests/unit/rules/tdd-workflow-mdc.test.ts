import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.join(process.cwd(), '.cursor/rules/tdd-workflow.mdc');

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

describe('tdd-workflow.mdc', () => {
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
    it('contains alwaysApply: false (Agent Requested rule, not Always Apply)', () => {
      expect(frontmatter).toContain('alwaysApply: false');
    });

    it('contains description: field', () => {
      expect(frontmatter).toContain('description:');
    });

    it('description contains activation keywords', () => {
      const keywords = ['implement', 'feature', 'build', 'create', 'develop'];
      const hasKeyword = keywords.some((kw) => frontmatter.toLowerCase().includes(kw));
      expect(hasKeyword).toBe(true);
    });
  });

  describe('section headers', () => {
    it('contains main title "TDD Integration Workflow"', () => {
      expect(body).toContain('TDD Integration Workflow');
    });

    it('contains section "When to Use TDD"', () => {
      expect(body).toContain('When to Use TDD');
    });

    it('contains section "How to Execute" (in Cursor or standalone)', () => {
      const hasSection =
        body.includes('How to Execute in Cursor') || body.includes('How to Execute');
      expect(hasSection).toBe(true);
    });

    it('contains section "Verification Protocol"', () => {
      expect(body).toContain('Verification Protocol');
    });
  });

  describe('TDD phases content — all 8 phases mentioned', () => {
    it('mentions PRE-PHASE or PRE_PHASE', () => {
      const hasPrePhase = body.includes('PRE-PHASE') || body.includes('PRE_PHASE');
      expect(hasPrePhase).toBe(true);
    });

    it('mentions RED phase', () => {
      expect(body).toContain('RED');
    });

    it('mentions GREEN phase', () => {
      expect(body).toContain('GREEN');
    });

    it('mentions REFACTOR phase', () => {
      expect(body).toContain('REFACTOR');
    });

    it('mentions CODE REVIEW or CODE_REVIEW phase', () => {
      const hasCodeReview = body.includes('CODE REVIEW') || body.includes('CODE_REVIEW');
      expect(hasCodeReview).toBe(true);
    });

    it('mentions ARCH REVIEW or ARCH_REVIEW phase', () => {
      const hasArchReview = body.includes('ARCH REVIEW') || body.includes('ARCH_REVIEW');
      expect(hasArchReview).toBe(true);
    });

    it('mentions DOCS phase', () => {
      expect(body).toContain('DOCS');
    });

    it('mentions TELEMETRY phase', () => {
      expect(body).toContain('TELEMETRY');
    });
  });

  describe('subagent types — all 7 must be mentioned', () => {
    const subagents = [
      'tdd-test-writer',
      'tdd-implementer',
      'tdd-refactorer',
      'tdd-code-reviewer',
      'tdd-architect-reviewer',
      'tdd-documenter',
      'tdd-telemetry-reporter',
    ];

    subagents.forEach((agent) => {
      it(`mentions subagent "${agent}"`, () => {
        expect(body).toContain(agent);
      });
    });
  });

  describe('exclusions — when NOT to use TDD', () => {
    it('mentions bug fix / bug fixes as exclusion', () => {
      const hasBugFix = body.toLowerCase().includes('bug fix') || body.toLowerCase().includes('bug fixes');
      expect(hasBugFix).toBe(true);
    });

    it('mentions documentation as exclusion', () => {
      expect(body.toLowerCase()).toContain('documentation');
    });

    it('mentions configuration as exclusion', () => {
      expect(body.toLowerCase()).toContain('configuration');
    });

    it('mentions refactoring as exclusion', () => {
      expect(body.toLowerCase()).toContain('refactoring');
    });
  });

  describe('Verification Protocol', () => {
    it('mentions test:unit command', () => {
      const hasUnitCmd =
        body.includes('npm run test:unit') || body.includes('test:unit');
      expect(hasUnitCmd).toBe(true);
    });

    it('mentions test:integration command', () => {
      const hasIntegrationCmd =
        body.includes('npm run test:integration') || body.includes('test:integration');
      expect(hasIntegrationCmd).toBe(true);
    });

    it('warns not to trust Phase Packet without independently running tests', () => {
      const hasWarning =
        body.includes('Phase Packet') ||
        (body.toLowerCase().includes('trust') && body.toLowerCase().includes('test'));
      expect(hasWarning).toBe(true);
    });
  });

  describe('references to skill files', () => {
    it('references .claude/skills/tdd-integration/skill.md', () => {
      expect(body).toContain('.claude/skills/tdd-integration/skill.md');
    });

    it('references .claude/skills/tdd-integration/phases/', () => {
      expect(body).toContain('.claude/skills/tdd-integration/phases/');
    });
  });
});
