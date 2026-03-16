const STORAGE_KEY = "learning_stats";
const CHANGE_EVENT = "learning-stats-changed";
const API_BASE = "/api/learning-stats";
const TIME_ZONE = "Asia/Shanghai";
const DAY_START_HOUR = 7;

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizePassRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return Number(n.toFixed(4));
}

function toIsoString(value, fallbackIso) {
  if (typeof value === "string" && value.trim()) {
    const ts = Date.parse(value);
    if (Number.isFinite(ts)) {
      return new Date(ts).toISOString();
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallbackIso;
}

function toRecordList(source) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== "object") return [];

  const entries = Object.entries(source).filter(
    ([, item]) => item && typeof item === "object"
  );
  const values = entries.map(([, item]) => item);
  if (values.length === 0) return [];

  const hasDateLike = values.some((item) => typeof item.date === "string");
  if (hasDateLike) return values;

  const keyedByDate = entries.every(([key]) =>
    /^\d{6}$/.test(String(key)) || /^\d{4}-\d{2}-\d{2}$/.test(String(key))
  );
  if (!keyedByDate) return [];

  return entries.map(([key, item]) => ({
    date: String(key),
    ...item,
  }));
}

export function toLearningStatsDate(dateValue) {
  if (typeof dateValue !== "string") return "";
  const raw = dateValue.trim();
  if (/^\d{6}$/.test(raw)) return raw;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[1].slice(2)}${m[2]}${m[3]}`;
  }

  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return "";

  const d = new Date(ts);
  const y = String(d.getFullYear()).slice(2);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${month}${day}`;
}

export function getLearningStatsTodayKey(ts = Date.now()) {
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
  const year = (map.year || "").slice(2);
  return `${year}${map.month}${map.day}`;
}

function defaultRecord(date, nowIso) {
  return {
    date,
    checkin_status: "未打卡",
    checked_in: false,
    new_count: 0,
    review_count: 0,
    study_seconds: 0,
    pass_count: 0,
    fuzzy_count: 0,
    fail_count: 0,
    pass_rate: 0,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function normalizeRecord(input) {
  if (!input || typeof input !== "object") return null;
  const date = toLearningStatsDate(input.date);
  if (!date) return null;

  const nowIso = new Date().toISOString();
  const checkedIn = Boolean(input.checked_in);
  const base = defaultRecord(date, nowIso);
  const newCount = normalizeCount(input.new_count);
  const reviewCount = normalizeCount(input.review_count);
  const studySeconds = normalizeCount(input.study_seconds);
  const passCount = normalizeCount(input.pass_count);
  const fuzzyCount = normalizeCount(input.fuzzy_count);
  const failCount = normalizeCount(input.fail_count);
  const autoRate = reviewCount > 0 ? passCount / reviewCount : 0;

  return {
    ...base,
    checked_in: checkedIn,
    checkin_status: checkedIn ? "已打卡" : "未打卡",
    new_count: newCount,
    review_count: reviewCount,
    study_seconds: studySeconds,
    pass_count: passCount,
    fuzzy_count: fuzzyCount,
    fail_count: failCount,
    pass_rate: normalizePassRate(
      typeof input.pass_rate === "number" ? input.pass_rate : autoRate
    ),
    created_at: toIsoString(input.created_at, nowIso),
    updated_at: toIsoString(input.updated_at, nowIso),
  };
}

function sortByDateDesc(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date));
}

function recordsFromPayload(payload) {
  const fromRecords = toRecordList(payload?.records);
  const fromPayload = toRecordList(payload);
  const list = fromRecords.length > 0 ? fromRecords : fromPayload;
  return sortByDateDesc(list.map(normalizeRecord).filter(Boolean));
}

