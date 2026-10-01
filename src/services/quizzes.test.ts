import { gradeLocally, type QuizQuestion } from './quizzes';

/**
 * On-device grading decides what a student is told immediately after they
 * answer, so a wrong verdict here is worse than a slow one. These cover the
 * cases where a naive implementation gets it wrong.
 */

function question(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: 'q1',
    quiz_set_id: 's1',
    concept_id: null,
    idx: 0,
    type: 'multiple_choice',
    prompt: 'Why?',
    options: ['a', 'b', 'c', 'd'],
    answer: 1,
    explanation: null,
    tier: 'core',
    ...overrides,
  };
}

describe('multiple choice', () => {
  const q = question({ type: 'multiple_choice', answer: 2 });

  it('accepts the correct index', () => {
    expect(gradeLocally(q, 2)).toBe(true);
  });

  it('rejects a different index', () => {
    expect(gradeLocally(q, 0)).toBe(false);
    expect(gradeLocally(q, 3)).toBe(false);
  });

  it('rejects index 0 when the answer is 0 only if it truly differs', () => {
    // Guards against a truthiness bug: 0 is a valid answer index.
    const zero = question({ type: 'multiple_choice', answer: 0 });
    expect(gradeLocally(zero, 0)).toBe(true);
    expect(gradeLocally(zero, 1)).toBe(false);
  });

  it('rejects a non-numeric answer', () => {
    expect(gradeLocally(q, '2' as never)).toBe(false);
  });
});

describe('true/false', () => {
  it('grades both polarities, including false-is-correct', () => {
    const isTrue = question({ type: 'true_false', answer: true, options: [] });
    const isFalse = question({ type: 'true_false', answer: false, options: [] });

    expect(gradeLocally(isTrue, true)).toBe(true);
    expect(gradeLocally(isTrue, false)).toBe(false);
    // A truthiness bug would fail this one.
    expect(gradeLocally(isFalse, false)).toBe(true);
    expect(gradeLocally(isFalse, true)).toBe(false);
  });
});

describe('matching', () => {
  const q = question({
    type: 'matching',
    options: ['A', 'B', 'C'],
    answer: [
      [0, 2],
      [1, 0],
      [2, 1],
    ],
  });

  it('accepts the right pairs in any order', () => {
    expect(
      gradeLocally(q, [
        [2, 1],
        [0, 2],
        [1, 0],
      ]),
    ).toBe(true);
  });

  it('rejects a wrong pairing', () => {
    expect(
      gradeLocally(q, [
        [0, 1],
        [1, 0],
        [2, 2],
      ]),
    ).toBe(false);
  });

  it('rejects an incomplete answer', () => {
    expect(gradeLocally(q, [[0, 2]])).toBe(false);
  });

  it('rejects a non-array answer', () => {
    expect(gradeLocally(q, 3 as never)).toBe(false);
  });
});

describe('short answer (offline fallback)', () => {
  const q = question({
    type: 'short_answer',
    options: [],
    answer: ['mitochondria', 'the mitochondrion'],
  });

  it('accepts any listed answer, case and space insensitive', () => {
    expect(gradeLocally(q, 'Mitochondria')).toBe(true);
    expect(gradeLocally(q, '  the Mitochondrion ')).toBe(true);
  });

  it('rejects something not listed', () => {
    // The server grades these on meaning; the local path is a strict fallback.
    expect(gradeLocally(q, 'the powerhouse')).toBe(false);
  });
});
