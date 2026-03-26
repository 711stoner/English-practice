const MAX_DAILY_LOAD_DEFAULT = 15;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseDateOnly(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]) - 1;
  const d = Number(m[3]);
  return Date.UTC(y, mon, d, 0, 0, 0, 0);
}

function diffDays(fromDateStr, toDateStr) {
  const fromMs = parseDateOnly(fromDateStr);
  const toMs = parseDateOnly(toDateStr);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.floor((toMs - fromMs) / DAY_MS);
}

function shiftDateStr(dateStr, deltaDays) {
  const baseMs = parseDateOnly(dateStr);
  if (!Number.isFinite(baseMs)) return dateStr;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const next = new Date(baseMs + deltaDays * DAY_MS);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function familiarityLevel(sentence) {
  const srs = sentence?.srs || {};
  if (srs.mastered) return "mastered";
  const reps = Number(srs.reps || 0);
  const lapses = Number(srs.lapses || 0);
  const intervalDays = Number(srs.intervalDays || 0);

  if (reps <= 0) return "unfamiliar";
  if (lapses >= 3 || reps <= 1) return "unfamiliar";
  if (lapses >= 1 || reps <= 3 || intervalDays <= 7) return "weak";
  return "stable";
}

function familiarityWeight(level) {
  if (level === "unfamiliar") return 80;
  if (level === "weak") return 40;
  if (level === "stable") return 10;
  return 0;
}

function mildPriorityShuffle(list, maxSwapDistance = 2, chance = 0.18) {
  const next = [...list];
  for (let i = 0; i < next.length - 1; i += 1) {
    if (Math.random() > chance) continue;
    const span = Math.min(maxSwapDistance, next.length - 1 - i);
    if (span <= 0) continue;
    const j = i + 1 + Math.floor(Math.random() * span);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function baseNewQuotaByReviewDemand(reviewDemand) {
  if (reviewDemand >= 15) return 0;
  if (reviewDemand >= 10) return 1;
  if (reviewDemand >= 6) return 2;
  if (reviewDemand >= 3) return 3;
  return 5;
}

function calcProtectionReduction({
  today,
  history,
  overdueCount,
  sessionSkipUniqueCount = 0,
}) {
  const map = new Map((history || []).map((d) => [d.date, d]));
  const yesterday = map.get(shiftDateStr(today, -1));
  const yesterdayFailRate =
    yesterday && (yesterday.reviewedCount || 0) > 0
      ? (yesterday.failCount || 0) / (yesterday.reviewedCount || 1)
      : 0;

  const recent3 = [shiftDateStr(today, -1), shiftDateStr(today, -2), shiftDateStr(today, -3)]
    .map((d) => map.get(d))
    .filter(Boolean);
  const recent3AvgPassRate =
    recent3.length > 0
      ? recent3.reduce((acc, day) => {
          const reviewed = day.reviewedCount || 0;
          if (reviewed <= 0) return acc;
          return acc + (day.passCount || 0) / reviewed;
        }, 0) / recent3.length
      : 1;

  const todayRecord = map.get(today);
  const todayDurationSeconds = todayRecord?.durationSeconds || 0;

  const triggered = [];
  if (yesterdayFailRate >= 0.25) triggered.push("昨日失败率偏高");
  if (recent3AvgPassRate < 0.55) triggered.push("近3日通过率偏低");
  if (overdueCount >= 6) triggered.push("逾期积压较多");
  if (todayDurationSeconds >= 45 * 60) triggered.push("今日有效学习时长已较高");
  if (sessionSkipUniqueCount >= 3) triggered.push("本轮不会句偏多");

  const reduction = clamp(triggered.length >= 2 ? 2 : triggered.length, 0, 2);
  return { reduction, reasons: triggered };
}

function blendReviewAndNew(reviewIds, newIds) {
  if (newIds.length === 0) return [...reviewIds];
  if (reviewIds.length === 0) return [...newIds];

  const headReviewCount = Math.min(reviewIds.length, Math.max(3, Math.floor(reviewIds.length * 0.5)));
  const result = [...reviewIds.slice(0, headReviewCount)];
  let r = headReviewCount;
  let n = 0;

  while (r < reviewIds.length || n < newIds.length) {
    if (n < newIds.length) {
      result.push(newIds[n]);
      n += 1;
    }
    for (let i = 0; i < 2 && r < reviewIds.length; i += 1) {
      result.push(reviewIds[r]);
      r += 1;
    }
  }

  return result;
}

function sortReviewCandidates(candidates, today) {
  const scored = candidates.map((sentence) => {
    const dueDate = sentence._dueDate || today;
    const overdueDays = Math.max(0, diffDays(dueDate, today));
    const familiarity = familiarityLevel(sentence);
    const lapses = Number(sentence?.srs?.lapses || 0);
    const reps = Number(sentence?.srs?.reps || 0);
    const dueAt = Number(sentence?.srs?.dueAt || 0);

    const score =
      overdueDays * 100 +
      familiarityWeight(familiarity) +
      lapses * 8 +
      (reps <= 2 ? 12 : 0) -
      dueAt / (1000 * 60 * 60 * 24 * 365 * 5);

    return { sentence, familiarity, overdueDays, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return mildPriorityShuffle(scored);
}

function sortNewCandidates(candidates) {
  const sorted = [...candidates].sort(
    (a, b) => (Number(b.createdAt || 0) - Number(a.createdAt || 0))
  );
  return mildPriorityShuffle(
    sorted.map((sentence) => ({ sentence, familiarity: "unfamiliar", overdueDays: 0, score: 0 })),
    1,
    0.12
  );
}

export function buildTodayStudyPlan({
  sentences,
  history,
  today,
  maxDailyLoad = MAX_DAILY_LOAD_DEFAULT,
  sessionSkipUniqueCount = 0,
}) {
  const normalizedMaxLoad = clamp(Number(maxDailyLoad) || MAX_DAILY_LOAD_DEFAULT, 1, 30);
  const reviewCandidatesRaw = [];
  const newCandidatesRaw = [];
  let deferredNewCount = 0;

  for (const sentence of sentences || []) {
    if (!sentence || sentence?.srs?.mastered) continue;
    const reps = Number(sentence?.srs?.reps || 0);
    const dueDate = sentence?.srs?.dueAt ? sentence._dueDate || null : null;
    const createdDate = sentence?._createdDate || null;

    if (reps > 0) {
      if (dueDate && dueDate <= today) {
        reviewCandidatesRaw.push(sentence);
      }
      continue;
    }

    // 当日新增句子从次日才进入新学候选池
    if (createdDate && createdDate >= today) {
      deferredNewCount += 1;
      continue;
    }

    // reps=0 且非当日新增，视为新学候选池
    newCandidatesRaw.push(sentence);
  }

  const overdueCount = reviewCandidatesRaw.filter((s) => (s._dueDate || today) < today).length;
  const reviewDemand = reviewCandidatesRaw.length;
  const baseNewQuota = baseNewQuotaByReviewDemand(reviewDemand);
  const protection = calcProtectionReduction({
    today,
    history,
    overdueCount,
    sessionSkipUniqueCount,
  });
  const rawNewQuota = clamp(baseNewQuota - protection.reduction, 0, 5);

  const reviewPlanned = Math.min(normalizedMaxLoad, reviewDemand);
  const remainingSlots = Math.max(0, normalizedMaxLoad - reviewPlanned);
  const newPlanned = Math.min(rawNewQuota, remainingSlots, newCandidatesRaw.length);

  const sortedReview = sortReviewCandidates(reviewCandidatesRaw, today).slice(0, reviewPlanned);
  const sortedNew = sortNewCandidates(newCandidatesRaw).slice(0, newPlanned);

  const reviewIds = sortedReview.map((item) => item.sentence.id);
  const newIds = sortedNew.map((item) => item.sentence.id);
  const queueIds = blendReviewAndNew(reviewIds, newIds);

  const idMeta = {};
  for (const item of sortedReview) {
    idMeta[item.sentence.id] = {
      type: "review",
      familiarity: item.familiarity,
      overdueDays: item.overdueDays,
    };
  }
  for (const item of sortedNew) {
    idMeta[item.sentence.id] = {
      type: "new",
      familiarity: "unfamiliar",
      overdueDays: 0,
    };
  }

  return {
    maxDailyLoad: normalizedMaxLoad,
    reviewDemand,
    overdueCount,
    baseNewQuota,
    adjustedNewQuota: rawNewQuota,
    reviewPlanned,
    newPlanned,
    deferredNewCount,
    queueIds,
    idMeta,
    protectionReasons: protection.reasons,
  };
}

export function injectSameSessionReinforcement(queueIds, sentenceId, options = {}) {
  const { minGap = 3, maxGap = 5 } = options;
  const next = [...queueIds];
  const existingIdx = next.indexOf(sentenceId);
  if (existingIdx >= 0 && existingIdx <= maxGap) {
    return next;
  }

  const start = Math.min(next.length, Math.max(0, minGap));
  const end = Math.min(next.length, Math.max(start, maxGap));
  const pos = start + Math.floor(Math.random() * (end - start + 1));
  next.splice(pos, 0, sentenceId);
  return next;
}

export function insertDeferredSentence(queueIds, sentenceId, options = {}) {
  const { minGap = 3, maxGap = 5 } = options;
  return injectSameSessionReinforcement(queueIds, sentenceId, { minGap, maxGap });
}

export function deprioritizeRemainingNew(queueIds, idMeta) {
  const review = [];
  const newer = [];
  for (const id of queueIds) {
    if (idMeta?.[id]?.type === "new") {
      newer.push(id);
    } else {
      review.push(id);
    }
  }
  return [...review, ...newer];
}
