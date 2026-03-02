import { useEffect, useState } from "react";
import { loadHistory, saveHistory, subscribeHistory } from "../storage/historyStore.js";

export function useHistory() {
  const [history, setHistoryState] = useState(() => loadHistory());

  useEffect(() => {
    const unsubscribe = subscribeHistory((next) => {
      setHistoryState(next);
    });
    return unsubscribe;
  }, []);

  const setHistory = (next) => {
    saveHistory(next);
    setHistoryState(next);
  };

  const reload = () => {
    const latest = loadHistory();
    setHistoryState(latest);
    return latest;
  };

  return { history, setHistory, reload };
}
