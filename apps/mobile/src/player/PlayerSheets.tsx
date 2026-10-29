import { VOICE_CATALOG } from '@lamplight/core';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Quality, QueueFile } from '../../modules/lamplight-engine/src/types';
import type { TKey } from '@/i18n/translate';
import { voiceTraits } from '@/onboarding/voiceTraits';
import type { CastCharacter } from '@/data/content';
import { Button } from '@/ui/Button';
import { OptionRow } from '@/ui/OptionRow';
import { Text } from '@/ui/Text';
import { useLocale, useT } from '@/i18n/useLocale';
import { ChoiceRow, SwitchRow } from '@/ui/SettingRows';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/theme/theme';
import type { CleanReadRow } from './session';
import { contentsEntries, SLEEP_MINUTES, type BookmarkEntry } from './sheets';
import { formatSpeed, SPEED_PRESETS, stepSpeed } from './speed';

/** Every speed (R-PL-4): 0.05 steps either way, or a preset; it takes effect at once. */
export function SpeedSheet({
  visible,
  speed,
  onClose,
  onSet,
}: {
  visible: boolean;
  speed: number;
  onClose(): void;
  onSet(speed: number): void;
}) {
  const t = useT();
  const locale = useLocale();
  const { colors, space } = useTheme();
  const step = formatSpeed(locale, 0.05);
  return (
    <Sheet visible={visible} title={t('player.speed')} onClose={onClose} closeLabel={t('common.close')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md }}>
        <Button label={`−${step}`} kind="secondary" onPress={() => onSet(stepSpeed(speed, -1))} />
        <Text
          variant="title2"
          numeric
          align="center"
          style={{ flex: 1, color: colors.ink }}
          accessibilityLiveRegion="polite"
        >
          {formatSpeed(locale, speed)}
        </Text>
        <Button label={`+${step}`} kind="secondary" onPress={() => onSet(stepSpeed(speed, 1))} />
      </View>
      <ScrollView style={{ maxHeight: 360 }}>
        {SPEED_PRESETS.map((p) => (
          <ChoiceRow
            key={p}
            label={formatSpeed(locale, p)}
            selected={Math.abs(p - speed) < 0.001}
            onPress={() => {
              onSet(p);
              onClose();
            }}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}

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

/**
 * Contents: bookmarks first (with one for the sentence being heard), then the chapters with the one being heard
 * marked; choosing either reads from there.
 */
export function ContentsSheet({
  visible,
  queue,
  index,
  bookmarks,
  onClose,
  onJump,
  onToggleBookmark,
}: {
  visible: boolean;
  queue: QueueFile | null;
  index: number;
  bookmarks: readonly BookmarkEntry[];
  onClose(): void;
  onJump(sentence: number): void;
  /** Bookmarks the sentence being heard, or removes its bookmark. */
  onToggleBookmark(): void;
}) {
  const t = useT();
  const { colors, space } = useTheme();
  if (!queue) return null;
  const jump = (sentence: number) => () => {
    onJump(sentence);
    onClose();
  };
  const marked = bookmarks.some((b) => b.start === index);
  return (
    <Sheet visible={visible} title={t('player.contents')} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView style={{ maxHeight: 480 }}>
        <Button
          label={t(marked ? 'player.bookmarkRemove' : 'player.bookmark')}
          icon={marked ? 'bookmarkFilled' : 'bookmark'}
          kind="secondary"
          block
          onPress={onToggleBookmark}
        />
        <Text variant="bodyStrong" style={{ color: colors.ink, marginTop: space.md, marginBottom: space.xs }}>
          {t('player.bookmarks')}
        </Text>
        {bookmarks.length === 0 ? (
          <Text variant="meta" style={{ color: colors.inkSoft, marginBottom: space.sm }}>
            {t('player.bookmarksEmpty')}
          </Text>
        ) : (
          bookmarks.map((b) => (
            <ChoiceRow key={b.id} label={b.text} selected={b.start === index} onPress={jump(b.start)} />
          ))
        )}
        <Text variant="bodyStrong" style={{ color: colors.ink, marginTop: space.md, marginBottom: space.xs }}>
          {t('player.chapters')}
        </Text>
        {contentsEntries(queue, index).map((e) => (
          <ChoiceRow key={e.start} label={e.title} selected={e.current} onPress={jump(e.start)} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

const QUALITIES: { value: Quality; desc: TKey }[] = [
  { value: 'studioPlus', desc: 'quality.studioPlusDesc' },
  { value: 'studio', desc: 'quality.studioDesc' },
  { value: 'auto', desc: 'quality.autoDesc' },
  { value: 'live', desc: 'quality.liveDesc' },
];

/** Voice and quality for this document (R-PL-5); both take effect from the next sentence. */
export function VoiceSheet({
  visible,
  voice,
  quality,
  onClose,
  onVoice,
  onQuality,
  onCast,
}: {
  visible: boolean;
  voice: string;
  quality: Quality;
  onClose(): void;
  onVoice(voice: string): void;
  onQuality(quality: Quality): void;
  /** Opens the Cast sheet (characters' voices). */
  onCast(): void;
}) {
  const t = useT();
  return (
    <Sheet visible={visible} title={t('player.voice')} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView style={{ maxHeight: 520 }}>
        <OptionRow icon="cast" label={t('cast.title')} hint={t('cast.desc')} onPress={onCast} />
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

/** Cast (R-CA-4): the characters found, how many lines each has, and the voice each one speaks with. */
export function CastSheet({
  visible,
  characters,
  onClose,
  onVoice,
  onMerge,
}: {
  visible: boolean;
  characters: readonly CastCharacter[];
  onClose(): void;
  onVoice(characterId: string, voice: string | null): void;
  onMerge(from: string, into: string): void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setMerging(false);
    }
  }, [visible]);
  const character = characters.find((c) => c.id === selected);
  const voiceName = (id: string | null) => (id ? t(`voices.names.${id}` as TKey) : t('quality.auto'));
  const back = (
    <View style={{ alignSelf: 'flex-start' }}>
      <Button
        label={t('common.back')}
        kind="quiet"
        icon="back"
        onPress={() => (merging ? setMerging(false) : setSelected(null))}
      />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      title={character ? character.name : t('cast.title')}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <ScrollView style={{ maxHeight: 520 }}>
        {!character ? (
          characters.length === 0 ? (
            <Text variant="callout" tone="soft">
              {t('cast.noCharacters')}
            </Text>
          ) : (
            characters.map((c) => (
              <OptionRow
                key={c.id}
                icon="voice"
                label={c.name}
                hint={[
                  t('cast.lines', { n: c.lineCount }),
                  ...(c.age && c.age !== 'adult' ? [t(`cast.profile.${c.age}`)] : []),
                  ...(c.temperament ? [t(`cast.profile.${c.temperament}`)] : []),
                  c.voiceId || !c.autoVoiceId
                    ? voiceName(c.voiceId)
                    : t('cast.autoVoice', { voice: voiceName(c.autoVoiceId) }),
                ]
                  // Each part stays on one line, and a separator never starts one.
                  .map((part) => part.replace(/ /g, '\u00a0'))
                  .join('\u00a0· ')}
                onPress={() => setSelected(c.id)}
              />
            ))
          )
        ) : merging ? (
          <>
            {characters
              .filter((c) => c.id !== character.id)
              .map((c) => (
                <ChoiceRow
                  key={c.id}
                  label={c.name}
                  description={t('cast.lines', { n: c.lineCount })}
                  selected={false}
                  onPress={() => {
                    onMerge(character.id, c.id);
                    setMerging(false);
                    setSelected(c.id);
                  }}
                />
              ))}
            {back}
          </>
        ) : (
          <>
            <ChoiceRow
              label={t('quality.auto')}
              selected={character.voiceId === null}
              onPress={() => onVoice(character.id, null)}
            />
            {VOICE_CATALOG.map((v) => (
              <ChoiceRow
                key={v.id}
                label={t(`voices.names.${v.id}` as TKey)}
                selected={character.voiceId === v.id}
                onPress={() => onVoice(character.id, v.id)}
              />
            ))}
            {characters.length > 1 ? (
              <OptionRow icon="collection" label={t('cast.merge')} onPress={() => setMerging(true)} />
            ) : null}
            {back}
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

/** Clean Read review (R-CR-4): each detector's findings in this document, switched on or off here. */
/** Who says this line: the book's characters, or no one in particular. */
export function SpeakerSheet({
  visible,
  characters,
  current,
  colors,
  onClose,
  onChoose,
}: {
  visible: boolean;
  characters: readonly CastCharacter[];
  /** The speaker Cast gave the line now. */
  current: string | null;
  colors: ReadonlyMap<string, string>;
  onClose(): void;
  onChoose(characterId: string | null): void;
}) {
  const t = useT();
  return (
    <Sheet visible={visible} title={t('speaker.title')} onClose={onClose} closeLabel={t('common.close')}>
      <Text variant="callout" tone="soft">
        {t('speaker.hint')}
      </Text>
      <ScrollView style={{ maxHeight: 460 }}>
        {characters
          .filter((c) => c.lineCount > 0 || c.id === current)
          .map((c) => (
            <ChoiceRow
              key={c.id}
              label={c.name}
              description={t('cast.lines', { n: c.lineCount })}
              selected={c.id === current}
              {...(colors.has(c.id) ? { accent: colors.get(c.id) ?? '' } : {})}
              onPress={() => onChoose(c.id)}
            />
          ))}
        <ChoiceRow label={t('speaker.nobody')} selected={current === null} onPress={() => onChoose(null)} />
      </ScrollView>
    </Sheet>
  );
}

export function CleanReadSheet({
  visible,
  rows,
  onClose,
  onToggle,
}: {
  visible: boolean;
  rows: readonly CleanReadRow[];
  onClose(): void;
  onToggle(reason: CleanReadRow['reason'], on: boolean): void;
}) {
  const t = useT();
  return (
    <Sheet visible={visible} title={t('clean.title')} onClose={onClose} closeLabel={t('common.close')}>
      <ScrollView style={{ maxHeight: 520 }}>
        <Text variant="callout" tone="soft">
          {rows.length ? t('clean.desc') : t('clean.nothing')}
        </Text>
        {rows.map((r) => (
          <SwitchRow
            key={r.reason}
            label={`${t(`clean.reasons.${r.reason}`)} (${r.count})`}
            description={r.examples.map((e) => `“${e}”`).join('  ')}
            value={r.on}
            onChange={(on) => onToggle(r.reason, on)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
