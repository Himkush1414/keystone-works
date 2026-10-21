import { recommendedVoices, type BuiltInVoice } from '@lamplight/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TKey } from '@/i18n/translate';
import { useLocale, useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Screen, useGutter } from '@/ui/Screen';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';
import { voiceTraits } from './voiceTraits';

export interface VoicePickProps {
  /** Plays the sample sentence in `voice`. */
  preview(text: string, lang: string, voice: string): void;
  stop(): void;
  onChoose(voice: string): void;
}

/** Three voices recommended for the device language (feature spec F1.5); hear each, keep one. */
export function VoicePickScreen({ preview, stop, onChoose }: VoicePickProps) {
  const t = useT();
  const locale = useLocale();
  const { space } = useTheme();
  const gutter = useGutter();
  const voices = recommendedVoices();
  const [selected, setSelected] = useState(voices[0]?.id ?? 'F1');
  useEffect(() => stop, [stop]);

  const hear = (v: BuiltInVoice) => {
    setSelected(v.id);
    preview(t('voicePick.sample'), locale, v.id);
  };
  const nameOf = (v: BuiltInVoice) => t(`voices.names.${v.id}` as TKey);
  const chosen = voices.find((v) => v.id === selected);

  return (
    <Screen bottom>
      <View style={[styles.body, { paddingHorizontal: gutter, gap: space.lg }]}>
        <View style={{ gap: space.xs }}>
          <Text variant="display" accessibilityRole="header">
            {t('voicePick.title')}
          </Text>
          <Text variant="body" tone="soft">
            {t('voicePick.body')}
          </Text>
        </View>
        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {voices.map((v) => (
            <VoiceCard
              key={v.id}
              name={nameOf(v)}
              voice={v}
              selected={v.id === selected}
              onHear={() => hear(v)}
              onChoose={() => onChoose(v.id)}
            />
          ))}
        </View>
      </View>
      <View style={{ paddingHorizontal: gutter, paddingBottom: space.lg, alignItems: 'flex-end' }}>
        <View style={{ alignSelf: 'flex-end' }}>
          <Button
            label={chosen ? t('voicePick.choose', { name: nameOf(chosen) }) : t('common.continue')}
            onPress={() => onChoose(selected)}
          />
        </View>
      </View>
    </Screen>
  );
}

function VoiceCard({
  name,
  voice,
  selected,
  onHear,
  onChoose,
}: {
  name: string;
  voice: BuiltInVoice;
  selected: boolean;
  onHear(): void;
  onChoose(): void;
}) {
  const t = useT();
  const { colors, space, radius } = useTheme();
  const traits = voiceTraits(voice);
  const description = `${t(`voices.traits.${traits.pitch}`)} · ${t(`voices.traits.${traits.pace}`)}`;
  return (
    <Tappable
      onPress={onHear}
      pressScale={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${name}, ${description}`}
      accessibilityHint={t('voicePick.hear', { name })}
      accessibilityActions={[{ name: 'choose', label: t('voicePick.choose', { name }) }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'choose' && onChoose()}
      style={[
        styles.card,
        {
          gap: space.md,
          padding: space.md,
          borderRadius: radius.md,
          backgroundColor: selected ? colors.surface : 'transparent',
          borderColor: selected ? colors.accent : colors.hairline,
        },
      ]}
    >
      <View style={[styles.play, { backgroundColor: selected ? colors.accent : colors.surfaceSunk }]}>
        <Icon name="play" size={20} color={selected ? colors.accentInk : colors.accent} />
      </View>
      <View style={styles.text}>
        <Text variant="title2">{name}</Text>
        <Text variant="meta" tone="soft">
          {description}
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
