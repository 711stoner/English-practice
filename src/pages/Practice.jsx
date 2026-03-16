import { useEffect, useMemo, useRef, useState } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { ensureSrs } from "../storage/sentencesStore.js";
import {
  getCstDateString,
  hasCheckedInToday,
  judgeSessionPass,
  loadHistory,
  markDailyCheckin,
  recordDailyNewPractice,
  recordDailyReviewCount,
  resetStudyActivityMarker,
  markStudyActivity,
} from "../storage/historyStore.js";
import {
  getFsrsDueAt,
  getFsrsIntervalDays,
  getFsrsLapses,
  getFsrsLastReviewAt,
  getFsrsReps,
  rateFsrsCard,
  ratingFromQuality,
} from "../srs/fsrs.js";
import {
  buildTodayStudyPlan,
  deprioritizeRemainingNew,
  injectSameSessionReinforcement,
  insertDeferredSentence,
} from "../utils/studyPlan.js";

function normalizeForCompare(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "");
}

function normalizeForTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prev = Array.from({ length: bLen + 1 }, (_, i) => i);
  const curr = new Array(bLen + 1).fill(0);

  for (let i = 1; i <= aLen; i += 1) {
    curr[0] = i;
    const aChar = a[i - 1];
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bLen; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[bLen];
}

function getFuzzyMatchInfo(userText, answerText) {
  const userNorm = normalizeForCompare(userText);
  const answerNorm = normalizeForCompare(answerText);
  const distance = levenshtein(userNorm, answerNorm);
  const threshold = 1;
  if (distance > threshold) return { ok: false, message: "" };

  const userTokens = normalizeForTokens(userText).split(" ").filter(Boolean);
  const answerTokens = normalizeForTokens(answerText).split(" ").filter(Boolean);

  if (userTokens.length !== answerTokens.length) return { ok: false, message: "" };

  const mismatches = [];
  for (let i = 0; i < userTokens.length; i += 1) {
    if (userTokens[i] !== answerTokens[i]) {
      mismatches.push(`${userTokens[i]} → ${answerTokens[i]}`);
    }
  }

  return {
    ok: mismatches.length <= 1,
    message: mismatches.length > 0 ? `拼写问题：${mismatches.join("，")}` : "",
  };
}

const MASTERY_REPS = 8;
const MASTERY_INTERVAL_DAYS = 730;
const DAILY_MAX_LOAD = 15;

function createEmptySessionSummary() {
  return {
    reviewed_count: 0,
    passed_count: 0,
    fuzzy_count: 0,
    failed_count: 0,
  };
}

function pickRandomId(list) {
  if (!list || list.length === 0) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index]?.id || null;
}

function buildPlanFromSource(sentences, sessionSkipUniqueCount = 0) {
  const now = Date.now();
  const today = getCstDateString(now);
  const history = loadHistory();

  const decorated = (sentences || []).map((sentence) => {
    const dueAt = Number(sentence?.srs?.dueAt || 0);
    const dueDate = Number.isFinite(dueAt) && dueAt > 0 ? getCstDateString(dueAt) : today;
    return { ...sentence, _dueDate: dueDate };
  });

  return buildTodayStudyPlan({
    sentences: decorated,
    history,
    today,
    maxDailyLoad: DAILY_MAX_LOAD,
    sessionSkipUniqueCount,
  });
}

