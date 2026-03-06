const STORAGE_KEY = "history";
const TIME_ZONE = "Asia/Shanghai";
const DAY_START_HOUR = 7;
const UTC_OFFSET_HOURS = 8;

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
  return {
    date,
    reviewedCount: 0,
    newCount: 0,
    durationSeconds: 0,
    updatedAt: Date.now(),
  };
}

export function loadHistory() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw);
  if (Array.isArray(data)) return data;
  return [];
}

export function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event("history-changed"));
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

export function upsertToday(patchFn) {
  const today = getCstDateString();
  const history = loadHistory();
  const index = history.findIndex((d) => d.date === today);

  const base = index >= 0 ? { ...history[index] } : defaultDay(today);
  const patched = patchFn ? patchFn({ ...base }) : base;
  const nextDay = patched && typeof patched === "object" ? patched : base;
  nextDay.updatedAt = Date.now();

  const nextHistory = [...history];
  if (index >= 0) {
    nextHistory[index] = nextDay;
  } else {
    nextHistory.push(nextDay);
  }

  saveHistory(nextHistory);
  return nextDay;
}
