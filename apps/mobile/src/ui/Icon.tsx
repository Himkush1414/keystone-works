import { ICON_STROKE, icons, type IconName } from '@lamplight/icons';
import { memo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Hand-drawn icon from @lamplight/icons. Decorative by default: give the surrounding control the label. */
export const Icon = memo(function Icon({ name, size = 24, color }: IconProps) {
  const { colors } = useTheme();
  const c = color ?? colors.ink;
  // 1.75 units at 24px; slightly heavier at small sizes so strokes never drop below 1.5px on screen.
  const stroke = Math.max(ICON_STROKE, 36 / size);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} importantForAccessibility="no">
      {icons[name].map((shape, i) =>
        shape.fill ? (
          <Path key={i} d={shape.d} fill={c} />
        ) : (
          <Path
            key={i}
            d={shape.d}
            fill="none"
            stroke={c}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
    </Svg>
  );
});
