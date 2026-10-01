import {
  formatDueRelative,
  formatInterval,
  grade,
  newCardState,
  previewIntervals,
  type CardState,
} from './scheduler';

/**
 * The scheduler decides when a student sees a card again, so these tests check
 * the properties that actually matter to learning, not just that it returns an
 * object.
 */

const NOW = new Date('2026-03-01T10:00:00.000Z');

describe('newCardState', () => {
  it('creates a card that is due immediately and unseen', () => {
    const state = newCardState(NOW);
    expect(state.state).toBe('new');
    expect(state.reps).toBe(0);
    expect(state.lapses).toBe(0);
    expect(state.last_review).toBeNull();
    expect(new Date(state.due).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });
});

describe('grade', () => {
  it('schedules a harder grade sooner than an easier one', () => {
    const start = newCardState(NOW);

    const again = grade(start, 'again', NOW);
    const hard = grade(start, 'hard', NOW);
    const good = grade(start, 'good', NOW);
    const easy = grade(start, 'easy', NOW);

    // The core promise of spaced repetition: struggling brings a card back
    // sooner, confidence pushes it further out.
    expect(again.dueAt.getTime()).toBeLessThanOrEqual(hard.dueAt.getTime());
    expect(hard.dueAt.getTime()).toBeLessThanOrEqual(good.dueAt.getTime());
    expect(good.dueAt.getTime()).toBeLessThan(easy.dueAt.getTime());
  });

  it('advances a new card out of the new state and counts the rep', () => {
    const result = grade(newCardState(NOW), 'good', NOW);
    expect(result.next.state).not.toBe('new');
    expect(result.next.reps).toBe(1);
    expect(result.next.last_review).not.toBeNull();
  });

  it('records a lapse when a learned card is forgotten', () => {
    // Take a card through to review state first.
    let state: CardState = newCardState(NOW);
    let clock = NOW;
    for (let i = 0; i < 4; i += 1) {
      const result = grade(state, 'easy', clock);
      state = result.next;
      clock = result.dueAt;
    }
    expect(state.state).toBe('review');

    const lapsed = grade(state, 'again', clock);
    expect(lapsed.next.lapses).toBe(state.lapses + 1);
    expect(lapsed.next.state).toBe('relearning');
  });

  it('grows the interval as a card is repeatedly recalled', () => {
    let state = newCardState(NOW);
    let clock = NOW;
    const intervals: number[] = [];

    for (let i = 0; i < 5; i += 1) {
      const result = grade(state, 'good', clock);
      intervals.push(result.dueAt.getTime() - clock.getTime());
      state = result.next;
      clock = result.dueAt;
    }

    // Not strictly monotonic step-to-step (fuzz, learning steps), but the last
    // interval must be far longer than the first.
    expect(intervals[intervals.length - 1]).toBeGreaterThan(intervals[0] * 10);
  });

  it('treats a null state as a brand new card rather than throwing', () => {
    expect(() => grade(null, 'good', NOW)).not.toThrow();
    expect(grade(null, 'good', NOW).next.reps).toBe(1);
  });
});

describe('previewIntervals', () => {
  it('returns a label for every grade so buttons can show the cost', () => {
    const preview = previewIntervals(newCardState(NOW), NOW);
    expect(Object.keys(preview).sort()).toEqual(['again', 'easy', 'good', 'hard']);
    for (const label of Object.values(preview)) {
      expect(label).toMatch(/^\d+ (min|h|d|mo|y)$/);
    }
  });

  it('matches what grade() actually schedules', () => {
    const state = newCardState(NOW);
    const preview = previewIntervals(state, NOW);
    // Fuzz is applied per call, so compare the unit rather than the exact value.
    expect(preview.good.split(' ')[1]).toBe(grade(state, 'good', NOW).intervalLabel.split(' ')[1]);
  });
});

describe('formatInterval', () => {
  it('never shows zero', () => {
    expect(formatInterval(0)).toBe('1 min');
    expect(formatInterval(1000)).toBe('1 min');
  });

  it('steps through units as the interval grows', () => {
    expect(formatInterval(10 * 60_000)).toBe('10 min');
    expect(formatInterval(3 * 3_600_000)).toBe('3 h');
    expect(formatInterval(5 * 86_400_000)).toBe('5 d');
    expect(formatInterval(90 * 86_400_000)).toBe('3 mo');
    expect(formatInterval(730 * 86_400_000)).toBe('2 y');
  });
});

describe('formatDueRelative', () => {
  it('reads naturally for the session summary', () => {
    expect(formatDueRelative(new Date(NOW.getTime() - 1000), NOW)).toBe('now');
    expect(formatDueRelative(new Date(NOW.getTime() + 3 * 3_600_000), NOW)).toBe('later today');
    expect(formatDueRelative(new Date(NOW.getTime() + 86_400_000), NOW)).toBe('tomorrow');
    expect(formatDueRelative(new Date(NOW.getTime() + 5 * 86_400_000), NOW)).toBe('in 5 d');
  });
});
