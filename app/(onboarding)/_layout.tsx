import { Stack } from 'expo-router';
import React from 'react';

export default function OnboardingLayout() {
  // Gestures are disabled so a half-answered step cannot be swiped past; the
  // Back control in each step is the only way backwards.
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}