export default function Practice() {
  const { sentences, setSentences, reload } = useSentences();

  const [queueIds, setQueueIds] = useState([]);
  const [idMeta, setIdMeta] = useState({});
  const [planInfo, setPlanInfo] = useState(() => ({
    maxDailyLoad: DAILY_MAX_LOAD,
    reviewDemand: 0,
    overdueCount: 0,
    baseNewQuota: 0,
    adjustedNewQuota: 0,
    reviewPlanned: 0,
    newPlanned: 0,
    protectionReasons: [],
  }));

  const [plannedCount, setPlannedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [randomId, setRandomId] = useState(null);

  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [answerMessage, setAnswerMessage] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [fuzzyNotice, setFuzzyNotice] = useState("");

  const [sessionSummary, setSessionSummary] = useState(createEmptySessionSummary);
  const [sessionSkipCounts, setSessionSkipCounts] = useState({});
  const [checkinFeedback, setCheckinFeedback] = useState("");
  const [checkedInToday, setCheckedInToday] = useState(() => hasCheckedInToday());

  const inputRef = useRef(null);
  const actionTimeoutRef = useRef(null);
  const lastQuestionIdRef = useRef(null);

  const fuzzyFirstPassIdsRef = useRef(new Set());
  const reinforcementInsertedRef = useRef(new Set());
  const startedNewInSessionRef = useRef(new Set());
  const isWindowActiveRef = useRef(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );

  function showActionMessage(msg, duration = 1600) {
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    setActionMessage(msg);
    actionTimeoutRef.current = setTimeout(() => {
      setActionMessage("");
      actionTimeoutRef.current = null;
    }, duration);
  }

  function resetPracticeState() {
    setInput("");
    setInputError("");
    setResult(null);
    setSubmitted(false);
    setAnswerMessage("");
    setShowHint(false);
    setCorrectStreak(0);
    setFuzzyNotice("");
  }

  function setDailyQueue(sourceSentences, options = {}) {
    const nextSkipUniqueCount = Number(options.sessionSkipUniqueCount || 0);
    const plan = buildPlanFromSource(sourceSentences, nextSkipUniqueCount);

    setQueueIds(plan.queueIds || []);
    setIdMeta(plan.idMeta || {});
    setPlanInfo(plan);
    setPlannedCount((plan.queueIds || []).length);
    setCompletedCount(0);
    setSessionSummary(createEmptySessionSummary());
    setSessionSkipCounts({});
    setCheckinFeedback("");

    fuzzyFirstPassIdsRef.current.clear();
    reinforcementInsertedRef.current.clear();
    startedNewInSessionRef.current.clear();
    resetStudyActivityMarker();

    if (options.showMessage) {
      showActionMessage(options.showMessage);
    }
  }

  useEffect(() => {
    setDailyQueue(sentences);
    // 只在页面进入时初始化今日计划。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
      }
      resetStudyActivityMarker();
    };
  }, []);

  useEffect(() => {
    const syncCheckinState = () => {
      setCheckedInToday(hasCheckedInToday());
    };
    window.addEventListener("history-changed", syncCheckinState);
    window.addEventListener("storage", syncCheckinState);
    return () => {
      window.removeEventListener("history-changed", syncCheckinState);
      window.removeEventListener("storage", syncCheckinState);
    };
  }, []);

  useEffect(() => {
    if (queueIds.length === 0) return;
    const existingIds = new Set(sentences.map((s) => s.id));
    const filtered = queueIds.filter((id) => existingIds.has(id));
    if (filtered.length !== queueIds.length) {
      setQueueIds(filtered);
      if (filtered.length < plannedCount) {
        setPlannedCount(filtered.length);
      }
    }
  }, [queueIds, sentences, plannedCount]);

  const current = useMemo(() => {
    if (isRandomMode) {
      return sentences.find((s) => s.id === randomId) || null;
    }
    const currentId = queueIds[0];
    return sentences.find((s) => s.id === currentId) || null;
  }, [sentences, queueIds, isRandomMode, randomId]);

  useEffect(() => {
    const currentId = current?.id || null;
    if (currentId && lastQuestionIdRef.current && currentId !== lastQuestionIdRef.current) {
      resetPracticeState();
    }

    lastQuestionIdRef.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    const updateActiveState = () => {
      isWindowActiveRef.current = document.visibilityState === "visible" && document.hasFocus();
      if (!isWindowActiveRef.current) {
        resetStudyActivityMarker();
      }
    };

    const onFocus = () => {
      isWindowActiveRef.current = document.visibilityState === "visible";
    };

    const onBlur = () => {
      isWindowActiveRef.current = false;
      resetStudyActivityMarker();
    };

    document.addEventListener("visibilitychange", updateActiveState);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", updateActiveState);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!submitted && inputRef.current) {
      inputRef.current.focus();
    }
  }, [current?.id, submitted]);

  function markActiveStudy(options = {}) {
    const { trackNewStart = false } = options;
    if (!isWindowActiveRef.current) return;
    markStudyActivity({ maxGapSeconds: 30 });

    if (!trackNewStart) return;
    if (isRandomMode || !current?.id) return;
    if (idMeta[current.id]?.type !== "new") return;
    if (startedNewInSessionRef.current.has(current.id)) return;

    startedNewInSessionRef.current.add(current.id);
    recordDailyNewPractice(current.id);
  }

  function rebuildQueueFromStorage() {
    const latest = reload();
    setIsRandomMode(false);
    setRandomId(null);
    resetPracticeState();
    setDailyQueue(latest, { showMessage: "已重新安排今日练习" });
  }

  function enterRandomMode() {
    setIsRandomMode(true);
    setRandomId(pickRandomId(sentences));
    resetPracticeState();
    showActionMessage("已进入随机练习");
  }

  function exitRandomMode() {
    setIsRandomMode(false);
    setRandomId(null);
    resetPracticeState();
    setDailyQueue(reload(), { showMessage: "已返回今日练习" });
  }

  const judgedSession = useMemo(
    () => judgeSessionPass(sessionSummary),
    [sessionSummary]
  );

  const remainingCount = isRandomMode ? 0 : queueIds.length;
  const progressHint =
    plannedCount > 0
      ? `已评分 ${completedCount} 句，当前剩余 ${remainingCount} 次练习`
      : "今日暂无待练习句子";

  if (sentences.length === 0) {
    return (
      <div className="card">
        <h2>今日默写练习</h2>
        <p>句仓为空，请先添加句子</p>
      </div>
    );
  }

  if (!isRandomMode && queueIds.length === 0) {
    const hasReviewedInRound = judgedSession.reviewed_count > 0;
    const canCheckin = judgedSession.passed && !checkedInToday;

    function handleSessionCheckin() {
      if (checkedInToday) {
        setCheckinFeedback("今日已打卡");
        return;
      }
      if (!judgedSession.passed) {
        setCheckinFeedback("未达到打卡标准");
        return;
      }
      markDailyCheckin();
      setCheckedInToday(true);
      setCheckinFeedback("打卡成功");
    }

    return (
      <div className="card">
        <h2>今日默写练习</h2>
        <p>{hasReviewedInRound ? "今日练习已完成，本轮结果如下：" : "今日暂无待练习句子"}</p>

        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>今日练习上限：{planInfo.maxDailyLoad || DAILY_MAX_LOAD} 句</div>
          <div style={{ marginTop: 6, color: "#666" }}>
            今日安排：复习 {planInfo.reviewPlanned || 0} 句，新学 {planInfo.newPlanned || 0} 句
          </div>
          {(planInfo.protectionReasons || []).length > 0 && (
            <div style={{ marginTop: 6, color: "#666" }}>
              系统已自动控量：{planInfo.protectionReasons.join("、")}
            </div>
          )}
        </div>

        {hasReviewedInRound && (
          <div className="card" style={{ marginTop: 12 }}>
            <div>
              <strong>本轮复习：{judgedSession.reviewed_count} 句</strong>
            </div>
            <div>会（grade=2）：{judgedSession.passed_count}</div>
            <div>模糊（grade=1）：{judgedSession.fuzzy_count}</div>
            <div>不会（grade=0）：{judgedSession.failed_count}</div>
            <div>通过率：{Math.round(judgedSession.pass_rate * 100)}%</div>
            <div>失败率：{Math.round(judgedSession.fail_rate * 100)}%</div>

            <div style={{ marginTop: 10 }}>
              <button
                className="button"
                type="button"
                onClick={handleSessionCheckin}
                disabled={!canCheckin}
              >
                {checkedInToday
                  ? "今日已打卡"
                  : canCheckin
                    ? "今日打卡"
                    : "未达到打卡标准"}
                <span className="paw" />
              </button>
            </div>

            {!judgedSession.passed && (
              <div style={{ marginTop: 8, color: "#666" }}>
                打卡条件：复习≥8，通过率≥50%，失败率&lt;25%
              </div>
            )}
            {checkinFeedback && (
              <div style={{ marginTop: 8, color: "#666" }}>{checkinFeedback}</div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button className="button" type="button" onClick={enterRandomMode}>
            随机练习一句（不计入今日队列）
            <span className="paw" />
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card">
        <h2>今日默写练习</h2>
        <p>没有可练习的句子</p>
      </div>
    );
  }

  function submitAnswer() {
    markActiveStudy({ trackNewStart: true });
    if (submitted) return;

    if (!input.trim()) {
      setInputError("请先输入你默写的英文句子");
      return;
    }

    setInputError("");

    const user = normalizeForCompare(input);
    const answer = normalizeForCompare(current.text || "");
    const exactOk = user === answer;

    let fuzzyMessage = "";
    if (!exactOk) {
      const fuzzy = getFuzzyMatchInfo(input, current.text || "");
      if (fuzzy.ok) {
        fuzzyMessage = fuzzy.message;
      }
    }

    if (correctStreak === 0 && (exactOk || Boolean(fuzzyMessage))) {
      if (fuzzyMessage) {
        fuzzyFirstPassIdsRef.current.add(current.id);
      }
      setCorrectStreak(1);
      setInput("");
      setResult(null);
      setSubmitted(false);
      const notice = fuzzyMessage ? `✅ 基本正确（有拼写问题）：${fuzzyMessage}` : "✅ 正确";
      setAnswerMessage(`${notice}\n请再默写一次确认`);
      setShowHint(false);
      setFuzzyNotice(fuzzyMessage);
      return;
    }

    const ok = correctStreak > 0 ? exactOk : exactOk || Boolean(fuzzyMessage);

    setCorrectStreak(0);
    setResult(ok);
    setSubmitted(true);
    setAnswerMessage("");
    setShowHint(false);
    setFuzzyNotice(fuzzyMessage);
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitAnswer();
  }

  function handleInputKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submitAnswer();
      return;
    }

    if (e.key === "Escape") {
      setShowHint(false);
    }
  }

  function handleNext() {
    markActiveStudy({ trackNewStart: true });
    if (isRandomMode) {
      setRandomId(pickRandomId(sentences));
      resetPracticeState();
      showActionMessage("已切换到下一句随机练习");
      return;
    }

    const id = current.id;
    const nextSkip = (sessionSkipCounts[id] || 0) + 1;
    const nextSkipCounts = { ...sessionSkipCounts, [id]: nextSkip };
    const nextSkipUniqueCount = Object.keys(nextSkipCounts).filter(
      (key) => (nextSkipCounts[key] || 0) > 0
    ).length;

    setSessionSkipCounts(nextSkipCounts);

    setQueueIds((prev) => {
      if (prev.length === 0) return prev;
      const [head, ...tail] = prev;
      if (!head) return prev;

      let minGap = 3;
      let maxGap = 5;
      if (nextSkip >= 2) {
        minGap = 2;
        maxGap = 4;
      }
      if (nextSkip >= 3) {
        minGap = 1;
        maxGap = 2;
      }

      let nextQueue = insertDeferredSentence(tail, head, { minGap, maxGap });

      if (nextSkipUniqueCount >= 3) {
        nextQueue = deprioritizeRemainingNew(nextQueue, idMeta);
      }

      return nextQueue;
    });

    resetPracticeState();

    if (nextSkip >= 3) {
      showActionMessage("这句已多次不会，系统会更快再次安排，建议先看提示再答");
    } else {
      showActionMessage("已标记为不会，这句会在稍后再次出现");
    }
  }

  function handleRate(q) {
    markActiveStudy({ trackNewStart: true });
    const now = Date.now();
    const currentId = current.id;

    const next = sentences.map((s) => {
      if (s.id !== currentId) return s;
      const base = ensureSrs(s).srs;
      const rating = ratingFromQuality(q);
      const updatedCard = rateFsrsCard(base.fsrs, rating, now);
      const intervalDays = getFsrsIntervalDays(updatedCard);
      const reps = getFsrsReps(updatedCard);
      const lapses = getFsrsLapses(updatedCard);
      const lastReviewAt = getFsrsLastReviewAt(updatedCard);
      const mastered =
        q >= 3 &&
        reps >= MASTERY_REPS &&
        intervalDays >= MASTERY_INTERVAL_DAYS;

      const updatedSrs = {
        ...base,
        algorithm: "fsrs",
        fsrs: updatedCard,
        dueAt: getFsrsDueAt(updatedCard),
        intervalDays,
        reps,
        lapses,
        lastReviewAt,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
        mastered,
        masteredAt: mastered ? now : base.masteredAt,
      };

      return { ...s, srs: updatedSrs };
    });

    setSentences(next);

    const resultType = q >= 4 ? "pass" : q >= 3 ? "fuzzy" : "fail";
    recordDailyReviewCount(1, resultType);

    if (!isRandomMode) {
      setSessionSummary((prev) => ({
        reviewed_count: prev.reviewed_count + 1,
        passed_count: prev.passed_count + (resultType === "pass" ? 1 : 0),
        fuzzy_count: prev.fuzzy_count + (resultType === "fuzzy" ? 1 : 0),
        failed_count: prev.failed_count + (resultType === "fail" ? 1 : 0),
      }));
      setCompletedCount((prev) => prev + 1);

      const shouldReinforce =
        !reinforcementInsertedRef.current.has(currentId) &&
        (q <= 3 || fuzzyFirstPassIdsRef.current.has(currentId) || idMeta[currentId]?.type === "new");

      setQueueIds((prev) => {
        const [, ...tail] = prev;
        if (!shouldReinforce) return tail;

        reinforcementInsertedRef.current.add(currentId);
        return injectSameSessionReinforcement(tail, currentId, { minGap: 3, maxGap: 5 });
      });
    } else {
      setRandomId(pickRandomId(next));
    }

    fuzzyFirstPassIdsRef.current.delete(currentId);

    resetPracticeState();
    showActionMessage("已记录本次练习");
  }

  return (
    <div className="card">
      <h2>今日默写练习</h2>

      {!isRandomMode && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>{progressHint}</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13 }}>
            今日练习上限：{planInfo.maxDailyLoad || DAILY_MAX_LOAD} 句（复习优先）
          </div>
          <div style={{ marginTop: 4, color: "#666", fontSize: 13 }}>
            今日已安排：复习 {planInfo.reviewPlanned || 0} 句，新学 {planInfo.newPlanned || 0} 句
          </div>
          {(planInfo.protectionReasons || []).length > 0 && (
            <div style={{ marginTop: 4, color: "#666", fontSize: 12 }}>
              自动控量：{planInfo.protectionReasons.join("、")}
            </div>
          )}
        </div>
      )}

      {!isRandomMode && queueIds.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button className="button secondary" type="button" onClick={rebuildQueueFromStorage}>
            重新安排今日练习
          </button>
        </div>
      )}

      {isRandomMode && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8, color: "#666" }}>当前模式：随机练习（不影响今日计划）</div>
          <button className="button secondary" type="button" onClick={exitRandomMode}>
            返回今日练习
          </button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <strong>中文提示：</strong>
        {current.meaning}
      </div>

      <details style={{ marginBottom: 10, color: "#666", fontSize: 12 }}>
        <summary>朗读功能说明（可选）</summary>
        <div style={{ marginTop: 6 }}>
          Chrome 下朗读功能可能不稳定，遇到卡顿可暂时关闭朗读。
        </div>
      </details>

      <form onSubmit={handleSubmit}>
        <label>请默写完整英文句子</label>
        <textarea
          ref={inputRef}
          className="input"
          rows={4}
          value={input}
          onChange={(e) => {
            markActiveStudy({ trackNewStart: true });
            setInput(e.target.value);
            if (inputError) setInputError("");
          }}
          onKeyDown={handleInputKeyDown}
          disabled={submitted}
          placeholder="在这里输入你默写的句子"
        />

        {inputError && (
          <div style={{ marginTop: -6, marginBottom: 10, color: "#b42318", fontSize: 13 }}>
            {inputError}
          </div>
        )}

        {!submitted && (
          <>
            <div style={{ marginTop: 8 }}>
              <button className="button" type="submit">
                提交答案
                <span className="paw" />
              </button>
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  markActiveStudy({ trackNewStart: true });
                  setShowHint(true);
                }}
              >
                查看提示
              </button>
              <button className="button secondary" type="button" onClick={handleNext}>
                不会这句
              </button>
            </div>
            <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
              快捷键：Ctrl/Cmd + Enter 提交，Esc 收起提示
            </div>
          </>
        )}
      </form>

      {actionMessage && <div style={{ marginTop: 8, color: "#666" }}>{actionMessage}</div>}

      {answerMessage && (
        <div style={{ marginTop: 8, color: "#333", whiteSpace: "pre-line" }}>
          {answerMessage}
        </div>
      )}

      {showHint && !submitted && <div style={{ marginTop: 8, color: "#333" }}>提示：{current.text}</div>}

      {submitted && (
        <div style={{ marginTop: 12 }}>
          <div>{result ? "✅ 提交成功" : "❌ 还有错误"}</div>
          <div>正确答案：{current.text}</div>
          {result && fuzzyNotice && <div style={{ marginTop: 6, color: "#c66" }}>{fuzzyNotice}</div>}

          <div style={{ marginTop: 8, color: "#666" }}>请选择掌握程度，系统会自动进入下一句</div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button" type="button" onClick={() => handleRate(4)}>
              会（记住了）
              <span className="paw" />
            </button>
            <button className="button secondary" type="button" onClick={() => handleRate(3)}>
              模糊（有点难）
            </button>
            <button className="button secondary" type="button" onClick={() => handleRate(1)}>
              不会（忘了）
            </button>
          </div>
        </div>
      )}

      {!isRandomMode && (
        <div style={{ marginTop: 12, color: "#666", fontSize: 12 }}>
          学习说明：系统会优先安排待复习句子，再按负荷动态补充新学句子。
        </div>
      )}
    </div>
  );
}
