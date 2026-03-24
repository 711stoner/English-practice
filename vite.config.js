import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const LEARNING_STATS_FILE = path.join(DATA_DIR, "learning_stats.json");
const USER_DATA_FILE = path.join(DATA_DIR, "user_data.json");

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

function normalizeDate(date) {
  if (typeof date !== "string") return "";
  const raw = date.trim();
  if (/^\d{6}$/.test(raw)) return raw;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1].slice(2)}${m[2]}${m[3]}`;

  return "";
}

function normalizeRecord(input) {
  if (!input || typeof input !== "object") return null;
  const date = normalizeDate(input.date);
  if (!date) return null;

  const nowIso = new Date().toISOString();
  const checkedIn = Boolean(input.checked_in);
  const reviewCount = normalizeCount(input.review_count);
  const passCount = normalizeCount(input.pass_count);
  const autoRate = reviewCount > 0 ? passCount / reviewCount : 0;

  return {
    date,
    checked_in: checkedIn,
    checkin_status: checkedIn ? "已打卡" : "未打卡",
    new_count: normalizeCount(input.new_count),
    review_count: reviewCount,
    study_seconds: normalizeCount(input.study_seconds),
    pass_count: passCount,
    fuzzy_count: normalizeCount(input.fuzzy_count),
    fail_count: normalizeCount(input.fail_count),
    pass_rate: normalizePassRate(
      typeof input.pass_rate === "number" ? input.pass_rate : autoRate
    ),
    created_at:
      typeof input.created_at === "string" && input.created_at
        ? input.created_at
        : nowIso,
    updated_at: nowIso,
  };
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

function sortByDateDesc(records) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date));
}

async function ensureLearningStatsFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(LEARNING_STATS_FILE);
  } catch {
    const initial = {
      version: 1,
      records: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await fs.writeFile(
      LEARNING_STATS_FILE,
      `${JSON.stringify(initial, null, 2)}\n`,
      "utf8"
    );
  }
}

async function readLearningStatsFile() {
  await ensureLearningStatsFile();
  const raw = await fs.readFile(LEARNING_STATS_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw);
    const records = toRecordList(parsed?.records)
      .map(normalizeRecord)
      .filter(Boolean);

    return {
      version: 1,
      records: sortByDateDesc(records),
      created_at:
        typeof parsed?.created_at === "string" && parsed.created_at
          ? parsed.created_at
          : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return {
      version: 1,
      records: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

async function writeLearningStatsFile(payload) {
  const data = {
    version: 1,
    records: sortByDateDesc(payload.records || []),
    created_at:
      typeof payload.created_at === "string" && payload.created_at
        ? payload.created_at
        : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await fs.writeFile(
    LEARNING_STATS_FILE,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );

  return data;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("Body too large"));
      }
    });

    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

function normalizeUserId(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.slice(0, 64);
}

function toObjectArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object");
}

function normalizePassword(raw) {
  if (typeof raw !== "string") return "";
  const password = raw.trim();
  if (!password) return "";
  return password.slice(0, 128);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function authError(res) {
  sendJson(res, 401, { error: "Invalid userId or password" });
}

async function upsertRecord(record) {
  const normalized = normalizeRecord(record);
  if (!normalized) return null;

  const current = await readLearningStatsFile();
  const list = [...current.records];
  const idx = list.findIndex((item) => item.date === normalized.date);

  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      ...normalized,
      date: list[idx].date,
      created_at: list[idx].created_at,
      updated_at: new Date().toISOString(),
    };
  } else {
    list.push({
      ...normalized,
      created_at: normalized.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return writeLearningStatsFile({
    ...current,
    records: list,
  });
}

function createLearningStatsApiPlugin() {
  const applyMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const rawUrl = req.url || "";
      if (!rawUrl.startsWith("/api/learning-stats")) {
        next();
        return;
      }

      const url = new URL(rawUrl, "http://localhost");

      try {
        if (req.method === "GET" && url.pathname === "/api/learning-stats") {
          const payload = await readLearningStatsFile();
          sendJson(res, 200, payload);
          return;
        }

        if (
          req.method === "POST" &&
          url.pathname === "/api/learning-stats/upsert"
        ) {
          const body = await parseJsonBody(req);
          const payload = await upsertRecord(body);
          if (!payload) {
            sendJson(res, 400, { error: "Invalid learning stats record" });
            return;
          }
          sendJson(res, 200, payload);
          return;
        }

        sendJson(res, 404, { error: "Not found" });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : "Internal server error",
        });
      }
    });
  };

  return {
    name: "learning-stats-api",
    configureServer: applyMiddleware,
    configurePreviewServer: applyMiddleware,
  };
}

async function ensureUserDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(USER_DATA_FILE);
  } catch {
    const initial = {
      version: 1,
      users: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await fs.writeFile(USER_DATA_FILE, `${JSON.stringify(initial, null, 2)}\n`, "utf8");
  }
}

async function readUserDataFile() {
  await ensureUserDataFile();
  const raw = await fs.readFile(USER_DATA_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw);
    const users = parsed?.users && typeof parsed.users === "object" ? parsed.users : {};
    return {
      version: 1,
      users,
      created_at:
        typeof parsed?.created_at === "string" && parsed.created_at
          ? parsed.created_at
          : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return {
      version: 1,
      users: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

async function writeUserDataFile(payload) {
  const data = {
    version: 1,
    users: payload?.users && typeof payload.users === "object" ? payload.users : {},
    created_at:
      typeof payload?.created_at === "string" && payload.created_at
        ? payload.created_at
        : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await fs.writeFile(USER_DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

function createUserDataApiPlugin() {
  const applyMiddleware = (server) => {
    server.middlewares.use(async (req, res, next) => {
      const rawUrl = req.url || "";
      if (!rawUrl.startsWith("/api/user-data")) {
        next();
        return;
      }

      const url = new URL(rawUrl, "http://localhost");
      const pathname = url.pathname;

      try {
        if (req.method === "GET" && pathname === "/api/user-data") {
          const userId = normalizeUserId(url.searchParams.get("userId") || "");
          if (!userId) {
            sendJson(res, 400, { error: "Missing userId" });
            return;
          }
          const payload = await readUserDataFile();
          const user = payload.users[userId] || {};
          sendJson(res, 200, {
            userId,
            sentences: toObjectArray(user.sentences),
            history: toObjectArray(user.history),
            updated_at:
              typeof user.updated_at === "string" ? user.updated_at : null,
          });
          return;
        }

        if (req.method === "POST" && pathname === "/api/user-data/sync") {
          const body = await parseJsonBody(req);
          const userId = normalizeUserId(body?.userId || "");
          const password = normalizePassword(body?.password || "");
          if (!userId || !password) {
            sendJson(res, 400, { error: "Missing userId or password" });
            return;
          }

          const payload = await readUserDataFile();
          const existing = payload.users[userId];
          const passwordHash = hashPassword(password);

          if (existing && existing.password_hash !== passwordHash) {
            authError(res);
            return;
          }

          if (!existing) {
            const nextUsers = {
              ...payload.users,
              [userId]: {
                userId,
                password_hash: passwordHash,
                sentences: [],
                history: [],
                updated_at: new Date().toISOString(),
              },
            };
            await writeUserDataFile({
              ...payload,
              users: nextUsers,
            });
            sendJson(res, 200, {
              userId,
              sentences: [],
              history: [],
              updated_at: nextUsers[userId].updated_at,
            });
            return;
          }

          sendJson(res, 200, {
            userId,
            sentences: toObjectArray(existing.sentences),
            history: toObjectArray(existing.history),
            updated_at:
              typeof existing.updated_at === "string" ? existing.updated_at : null,
          });
          return;
        }

        if (req.method === "POST" && pathname === "/api/user-data/upsert") {
          const body = await parseJsonBody(req);
          const userId = normalizeUserId(body?.userId || "");
          const password = normalizePassword(body?.password || "");
          if (!userId || !password) {
            sendJson(res, 400, { error: "Missing userId or password" });
            return;
          }

          const payload = await readUserDataFile();
          const existing = payload.users[userId];
          const passwordHash = hashPassword(password);

          if (existing && existing.password_hash !== passwordHash) {
            authError(res);
            return;
          }

          const nextUsers = {
            ...payload.users,
            [userId]: {
              userId,
              password_hash: existing?.password_hash || passwordHash,
              sentences: toObjectArray(body?.sentences),
              history: toObjectArray(body?.history),
              updated_at: new Date().toISOString(),
            },
          };

          await writeUserDataFile({
            ...payload,
            users: nextUsers,
          });

          sendJson(res, 200, {
            ok: true,
            userId,
            updated_at: nextUsers[userId].updated_at,
          });
          return;
        }

        sendJson(res, 404, { error: "Not found" });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : "Internal server error",
        });
      }
    });
  };

  return {
    name: "user-data-api",
    configureServer: applyMiddleware,
    configurePreviewServer: applyMiddleware,
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createLearningStatsApiPlugin(), createUserDataApiPlugin()],
  preview: {
    allowedHosts: ["xiaomaoenglish.zeabur.app"],
  },
});
