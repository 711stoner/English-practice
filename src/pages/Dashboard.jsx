import { useEffect, useMemo, useRef } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { useHistory } from "../hooks/useHistory.js";
import {
  getCstDateString,
  getCstDayStartMs,
} from "../storage/historyStore.js";

function formatDateTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString();
}

function formatDuration(seconds) {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function shiftDateStr(dateStr, deltaDays) {
  const parts = dateStr.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const base = Date.UTC(y, m, d, -1);
  const ts = base + deltaDays * 24 * 60 * 60 * 1000;
  return getCstDateString(ts);
}

function isDueByCstDay(srs, now = Date.now()) {
  if (!srs || srs.mastered) return false;
  const dueAt = srs.dueAt;
  if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return false;
  const dueDate = getCstDateString(dueAt);
  const today = getCstDateString(now);
  return dueDate <= today;
}

const DAILY_REVIEW_LIMIT = 15;

export default function Dashboard() {
  const { sentences } = useSentences();
  const { history } = useHistory();
  const canvasRef = useRef(null);

  const now = Date.now();
  const todayStart = getCstDayStartMs();
  const dayMs = 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const total = sentences.length;
    const dueTodayRaw = sentences.filter((s) =>
      isDueByCstDay(s.srs, now)
    ).length;
    const dueToday = Math.min(dueTodayRaw, DAILY_REVIEW_LIMIT);
    const next7 = sentences.filter((s) => {
      if (!s.srs || s.srs.mastered) return false;
      if ((s.srs.reps ?? 0) <= 0) return false;
      const dueAt = s.srs?.dueAt;
      if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return false;
      const dueDayStart = getCstDayStartMs(dueAt);
      return dueDayStart >= todayStart && dueDayStart < todayStart + 7 * dayMs;
    }).length;
    const learned = sentences.filter((s) => (s.srs?.reps ?? 0) > 0).length;
    const mastered = sentences.filter((s) => s.srs?.mastered).length;

    return { total, dueToday, next7, learned, mastered };
  }, [sentences, now, todayStart, dayMs]);

  const barData = useMemo(() => {
    const counts = Array(7).fill(0);
    for (const s of sentences) {
      if (!s.srs || s.srs.mastered) continue;
      if ((s.srs.reps ?? 0) <= 0) continue;
      const dueAt = s.srs?.dueAt;
      if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) continue;
      const dueDayStart = getCstDayStartMs(dueAt);
      const diff = Math.floor((dueDayStart - todayStart) / dayMs);
      if (diff >= 0 && diff < 7) counts[diff] += 1;
    }
    return counts;
  }, [sentences, todayStart, dayMs]);

  const dueList = useMemo(() => {
    return sentences
      .filter((s) => isDueByCstDay(s.srs, now))
      .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0))
      .slice(0, Math.min(10, DAILY_REVIEW_LIMIT));
  }, [sentences, now]);

  const todayHistory = useMemo(() => {
    const today = getCstDateString();
    return (
      history.find((d) => d.date === today) || {
        reviewedCount: 0,
        newCount: 0,
        durationSeconds: 0,
      }
    );
  }, [history]);

  const streakDays = useMemo(() => {
    const map = new Map(history.map((d) => [d.date, d]));
    const today = getCstDateString();
    const isCheckin = (day) =>
      (day.reviewedCount || 0) > 0 || (day.durationSeconds || 0) >= 60;

    const todayRecord = map.get(today);
    if (!todayRecord || !isCheckin(todayRecord)) return 0;

    let streak = 0;
    let cursor = today;
    while (true) {
      const record = map.get(cursor);
      if (!record || !isCheckin(record)) break;
      streak += 1;
      cursor = shiftDateStr(cursor, -1);
    }
    return streak;
  }, [history]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const padding = 24;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxValue = Math.max(1, ...barData);
    const barWidth = chartWidth / barData.length;

    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    for (let i = 0; i < barData.length; i += 1) {
      const value = barData[i];
      const barHeight = Math.round((value / maxValue) * (chartHeight - 8));
      const x = padding + i * barWidth + 8;
      const y = height - padding - barHeight;
      const w = barWidth - 16;

      ctx.fillStyle = "#27ae60";
      ctx.fillRect(x, y, w, barHeight);

      ctx.fillStyle = "#333";
      ctx.font = "12px Arial";
      ctx.fillText(`D${i}`, x + 2, height - padding + 14);
      if (value > 0) {
        ctx.fillText(String(value), x + 2, y - 4);
      }
    }
  }, [barData]);

  return (
    <div>
      <div className="card">
        <h2>仪表盘</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="card" style={{ minWidth: 160 }}>
            <div>总句子数</div>
            <strong style={{ fontSize: 24 }}>{stats.total}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日到期</div>
            <strong style={{ fontSize: 24 }}>{stats.dueToday}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>未来7天计划复习（不含新学）</div>
            <strong style={{ fontSize: 24 }}>{stats.next7}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>已学（reps&gt;0）</div>
            <strong style={{ fontSize: 24 }}>{stats.learned}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>已掌握（暂停复习）</div>
            <strong style={{ fontSize: 24 }}>{stats.mastered}</strong>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>今日学习记录</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日复习完成</div>
            <strong style={{ fontSize: 24 }}>{todayHistory.reviewedCount || 0}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日新增句子</div>
            <strong style={{ fontSize: 24 }}>{todayHistory.newCount || 0}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日学习时长</div>
            <strong style={{ fontSize: 24 }}>{formatDuration(todayHistory.durationSeconds || 0)}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>连续打卡天数</div>
            <strong style={{ fontSize: 24 }}>{streakDays}</strong>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>未来7天计划复习柱状图（不含新学）</h3>
        <canvas ref={canvasRef} width={700} height={260} />
      </div>

      <div className="card">
        <h3>今日到期列表（最多10条）</h3>
        {dueList.length === 0 && <p>今天没有到期句子</p>}
        {dueList.map((s) => (
          <div key={s.id} className="card">
            <div>
              <strong>中文：</strong>
              {s.meaning}
            </div>
            <div>
              <strong>标签：</strong>
              {(s.tags || []).join(", ")}
            </div>
            <div>
              <strong>到期时间：</strong>
              {formatDateTime(s.srs?.dueAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
