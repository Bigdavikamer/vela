// Native modules that have no JS implementation under Jest. Mocking them here
// keeps pure-logic tests (grading, scheduling, i18n) importable without
// standing up the whole app.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// The app reads its Supabase config from expo-constants at import time.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0-test',
      extra: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'sb_publishable_test',
        webBaseUrl: 'https://vela.test',
      },
    },
  },
}));
