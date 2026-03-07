import { useEffect, useMemo, useRef, useState } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { ensureSrs } from "../storage/sentencesStore.js";
import { getCstDateString, upsertToday } from "../storage/historyStore.js";
import {
  getFsrsDueAt,
  getFsrsIntervalDays,
  getFsrsLapses,
  getFsrsLastReviewAt,
  getFsrsReps,
  rateFsrsCard,
  ratingFromQuality,
} from "../srs/fsrs.js";

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
  const maxLen = Math.max(userNorm.length, answerNorm.length);
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
    message:
      mismatches.length > 0 ? `拼写问题：${mismatches.join("，")}` : "",
  };
}

const MASTERY_REPS = 8;
const MASTERY_INTERVAL_DAYS = 730;
const DAILY_REVIEW_LIMIT = 15;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomId(list) {
  if (!list || list.length === 0) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index].id || null;
}

function isDueByCstDay(srs, now = Date.now()) {
  if (!srs || srs.mastered) return false;
  const dueAt = srs.dueAt;
  if (typeof dueAt !== "number" || !Number.isFinite(dueAt)) return false;
  const dueDate = getCstDateString(dueAt);
  const today = getCstDateString(now);
  return dueDate <= today;
}

function buildTodayQueueIds(sentences, now) {
  return sentences
    .filter((s) => isDueByCstDay(s.srs, now))
    .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0))
    .slice(0, DAILY_REVIEW_LIMIT)
    .map((s) => s.id)
    .filter(Boolean);
}

