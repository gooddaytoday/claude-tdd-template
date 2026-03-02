import { readFileSync } from 'node:fs';
import { RunReportSchema, ExperimentResultSchema } from './src/telemetry/schemas.js';

const data = JSON.parse(readFileSync('tests/fixtures/artifacts/fail-run.json', 'utf8'));

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
