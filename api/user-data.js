import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DATA_DIR = "/tmp";
const USER_DATA_FILE = path.join(DATA_DIR, "user_data.json");

async function readUserData() {
  try {
    const data = await fs.readFile(USER_DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return { version: 1, users: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }
}

async function writeUserData(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USER_DATA_FILE, JSON.stringify(data, null, 2));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method === "GET") {
    const { userId } = req.query;
    if (!userId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }
    const data = await readUserData();
    const user = data.users[userId] || {};
    res.status(200).json({
      userId,
      sentences: user.sentences || [],
      history: user.history || [],
      updated_at: user.updated_at || null,
    });
    return;
  }

  if (req.method === "POST") {
    const { userId, password, sentences, history, action } = req.body;

    if (!userId || !password) {
      res.status(400).json({ error: "Missing userId or password" });
      return;
    }

    const data = await readUserData();
    const passwordHash = hashPassword(password);
    const existing = data.users[userId];

    if (existing && existing.password_hash !== passwordHash) {
      res.status(401).json({ error: "Invalid userId or password" });
      return;
    }

    if (action === "sync" || !existing) {
      const userData = {
        userId,
        password_hash: existing?.password_hash || passwordHash,
        sentences: sentences || existing?.sentences || [],
        history: history || existing?.history || [],
        updated_at: new Date().toISOString(),
      };
      data.users[userId] = userData;
      data.updated_at = new Date().toISOString();
      await writeUserData(data);
      res.status(200).json({
        userId,
        sentences: userData.sentences,
        history: userData.history,
        updated_at: userData.updated_at,
      });
      return;
    }

    res.status(200).json({
      userId,
      sentences: existing.sentences || [],
      history: existing.history || [],
      updated_at: existing.updated_at || null,
    });
  }

  res.status(405).json({ error: "Method not allowed" });
}
