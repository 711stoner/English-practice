import { useEffect, useMemo, useState } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { useHistory } from "../hooks/useHistory.js";
import {
  getCstDateString,
  getCstDayStartMs,
  getConsecutiveCheckinDays,
  getTodayLearningStatsOrEmpty,
  loadLearningStats,
} from "../storage/historyStore.js";
import {
  ensureLearningStatsFile,
  hasAnyLearningStatsRecords,
  selectRecentLearningStatsRows,
  subscribeLearningStats,
} from "../storage/learningStatsStore.js";
import {
  MEMORY_RULES_FOOTNOTE,
  MEMORY_RULES_SECTIONS,
} from "../constants/memoryRules.js";

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

function historyDayToStatsRow(day) {
  const date = normalizeStatsDate(day?.date);
  if (!date) return null;
  const checkedIn =
    Boolean(day?.checkedIn) &&
    typeof day?.checkinAt === "number" &&
    Number.isFinite(day.checkinAt);
  const reviewed = Number(day?.reviewedCount || 0);
  const pass = Number(day?.passCount || 0);
  return {
    date,
    checkin_status: checkedIn ? "已打卡" : "未打卡", new_count: Number(day?.newCount || 0),
    review_count: reviewed,
    pass_count: Number(day?.passCount || 0),
    fuzzy_count: Number(day?.fuzzyCount || 0),
    fail_count: Number(day?.failCount || 0),
    pass_rate: reviewed > 0 ? pass / reviewed : Number(day?.passRate || 0),
    recall_score: Number(day?.recallScore || 0),
    has_record: true,
  };
}

const REVIEW_LIST_LIMIT = 10;
const HISTORY_VIEW_DAYS = 365;