function shiftLearningDateKey(dateKey, deltaDays) {
  if (!/^\d{6}$/.test(dateKey)) return dateKey;
  const yy = Number(dateKey.slice(0, 2));
  const mm = Number(dateKey.slice(2, 4));
  const dd = Number(dateKey.slice(4, 6));
  const base = new Date(Date.UTC(2000 + yy, mm - 1, dd + deltaDays));
  const y = String(base.getUTCFullYear()).slice(2);
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildRecentDateKeys(days = 7, ts = Date.now()) {
  const count = Math.max(1, Math.floor(days));
  const todayKey = getLearningStatsTodayKey(ts);
  return Array.from({ length: count }, (_, idx) =>
    shiftLearningDateKey(todayKey, -idx)
  );
}

function notifyChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

async function fetchRemoteRecords() {
  const res = await fetch(API_BASE, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch learning stats: ${res.status}`);
  }
  const payload = await res.json();
  return recordsFromPayload(payload);
}

async function upsertRemoteRecord(record) {
  const res = await fetch(`${API_BASE}/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    throw new Error(`Failed to upsert learning stats: ${res.status}`);
  }
  const payload = await res.json();
  return recordsFromPayload(payload);
}

export function loadLearningStats() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw);
  const fromRecords = toRecordList(data?.records);
  const fromPayload = toRecordList(data);
  const list = fromRecords.length > 0 ? fromRecords : fromPayload;
  return sortByDateDesc(list.map(normalizeRecord).filter(Boolean));
}

export function saveLearningStats(records) {
  const normalized = sortByDateDesc(records.map(normalizeRecord).filter(Boolean));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  notifyChanged();
  return normalized;
}

export async function ensureLearningStatsFile() {
  try {
    const remote = await fetchRemoteRecords();
    return saveLearningStats(remote);
  } catch {
    const local = loadLearningStats();
    if (!Array.isArray(local)) {
      return saveLearningStats([]);
    }
    return local;
  }
}

export function subscribeLearningStats(callback) {
  const handleLocal = () => {
    callback(loadLearningStats());
  };

  const handleStorage = (e) => {
    if (e.key === STORAGE_KEY) {
      callback(loadLearningStats());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleLocal);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleLocal);
    window.removeEventListener("storage", handleStorage);
  };
}

function mergeRecord(records, patch) {
  const date = toLearningStatsDate(patch?.date);
  if (!date) return { merged: records, current: null };

  const nowIso = new Date().toISOString();
  const existingIdx = records.findIndex((item) => item.date === date);
  const existing =
    existingIdx >= 0 ? records[existingIdx] : defaultRecord(date, nowIso);
  const nextCheckedIn =
    typeof patch.checked_in === "boolean" ? patch.checked_in : existing.checked_in;

  const mergedRecord = normalizeRecord({
    ...existing,
    ...patch,
    date,
    checked_in: nextCheckedIn,
    checkin_status: nextCheckedIn ? "已打卡" : "未打卡",
    new_count:
      patch.new_count == null ? existing.new_count : normalizeCount(patch.new_count),
    review_count:
      patch.review_count == null
        ? existing.review_count
        : normalizeCount(patch.review_count),
    study_seconds:
      patch.study_seconds == null
        ? existing.study_seconds || 0
        : normalizeCount(patch.study_seconds),
    pass_count:
      patch.pass_count == null ? existing.pass_count : normalizeCount(patch.pass_count),
    fuzzy_count:
      patch.fuzzy_count == null
        ? existing.fuzzy_count
        : normalizeCount(patch.fuzzy_count),
    fail_count:
      patch.fail_count == null ? existing.fail_count : normalizeCount(patch.fail_count),
    pass_rate:
      patch.pass_rate == null
        ? existing.pass_rate
        : normalizePassRate(patch.pass_rate),
    created_at: existing.created_at || nowIso,
    updated_at: nowIso,
  });

  const next = [...records];
  if (existingIdx >= 0) {
    next[existingIdx] = mergedRecord;
  } else {
    next.push(mergedRecord);
  }

  return { merged: sortByDateDesc(next), current: mergedRecord };
}

