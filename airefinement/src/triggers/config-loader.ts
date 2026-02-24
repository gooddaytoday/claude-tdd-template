import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { ZodError } from 'zod';
import {
  ThresholdsConfig,
  ThresholdsConfigSchema,
  TriggersConfig,
  TriggersConfigSchema,
} from '@/telemetry/schemas.js';

export class ConfigLoadError extends Error {
  public readonly causeDetail?: unknown;

  public constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'ConfigLoadError';
    this.causeDetail = causeDetail;
  }
}

export function loadTriggersConfig(filePath: string): TriggersConfig {
  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = YAML.parse(fileContent);
    return TriggersConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigLoadError(`Invalid triggers config schema: ${filePath}`, error.issues);
    }

    if (error instanceof Error) {
      throw new ConfigLoadError(`Failed to load triggers config: ${filePath}`, error.message);
    }

    throw new ConfigLoadError(`Failed to load triggers config: ${filePath}`, error);
  }
}

export function loadThresholdsConfig(filePath: string): ThresholdsConfig {
  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(fileContent) as unknown;
    return ThresholdsConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigLoadError(`Invalid thresholds config schema: ${filePath}`, error.issues);
    }

    if (error instanceof Error) {
      throw new ConfigLoadError(`Failed to load thresholds config: ${filePath}`, error.message);
    }

    throw new ConfigLoadError(`Failed to load thresholds config: ${filePath}`, error);
  }
}
