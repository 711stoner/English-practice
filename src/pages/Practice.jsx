import { useEffect, useMemo, useRef, useState } from "react";
import { useSentences } from "../hooks/useSentences.js";
import { ensureSrs } from "../storage/sentencesStore.js";
import { upsertToday } from "../storage/historyStore.js";

function normalizeSpaces(text) {
  return text.trim().replace(/\s+/g, " ");
}

function applySm2(srs, q) {
  let { intervalDays, ease, reps, lapses } = srs;

  if (q < 3) {
    reps = 0;
    intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
    lapses += 1;
  } else {
    reps += 1;
    ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    intervalDays =
      reps === 1 ? 1 : reps === 2 ? 3 : Math.round(intervalDays * ease);
  }

  const dueAt = Date.now() + intervalDays * 24 * 60 * 60 * 1000;
  return { dueAt, intervalDays, ease, reps, lapses };
}

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
  const skipTimeoutRef = useRef(null);
  const lastTickRef = useRef(Date.now());
  const intervalRef = useRef(null);

  useEffect(() => {
    const now = Date.now();
    const due = sentences.filter((s) => (s.srs?.dueAt ?? now) <= now);
    const ids = due.map((s) => s.id).filter(Boolean);
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

  function resetPracticeState() {
    setInput("");
    setResult(null);
    setSubmitted(false);
    setSkipMessage("");
    setAnswerMessage("");
    setShowHint(false);
  }

  function rebuildQueueFromStorage() {
    const latest = reload();
    const now = Date.now();
    const due = latest.filter((s) => (s.srs?.dueAt ?? now) <= now);
    const ids = due.map((s) => s.id).filter(Boolean);
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
    const user = normalizeSpaces(input);
    const answer = normalizeSpaces(current.text || "");
    const ok = user === answer;
    setResult(ok);
    setSubmitted(true);
    setSkipMessage("");
    setAnswerMessage("");
    setShowHint(false);
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

    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current);
    }
    setSkipMessage("已跳过：不更新记忆曲线");
    skipTimeoutRef.current = setTimeout(() => {
      setSkipMessage("");
      skipTimeoutRef.current = null;
    }, 1500);
  }

  function handleRate(q) {
    const next = sentences.map((s) => {
      if (s.id !== current.id) return s;
      const updatedSrs = applySm2(ensureSrs(s).srs, q);
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
            下一题
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
