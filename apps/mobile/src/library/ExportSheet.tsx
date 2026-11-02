import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import { formatDuration } from '@/i18n/translate';
import { useLocale, useT } from '@/i18n/useLocale';
import { exportBusy, exportTimeLeft, type ExportState } from '@/state/export';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { OptionRow } from '@/ui/OptionRow';
import { ProgressBar } from '@/ui/ProgressBar';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

export interface ExportChoice {
  /** Files a whole-book export writes (one per chapter). */
  chapters: number;
  /** The chapter being listened to, when this book is in the player. */
  current?: { index: number; title: string };
}

/** Error codes from the engine and the app, in words (R-EX-1). */
const ERROR_KEYS = {
  'export-write': 'export.write',
  'export-empty': 'export.empty',
} as const;

/**
 * Audio export (R-EX-1): whole book or the chapter being heard, then progress with an estimate, then where
 * the files went. The export itself lives in the export store, so this sheet can close and reopen meanwhile.
 */
export function ExportSheet({
  visible,
  title,
  choice,
  exports,
  onStart,
  onStop,
  onClose,
}: {
  visible: boolean;
  title: string;
  choice: ExportChoice | null;
  exports: StoreApi<ExportState>;
  onStart(chapter?: number): void;
  onStop(): void;
  onClose(): void;
}) {
  const t = useT();
  const locale = useLocale();
  const { space } = useTheme();
  const state = useStore(exports);
  const [now, setNow] = useState(Date.now());
  const busy = exportBusy(state);
  // The estimate is re-read every second while the export runs (progress events come every 250 ms or less).
  useEffect(() => {
    if (!visible || !busy) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [visible, busy]);

  const left = exportTimeLeft(state, Math.max(now, state.lastAt));
  const body = (() => {
    if (state.phase === 'idle' || !choice) {
      return (
        <View style={{ gap: space.sm }}>
          <Text variant="callout" tone="soft">
            {t('export.desc')}
          </Text>
          <OptionRow
            icon="export"
            label={t('export.whole')}
            hint={t('export.wholeDesc', { n: choice?.chapters ?? 1 })}
            onPress={() => onStart()}
          />
          {choice?.current ? (
            <OptionRow
              icon="chapters"
              label={t('export.chapter')}
              hint={choice.current.title}
              onPress={() => onStart(choice.current?.index)}
            />
          ) : null}
        </View>
      );
    }
    if (busy) {
      const value = state.total ? state.done / state.total : 0;
      return (
        <View style={{ gap: space.md }} accessibilityLiveRegion="polite">
          <Text variant="bodyStrong">
            {state.phase === 'preparing'
              ? t('export.preparing')
              : t('export.progress', { done: state.done, total: state.total })}
          </Text>
          <ProgressBar value={value} label={t('export.title')} />
          <Text variant="meta" tone="soft">
            {state.waiting
              ? t('export.waiting')
              : left !== null
                ? t('export.eta', { time: formatDuration(locale, left) })
                : t('export.keepOpen')}
          </Text>
          {left !== null && !state.waiting ? (
            <Text variant="meta" tone="faint">
              {t('export.keepOpen')}
            </Text>
          ) : null}
          <Button label={t('export.stop')} kind="quiet" icon="close" onPress={onStop} />
        </View>
      );
    }
    if (state.phase === 'done' && state.result) {
      return (
        <View style={{ gap: space.sm }}>
          <Text variant="bodyStrong">{t('export.done', { folder: state.result.folder })}</Text>
          <Text variant="callout" tone="soft">
            {t('export.doneDesc', {
              n: state.result.files,
              time: formatDuration(locale, state.result.durationMs),
            })}
          </Text>
          <Button label={t('common.done')} onPress={onClose} />
        </View>
      );
    }
    const key =
      state.phase === 'cancelled'
        ? 'export.stopped'
        : (ERROR_KEYS[state.error as keyof typeof ERROR_KEYS] ?? 'export.failed');
    return (
      <View style={{ gap: space.sm }}>
        <Text variant="callout" tone={state.phase === 'failed' ? 'danger' : 'soft'}>
          {t(key)}
        </Text>
        <Button label={t('common.close')} kind="secondary" onPress={onClose} />
      </View>
    );
  })();

  return (
    <Sheet
      visible={visible}
      title={`${t('export.title')} · ${title}`}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      {body}
    </Sheet>
  );
}
