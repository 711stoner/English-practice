import { loadSentences, saveSentences } from "./sentencesStore.js";
import { loadHistory, saveHistory } from "./historyStore.js";

const API_BASE = "/api/user-data";

function normalizeCredentials(user) {
  const rawUserId = String(user?.id || "").trim();
  const userId = rawUserId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const password = String(user?.password || "");
  if (!userId || !password) return null;
  return { userId, password };
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function toObjectArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object");
}

function pickNewerSentence(a, b) {
  const aReview = Number(a?.srs?.lastReviewAt || 0);
  const bReview = Number(b?.srs?.lastReviewAt || 0);
  if (aReview !== bReview) return aReview > bReview ? a : b;

  const aReps = Number(a?.srs?.reps || 0);
  const bReps = Number(b?.srs?.reps || 0);
  if (aReps !== bReps) return aReps > bReps ? a : b;

  const aCreated = Number(a?.createdAt || 0);
  const bCreated = Number(b?.createdAt || 0);
  return aCreated >= bCreated ? a : b;
}

function mergeSentences(local, remote) {
  const map = new Map();
  for (const item of toObjectArray(remote)) {
    const id = String(item.id || "").trim();
    if (!id) continue;
    map.set(id, item);
  }
  for (const item of toObjectArray(local)) {
    const id = String(item.id || "").trim();
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }
    map.set(id, pickNewerSentence(item, map.get(id)));
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
  );
}

function mergeHistory(local, remote) {
  const map = new Map();
  for (const item of toObjectArray(remote)) {
    const date = String(item.date || "").trim();
    if (!date) continue;
    map.set(date, item);
  }
  for (const item of toObjectArray(local)) {
    const date = String(item.date || "").trim();
    if (!date) continue;
    const prev = map.get(date);
    if (!prev) {
      map.set(date, item);
      continue;
    }
    const prevUpdated = Number(prev.updatedAt || 0);
    const nextUpdated = Number(item.updatedAt || 0);
    map.set(date, nextUpdated >= prevUpdated ? item : prev);
  }
  return Array.from(map.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}

async function fetchUserData(userId, password) {
  const res = await fetch(`${API_BASE}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, password }),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch user data: ${res.status}`);
  }
  return res.json();
}

async function upsertUserData(userId, password, payload) {
  const res = await fetch(`${API_BASE}/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId,
      password,
      sentences: toObjectArray(payload?.sentences),
      history: toObjectArray(payload?.history),
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save user data: ${res.status}`);
  }
  return res.json();
}

export async function syncUserDataFromCloud(user) {
  const credentials = normalizeCredentials(user);
  if (!credentials) return null;
  const { userId, password } = credentials;

  const localSentences = loadSentences();
  const localHistory = loadHistory();
  const remotePayload = await fetchUserData(userId, password);
  const remoteSentences = toObjectArray(remotePayload?.sentences);
  const remoteHistory = toObjectArray(remotePayload?.history);

  const mergedSentences = mergeSentences(localSentences, remoteSentences);
  const mergedHistory = mergeHistory(localHistory, remoteHistory);

  const shouldReplaceLocal =
    mergedSentences.length !== localSentences.length ||
    mergedHistory.length !== localHistory.length ||
    (isNonEmptyArray(remoteSentences) &&
      !isNonEmptyArray(localSentences)) ||
    (isNonEmptyArray(remoteHistory) && !isNonEmptyArray(localHistory));

  if (shouldReplaceLocal) {
    saveSentences(mergedSentences);
    saveHistory(mergedHistory);
  }

  await upsertUserData(userId, password, {
    sentences: mergedSentences,
    history: mergedHistory,
  });

  return {
    userId,
    sentences: mergedSentences,
    history: mergedHistory,
  };
}

export async function pushUserDataToCloud(user) {
  const credentials = normalizeCredentials(user);
  if (!credentials) return null;
  const { userId, password } = credentials;
  return upsertUserData(userId, password, {
    sentences: loadSentences(),
    history: loadHistory(),
  });
}
