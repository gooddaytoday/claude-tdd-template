import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { AnalysisResult, RunReport, TriggerResult } from '@/telemetry/schemas.js';

const mockBuildPrompt = jest.fn<(template: string, variables: Record<string, string>) => string>();

jest.unstable_mockModule('@/utils/claude-cli.js', () => ({
  buildPrompt: mockBuildPrompt,
  runClaude: jest.fn(),
}));

const { DIAGNOSIS_PROMPT, ALLOWED_MODIFICATION_PATHS, buildDiagnosisPrompt } =
  await import('@/refinement/prompt-templates.js');

describe('prompt-templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildPrompt.mockImplementation((template: string, vars: Record<string, string>) => {
      let result = template;
      for (const [key, value] of Object.entries(vars)) {
        result = result.split(`{{${key}}}`).join(value);
      }
      return result;
    });
  });

  describe('DIAGNOSIS_PROMPT constant', () => {
    it('contains {{triggers_summary}} placeholder', () => {
      expect(DIAGNOSIS_PROMPT).toContain('{{triggers_summary}}');
    });

    it('contains {{failure_reports}} placeholder', () => {
      expect(DIAGNOSIS_PROMPT).toContain('{{failure_reports}}');
    });

    it('contains {{agent_prompts}} placeholder', () => {
      expect(DIAGNOSIS_PROMPT).toContain('{{agent_prompts}}');
    });

    it('contains {{policy_files}} placeholder', () => {
      expect(DIAGNOSIS_PROMPT).toContain('{{policy_files}}');
    });

    it('contains "Context" section', () => {
      expect(DIAGNOSIS_PROMPT).toContain('Context');
    });

    it('contains "Problem" section', () => {
      expect(DIAGNOSIS_PROMPT).toContain('Problem');
    });

    it('contains "Task" section', () => {
      expect(DIAGNOSIS_PROMPT).toContain('Task');
    });

    it('contains TDD phases description with RED → GREEN → REFACTOR', () => {
      expect(DIAGNOSIS_PROMPT).toContain('RED → GREEN → REFACTOR');
    });

    it('contains full TDD pipeline phases including CODE_REVIEW, ARCH_REVIEW, DOCS', () => {
      expect(DIAGNOSIS_PROMPT).toContain('CODE_REVIEW');
      expect(DIAGNOSIS_PROMPT).toContain('ARCH_REVIEW');
      expect(DIAGNOSIS_PROMPT).toContain('DOCS');
    });
  });

  describe('ALLOWED_MODIFICATION_PATHS constant', () => {
    it('is an array of strings', () => {
      expect(Array.isArray(ALLOWED_MODIFICATION_PATHS)).toBe(true);
      for (const p of ALLOWED_MODIFICATION_PATHS) {
        expect(typeof p).toBe('string');
      }
    });

    it('includes .claude/agents/', () => {
      expect(ALLOWED_MODIFICATION_PATHS).toContain('.claude/agents/');
    });

    it('includes .claude/skills/', () => {
      expect(ALLOWED_MODIFICATION_PATHS).toContain('.claude/skills/');
    });

    it('includes .claude/hooks/', () => {
      expect(ALLOWED_MODIFICATION_PATHS).toContain('.claude/hooks/');
    });
  });

  describe('buildDiagnosisPrompt', () => {
    const makeTrigger = (description: string): TriggerResult => ({
      type: 'event_driven',
      rule: 'guard_violation',
      severity: 'critical',
      description,
      evidence: {},
    });

    const makeAnalysis = (triggers: TriggerResult[] = []): AnalysisResult => ({
      timestamp: '2024-01-01T00:00:00Z',
      runs_analyzed: 5,
      traces_analyzed: 10,
      triggers_fired: triggers,
      recommendation: 'refine',
      summary: 'Test summary',
    });

    const makeRunReport = (feature: string): RunReport => ({
      run_id: 'run-1',
      timestamp: '2024-01-01T00:00:00Z',
      task_id: 'task-1',
      subtask_id: 'sub-1',
      feature,
      test_type: 'unit',
      phases: [],
      fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
      guard_violations: [],
      overall_status: 'FAILED',
      partial_credit_score: 0,
    });

    it('calls buildPrompt with DIAGNOSIS_PROMPT as the template', () => {
      buildDiagnosisPrompt({
        analysis: makeAnalysis(),
        failedRunReports: [],
        currentAgentPrompts: {},
        currentPolicies: {},
      });

      expect(mockBuildPrompt).toHaveBeenCalledTimes(1);
      expect(mockBuildPrompt).toHaveBeenCalledWith(DIAGNOSIS_PROMPT, expect.any(Object));
    });

    it('formats triggers_fired into triggers_summary variable', () => {
      const trigger = makeTrigger('Guard violation rate exceeded threshold');

      buildDiagnosisPrompt({
        analysis: makeAnalysis([trigger]),
        failedRunReports: [],
        currentAgentPrompts: {},
        currentPolicies: {},
      });

      expect(mockBuildPrompt).toHaveBeenCalledTimes(1);
      const [, variables] = mockBuildPrompt.mock.calls[0] as [string, Record<string, string>];
      expect(variables.triggers_summary).toContain('Guard violation rate exceeded threshold');
    });

    it('formats failedRunReports into failure_reports variable', () => {
      const report = makeRunReport('some-feature-under-test');

      buildDiagnosisPrompt({
        analysis: makeAnalysis(),
        failedRunReports: [report],
        currentAgentPrompts: {},
        currentPolicies: {},
      });

      expect(mockBuildPrompt).toHaveBeenCalledTimes(1);
      const [, variables] = mockBuildPrompt.mock.calls[0] as [string, Record<string, string>];
      expect(variables.failure_reports).toContain('some-feature-under-test');
    });

    it('formats currentAgentPrompts into agent_prompts variable', () => {
      buildDiagnosisPrompt({
        analysis: makeAnalysis(),
        failedRunReports: [],
        currentAgentPrompts: { 'tdd-implementer': 'Implement minimal code to pass tests' },
        currentPolicies: {},
      });

      expect(mockBuildPrompt).toHaveBeenCalledTimes(1);
      const [, variables] = mockBuildPrompt.mock.calls[0] as [string, Record<string, string>];
      expect(variables.agent_prompts).toContain('tdd-implementer');
      expect(variables.agent_prompts).toContain('Implement minimal code to pass tests');
    });

    it('formats currentPolicies into policy_files variable', () => {
      buildDiagnosisPrompt({
        analysis: makeAnalysis(),
        failedRunReports: [],
        currentAgentPrompts: {},
        currentPolicies: { 'guard-rules.md': 'No test modification in GREEN phase' },
      });

      expect(mockBuildPrompt).toHaveBeenCalledTimes(1);
      const [, variables] = mockBuildPrompt.mock.calls[0] as [string, Record<string, string>];
      expect(variables.policy_files).toContain('guard-rules.md');
      expect(variables.policy_files).toContain('No test modification in GREEN phase');
    });

    it('does not throw with empty arrays and objects', () => {
      expect(() =>
        buildDiagnosisPrompt({
          analysis: makeAnalysis([]),
          failedRunReports: [],
          currentAgentPrompts: {},
          currentPolicies: {},
        })
      ).not.toThrow();
    });

    it('includes experimentId in returned string when provided', () => {
      const result = buildDiagnosisPrompt({
        analysis: makeAnalysis(),
        failedRunReports: [],
        currentAgentPrompts: {},
        currentPolicies: {},
        experimentId: 'exp-42',
      });

      expect(result).toContain('exp-42');
    });

    it('formats multiple triggers into triggers_summary', () => {
      const triggers = [
        makeTrigger('First trigger description'),
        makeTrigger('Second trigger description'),
      ];

      buildDiagnosisPrompt({
        analysis: makeAnalysis(triggers),
        failedRunReports: [],
        currentAgentPrompts: {},
        currentPolicies: {},
      });

      expect(mockBuildPrompt).toHaveBeenCalledTimes(1);
      const [, variables] = mockBuildPrompt.mock.calls[0] as [string, Record<string, string>];
      expect(variables.triggers_summary).toContain('First trigger description');
      expect(variables.triggers_summary).toContain('Second trigger description');
    });
  });
});
