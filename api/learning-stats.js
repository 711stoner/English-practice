import fs from "fs/promises";
import path from "path";

const DATA_DIR = "/tmp";
const LEARNING_STATS_FILE = path.join(DATA_DIR, "learning_stats.json");

async function readStats() {
  try {
    const data = await fs.readFile(LEARNING_STATS_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return { version: 1, records: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }
}

async function writeStats(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LEARNING_STATS_FILE, JSON.stringify(data, null, 2));
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
    const stats = await readStats();
    res.status(200).json(stats);
    return;
  }

  if (req.method === "POST") {
    const current = await readStats();
    const { date, ...record } = req.body;
    const normalizedDate = String(date || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, d) => `${y.slice(2)}${mo}${d}`);

    if (!normalizedDate || !/^\d{6}$/.test(normalizedDate)) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }

    const idx = current.records.findIndex((r) => r.date === normalizedDate);
    if (idx >= 0) {
      current.records[idx] = { date: normalizedDate, ...current.records[idx], ...record, updated_at: new Date().toISOString() };
    } else {
      current.records.push({ date: normalizedDate, ...record, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }

    current.updated_at = new Date().toISOString();
    await writeStats(current);
    res.status(200).json(current);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
