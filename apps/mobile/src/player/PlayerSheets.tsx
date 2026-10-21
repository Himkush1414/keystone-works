import { ScrollView } from 'react-native';
import type { QueueFile } from '../../modules/lamplight-engine/src/types';
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
