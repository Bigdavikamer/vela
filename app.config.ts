import type { ExpoConfig } from 'expo/config';

/**
 * Vela — Expo configuration.
 *
 * Only EXPO_PUBLIC_* values reach the client bundle, and by design the only
 * ones here are the Supabase URL and its publishable key. Every privileged
 * credential (AI providers, Stripe secret, service role) lives in Edge Function
 * secrets and never touches this file or the app.
 */
const config: ExpoConfig = {
  name: 'Vela',
  slug: 'vela',
  scheme: 'vela',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // the New Architecture is the only architecture from SDK 57; no flag needed
  icon: './assets/icon.png',

  // Splash is configured through the expo-splash-screen plugin below; the
  // top-level `splash` key was removed in SDK 57.

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.vela.study',
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // Recording is the app's most sensitive capability, so the strings say
      // plainly what happens to the audio and whose consent is required.
      NSMicrophoneUsageDescription:
        'Vela records lectures you choose to capture, so it can transcribe them into study notes. Recordings stay private to your account. Make sure recording is allowed where you are and that anyone being recorded has agreed.',
      NSPhotoLibraryUsageDescription:
        'Pick images of slides, textbook pages, or handwritten notes to turn into study material.',
      NSCameraUsageDescription:
        'Photograph slides or textbook pages to turn them into study material.',
      UIBackgroundModes: ['audio'],
    },
  },

  android: {
    package: 'app.vela.study',
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundColor: '#0A0B0E',
    },
    // edge-to-edge is always on from SDK 54; there is no config key for it
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },

  web: { favicon: './assets/favicon.png', bundler: 'metro', output: 'single' },

  plugins: [
    'expo-router',
    'expo-web-browser',
    'expo-secure-store',
    'expo-localization',
    'expo-font',
    [
      'expo-audio',
      {
        microphonePermission:
          'Vela needs the microphone to record the lectures you choose to capture.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Add slides or textbook pages from your library.',
        cameraPermission: 'Photograph slides or textbook pages.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#0A0B0E',
      },
    ],
  ],

  experiments: { typedRoutes: true },

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    // Where the Stripe checkout / billing portal returns to.
    webBaseUrl: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://vela.app',
  },
};

export default config;
