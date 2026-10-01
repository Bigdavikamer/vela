import React from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '../theme/tokens';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * The last line of defence.
 *
 * A render crash in one screen must not leave a student staring at a white
 * void with their lecture recording seemingly gone. This shows what happened,
 * confirms their work is safe, and offers a way back.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Enough context to diagnose, without shipping the student's content.
    console.error('Unhandled render error', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 8).join('\n'),
      componentStack: info.componentStack?.split('\n').slice(0, 8).join('\n'),
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.icon}>
          <Icon name="alert-triangle" size={28} color="warning" />
        </View>
        <Text variant="title2" align="center">
          Something went wrong on this screen
        </Text>
        <Text variant="callout" color="textSecondary" align="center" style={styles.body}>
          Your notes, recordings, and progress are safe — nothing was lost. Try going back.
        </Text>
        <Button label="Try again" onPress={this.reset} style={styles.action} />
        {__DEV__ ? (
          <Text variant="caption" color="textTertiary" style={styles.dev}>
            {error.message}
          </Text>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  icon: { marginBottom: space.sm },
  body: { maxWidth: 320 },
  action: { marginTop: space.base, minWidth: 200 },
  dev: { marginTop: space.xl, maxWidth: 320 },
});
