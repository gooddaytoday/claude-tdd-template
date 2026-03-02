import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunReportSchema, ExperimentResultSchema } from './src/telemetry/schemas.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(moduleDir, 'tests/fixtures/artifacts/fail-run.json');
const data = JSON.parse(readFileSync(fixturePath, 'utf8'));

try {
  RunReportSchema.parse(data);
  console.log("RunReportSchema Success");
} catch(e) {
  console.error("RunReportSchema validation failed:", e);
  throw e;
}

try {
  ExperimentResultSchema.parse(data);
  console.log("ExperimentResultSchema Success");
} catch(e) {
  console.error("ExperimentResultSchema validation failed:", e);
  throw e;
}
