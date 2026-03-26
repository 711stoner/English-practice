const DAY_MS = 24 * 60 * 60 * 1000;

export const FUZZY_RECALL_WEIGHT = 0.6;
export const MIN_SUCCESSFUL_REVIEWS = 3;
export const MIN_RECALL_SCORE = 0.45;
export const MIN_SUCCESS_RATE = 0.7;
export const MAX_FAIL_RATE = 0.3;

const EARLY_INTERVAL_STEPS = [
  { maxReps: 1, maxDays: 1, label: "1天巩固期" },
  { maxReps: 2, maxDays: 3, label: "3天巩固期" },
  { maxReps: 4, maxDays: 7, label: "7天巩固期" },
  { maxReps: 6, maxDays: 15, label: "15天稳固期" },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(clamp(n, 0, 1).toFixed(4));
}

function getEarlyIntervalStep(nextReps) {
  const reps = normalizeCount(nextReps);
  if (reps <= 0) return null;
  return EARLY_INTERVAL_STEPS.find((item) => reps <= item.maxReps) || null;
}

function tightenIntervalCap(maxDays) {
  if (maxDays <= 1) return 1;
  if (maxDays <= 3) return 1;
  if (maxDays <= 7) return 3;
  return 7;
}

function getStageLabel(maxDays) {
  const step = EARLY_INTERVAL_STEPS.find((item) => item.maxDays === maxDays);
  return step?.label || "FSRS自适应阶段";
}

export function getRecallScoreFromCounts(passedCount, fuzzyCount, reviewedCount) {
  const reviewed = normalizeCount(reviewedCount);
  if (reviewed <= 0) return 0;
  const passed = normalizeCount(passedCount);
  const fuzzy = normalizeCount(fuzzyCount);
  return normalizeRate((passed + fuzzy * FUZZY_RECALL_WEIGHT) / reviewed);
}

export function judgeCompositeSessionSummary(summary) {
  const reviewedCount = normalizeCount(summary?.reviewed_count);
  const passedCount = normalizeCount(summary?.passed_count);
  const fuzzyCount = normalizeCount(summary?.fuzzy_count);
  const failedCount = normalizeCount(summary?.failed_count);
  const successfulCount = passedCount + fuzzyCount;
  const passRate = reviewedCount > 0 ? normalizeRate(passedCount / reviewedCount) : 0;
  const successRate =
    reviewedCount > 0
      ? normalizeRate(successfulCount / reviewedCount)
      : 0;
  const recallScore = getRecallScoreFromCounts(
    passedCount,
    fuzzyCount,
    reviewedCount
  );
  const failRate = reviewedCount > 0 ? normalizeRate(failedCount / reviewedCount) : 0;

  const passed =
    successfulCount >= MIN_SUCCESSFUL_REVIEWS &&
    recallScore >= MIN_RECALL_SCORE &&
    successRate >= MIN_SUCCESS_RATE &&
    failRate < MAX_FAIL_RATE;

  return {
    passed,
    reviewed_count: reviewedCount,
    passed_count: passedCount,
    fuzzy_count: fuzzyCount,
    failed_count: failedCount,
    successful_count: successfulCount,
    pass_rate: passRate,
    success_rate: successRate,
    recall_score: recallScore,
    fail_rate: failRate,
  };
}

export function getCompositeIntervalPlan({
  tier = "weak",
  nextReps = 0,
  effectiveQ = 1,
  usedAssistance = false,
} = {}) {
  if (effectiveQ < 3) {
    return {
      maxIntervalDays: null,
      stageLabel: "同日强化",
      stageKey: "same_day",
    };
  }

  const baseStep = getEarlyIntervalStep(nextReps);
  let maxDays = baseStep?.maxDays ?? null;

  if (maxDays == null && (effectiveQ === 3 || usedAssistance)) {
    maxDays = 15;
  }

  if (tier === "new") {
    maxDays = maxDays == null ? 1 : Math.min(maxDays, 1);
  } else if (tier === "unfamiliar") {
    maxDays = maxDays == null ? 3 : Math.min(maxDays, 3);
  } else if (tier === "weak") {
    maxDays = maxDays == null ? 7 : Math.min(maxDays, 7);
  }

  if (maxDays != null && (effectiveQ === 3 || usedAssistance)) {
    maxDays = tightenIntervalCap(maxDays);
  }

  if (maxDays == null) {
    return {
      maxIntervalDays: null,
      stageLabel: "FSRS自适应阶段",
      stageKey: "fsrs",
    };
  }

  return {
    maxIntervalDays: maxDays,
    stageLabel: getStageLabel(maxDays),
    stageKey: `cap_${maxDays}d`,
  };
}

export function applyCompositeIntervalCap(cardInput, plan, nowMs = Date.now()) {
  const maxDays = Number(plan?.maxIntervalDays);
  if (!Number.isFinite(maxDays) || maxDays <= 0) {
    return { card: cardInput, capped: false };
  }

  const normalizedCapDays = Math.max(1, Math.round(maxDays));
  const scheduledDays = Number(cardInput?.scheduled_days || 0);
  const nextScheduledDays =
    scheduledDays > 0 ? Math.min(scheduledDays, normalizedCapDays) : normalizedCapDays;
  const maxDueAt = nowMs + nextScheduledDays * DAY_MS;
  const dueAt = typeof cardInput?.due === "number" ? cardInput.due : maxDueAt;
  const nextDueAt = Math.min(dueAt, maxDueAt);
  const capped = scheduledDays > nextScheduledDays || dueAt > nextDueAt;

  return {
    card: capped
      ? {
          ...cardInput,
          scheduled_days: nextScheduledDays,
          due: nextDueAt,
        }
      : cardInput,
    capped,
  };
}

export function shouldScheduleSameDayReinforcement({
  tier = "weak",
  effectiveQ = 1,
  fuzzyFirstPass = false,
  sameSessionMiss = 0,
} = {}) {
  if (effectiveQ <= 3) return true;
  if (fuzzyFirstPass) return true;
  if (tier === "new" || tier === "unfamiliar") return true;
  return normalizeCount(sameSessionMiss) >= 2;
}

export function getSameDayReinforcementWindow(tier = "weak") {
  if (tier === "unfamiliar") {
    return { minGap: 4, maxGap: 6 };
  }
  if (tier === "new") {
    return { minGap: 3, maxGap: 5 };
  }
  return { minGap: 3, maxGap: 5 };
}
