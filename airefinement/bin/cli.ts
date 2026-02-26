import { join } from 'node:path';
import { loadExperimentHistory, formatHistoryTable } from '../src/eval/reporter.js';
import { CollectorError } from '../src/telemetry/collector.js';

const args = process.argv.slice(2);

if (args[0] === 'report' && args.includes('--history')) {
  try {
    const experiments = loadExperimentHistory(join(process.cwd(), 'artifacts', 'reports'));
    console.log(formatHistoryTable(experiments));
  } catch (err) {
    if (err instanceof CollectorError) {
      console.error('Error reading reports:', err.message);
      process.exit(1);
    }
    throw err;
  }
} else {
  console.log('AIREFINEMENT CLI INITIALIZED');
  console.log('Usage: airefinement report --history');
}
