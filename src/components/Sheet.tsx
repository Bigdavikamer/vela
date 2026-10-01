import React, { useCallback, useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Text } from './Text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** hides the grabber and disables swipe-to-dismiss for destructive confirms */
  dismissible?: boolean;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * A bottom sheet used only where it genuinely beats a screen push: short,
 * focused choices that keep the current context visible behind them.
 */
export function Sheet({
  visible,
  onClose,
  title,
  dismissible = true,
  children,
  contentStyle,
}: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: screenHeight } = useWindowDimensions();

  const translateY = useSharedValue(screenHeight);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdrop.value = withTiming(1, { duration: motion.duration.base });
      translateY.value = reduceMotion
        ? withTiming(0, { duration: motion.duration.fast })
        : withSpring(0, motion.spring.settle);
    } else {
      backdrop.value = withTiming(0, { duration: motion.duration.fast });
      translateY.value = withTiming(screenHeight, { duration: motion.duration.base });
    }
  }, [visible, translateY, backdrop, screenHeight, reduceMotion]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .enabled(dismissible)
    .onUpdate((e) => {
      // resist upward drag; the sheet is not expandable
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose = e.translationY > 110 || e.velocityY > 900;
      if (shouldClose) {
        translateY.value = withTiming(screenHeight, { duration: motion.duration.base });
        backdrop.value = withTiming(0, { duration: motion.duration.fast });
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, motion.spring.settle);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissible ? close : undefined}
    >
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }, backdropStyle]}>
          <Pressable
            style={styles.flex}
            onPress={dismissible ? close : undefined}
            accessibilityRole="button"
            accessibilityLabel="Close"
            // the backdrop is a fallback dismiss target; screen readers use the
            // explicit close affordance inside the sheet instead
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              theme.shadow.sheet,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.border,
                paddingBottom: insets.bottom + space.lg,
                maxHeight: screenHeight * 0.88,
              },
              sheetStyle,
            ]}
          >
            {dismissible ? (
              <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
            ) : (
              <View style={styles.grabberSpacer} />
            )}

            {title ? (
              <Text variant="title3" style={styles.title}>
                {title}
              </Text>
            ) : null}

            <View style={[styles.content, contentStyle]}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingTop: space.sm,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: space.md,
  },
  grabberSpacer: { height: space.md },
  title: { paddingHorizontal: space.lg, marginBottom: space.md },
  content: { paddingHorizontal: space.lg },
});
