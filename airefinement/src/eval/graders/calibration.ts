export interface CalibrationResult {
  rubric: string;
  spearman_correlation: number;
  sample_size: number;
  calibrated: boolean;
}

function rankArray(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(values.length);
  let pos = 0;
  while (pos < indexed.length) {
    let end = pos;
    while (end + 1 < indexed.length && indexed[end + 1].v === indexed[pos].v) {
      end++;
    }
    const avgRank = (pos + 1 + end + 1) / 2;
    for (let k = pos; k <= end; k++) {
      ranks[indexed[k].i] = avgRank;
    }
    pos = end + 1;
  }
  return ranks;
}

function spearmanCorrelation(ranks1: number[], ranks2: number[]): number {
  const n = ranks1.length;
  let sumDSq = 0;
  for (let i = 0; i < n; i++) {
    const d = ranks1[i] - ranks2[i];
    sumDSq += d * d;
  }
  return 1 - (6 * sumDSq) / (n * (n * n - 1));
}

export async function calibrateLlmJudge(
  rubric: string,
  humanAnnotations: Array<{ input: string; humanScore: number }>,
  llmScores: Array<{ input: string; llmScore: number }>,
): Promise<CalibrationResult> {
  if (humanAnnotations.length < 2) {
    throw new Error(`calibrateLlmJudge requires at least 2 samples, got ${humanAnnotations.length}`);
  }
  if (humanAnnotations.length !== llmScores.length) {
    throw new Error('humanAnnotations and llmScores must have the same length');
  }
  const humanScores = humanAnnotations.map((a) => a.humanScore);
  const llmScoreValues = llmScores.map((s) => s.llmScore);
  const humanRanks = rankArray(humanScores);
  const llmRanks = rankArray(llmScoreValues);
  const rho = spearmanCorrelation(humanRanks, llmRanks);
  return {
    rubric,
    spearman_correlation: rho,
    sample_size: humanAnnotations.length,
    calibrated: rho >= 0.8,
  };
}
