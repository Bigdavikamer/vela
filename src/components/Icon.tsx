import Feather from '@expo/vector-icons/Feather';
import React from 'react';

import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/theme';

/**
 * One icon set, app-wide. Feather is thin and quiet, which suits a study tool;
 * mixing sets is the fastest way to make an interface look assembled rather
 * than designed.
 */
export type IconName = React.ComponentProps<typeof Feather>['name'];

export type IconProps = {
  name: IconName;
  size?: number;
  color?: keyof ThemeColors;
  tint?: string;
};

export const Icon = React.memo(function Icon({
  name,
  size = 20,
  color = 'text',
  tint,
}: IconProps) {
  const theme = useTheme();
  return (
    <Feather
      name={name}
      size={size}
      color={tint ?? theme.colors[color]}
      // icons are decorative: the surrounding control carries the label
      accessible={false}
    />
  );
});
