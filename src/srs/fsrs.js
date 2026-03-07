import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  TypeConvert,
} from "ts-fsrs";

const DAY_MS = 24 * 60 * 60 * 1000;

const FSRS_PARAMS = generatorParameters({
  enable_fuzz: true,
  enable_short_term: false,
});

const SCHEDULER = fsrs(FSRS_PARAMS);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mapEaseToDifficulty(ease) {
  const minEase = 1.3;
  const maxEase = 3.3;
  const safeEase = clamp(
    typeof ease === "number" ? ease : 2.5,
    minEase,
    maxEase
  );
  const t = (safeEase - minEase) / (maxEase - minEase);
  return clamp(10 - t * 9, 1, 10);
}

function toCardInput(card) {
  return {
    ...card,
    due: card.due.getTime(),
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

function toCard(cardInput) {
  return TypeConvert.card(cardInput);
}

export function createFsrsCard(nowMs = Date.now()) {
  const card = createEmptyCard(new Date(nowMs));
  return toCardInput(card);
}

export function migrateSm2ToFsrsCard(srs, createdAt) {
  const now = Date.now();
  const baseDate =
    typeof srs.lastReviewAt === "number"
      ? srs.lastReviewAt
      : typeof createdAt === "number"
        ? createdAt
        : now;
  const baseCard = createEmptyCard(new Date(baseDate));
  const reps = typeof srs.reps === "number" ? srs.reps : 0;
  const lapses = typeof srs.lapses === "number" ? srs.lapses : 0;
  const intervalDays =
    typeof srs.intervalDays === "number" && srs.intervalDays > 0
      ? Math.round(srs.intervalDays)
      : 0;
  const dueAt =
    typeof srs.dueAt === "number" && Number.isFinite(srs.dueAt)
      ? srs.dueAt
      : baseDate + Math.max(1, intervalDays) * DAY_MS;
  const lastReviewAt =
    typeof srs.lastReviewAt === "number"
      ? srs.lastReviewAt
      : baseDate;

  if (reps <= 0) {
    const fresh = {
      ...baseCard,
      reps: 0,
      lapses: 0,
      due: new Date(dueAt),
      last_review: null,
      state: State.New,
    };
    return toCardInput(fresh);
  }

  const difficulty = mapEaseToDifficulty(srs.ease);
  const stability = Math.max(baseCard.stability, intervalDays || 0.1);
  const migrated = {
    ...baseCard,
    reps,
    lapses,
    difficulty,
    stability,
    scheduled_days: Math.max(1, intervalDays || 1),
    elapsed_days: Math.max(1, intervalDays || 1),
    learning_steps: 0,
    due: new Date(dueAt),
    last_review: new Date(lastReviewAt),
    state: State.Review,
  };

  return toCardInput(migrated);
}

export function ensureFsrsCard(srs, createdAt) {
  if (srs && srs.fsrs) return srs.fsrs;
  return migrateSm2ToFsrsCard(srs || {}, createdAt);
}

export function rateFsrsCard(cardInput, rating, nowMs = Date.now()) {
  const card = toCard(cardInput);
  const scheduling = SCHEDULER.repeat(card, new Date(nowMs));
  const item = scheduling[rating];
  if (!item || !item.card) return cardInput;
  return toCardInput(item.card);
}

export function ratingFromQuality(q) {
  if (q <= 1) return Rating.Again;
  if (q === 3) return Rating.Hard;
  return Rating.Good;
}

export function getFsrsDueAt(cardInput) {
  return typeof cardInput?.due === "number" ? cardInput.due : Date.now();
}

export function getFsrsIntervalDays(cardInput) {
  const days = cardInput?.scheduled_days;
  return typeof days === "number" ? days : 0;
}

export function getFsrsLastReviewAt(cardInput) {
  return typeof cardInput?.last_review === "number" ? cardInput.last_review : null;
}

export function getFsrsReps(cardInput) {
  const reps = cardInput?.reps;
  return typeof reps === "number" ? reps : 0;
}

export function getFsrsLapses(cardInput) {
  const lapses = cardInput?.lapses;
  return typeof lapses === "number" ? lapses : 0;
}

