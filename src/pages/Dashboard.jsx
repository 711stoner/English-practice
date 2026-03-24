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
    checkin_status: checkedIn ? "已打卡" : "未打卡",
    new_count: Number(day?.newCount || 0),
    review_count: reviewed,
    pass_count: Number(day?.passCount || 0),
    fuzzy_count: Number(day?.fuzzyCount || 0),
    fail_count: Number(day?.failCount || 0),
    pass_rate: reviewed > 0 ? pass / reviewed : Number(day?.passRate || 0),
    has_record: true,
  };
}

const REVIEW_LIST_LIMIT = 10;

export default function Dashboard() {
  const { sentences } = useSentences();
  const { history } = useHistory();
  const [showAllStats, setShowAllStats] = useState(false);
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

  const visibleStats = useMemo(() => {
    if (showAllStats) {
      return statsRowsSource.map((row) => ({ ...row, has_record: true }));
    }
    return recentStatsRows;
  }, [statsRowsSource, recentStatsRows, showAllStats]);

  const todayStatsDate = useMemo(
    () => normalizeStatsDate(todayHistory.date),
    [todayHistory.date]
  );

  return (
    <div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>仪表盘</h2>
          <button
            className="button secondary"
            type="button"
            onClick={() => setShowRules((v) => !v)}
          >
            {showRules ? "收起学习规则" : "学习规则说明"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="card" style={{ minWidth: 160 }}>
            <div>总句子数</div>
            <strong style={{ fontSize: 24 }}>{stats.total}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日待复习</div>
            <strong style={{ fontSize: 24 }}>{stats.dueToday}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>未来7天待复习</div>
            <strong style={{ fontSize: 24 }}>{stats.next7Due}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>已进入复习</div>
            <strong style={{ fontSize: 24 }}>{stats.learned}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>已掌握</div>
            <strong style={{ fontSize: 24 }}>{stats.mastered}</strong>
          </div>
        </div>
      </div>

      {showRules && (
        <div className="card">
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

      <div className="card">
        <h3>今日学习数据</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日已复习</div>
            <strong style={{ fontSize: 24 }}>{todayHistory.reviewedCount || 0}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日新学</div>
            <strong style={{ fontSize: 24 }}>{todayHistory.newCount || 0}</strong>
          </div>
          <div className="card" style={{ minWidth: 160 }}>
            <div>今日有效学习时长</div>
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
        {!statsLoading && !hasAnyStatsOrFallback && <p>暂无学习情况数据</p>}

        {!statsLoading && hasAnyStatsOrFallback && (
          <>
            {!showAllStats && !recentHasAnyRecord && (
              <p style={{ color: "#666" }}>最近7天暂无学习记录，可查看更早历史数据</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              <strong>日期</strong>
              <strong>打卡情况</strong>
              <strong>新学句子数</strong>
              <strong>复习句子数</strong>
              {visibleStats.map((row) => {
                const rowDate = normalizeStatsDate(row.date);
                const isTodayRow = rowDate === todayStatsDate;
                const checkinStatus = isTodayRow
                  ? todayHistory.checkedIn
                    ? "已打卡"
                    : "未打卡"
                  : row.checkin_status || "未打卡";
                const newCount = isTodayRow ? todayHistory.newCount || 0 : row.new_count || 0;
                const reviewCount = isTodayRow
                  ? todayHistory.reviewedCount || 0
                  : row.review_count || 0;

                return (
                  <div key={row.date} style={{ display: "contents" }}>
                    <div>{rowDate}</div>
                    <div>{checkinStatus}</div>
                    <div>{newCount}</div>
                    <div>{reviewCount}</div>
                  </div>
                );
              })}
            </div>

            {olderHistoryRows.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="button"
                  type="button"
                  onClick={() => setShowAllStats((v) => !v)}
                >
                  {showAllStats ? "收起" : "查看更多历史记录"}
                  <span className="paw" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>今日待复习（最多{REVIEW_LIST_LIMIT}条）</h3>
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