export default function Dashboard() {
  const { sentences } = useSentences();
  const { history } = useHistory();
  const [showYearStats, setShowYearStats] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [learningStats, setLearningStats] = useState(() => loadLearningStats());
  const [statsLoading, setStatsLoading] = useState(true);

  const todayStart = getCstDayStartMs();
  const dayMs = 24 * 60 * 60 * 1000;

  const stats = useMemo(() => {
    const total = sentences.length;
    const dueToday = sentences.filter((s) => isDueByCstDay(s.srs)).length;
    const next7Due = sentences.filter((s) => {
      if (!s.srs || s.srs.mastered) return false;
      if ((s.srs.reps ?? 0) <= 0) return false;
      const dueAt = s.srs?.dueAt;
      if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return false;
      const dueDayStart = getCstDayStartMs(dueAt);
      return (
        dueDayStart >= todayStart + dayMs &&
        dueDayStart < todayStart + 8 * dayMs
      );
    }).length;
    const learned = sentences.filter((s) => (s.srs?.reps ?? 0) > 0).length;
    const mastered = sentences.filter((s) => s.srs?.mastered).length;

    return { total, dueToday, next7Due, learned, mastered };
  }, [sentences, todayStart, dayMs]);

  const dueList = useMemo(() => {
    return sentences
      .filter((s) => isDueByCstDay(s.srs))
      .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0))
      .slice(0, REVIEW_LIST_LIMIT);
  }, [sentences]);

  const dueTotalCount = useMemo(() => {
    return sentences.filter((s) => isDueByCstDay(s.srs)).length;
  }, [sentences]);

  const todayHistory = useMemo(() => {
    return getTodayLearningStatsOrEmpty(history);
  }, [history]);

  const streakDays = useMemo(() => {
    return getConsecutiveCheckinDays(history);
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

  const hasAnyStats = useMemo(
    () => hasAnyLearningStatsRecords(learningStats),
    [learningStats]
  );

  const historyFallbackStats = useMemo(() => {
    return (history || [])
      .map(historyDayToStatsRow)
      .filter(Boolean)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [history]);

  const statsRowsSource = hasAnyStats ? learningStats : historyFallbackStats;

  const hasAnyStatsOrFallback = useMemo(
    () => hasAnyStats || historyFallbackStats.length > 0,
    [hasAnyStats, historyFallbackStats]
  );

  const recentStatsRows = useMemo(
    () => selectRecentLearningStatsRows(statsRowsSource, { days: 7, fillMissingDays: true }),
    [statsRowsSource]
  );

  const recentHasAnyRecord = useMemo(
    () => recentStatsRows.some((row) => row.has_record),
    [recentStatsRows]
  );

  const recentDateSet = useMemo(
    () => new Set(recentStatsRows.map((row) => row.date)),
    [recentStatsRows]
  );

  const olderHistoryRows = useMemo(
    () => statsRowsSource.filter((row) => !recentDateSet.has(row.date)),
    [statsRowsSource, recentDateSet]
  );

  const recentYearStatsRows = useMemo(
    () =>
      selectRecentLearningStatsRows(statsRowsSource, {
        days: HISTORY_VIEW_DAYS,
        fillMissingDays: false,
      }),
    [statsRowsSource]
  );

  const visibleStats = useMemo(() => {
    if (showYearStats) {
      return recentYearStatsRows;
    }
    return recentStatsRows;
  }, [recentStatsRows, recentYearStatsRows, showYearStats]);

  const todayStatsDate = useMemo(
    () => normalizeStatsDate(todayHistory.date),
    [todayHistory.date]
  );

  return (
    <div>
      <div className='card' style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0 }}>📊 学习概览</h2>
          <button
            className='button secondary' type="button" onClick={() => setShowRules((v) => !v)}
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            {showRules ? "收起" : "规则说明"}
          </button>
        </div>

        <div className='stat-grid'>
          <div className='stat-item'>
            <div className='stat-value'>{stats.total}</div>
            <div className='stat-label'>总句子数</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value' style={{ color: '#ef4444'}}>{stats.dueToday}</div>
            <div className='stat-label'>今日待复习</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value' style={{ color: '#f97316'}}>{stats.next7Due}</div>
            <div className='stat-label'>7天待复习</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value' style={{ color: '#06b6d4'}}>{stats.learned}</div>
            <div className='stat-label'>已进入复习</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value' style={{ color: '#22c55e'}}>{stats.mastered}</div>
            <div className='stat-label'>已掌握</div>
          </div>
        </div>
      </div>

      {showRules && (
        <div className='card'>
          <h3>学习规则说明</h3>
          <p style={{ color: "#666", marginTop: 4 }}>
            这套规则用于帮助你更稳定地记住英文整句，下面是当前应用正在执行的核心学习逻辑。
          </p>
          {MEMORY_RULES_SECTIONS.map((section) => (
            <details key={section.title} style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>{section.title}</summary>
              <div style={{ marginTop: 6, color: "#666" }}>{section.summary}</div>
              <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 20 }}>
                {section.points.map((point) => (
                  <li key={point} style={{ marginTop: 4 }}>
                    {point}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
            {MEMORY_RULES_FOOTNOTE}
          </div>
        </div>
      )}

      <div className='card' style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>📅 今日学习</h3>
        <div className='stat-grid' style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))'}}>
          <div className='stat-item'>
            <div className='stat-value'>{todayHistory.reviewedCount || 0}</div>
            <div className='stat-label'>已复习</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value'>{todayHistory.newCount || 0}</div>
            <div className='stat-label'>新学</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value'>{formatDuration(todayHistory.durationSeconds || 0)}</div>
            <div className='stat-label'>学习时长</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value'>{Math.round((todayHistory.recallScore || 0) * 100)}%</div>
            <div className='stat-label'>综合回忆分</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value' style={{ color: '#c084fc'}}>{streakDays}</div>
            <div className='stat-label'>连续打卡</div>
          </div>
          <div className='stat-item'>
            <div className='stat-value' style={{ color: todayHistory.checkedIn ? '#22c55e' : "#64748b" }}>
              {todayHistory.checkedIn ? "✅ 已打卡" : "未打卡"}
            </div>
            <div className='stat-label'>今日状态</div>
          </div>
        </div>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>📈 学习记录</h3>
        {statsLoading && <p>加载中...</p>}
        {!statsLoading && !hasAnyStatsOrFallback && <p style={{ color: "#64748b" }}>暂无学习数据</p>}

        {!statsLoading && hasAnyStatsOrFallback && (
          <>
            {!showYearStats && !recentHasAnyRecord && (
              <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>最近7天暂无记录</p>
            )}
            <table style={{ overflow: "auto" }}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>打卡</th>
                  <th>新学</th>
                  <th>复习</th>
                </tr>
              </thead>
              <tbody>
                {visibleStats.map((row) => {
                  const rowDate = normalizeStatsDate(row.date);
                  const isTodayRow = rowDate === todayStatsDate;
                  const checkinStatus = isTodayRow
                    ? todayHistory.checkedIn
                      ? "✅ 已打卡"
                      : "未打卡"
                    : row.checkin_status === "已打卡" ? "✅ 已打卡" : "未打卡";
                  const newCount = isTodayRow ? todayHistory.newCount || 0 : row.new_count || 0;
                  const reviewCount = isTodayRow
                    ? todayHistory.reviewedCount || 0
                    : row.review_count || 0;

                  return (
                    <tr key={row.date}>
                      <td>{rowDate}</td>
                      <td>{checkinStatus}</td>
                      <td>{newCount}</td>
                      <td>{reviewCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {olderHistoryRows.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <button
                  className='button secondary' type="button" onClick={() => setShowYearStats((v) => !v)}
                  style={{ width: "100%" }}
                >
                  {showYearStats ? "收起" : "查看历史记录"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>⏰ 今日待复习</h3>
        {dueList.length === 0 && (
          <p style={{ color: "#64748b", textAlign: "center", padding: "20px 0", margin: 0 }}>
            今日没有待复习的内容
          </p>
        )}
        {dueList.map((s, idx) => (
          <div
            key={s.id}
            style={{
              padding: 12,
              background: idx % 2 === 0 ? "transparent" : "rgba(124,58,237,0.03)", borderBottom: "1px solid rgba(124,58,237,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center"}}
          >
            <div>
              <div style={{ fontWeight: 600, color: "#fff" }}>{s.meaning}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                {getReviewStatusLabel(s.srs)}
              </div>
            </div>
            {idx < 3 && <span style={{ fontSize: 20 }}>🔥</span>}
          </div>
        ))}
        {dueTotalCount > dueList.length && (
          <div style={{ marginTop: 12, padding: 12, background: "rgba(6,182,212,0.1)", color: "#06b6d4", fontSize: 13, borderRadius: 8, textAlign: "center" }}>
            还有 <strong>{dueTotalCount - dueList.length}</strong> 条待复习
          </div>
        )}
      </div>
    </div>
  );
}
