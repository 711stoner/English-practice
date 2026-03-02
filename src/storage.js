const STORAGE_KEY = "sentences";
const LEGACY_KEYS = ["sentence_bank_v1", "sentenceList", "sentences_v1"];

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function makeId() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
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
    },
  };
}

function migrateLegacyKeys() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return;

  for (const key of LEGACY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const data = safeParse(raw);
    if (Array.isArray(data)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    localStorage.removeItem(key);
  }
}

export function loadSentences() {
  migrateLegacyKeys();
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParse(raw);
  if (Array.isArray(data)) return data.map(ensureSrs);
  return [];
}

export function saveSentences(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addSentence({ text, meaning, tags }) {
  const now = Date.now();
  const sentence = {
    id: makeId(),
    text,
    meaning,
    tags,
    createdAt: now,
    srs: {
      dueAt: now,
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
    },
  };
  const list = loadSentences();
  const next = [sentence, ...list];
  saveSentences(next);
  return next;
}

export function deleteSentence(id) {
  const list = loadSentences();
  const next = list.filter((s) => s.id !== id);
  saveSentences(next);
  return next;
}
