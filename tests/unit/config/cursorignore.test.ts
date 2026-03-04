import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.join(process.cwd(), '.cursorignore');

function readFile(): string {
  return fs.readFileSync(FILE_PATH, 'utf-8');
}

describe('.cursorignore', () => {
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

  describe('security exclusions', () => {
    it('contains .env (environment secrets)', () => {
      expect(content?.includes('.env')).toBe(true);
    });

    it('contains .env.* (environment file variants)', () => {
      expect(content?.includes('.env.*')).toBe(true);
    });

    it('contains secrets/ (secrets directory)', () => {
      expect(content?.includes('secrets/')).toBe(true);
    });

    it('contains .git/config (git config exclusion)', () => {
      expect(content?.includes('.git/config')).toBe(true);
    });
  });

  describe('build artifact exclusions', () => {
    it('contains node_modules/ (build artifact)', () => {
      expect(content?.includes('node_modules/')).toBe(true);
    });

    it('contains dist/ (build output)', () => {
      expect(content?.includes('dist/')).toBe(true);
    });
  });

  describe('project-specific exclusions', () => {
    it('contains airefinement/artifacts/traces/ (large trace files)', () => {
      expect(content?.includes('airefinement/artifacts/traces/')).toBe(true);
    });
  });
});
