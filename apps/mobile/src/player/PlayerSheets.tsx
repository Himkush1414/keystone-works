import { VOICE_CATALOG } from '@lamplight/core';
import { ScrollView } from 'react-native';
import type { Quality, QueueFile } from '../../modules/lamplight-engine/src/types';
import type { TKey } from '@/i18n/translate';
import { voiceTraits } from '@/onboarding/voiceTraits';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n/useLocale';
import { ChoiceRow } from '@/ui/SettingRows';
import { Sheet } from '@/ui/Sheet';
import { contentsEntries, SLEEP_MINUTES } from './sheets';

/** Sleep timer (R-PL-6): a number of minutes or the end of the chapter, with a gentle fade from the engine. */
export function SleepSheet({
  visible,
  status,
  onClose,
  onSet,
}: {
  visible: boolean;
  /** What the timer is doing now ("Ends in 12 min"), or null when it's off. */
  status: string | null;
  onClose(): void;
  onSet(minutes: number | null, endOfChapter: boolean): void;
}) {
  const t = useT();
  const set = (minutes: number | null, endOfChapter: boolean) => () => {
    onSet(minutes, endOfChapter);
    onClose();
  };
  return (
    <Sheet visible={visible} title={t('player.sleep')} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView style={{ maxHeight: 420 }}>
        <ChoiceRow
          label={t('sleep.off')}
          description={status ?? undefined}
          selected={status === null}
          onPress={set(null, false)}
        />
        {SLEEP_MINUTES.map((n) => (
          <ChoiceRow key={n} label={t('sleep.minutes', { n })} selected={false} onPress={set(n, false)} />
        ))}
        <ChoiceRow label={t('sleep.endOfChapter')} selected={false} onPress={set(null, true)} />
      </ScrollView>
    </Sheet>
  );
}

/** Contents: the chapters, with the one being heard marked; choosing one reads from its start. */
export function ContentsSheet({
  visible,
  queue,
  index,
  onClose,
  onJump,
}: {
  visible: boolean;
  queue: QueueFile | null;
  index: number;
  onClose(): void;
  onJump(sentence: number): void;
}) {
  const t = useT();
  if (!queue) return null;
  return (
    <Sheet visible={visible} title={t('player.contents')} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView style={{ maxHeight: 480 }}>
        {contentsEntries(queue, index).map((e) => (
          <ChoiceRow
            key={e.start}
            label={e.title}
            selected={e.current}
            onPress={() => {
              onJump(e.start);
              onClose();
            }}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

const QUALITIES: { value: Quality; desc: TKey }[] = [
  { value: 'auto', desc: 'quality.autoDesc' },
  { value: 'live', desc: 'quality.liveDesc' },
  { value: 'studio', desc: 'quality.studioDesc' },
  { value: 'studioPlus', desc: 'quality.studioPlusDesc' },
];

/** Voice and quality for this document (R-PL-5); both take effect from the next sentence. */
export function VoiceSheet({
  visible,
  voice,
  quality,
  onClose,
  onVoice,
  onQuality,
}: {
  visible: boolean;
  voice: string;
  quality: Quality;
  onClose(): void;
  onVoice(voice: string): void;
  onQuality(quality: Quality): void;
}) {
  const t = useT();
  return (
    <Sheet visible={visible} title={t('player.voice')} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView style={{ maxHeight: 520 }}>
        {VOICE_CATALOG.map((v) => {
          const traits = voiceTraits(v);
          return (
            <ChoiceRow
              key={v.id}
              label={t(`voices.names.${v.id}` as TKey)}
              description={`${t(`voices.traits.${traits.pitch}`)} · ${t(`voices.traits.${traits.pace}`)}`}
              selected={v.id === voice}
              onPress={() => onVoice(v.id)}
            />
          );
        })}
        <Text variant="micro" tone="soft" style={{ marginTop: 16 }} accessibilityRole="header">
          {t('player.quality')}
        </Text>
        {QUALITIES.map((q) => (
          <ChoiceRow
            key={q.value}
            label={t(`quality.${q.value}`)}
            description={t(q.desc)}
            selected={q.value === quality}
            onPress={() => onQuality(q.value)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
