import { create } from 'zustand';

export type StudyGoal = 'keep_up' | 'exam' | 'understand' | 'remember';
export type StudyStyle = 'recall_first' | 'explain_first' | 'practice_heavy' | 'skim_then_drill';

type OnboardingState = {
  subject: string;
  goal: StudyGoal | null;
  style: StudyStyle | null;
  /** null = keep material in the source's own language */
  contentLanguage: string | null;
  examTitle: string;
  examDate: string | null;
  /** set once the space is created, so a back-and-forward does not duplicate it */
  spaceId: string | null;

  set: <K extends keyof Omit<OnboardingState, 'set' | 'reset'>>(
    key: K,
    value: OnboardingState[K],
  ) => void;
  reset: () => void;
};

const INITIAL = {
  subject: '',
  goal: null,
  style: null,
  contentLanguage: null,
  examTitle: '',
  examDate: null,
  spaceId: null,
} as const;

/**
 * Answers collected during onboarding.
 *
 * Deliberately in memory only: if the app is killed mid-onboarding, starting
 * over from a clean slate is friendlier than resuming a half-answered
 * questionnaire the student no longer remembers.
 */
export const useOnboarding = create<OnboardingState>((set) => ({
  ...INITIAL,
  set: (key, value) => set({ [key]: value } as Partial<OnboardingState>),
  reset: () => set({ ...INITIAL }),
}));
