import {
  loadLearningStats as loadLearningStatsFromStore,
  saveLearningStats as saveLearningStatsFromStore,
  showLearningStats,
  syncHistoryDayToLearningStats,
  toLearningStatsDate,
  upsertDailyLearningStats as upsertDailyLearningStatsInStore,
} from "./learningStatsStore.js";

const STORAGE_KEY = "history";
const STUDY_ACTIVITY_KEY = "study_activity_marker";
const TIME_ZONE = "Asia/Shanghai";
const DAY_START_HOUR = 7;
const UTC_OFFSET_HOURS = 8;
const DEFAULT_ACTIVITY_GAP_SECONDS = 30;

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getCstDateString(ts = Date.now()) {
  const shifted = ts - DAY_START_HOUR * 60 * 60 * 1000;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(shifted));

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return `${map.year}-${map.month}-${map.day}`;
}

export function getCstDayStartMs(ts = Date.now()) {
  const parts = getCstDateString(ts).split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return Date.UTC(y, m, d, DAY_START_HOUR - UTC_OFFSET_HOURS);
}

export function getTaipeiDateString(ts = Date.now()) {
  return getCstDateString(ts);
}

function defaultDay(date) {
  const now = Date.now();
  return {
    date,
    reviewedCount: 0,
    newCount: 0,
    newPracticedIds: [],
    durationSeconds: 0,
    activityCount: 0,
    lastStudyActiveAt: null,
    passCount: 0,
    fuzzyCount: 0,
    failCount: 0,
    passRate: 0,
    checkedIn: false,
    checkinAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeGapSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ACTIVITY_GAP_SECONDS;
  return Math.max(1, Math.floor(n));
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  for (const item of value) {
    if (item == null) continue;
    const id = String(item).trim();
    if (!id) continue;
    unique.add(id);
  }
  return Array.from(unique);
}

function normalizeHistoryDate(value) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const short = raw.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (short) {
    return `20${short[1]}-${short[2]}-${short[3]}`;
  }
  return "";
}

function shiftDateStr(dateStr, deltaDays) {
  const parts = dateStr.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateStr;
  }
  const base = Date.UTC(y, m, d, -1);
  const ts = base + deltaDays * 24 * 60 * 60 * 1000;
  return getCstDateString(ts);
}

function isStrictCheckedIn(day) {
  return Boolean(
    day?.checkedIn &&
      typeof day?.checkinAt === "number" &&
      Number.isFinite(day.checkinAt)
  );
}

function hasReviewActivity(day) {
  const reviewed = normalizeCount(day?.reviewedCount);
  const pass = normalizeCount(day?.passCount);
  const fuzzy = normalizeCount(day?.fuzzyCount);
  const fail = normalizeCount(day?.failCount);
  return reviewed > 0 || pass > 0 || fuzzy > 0 || fail > 0;
}

function hasTrackedNewPractice(day) {
  return normalizeIdList(day?.newPracticedIds).length > 0;
}

function hasTrackedStudyActivity(day) {
  const activityCount = normalizeCount(day?.activityCount);
  const lastStudyActiveAt =
    typeof day?.lastStudyActiveAt === "number" &&
    Number.isFinite(day.lastStudyActiveAt)
      ? day.lastStudyActiveAt
      : null;
  return activityCount > 0 || lastStudyActiveAt != null;
}

function isLikelyLegacyGhostToday(day, today) {
  if (!day || day.date !== today) return false;
  const checkedIn = Boolean(day.checkedIn);
  const newCount = normalizeCount(day.newCount);
  const durationSeconds = normalizeCount(day.durationSeconds);

  const hasSignals =
    isStrictCheckedIn(day) ||
    hasReviewActivity(day) ||
    hasTrackedNewPractice(day) ||
    hasTrackedStudyActivity(day);

  if (hasSignals) return false;
  return checkedIn || newCount > 0 || durationSeconds > 0;
}

