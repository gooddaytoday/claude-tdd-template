# Metrics Module Documentation

## Overview
The metrics module provides functions for calculating and evaluating pipeline KPIs and role-specific metrics. It aggregates telemetry data and compares it against configured thresholds to ensure quality standards.

## Implementation Details

### Phase: threshold comparison function for metrics
Implemented the `compareToThresholds` function to evaluate aggregated metrics against pipeline KPIs. It returns a list of violations when metrics fall short of targets or exceed maximum limits.

### Files Structure
- `thresholds.ts` - Compares aggregated metrics against pipeline KPIs to identify threshold violations.
- `pipeline-metrics.ts` - Computes pipeline KPIs from collected RunReports.
- `role-metrics.ts` - Computes role-specific metrics.

### Classes and Interfaces
- `ThresholdViolation` - Represents a metric that failed to meet its threshold.
  - Dependencies: None

### Functions
- `compareToThresholds(metrics: AggregatedMetrics, thresholds: ThresholdsConfig)` - Evaluates metrics against thresholds and returns an array of violations.

## Architecture

### Design Patterns
- Pure Functions: The threshold comparison is implemented as a pure function, taking metrics and configuration as inputs and returning violations without side effects.

### Integration Points
- Used by: Metrics engine/evaluator
- Uses: Types from `@/telemetry/schemas.js`
- Other modules: Telemetry

### Error Handling
- Error scenarios: None explicitly handled; relies on TypeScript typing for input validation.

## Testing

### Unit Tests
- Location: `tests/unit/metrics/`
- Key test files: `thresholds.test.ts`, `pipeline-metrics.test.ts`, `role-metrics.test.ts`

### Integration Tests
- Location: `tests/integration/metrics/`
- Coverage: Not implemented yet.

## Usage Examples

### Example 1: Comparing metrics to thresholds
```typescript
import { compareToThresholds } from '@/metrics/thresholds.js';

const violations = compareToThresholds(metrics, thresholdsConfig);
if (violations.length > 0) {
  console.log('Pipeline failed to meet KPIs:', violations);
}
```

## Related Tasks
- Task 8: Metrics Engine - Compute role-specific metrics and pipeline KPIs from collected RunReports.

## Changelog

### 2026-02-25 - Task 8.3: threshold comparison function for metrics
Added `compareToThresholds` function to evaluate aggregated metrics against pipeline KPIs.
