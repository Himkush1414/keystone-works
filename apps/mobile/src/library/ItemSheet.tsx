import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { LibraryItem } from '@/data/library';
import { useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { OptionRow } from '@/ui/OptionRow';
import { Sheet } from '@/ui/Sheet';
import { TextField } from '@/ui/TextField';

export interface ItemSheetProps {
  item: LibraryItem | null;
  onClose(): void;
  onPlay(item: LibraryItem): void;
  onToggleFinished(item: LibraryItem): void;
  onSaveDetails(item: LibraryItem, details: { title: string; author: string | null }): void;
  onDelete(item: LibraryItem): void;
}

/** What you can do with one item (R-LB-3): play, fix its title and author, mark it finished, delete it. */
export function ItemSheet({
  item,
  onClose,
  onPlay,
  onToggleFinished,
  onSaveDetails,
  onDelete,
}: ItemSheetProps) {
  const t = useT();
  const { space } = useTheme();
  const [step, setStep] = useState<'actions' | 'details'>('actions');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');

  useEffect(() => {
    setStep('actions');
    setTitle(item?.title ?? '');
    setAuthor(item?.author ?? '');
  }, [item]);

  if (!item) return null;
  const then = (run: (i: LibraryItem) => void) => () => {
    onClose();
    run(item);
  };
  return (
    <Sheet visible title={item.title} onClose={onClose} closeLabel={t('common.close')}>
      {step === 'actions' ? (
        <View>
          {item.status === 'ready' ? (
            <OptionRow icon="play" label={t('item.play')} onPress={then(onPlay)} />
          ) : null}
          <OptionRow icon="text" label={t('item.details')} onPress={() => setStep('details')} />
          {item.status === 'ready' ? (
            <OptionRow
              icon="check"
              label={t(item.finishedAt === null ? 'item.markFinished' : 'item.markUnfinished')}
              onPress={then(onToggleFinished)}
            />
          ) : null}
          <OptionRow icon="trash" label={t('item.delete')} tone="danger" onPress={then(onDelete)} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <TextField
            value={title}
            onChangeText={setTitle}
            label={t('item.titleField')}
            placeholder={t('item.titleField')}
          />
          <TextField
            value={author}
            onChangeText={setAuthor}
            label={t('item.authorField')}
            placeholder={t('item.authorField')}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button label={t('common.back')} kind="quiet" icon="back" onPress={() => setStep('actions')} />
            <Button
              label={t('common.save')}
              onPress={then((i) => onSaveDetails(i, { title, author: author.trim() || null }))}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}