function normalizeDay(day, fallbackDate) {
  const base = day && typeof day === "object" ? day : {};
  const date = normalizeHistoryDate(base.date) || normalizeHistoryDate(fallbackDate);
  if (!date) return null;
  const now = Date.now();
  const reviewedCount = normalizeCount(base.reviewedCount);
  const durationSeconds = normalizeCount(base.durationSeconds);

  return {
    ...base,
    date,
    reviewedCount,
    newCount: normalizeCount(base.newCount),
    newPracticedIds: normalizeIdList(base.newPracticedIds),
    durationSeconds,
    activityCount: normalizeCount(base.activityCount),
    lastStudyActiveAt:
      typeof base.lastStudyActiveAt === "number" &&
      Number.isFinite(base.lastStudyActiveAt)
        ? base.lastStudyActiveAt
        : null,
    passCount: normalizeCount(base.passCount),
    fuzzyCount: normalizeCount(base.fuzzyCount),
    failCount: normalizeCount(base.failCount),
    passRate: Number.isFinite(Number(base.passRate))
      ? Number(base.passRate)
      : reviewedCount > 0
        ? normalizeCount(base.passCount) / reviewedCount
        : 0,
    checkedIn: typeof base.checkedIn === "boolean" ? base.checkedIn : false,
    checkinAt:
      typeof base.checkinAt === "number" && Number.isFinite(base.checkinAt)
        ? base.checkinAt
        : null,
    createdAt:
      typeof base.createdAt === "number" && Number.isFinite(base.createdAt)
        ? base.createdAt
        : now,
    updatedAt:
      typeof base.updatedAt === "number" && Number.isFinite(base.updatedAt)
        ? base.updatedAt
        : now,
  };
}

function normalizeHistoryList(list) {
  if (!Array.isArray(list)) return [];
  const byDate = new Map();

  for (const item of list) {
    const normalized = normalizeDay(item, "");
    if (!normalized) continue;
    const prev = byDate.get(normalized.date);
    if (!prev || (normalized.updatedAt || 0) >= (prev.updatedAt || 0)) {
      byDate.set(normalized.date, normalized);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function loadHistory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw);
  if (Array.isArray(data)) return normalizeHistoryList(data);
  return [];
}

export function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event("history-changed"));
}

function loadActivityMarker() {
  const raw = localStorage.getItem(STUDY_ACTIVITY_KEY);
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return null;

  const date = typeof parsed.date === "string" ? parsed.date : "";
  const lastActiveAt =
    typeof parsed.lastActiveAt === "number" && Number.isFinite(parsed.lastActiveAt)
      ? parsed.lastActiveAt
      : null;

  if (!date) return null;
  return { date, lastActiveAt };
}

function saveActivityMarker(marker) {
  if (!marker || typeof marker !== "object") {
    localStorage.removeItem(STUDY_ACTIVITY_KEY);
    return;
  }
  localStorage.setItem(STUDY_ACTIVITY_KEY, JSON.stringify(marker));
}

export function subscribeHistory(callback) {
  const handleLocal = () => {
    callback(loadHistory());
  };

  const handleStorage = (e) => {
    if (e.key === STORAGE_KEY) {
      callback(loadHistory());
    }
  };

  window.addEventListener("history-changed", handleLocal);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("history-changed", handleLocal);
    window.removeEventListener("storage", handleStorage);
  };
}

export function upsertToday(patchFn, options = {}) {
  const { syncLearningStats = true } = options;
  const today = getCstDateString();
  const history = loadHistory();
  const index = history.findIndex((d) => d.date === today);

  const base =
    index >= 0 ? normalizeDay(history[index], today) : defaultDay(today);
  if (!base) {
    return defaultDay(today);
  }
  const patched = patchFn ? patchFn({ ...base }) : base;
  const nextDay = normalizeDay(
    patched && typeof patched === "object" ? patched : base,
    today
  );
  if (!nextDay) {
    return base;
  }
  nextDay.createdAt = base.createdAt || nextDay.createdAt;
  nextDay.updatedAt = Date.now();

  const nextHistory = [...history];
  if (index >= 0) {
    nextHistory[index] = nextDay;
  } else {
    nextHistory.push(nextDay);
  }

  saveHistory(nextHistory);
  if (syncLearningStats) {
    void syncHistoryDayToLearningStats({
      ...nextDay,
      checkedIn: isStrictCheckedIn(nextDay),
    });
  }
  return nextDay;
}

