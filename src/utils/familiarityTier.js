function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getPracticeFamiliarityTier(sentence, meta = {}, policy = {}) {
  const srs = sentence?.srs || {};
  if (srs.mastered) return "mastered";

  const reps = toNumber(srs.reps, 0);
  const lapses = toNumber(srs.lapses, 0);
  const intervalDays = toNumber(srs.intervalDays, 0);
  const sameSessionMiss = toNumber(policy.sameSessionMiss, 0);
  const skipCount = toNumber(policy.skipCount, 0);

  if (meta?.type === "new" || reps <= 0) return "new";
  if (sameSessionMiss >= 2 || skipCount >= 2) return "weak";

  if (meta?.familiarity === "unfamiliar") return "unfamiliar";
  if (meta?.familiarity === "weak") return "weak";
  if (meta?.familiarity === "stable") return "stable";

  if (lapses >= 2 || reps <= 2) return "unfamiliar";
  if (lapses >= 1 || reps <= 4 || intervalDays <= 7) return "weak";
  return "stable";
}

export function getConfirmationPolicyByTier(tier) {
  if (tier === "new" || tier === "unfamiliar") {
    return {
      requireSecondConfirm: true,
      fuzzyNeedsConfirm: true,
      exactPassDirect: false,
      label: "严格确认",
    };
  }

  if (tier === "weak") {
    return {
      requireSecondConfirm: false,
      fuzzyNeedsConfirm: true,
      exactPassDirect: true,
      label: "适中确认",
    };
  }

  return {
    requireSecondConfirm: false,
    fuzzyNeedsConfirm: false,
    exactPassDirect: true,
    label: "快速确认",
  };
}

