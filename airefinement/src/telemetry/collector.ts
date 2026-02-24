import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import {
  RunReportSchema,
  TraceEventSchema,
  ExperimentResultSchema,
} from '@/telemetry/schemas.js';
import type { AggregatedMetrics, RunReport, TraceEvent } from '@/telemetry/schemas.js';

export class CollectorError extends Error {
  public readonly causeDetail?: unknown;

  public constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'CollectorError';
    this.causeDetail = causeDetail;
  }
}

function wrapParseError(context: string, error: unknown): never {
  if (error instanceof ZodError) {
    throw new CollectorError(`Invalid schema in ${context}`, error.issues);
  }
  if (error instanceof Error) {
    throw new CollectorError(`Failed to parse ${context}`, error.message);
  }
  throw new CollectorError(`Failed to parse ${context}`, error);
}

export function readRunReports(dir: string): RunReport[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const reports = files.map((f) => {
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      return RunReportSchema.parse(raw);
    } catch (error) {
      wrapParseError(f, error);
    }
  });
  return reports.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function readTraceEvents(dir: string): TraceEvent[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  const events: TraceEvent[] = [];
  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    for (let i = 0; i < lines.length; i++) {
      try {
        events.push(TraceEventSchema.parse(JSON.parse(lines[i])));
      } catch (error) {
        wrapParseError(`${f}:${i + 1}`, error);
      }
    }
  }
  return events;
}

export function getLatestBaseline(dir: string): AggregatedMetrics | null {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return null;

  const experiments = files.map((f) => {
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      return ExperimentResultSchema.parse(raw);
    } catch (error) {
      wrapParseError(f, error);
    }
  });

  experiments.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return experiments[0].control_results;
}