export function markTodayCheckin() {
  return upsertToday((day) => ({
    ...day,
    checkedIn: true,
    checkinAt: Date.now(),
  }));
}

export function loadLearningStats() {
  return loadLearningStatsFromStore();
}

export function saveLearningStats(records) {
  return saveLearningStatsFromStore(records);
}

export function upsertDailyLearningStats(date, patch = {}) {
  return upsertDailyLearningStatsInStore({
    date: toLearningStatsDate(date),
    ...patch,
  });
}

export function recordDailyNewCount(count = 1) {
  const delta = normalizeCount(count);
  if (delta <= 0) return loadHistory().find((d) => d.date === getCstDateString()) || null;
  return upsertToday((day) => ({
    ...day,
    newCount: (day.newCount || 0) + delta,
  }));
}

export function recordDailyNewPractice(sentenceId) {
  const id = sentenceId == null ? "" : String(sentenceId).trim();
  if (!id) return loadHistory().find((d) => d.date === getCstDateString()) || null;

  return upsertToday((day) => {
    const trackedIds = normalizeIdList(day.newPracticedIds);
    if (trackedIds.includes(id)) {
      return {
        ...day,
        newPracticedIds: trackedIds,
      };
    }

    return {
      ...day,
      newCount: (day.newCount || 0) + 1,
      newPracticedIds: [...trackedIds, id],
    };
  });
}

export function recordDailyReviewCount(count = 1, resultType = "pass") {
  const delta = normalizeCount(count);
  if (delta <= 0) return loadHistory().find((d) => d.date === getCstDateString()) || null;

  return upsertToday((day) => {
    const next = {
      ...day,
      reviewedCount: (day.reviewedCount || 0) + delta,
    };

    if (resultType === "fuzzy") {
      next.fuzzyCount = (day.fuzzyCount || 0) + delta;
    } else if (resultType === "fail") {
      next.failCount = (day.failCount || 0) + delta;
    } else {
      next.passCount = (day.passCount || 0) + delta;
    }

    const reviewedCount = next.reviewedCount || 0;
    next.passRate = reviewedCount > 0 ? (next.passCount || 0) / reviewedCount : 0;
    return next;
  });
}

export function addStudySeconds(seconds = 0) {
  const delta = normalizeCount(seconds);
  if (delta <= 0) return loadHistory().find((d) => d.date === getCstDateString()) || null;

  return upsertToday((day) => ({
    ...day,
    durationSeconds: (day.durationSeconds || 0) + delta,
  }));
}

export function resetStudyActivityMarker() {
  saveActivityMarker(null);
}

export function markStudyActivity(options = {}) {
  const ts =
    typeof options.ts === "number" && Number.isFinite(options.ts)
      ? options.ts
      : Date.now();
  const maxGapSeconds = normalizeGapSeconds(options.maxGapSeconds);
  const today = getCstDateString(ts);
  const marker = loadActivityMarker();

  if (!marker || marker.date !== today || !Number.isFinite(marker.lastActiveAt)) {
    saveActivityMarker({ date: today, lastActiveAt: ts });
    return 0;
  }

  const deltaSec = Math.floor((ts - marker.lastActiveAt) / 1000);
  const gained = Math.max(0, Math.min(maxGapSeconds, deltaSec));

  saveActivityMarker({ date: today, lastActiveAt: ts });
  if (gained <= 0) return 0;

  upsertToday((day) => ({
    ...day,
    activityCount: (day.activityCount || 0) + 1,
    lastStudyActiveAt: ts,
    durationSeconds: (day.durationSeconds || 0) + (gained > 0 ? gained : 0),
  }), { syncLearningStats: false });
  return gained;
}

