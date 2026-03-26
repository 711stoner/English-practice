const LIGHT_TOKENS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "by",
  "from",
  "up",
  "down",
  "as",
  "and",
  "or",
  "but",
  "if",
  "that",
  "this",
  "these",
  "those",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "may",
  "might",
  "must",
  "should",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "her",
  "us",
  "them",
  "my",
  "your",
  "his",
  "our",
  "their",
]);

function normalizeCompare(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "");
}

function normalizeSpaceKeepCase(text) {
  return String(text || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeWordSpacing(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePunctuationText(text) {
  return String(text || "")
    .replace(/[，]/g, ",")
    .replace(/[。]/g, ".")
    .replace(/[！]/g, "!")
    .replace(/[？]/g, "?")
    .replace(/[；]/g, ";")
    .replace(/[：]/g, ":")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
}

function extractPunctuationSignature(text) {
  const normalized = normalizePunctuationText(text);
  const marks = normalized.match(/[^\p{L}\p{N}\s]/gu) || [];
  return marks.join("");
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
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
    const aItem = a[i - 1];
    for (let j = 1; j <= bLen; j += 1) {
      const cost = aItem === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bLen; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[bLen];
}

function isLightToken(token) {
  const t = String(token || "").toLowerCase();
  return LIGHT_TOKENS.has(t);
}

function isMinorTokenDiff(a, b) {
  if (a === b) return true;
  const d = levenshtein(a, b);
  if (d <= 1) return true;
  if (isLightToken(a) && isLightToken(b)) return true;
  if (a.endsWith("s") && a.slice(0, -1) === b) return true;
  if (b.endsWith("s") && b.slice(0, -1) === a) return true;
  return false;
}

function getThresholdByLength(answerWordCount) {
  if (answerWordCount <= 8) {
    return {
      bucket: "short",
      maxCharDistance: 1,
      maxTokenDistance: 1,
      maxMinorErrors: 1,
      maxLengthGap: 0,
      maxCoreErrors: 0,
    };
  }

  if (answerWordCount <= 14) {
    return {
      bucket: "medium",
      maxCharDistance: 2,
      maxTokenDistance: 2,
      maxMinorErrors: 2,
      maxLengthGap: 1,
      maxCoreErrors: 0,
    };
  }

  return {
    bucket: "long",
    maxCharDistance: 3,
    maxTokenDistance: 3,
    maxMinorErrors: 3,
    maxLengthGap: 2,
    maxCoreErrors: 0,
  };
}

export function judgeSpellingAttempt(userText, answerText) {
  const userCompare = normalizeCompare(userText);
  const answerCompare = normalizeCompare(answerText);
  const exact = userCompare === answerCompare;

  const userCaseComparable = normalizeSpaceKeepCase(userText);
  const answerCaseComparable = normalizeSpaceKeepCase(answerText);
  const hasCapitalizationIssue =
    userCaseComparable &&
    answerCaseComparable &&
    userCaseComparable.toLowerCase() === answerCaseComparable.toLowerCase() &&
    userCaseComparable !== answerCaseComparable;
  const hasSpacingIssue =
    userCompare === answerCompare &&
    normalizeWordSpacing(userText) !== normalizeWordSpacing(answerText);

  const hasPunctuationIssue =
    extractPunctuationSignature(userText) !== extractPunctuationSignature(answerText);

  const formattingHints = [];
  if (hasCapitalizationIssue) {
    formattingHints.push("句首或专有名词大小写可再规范一些");
  }
  if (hasSpacingIssue) {
    formattingHints.push("空格可再规范一些（不影响本句通过）");
  }
  if (hasPunctuationIssue) {
    formattingHints.push("标点可再规范一些（不影响本句通过）");
  }

  if (exact) {
    return {
      exact: true,
      fuzzyOk: true,
      message: "",
      isCoreCorrect: true,
      coreErrors: 0,
      minorErrors: 0,
      bucket: "exact",
      tokenDistance: 0,
      charDistance: 0,
      formattingHints,
      hasPunctuationIssue,
      hasCapitalizationIssue,
      hasSpacingIssue,
    };
  }

  const userTokens = tokenize(userText);
  const answerTokens = tokenize(answerText);
  const answerWordCount = answerTokens.length;
  const threshold = getThresholdByLength(answerWordCount);

  const tokenDistance = levenshtein(userTokens, answerTokens);
  const charDistance = levenshtein(userCompare, answerCompare);
  const lengthGap = Math.abs(userTokens.length - answerTokens.length);

  let coreErrors = 0;
  let minorErrors = 0;

  const minLen = Math.min(userTokens.length, answerTokens.length);
  for (let i = 0; i < minLen; i += 1) {
    const u = userTokens[i];
    const a = answerTokens[i];
    if (u === a) continue;
    if (isMinorTokenDiff(u, a)) {
      minorErrors += 1;
    } else {
      coreErrors += 1;
    }
  }

  if (userTokens.length > minLen) {
    for (let i = minLen; i < userTokens.length; i += 1) {
      if (isLightToken(userTokens[i])) minorErrors += 1;
      else coreErrors += 1;
    }
  } else if (answerTokens.length > minLen) {
    for (let i = minLen; i < answerTokens.length; i += 1) {
      if (isLightToken(answerTokens[i])) minorErrors += 1;
      else coreErrors += 1;
    }
  }

  const fuzzyOk =
    tokenDistance <= threshold.maxTokenDistance &&
    charDistance <= threshold.maxCharDistance &&
    lengthGap <= threshold.maxLengthGap &&
    coreErrors <= threshold.maxCoreErrors &&
    minorErrors <= threshold.maxMinorErrors;

  const message = fuzzyOk
    ? `轻微误差：非核心${minorErrors}处，核心${coreErrors}处`
    : `需要更精确：核心${coreErrors}处，非核心${minorErrors}处`;

  return {
    exact: false,
    fuzzyOk,
    message,
    isCoreCorrect: fuzzyOk,
    coreErrors,
    minorErrors,
    bucket: threshold.bucket,
    tokenDistance,
    charDistance,
    formattingHints,
    hasPunctuationIssue,
    hasCapitalizationIssue,
    hasSpacingIssue,
  };
}
