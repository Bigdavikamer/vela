import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';

/**
 * Spaced repetition.
 *
 * Vela uses FSRS-6 (via ts-fsrs) rather than an invented interval scheme. It is
 * the best-evidenced open scheduler available, and the parameters below are its
 * published defaults — a per-user optimisation pass can replace them later
 * without touching anything that calls this module.
 *
 * Scheduling runs on the device: grading a card must feel instant, and a
 * student on a bad connection should still be able to review. The result is
 * written back to `card_states`, so the next device sees the same schedule.
 */

export type CardState = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  last_review: string | null;
};

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

const GRADE_TO_RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export const GRADE_VALUE: Record<ReviewGrade, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

const STATE_TO_DB: Record<State, CardState['state']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const DB_TO_STATE: Record<CardState['state'], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/**
 * `enable_fuzz` spreads due dates by a few percent so a big import does not
 * come back as one enormous review day months later.
 */
const scheduler = fsrs({
  enable_fuzz: true,
  enable_short_term: true,
  // 0.9 = aim to recall 90% of cards at review time. Higher means more reviews
  // for slightly better retention; this is the widely used default.
  request_retention: 0.9,
});

function toFsrsCard(state: CardState | null): Card {
  if (!state) return createEmptyCard(new Date());
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: DB_TO_STATE[state.state],
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

function fromFsrsCard(card: Card): CardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_DB[card.state],
    last_review: card.last_review?.toISOString() ?? null,
  };
}

export type ScheduleResult = {
  next: CardState;
  /** what the student sees on the button: "10 min", "3 days" */
  intervalLabel: string;
  dueAt: Date;
};

/** Applies a grade and returns the new scheduling state. */
export function grade(
  current: CardState | null,
  reviewGrade: ReviewGrade,
  now = new Date(),
): ScheduleResult {
  const result = scheduler.next(toFsrsCard(current), now, GRADE_TO_RATING[reviewGrade]);
  const next = fromFsrsCard(result.card);
  return {
    next,
    intervalLabel: formatInterval(result.card.due.getTime() - now.getTime()),
    dueAt: result.card.due,
  };
}

/**
 * Previews all four outcomes so the grading buttons can show what each choice
 * costs — "Again · 1 min" vs "Easy · 4 days". Seeing the consequence makes
 * students grade honestly instead of always pressing Good.
 */
export function previewIntervals(
  current: CardState | null,
  now = new Date(),
): Record<ReviewGrade, string> {
  const card = toFsrsCard(current);
  const preview = scheduler.repeat(card, now);
  return {
    again: formatInterval(preview[Rating.Again].card.due.getTime() - now.getTime()),
    hard: formatInterval(preview[Rating.Hard].card.due.getTime() - now.getTime()),
    good: formatInterval(preview[Rating.Good].card.due.getTime() - now.getTime()),
    easy: formatInterval(preview[Rating.Easy].card.due.getTime() - now.getTime()),
  };
}

export function newCardState(now = new Date()): CardState {
  return fromFsrsCard(createEmptyCard(now));
}

/** Compact, human interval label. Never shows "0 minutes". */
export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.round(hours / 24);
  if (days < 31) return `${days} d`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo`;

  const years = Math.round(months / 12);
  return `${years} y`;
}

/** "in 3 days" / "today" for the end-of-session summary. */
export function formatDueRelative(due: Date, now = new Date()): string {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return 'now';
  const days = Math.round(ms / 86400000);
  if (days === 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${formatInterval(ms)}`;
}