export function markDailyCheckin() {
  return markTodayCheckin();
}

export function getRecentLearningStats(days = 7) {
  return showLearningStats({
    limit: Math.max(0, normalizeCount(days)),
    all: false,
  });
}

export function getTodayLearningStats() {
  const today = getCstDateString();
  const day = loadHistory().find((item) => item.date === today);
  const normalized = normalizeDay(day || defaultDay(today), today);
  if (!normalized) return defaultDay(today);
  if (isLikelyLegacyGhostToday(normalized, today)) {
    return defaultDay(today);
  }
  return {
    ...normalized,
    checkedIn: isStrictCheckedIn(normalized),
  };
}

export function getDashboardStats() {
  const today = getTodayLearningStats();
  return {
    date: today.date,
    reviewed_count: today.reviewedCount || 0,
    new_count: today.newCount || 0,
    study_seconds: today.durationSeconds || 0,
    checked_in: isStrictCheckedIn(today),
    pass_count: today.passCount || 0,
    fuzzy_count: today.fuzzyCount || 0,
    fail_count: today.failCount || 0,
  };
}

export function hasCheckedInToday() {
  const today = getTodayLearningStats();
  return isStrictCheckedIn(today);
}

export function getTodayLearningStatsOrEmpty(history = loadHistory(), ts = Date.now()) {
  const today = getCstDateString(ts);
  const day = Array.isArray(history)
    ? history.find((item) => item?.date === today)
    : null;
  const normalized = normalizeDay(day || defaultDay(today), today);
  if (!normalized) return defaultDay(today);
  if (isLikelyLegacyGhostToday(normalized, today)) {
    return defaultDay(today);
  }
  return {
    ...normalized,
    checkedIn: isStrictCheckedIn(normalized),
  };
}

export function getConsecutiveCheckinDays(history = loadHistory(), ts = Date.now()) {
  const today = getCstDateString(ts);
  const map = new Map(
    (Array.isArray(history) ? history : []).map((d) => {
      const normalized = normalizeDay(d, "");
      return normalized ? [normalized.date, normalized] : null;
    }).filter(Boolean)
  );

  const todayRecord = map.get(today);
  if (!isStrictCheckedIn(todayRecord)) return 0;

  let streak = 0;
  let cursor = today;
  while (true) {
    const record = map.get(cursor);
    if (!isStrictCheckedIn(record)) break;
    streak += 1;
    cursor = shiftDateStr(cursor, -1);
  }

  return streak;
}

export function clearTodayGhostStats() {
  const today = getCstDateString();
  const history = loadHistory();
  const index = history.findIndex((d) => d.date === today);
  if (index < 0) return false;

  const normalized = normalizeDay(history[index], today);
  if (!normalized || !isLikelyLegacyGhostToday(normalized, today)) return false;

  const cleaned = {
    ...defaultDay(today),
    createdAt: normalized.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  const next = [...history];
  next[index] = cleaned;
  saveHistory(next);
  void syncHistoryDayToLearningStats(cleaned);
  return true;
}

export function judgeSessionPass(summary) {
  const reviewedCount = normalizeCount(summary?.reviewed_count);
  const passedCount = normalizeCount(summary?.passed_count);
  const fuzzyCount = normalizeCount(summary?.fuzzy_count);
  const failedCount = normalizeCount(summary?.failed_count);
  const passRate = reviewedCount > 0 ? passedCount / reviewedCount : 0;
  const failRate = reviewedCount > 0 ? failedCount / reviewedCount : 0;

  const passed =
    reviewedCount >= 8 &&
    passRate >= 0.5 &&
    failRate < 0.25;

  return {
    passed,
    reviewed_count: reviewedCount,
    passed_count: passedCount,
    fuzzy_count: fuzzyCount,
    failed_count: failedCount,
    pass_rate: passRate,
    fail_rate: failRate,
  };
}
