import { useEffect, useMemo, useRef } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { useHistory } from "../hooks/useHistory.js";
import { getTaipeiDateString } from "../storage/historyStore.js";

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

function startOfTodayTaipei() {
  const parts = getTaipeiDateString().split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return Date.UTC(y, m, d);
}

function shiftDateStr(dateStr, deltaDays) {
  const parts = dateStr.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  const ts = Date.UTC(y, m, d) + deltaDays * 24 * 60 * 60 * 1000;
  return getTaipeiDateString(ts);
}

export default function Dashboard() {
  const { sentences } = useSentences();
  const { history } = useHistory();
  const canvasRef = useRef(null);

  const now = Date.now();
  const todayStart = startOfTodayTaipei();
  const dayMs = 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const total = sentences.length;
    const dueToday = sentences.filter((s) => s.srs?.dueAt <= now).length;
    const next7 = sentences.filter((s) => {
      const due = s.srs?.dueAt ?? 0;
      return due >= todayStart && due < todayStart + 7 * dayMs;
    }).length;
    const learned = sentences.filter((s) => (s.srs?.reps ?? 0) > 0).length;

    return { total, dueToday, next7, learned };
  }, [sentences, now, todayStart, dayMs]);

  const barData = useMemo(() => {
    const counts = Array(7).fill(0);
    for (const s of sentences) {
      const due = s.srs?.dueAt;
      if (typeof due !== "number") continue;
      const diff = Math.floor((due - todayStart) / dayMs);
      if (diff >= 0 && diff < 7) counts[diff] += 1;
    }
    return counts;
  }, [sentences, todayStart, dayMs]);

  const dueList = useMemo(() => {
    return sentences
      .filter((s) => s.srs?.dueAt <= now)
      .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0))
      .slice(0, 10);
  }, [sentences, now]);

  const todayHistory = useMemo(() => {
    const today = getTaipeiDateString();
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
    const today = getTaipeiDateString();
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
            <div>未来7天到期</div>
            <strong style={{ fontSize: 24 }}>{stats.next7}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>已学（reps&gt;0）</div>
            <strong style={{ fontSize: 24 }}>{stats.learned}</strong>
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
        <h3>未来7天到期柱状图</h3>
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
