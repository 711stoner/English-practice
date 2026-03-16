import { useEffect, useMemo, useState } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { useHistory } from "../hooks/useHistory.js";
import {
  getCstDateString,
  getCstDayStartMs,
  loadLearningStats,
} from "../storage/historyStore.js";
import {
  ensureLearningStatsFile,
  subscribeLearningStats,
} from "../storage/learningStatsStore.js";

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

function getReviewStatusLabel(srs, now = Date.now()) {
  const dueAt = srs?.dueAt;
  if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) {
    return "今日待复习";
  }
  const dueDate = getCstDateString(dueAt);
  const today = getCstDateString(now);
  return dueDate < today ? "已逾期" : "今日待复习";
}

function normalizeStatsDate(date) {
  if (typeof date !== "string") return "";
  if (/^\d{6}$/.test(date)) return date;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1].slice(2)}${m[2]}${m[3]}`;
  return date;
}

const DAILY_REVIEW_LIMIT = 15;

export default function Dashboard() {
  const { sentences } = useSentences();
  const { history } = useHistory();
  const [showAllStats, setShowAllStats] = useState(false);
  const [learningStats, setLearningStats] = useState(() => loadLearningStats());
  const [statsLoading, setStatsLoading] = useState(true);

  const todayStart = getCstDayStartMs();
  const dayMs = 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const total = sentences.length;
    const dueTodayRaw = sentences.filter((s) => isDueByCstDay(s.srs)).length;
    const dueToday = Math.min(dueTodayRaw, DAILY_REVIEW_LIMIT);
    const next7Due = sentences.filter((s) => {
      if (!s.srs || s.srs.mastered) return false;
      if ((s.srs.reps ?? 0) <= 0) return false;
      const dueAt = s.srs?.dueAt;
      if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return false;
      const dueDayStart = getCstDayStartMs(dueAt);
      return dueDayStart >= todayStart && dueDayStart < todayStart + 7 * dayMs;
    }).length;
    const learned = sentences.filter((s) => (s.srs?.reps ?? 0) > 0).length;
    const mastered = sentences.filter((s) => s.srs?.mastered).length;

    return { total, dueToday, next7Due, learned, mastered };
  }, [sentences, todayStart, dayMs]);

  const dueList = useMemo(() => {
    return sentences
      .filter((s) => isDueByCstDay(s.srs))
      .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0))
      .slice(0, Math.min(10, DAILY_REVIEW_LIMIT));
  }, [sentences]);

  const dueTotalCount = useMemo(() => {
    return sentences.filter((s) => isDueByCstDay(s.srs)).length;
  }, [sentences]);

  const todayHistory = useMemo(() => {
    const today = getCstDateString();
    return (
      history.find((d) => d.date === today) || {
        reviewedCount: 0,
        newCount: 0,
        durationSeconds: 0,
        checkedIn: false,
      }
    );
  }, [history]);

  const streakDays = useMemo(() => {
    const map = new Map(history.map((d) => [d.date, d]));
    const today = getCstDateString();
    const todayRecord = map.get(today);
    if (!todayRecord?.checkedIn) return 0;

    let streak = 0;
    let cursor = today;
    while (true) {
      const record = map.get(cursor);
      if (!record?.checkedIn) break;
      streak += 1;
      cursor = shiftDateStr(cursor, -1);
    }
    return streak;
  }, [history]);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      const rows = loadLearningStats();
      if (!cancelled) {
        setLearningStats(rows);
      }
    };

    refresh();
    ensureLearningStatsFile()
      .then(() => {
        refresh();
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    const unsubscribe = subscribeLearningStats((rows) => {
      if (!cancelled) {
        setLearningStats(rows);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const visibleStats = useMemo(() => {
    if (showAllStats) return learningStats;
    return learningStats.slice(0, 7);
  }, [learningStats, showAllStats]);

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
            <div>7天内到期复习</div>
            <strong style={{ fontSize: 24 }}>{stats.next7Due}</strong>
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
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日打卡状态</div>
            <strong style={{ fontSize: 24 }}>
              {todayHistory.checkedIn ? "已打卡" : "未打卡"}
            </strong>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>学习情况数据</h3>
        {statsLoading && <p>加载中...</p>}
        {!statsLoading && learningStats.length === 0 && <p>暂无学习情况数据</p>}

        {!statsLoading && learningStats.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              <strong>日期</strong>
              <strong>打卡情况</strong>
              <strong>新学句子数</strong>
              <strong>复习句子数</strong>
              {visibleStats.map((row) => (
                <div key={row.date} style={{ display: "contents" }}>
                  <div>{normalizeStatsDate(row.date)}</div>
                  <div>{row.checkin_status || "未打卡"}</div>
                  <div>{row.new_count || 0}</div>
                  <div>{row.review_count || 0}</div>
                </div>
              ))}
            </div>

            {learningStats.length > 7 && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="button"
                  type="button"
                  onClick={() => setShowAllStats((v) => !v)}
                >
                  {showAllStats ? "收起" : "更多"}
                  <span className="paw" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>今日待复习（最多10条）</h3>
        {dueList.length === 0 && <p>今日暂无待复习内容</p>}
        {dueList.map((s) => (
          <div key={s.id} className="card">
            <div style={{ fontWeight: 600 }}>{s.meaning}</div>
            <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
              状态：{getReviewStatusLabel(s.srs)}
            </div>
          </div>
        ))}
        {dueTotalCount > dueList.length && (
          <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
            还有 {dueTotalCount - dueList.length} 条待复习
          </div>
        )}
      </div>
    </div>
  );
}
