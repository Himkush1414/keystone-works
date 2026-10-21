import Constants from 'expo-constants';
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';
import { LOCALE_NAMES, LOCALES } from '@/i18n/translate';
import { useLocale, useT } from '@/i18n/useLocale';
import { formatSpeed, SPEED_STOPS } from '@/player/speed';
import { useServices } from '@/services/context';
import type { CastModePreference, QualityPreference } from '@/state/settings';
import { useTheme } from '@/theme/theme';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { ChoiceRow, SwitchRow } from '@/ui/SettingRows';
import { Text } from '@/ui/Text';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors, space, radius } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="micro" tone="soft" accessibilityRole="header">
        {title}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.hairline,
            borderRadius: radius.md,
            padding: space.md,
            gap: space.sm,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

/** Settings (R-SE-1): every choice applies at once and is kept in the app database. */
export function SettingsScreen({ onBack }: { onBack(): void }) {
  const { settings } = useServices();
  const s = useStore(settings);
  const update = s.update;
  const t = useT();
  const locale = useLocale();
  const { space } = useTheme();
  const gutter = useGutter();
  const qualities: QualityPreference[] = ['auto', 'live', 'studio', 'studioPlus'];
  const qualityDesc = {
    auto: 'quality.autoDesc',
    live: 'quality.liveDesc',
    studio: 'quality.studioDesc',
    studioPlus: 'quality.studioPlusDesc',
  } as const;
  const casts: CastModePreference[] = ['off', 'dialogue', 'full'];

  return (
    <Screen>
      <View style={[styles.bar, { paddingHorizontal: space.xs }]}>
        <IconButton icon="back" label={t('common.back')} onPress={onBack} />
        <Text variant="title1" accessibilityRole="header">
          {t('settings.title')}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.x5, gap: space.xl }}
      >
        <Section title={t('settings.appearance')}>
          <Text variant="callout" tone="soft">
            {t('settings.theme')}
          </Text>
          <Segmented
            label={t('settings.theme')}
            value={s.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
          <SwitchRow
            label={t('settings.reduceMotion')}
            description={t('settings.reduceMotionDesc')}
            value={s.motion === 'reduce'}
            onChange={(on) => update({ motion: on ? 'reduce' : 'system' })}
          />
        </Section>

        <Section title={t('settings.playback')}>
          <Text variant="callout" tone="soft">
            {t('settings.defaultSpeed')}
          </Text>
          <Segmented
            label={t('settings.defaultSpeed')}
            value={String(s.defaultSpeed)}
            onChange={(v) => update({ defaultSpeed: Number(v) })}
            options={[...SPEED_STOPS]
              .sort((a, b) => a - b)
              .map((v) => ({ value: String(v), label: formatSpeed(locale, v) }))}
          />
          <SwitchRow
            label={t('settings.rewindOnResume')}
            value={s.rewindOnResume}
            onChange={(rewindOnResume) => update({ rewindOnResume })}
          />
          <SwitchRow
            label={t('settings.autoAdvance')}
            value={s.autoAdvance}
            onChange={(autoAdvance) => update({ autoAdvance })}
          />
        </Section>

        <Section title={t('settings.voices')}>
          {qualities.map((q) => (
            <ChoiceRow
              key={q}
              label={t(`quality.${q}`)}
              description={t(qualityDesc[q])}
              selected={s.quality === q}
              onPress={() => update({ quality: q })}
            />
          ))}
        </Section>

        <Section title={t('cast.title')}>
          <Text variant="meta" tone="soft">
            {t('cast.desc')}
          </Text>
          {casts.map((c) => (
            <ChoiceRow
              key={c}
              label={t(`cast.${c}`)}
              selected={s.castMode === c}
              onPress={() => update({ castMode: c })}
            />
          ))}
        </Section>

        <Section title={t('settings.language')}>
          <ChoiceRow
            label={t('settings.themeSystem')}
            selected={s.locale === 'system'}
            onPress={() => update({ locale: 'system' })}
          />
          {LOCALES.map((l) => (
            <ChoiceRow
              key={l}
              label={LOCALE_NAMES[l]}
              selected={s.locale === l}
              onPress={() => update({ locale: l })}
            />
          ))}
        </Section>

        <Section title={t('settings.accessibility')}>
          <SwitchRow
            label={t('settings.haptics')}
            value={s.haptics}
            onChange={(haptics) => update({ haptics })}
          />
        </Section>

        <Section title={t('settings.privacy')}>
          <Text variant="body">{t('privacy.noAccount')}</Text>
          <Text variant="callout" tone="soft">
            {t('privacy.local')}
          </Text>
          <Text variant="callout" tone="soft">
            {t('privacy.network')}
          </Text>
        </Section>

        <Section title={t('settings.about')}>
          <Text variant="bodyStrong">{t('promise.title')}</Text>
          <Text variant="callout" tone="soft">
            {t('promise.body')}
          </Text>
          <Text variant="meta" tone="faint">
            {t('settings.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
          </Text>
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth },
});
