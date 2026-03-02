import { useEffect, useState } from "react";
import { loadSentences, saveSentences, subscribe } from "../storage/sentencesStore.js";

export function useSentences() {
  const [sentences, setSentencesState] = useState(() => loadSentences());

  useEffect(() => {
    const unsubscribe = subscribe((next) => {
      setSentencesState(next);
    });
    return unsubscribe;
  }, []);

  const setSentences = (next) => {
    saveSentences(next);
    setSentencesState(next);
  };

  const reload = () => {
    const latest = loadSentences();
    setSentencesState(latest);
    return latest;
  };

  return { sentences, setSentences, reload };
}