export async function upsertDailyLearningStats(patch) {
  const current = loadLearningStats();
  const { merged, current: row } = mergeRecord(current, patch);
  if (!row) return null;

  saveLearningStats(merged);

  try {
    const remote = await upsertRemoteRecord(row);
    saveLearningStats(remote);
  } catch {
    // Keep local data as fallback when API is unavailable.
  }

  return row;
}

export async function markDailyCheckin(date) {
  return upsertDailyLearningStats({
    date,
    checked_in: true,
    checkin_status: "已打卡",
  });
}

export async function recordDailyNewCount(date, count = 1) {
  const targetDate = toLearningStatsDate(date);
  const list = loadLearningStats();
  const existing = list.find((item) => item.date === targetDate);
  const base = existing?.new_count || 0;
  return upsertDailyLearningStats({
    date: targetDate,
    new_count: base + normalizeCount(count),
  });
}

export async function recordDailyReviewCount(date, count = 1) {
  const targetDate = toLearningStatsDate(date);
  const list = loadLearningStats();
  const existing = list.find((item) => item.date === targetDate);
  const base = existing?.review_count || 0;
  return upsertDailyLearningStats({
    date: targetDate,
    review_count: base + normalizeCount(count),
  });
}

export function showLearningStats(options = {}) {
  const { all = false, limit = 7 } = options;
  const records = loadLearningStats();
  if (all) return records;
  return records.slice(0, Math.max(0, limit));
}

export function selectRecentLearningStatsRows(
  records = loadLearningStats(),
  options = {}
) {
  const { days = 7, ts = Date.now(), fillMissingDays = true } = options;
  const normalizedRecords = sortByDateDesc(
    toRecordList(records).map(normalizeRecord).filter(Boolean)
  );
  const dateKeys = buildRecentDateKeys(days, ts);
  const map = new Map(normalizedRecords.map((row) => [row.date, row]));

  if (!fillMissingDays) {
    return dateKeys
      .map((date) => map.get(date))
      .filter(Boolean)
      .map((row) => ({ ...row, has_record: true }));
  }

  const nowIso = new Date(ts).toISOString();
  return dateKeys.map((date) => {
    const found = map.get(date);
    if (found) return { ...found, has_record: true };
    return { ...defaultRecord(date, nowIso), has_record: false };
  });
}

export function hasAnyLearningStatsRecords(records = loadLearningStats()) {
  return toRecordList(records).map(normalizeRecord).filter(Boolean).length > 0;
}

export function getTodayLearningStatsOrEmpty(records = loadLearningStats(), ts = Date.now()) {
  const todayKey = getLearningStatsTodayKey(ts);
  const list = Array.isArray(records) ? records : [];
  const found = list.find((item) => item?.date === todayKey);
  if (found) {
    const normalized = normalizeRecord(found);
    if (normalized) return normalized;
  }
  return defaultRecord(todayKey, new Date(ts).toISOString());
}

export async function syncHistoryDayToLearningStats(day) {
  if (!day || typeof day !== "object") return null;
  const date = toLearningStatsDate(day.date);
  if (!date) return null;

  const reviewCount = normalizeCount(day.reviewedCount);
  const passCount = normalizeCount(day.passCount);
  const fuzzyCount = normalizeCount(day.fuzzyCount);
  const failCount = normalizeCount(day.failCount);
  const checkedIn =
    Boolean(day.checkedIn) &&
    typeof day.checkinAt === "number" &&
    Number.isFinite(day.checkinAt);

  return upsertDailyLearningStats({
    date,
    checked_in: checkedIn,
    checkin_status: checkedIn ? "已打卡" : "未打卡",
    new_count: normalizeCount(day.newCount),
    review_count: reviewCount,
    study_seconds: normalizeCount(day.durationSeconds),
    pass_count: passCount,
    fuzzy_count: fuzzyCount,
    fail_count: failCount,
    pass_rate:
      reviewCount > 0
        ? passCount / reviewCount
        : normalizePassRate(day.passRate || 0),
  });
}