export default function Practice() {
  const { sentences, setSentences, reload } = useSentences();
  const [queueIds, setQueueIds] = useState([]);
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [randomId, setRandomId] = useState(null);
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [skipMessage, setSkipMessage] = useState("");
  const [answerMessage, setAnswerMessage] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [fuzzyNotice, setFuzzyNotice] = useState("");
  const skipTimeoutRef = useRef(null);
  const lastTickRef = useRef(Date.now());
  const intervalRef = useRef(null);
  const lastQuestionIdRef = useRef(null);

  useEffect(() => {
    const now = Date.now();
    const ids = buildTodayQueueIds(sentences, now);
    setQueueIds(shuffleArray(ids));
  }, []);

  useEffect(() => {
    const start = Date.now();
    lastTickRef.current = start;

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const deltaSec = Math.floor((now - lastTickRef.current) / 1000);
      if (deltaSec > 0) {
        upsertToday((day) => ({
          ...day,
          durationSeconds: (day.durationSeconds || 0) + deltaSec,
        }));
        lastTickRef.current = now;
      }
    }, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const end = Date.now();
      const deltaSec = Math.floor((end - lastTickRef.current) / 1000);
      if (deltaSec > 0) {
        upsertToday((day) => ({
          ...day,
          durationSeconds: (day.durationSeconds || 0) + deltaSec,
        }));
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (queueIds.length === 0) return;
    const existingIds = new Set(sentences.map((s) => s.id));
    const filtered = queueIds.filter((id) => existingIds.has(id));
    if (filtered.length !== queueIds.length) {
      setQueueIds(filtered);
    }
  }, [queueIds, sentences]);

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
      setInput("");
      setResult(null);
      setSubmitted(false);
      setSkipMessage("");
      setAnswerMessage("");
      setShowHint(false);
      setCorrectStreak(0);
      setFuzzyNotice("");
    }
    lastQuestionIdRef.current = currentId;
  }, [current?.id]);

  function resetPracticeState() {
    setInput("");
    setResult(null);
    setSubmitted(false);
    setSkipMessage("");
    setAnswerMessage("");
    setShowHint(false);
    setCorrectStreak(0);
    setFuzzyNotice("");
  }

  function rebuildQueueFromStorage() {
    const latest = reload();
    const now = Date.now();
    const ids = buildTodayQueueIds(latest, now);
    setQueueIds(shuffleArray(ids));
  }

  function flushDuration() {
    const now = Date.now();
    const deltaSec = Math.floor((now - lastTickRef.current) / 1000);
    if (deltaSec > 0) {
      upsertToday((day) => ({
        ...day,
        durationSeconds: (day.durationSeconds || 0) + deltaSec,
      }));
      lastTickRef.current = now;
    }
  }

  function enterRandomMode() {
    setIsRandomMode(true);
    setRandomId(pickRandomId(sentences));
    resetPracticeState();
  }

  function exitRandomMode() {
    flushDuration();
    setIsRandomMode(false);
    setRandomId(null);
    resetPracticeState();
    rebuildQueueFromStorage();
  }

  if (sentences.length === 0) {
    return (
      <div className="card">
        <h2>今日复习</h2>
        <p>句仓为空，请先添加句子</p>
      </div>
    );
  }

  if (!isRandomMode && queueIds.length === 0) {
    return (
      <div className="card">
        <h2>今日复习</h2>
        <p>今天没有到期句子</p>
        <button className="button" type="button" onClick={enterRandomMode}>
          随机练习一条（不影响复习计划）
          <span className="paw" />
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card">
        <h2>今日复习</h2>
        <p>没有可练习的句子</p>
      </div>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (submitted) return;
    const user = normalizeForCompare(input);
    const answer = normalizeForCompare(current.text || "");
    const exactOk = user === answer;
    let fuzzyMessage = "";

    if (exactOk && correctStreak === 0) {
      setCorrectStreak(1);
      setInput("");
      setResult(null);
      setSubmitted(false);
      setSkipMessage("");
      const notice = fuzzyMessage ? `✅ 基本正确（有拼写问题）：${fuzzyMessage}` : "✅ 正确";
      setAnswerMessage(`${notice}\n请再拼写一次确认`);
      setShowHint(false);
      setFuzzyNotice(fuzzyMessage);
      return;
    }

    if (!exactOk) {
      const fuzzy = getFuzzyMatchInfo(input, current.text || "");
      if (fuzzy.ok) {
        fuzzyMessage = fuzzy.message;
      }
    }

    const ok =
      correctStreak === 0 ? exactOk || Boolean(fuzzyMessage) : exactOk;

    if (ok && correctStreak === 0) {
      setCorrectStreak(1);
      setInput("");
      setResult(null);
      setSubmitted(false);
      setSkipMessage("");
      const notice = fuzzyMessage ? `✅ 基本正确（有拼写问题）：${fuzzyMessage}` : "✅ 正确";
      setAnswerMessage(`${notice}\n请再拼写一次确认`);
      setShowHint(false);
      setFuzzyNotice(fuzzyMessage);
      return;
    }

    setCorrectStreak(0);
    setResult(ok);
    setSubmitted(true);
    setSkipMessage("");
    setAnswerMessage("");
    setShowHint(false);
    setFuzzyNotice(fuzzyMessage);
  }

  function handleNext() {
    if (isRandomMode) {
      setRandomId(pickRandomId(sentences));
    } else {
      setQueueIds((prev) => {
        if (prev.length <= 1) return prev;
        return [...prev.slice(1), prev[0]];
      });
    }

    setInput("");
    setResult(null);
    setSubmitted(false);
    setAnswerMessage("");
    setShowHint(false);
    setCorrectStreak(0);
    setFuzzyNotice("");

    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
    }
    setSkipMessage("已标记为不会：稍后继续背诵（不更新记忆曲线）");
    skipTimeoutRef.current = setTimeout(() => {
      setSkipMessage("");
      skipTimeoutRef.current = null;
    }, 1500);
  }

  function handleRate(q) {
    const now = Date.now();
    const next = sentences.map((s) => {
      if (s.id !== current.id) return s;
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

    setAnswerMessage(`正确英文：${current.text}\n正确中文：${current.meaning}`);

    upsertToday((day) => ({
      ...day,
      reviewedCount: (day.reviewedCount || 0) + 1,
    }));

    if (isRandomMode) {
      setRandomId(pickRandomId(next));
    } else {
      setQueueIds((prev) => prev.slice(1));
    }

    setInput("");
    setResult(null);
    setSubmitted(false);
    setSkipMessage("");
    setShowHint(false);
  }

  function handleRebuildQueue() {
    const ok = window.confirm("确认是否重新生成今日队列？");
    if (!ok) return;
    setIsRandomMode(false);
    setRandomId(null);
    resetPracticeState();
    rebuildQueueFromStorage();
  }

  return (
    <div className="card">
      <h2>今日复习</h2>

      {isRandomMode && (
        <div style={{ marginBottom: 8, color: "#666" }}>
          当前模式：随机练习（不影响复习计划）
        </div>
      )}

      {!isRandomMode && queueIds.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button className="button" type="button" onClick={handleRebuildQueue}>
            重新生成今日队列
            <span className="paw" />
          </button>
        </div>
      )}

      {isRandomMode && (
        <div style={{ marginBottom: 12 }}>
          <button className="button" type="button" onClick={exitRandomMode}>
            退出随机练习
            <span className="paw" />
          </button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <strong>中文：</strong>
        {current.meaning}
      </div>

      <div style={{ marginBottom: 8, color: "#666", fontSize: 12 }}>
        若你在 Chrome 点击朗读会卡死，请先不要启用朗读。
      </div>

      <form onSubmit={handleSubmit}>
        <label>请输入完整英文句子</label>
        <textarea
          className="input"
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={submitted}
          placeholder="输入英文句子..."
        />

        <div style={{ marginTop: 8 }}>
          <button className="button" type="submit" disabled={submitted}>
            提交
            <span className="paw" />
          </button>
          <button
            className="button"
            type="button"
            onClick={handleNext}
            style={{ marginLeft: 8 }}
          >
            不会，下一题
            <span className="paw" />
          </button>
          <button
            className="button"
            type="button"
            onClick={() => setShowHint(true)}
            style={{ marginLeft: 8 }}
            disabled={submitted}
          >
            提示
            <span className="paw" />
          </button>
        </div>
      </form>

      {skipMessage && (
        <div style={{ marginTop: 8, color: "#666" }}>{skipMessage}</div>
      )}

      {answerMessage && (
        <div style={{ marginTop: 8, color: "#333", whiteSpace: "pre-line" }}>
          {answerMessage}
        </div>
      )}

      {showHint && !submitted && (
        <div style={{ marginTop: 8, color: "#333" }}>
          答案：{current.text}
        </div>
      )}

      {submitted && (
        <div style={{ marginTop: 12 }}>
          <div>{result ? "✅ 正确" : "❌ 错误"}</div>
          <div>正确答案：{current.text}</div>
          {result && fuzzyNotice && (
            <div style={{ marginTop: 6, color: "#c66" }}>{fuzzyNotice}</div>
          )}

          <div style={{ marginTop: 12 }}>
            <button
              className="button"
              type="button"
              onClick={() => handleRate(4)}
            >
              记住了
              <span className="paw" />
            </button>
            <button
              className="button"
              type="button"
              onClick={() => handleRate(3)}
              style={{ marginLeft: 8 }}
            >
              有点难
              <span className="paw" />
            </button>
            <button
              className="button"
              type="button"
              onClick={() => handleRate(1)}
              style={{ marginLeft: 8 }}
            >
              忘了
              <span className="paw" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
