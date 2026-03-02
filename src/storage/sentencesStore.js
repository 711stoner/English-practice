const STORAGE_KEY = "sentences";
const LEGACY_KEYS = [
  "sentence",
  "sentenceList",
  "sentences_v1",
  "data",
  "items",
  "phrases",
  "cards",
  "bank",
];

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function defaultSrs() {
  return {
    dueAt: Date.now(),
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    stability: null,
    difficulty: null,
    lastReviewAt: null,
  };
}

export function ensureSrs(sentence) {
  const now = Date.now();
  const srs = sentence.srs || {};
  return {
    ...sentence,
    srs: {
      dueAt: typeof srs.dueAt === "number" ? srs.dueAt : now,
      intervalDays: typeof srs.intervalDays === "number" ? srs.intervalDays : 0,
      ease: typeof srs.ease === "number" ? srs.ease : 2.5,
      reps: typeof srs.reps === "number" ? srs.reps : 0,
      lapses: typeof srs.lapses === "number" ? srs.lapses : 0,
      stability: typeof srs.stability === "number" ? srs.stability : null,
      difficulty: typeof srs.difficulty === "number" ? srs.difficulty : null,
      lastReviewAt: typeof srs.lastReviewAt === "number" ? srs.lastReviewAt : null,
    },
  };
}

export function loadSentences() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw);
  if (Array.isArray(data)) return data.map(ensureSrs);
  return [];
}

export function saveSentences(sentences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sentences));
  window.dispatchEvent(new Event("sentences-changed"));
}

export function subscribe(callback) {
  const handleLocal = () => {
    callback(loadSentences());
  };

  const handleStorage = (e) => {
    if (e.key === STORAGE_KEY) {
      callback(loadSentences());
    }
  };

  window.addEventListener("sentences-changed", handleLocal);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener("sentences-changed", handleLocal);
    window.removeEventListener("storage", handleStorage);
  };
}

export function migrateLegacyKeys() {
  const existing = loadSentences();
  const byId = new Map();

  for (const s of existing) {
    if (s && s.id) byId.set(s.id, s);
  }

  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    const data = safeParse(raw);
    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item || !item.id) continue;
        if (!byId.has(item.id)) {
          byId.set(item.id, ensureSrs(item));
        }
      }
    }

    localStorage.removeItem(key);
  }

  saveSentences(Array.from(byId.values()));
}

export function makeId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

export function createSentence({ text, meaning, tags }) {
  const now = Date.now();
  return {
    id: makeId(),
    text,
    meaning,
    tags,
    createdAt: now,
    srs: defaultSrs(),
  };
}
