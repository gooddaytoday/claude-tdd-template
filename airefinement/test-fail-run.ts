import { readFileSync } from 'node:fs';
import { RunReportSchema, ExperimentResultSchema } from './src/telemetry/schemas.js';

const data = JSON.parse(readFileSync('tests/fixtures/artifacts/fail-run.json', 'utf8'));

try {
  RunReportSchema.parse(data);
  console.log("RunReportSchema Success");
} catch(e) {
  console.log("RunReportSchema Error:", e.issues);
}

try {
  ExperimentResultSchema.parse(data);
  console.log("ExperimentResultSchema Success");
} catch(e) {
  console.log("ExperimentResultSchema Error:", e.issues);
}
