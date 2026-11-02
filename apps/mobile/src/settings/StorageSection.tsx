import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocale, useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { formatBytes } from './storage';

/**
 * Storage (R-VO-5): how much prepared audio the phone keeps (sentences already heard play at once next time,
 * up to the cache's cap) and a way to clear it, with a confirmation that says how much goes.
 */
export function StorageSection({
  cacheBytes,
  clearCache,
}: {
  cacheBytes(): Promise<number>;
  clearCache(): Promise<void>;
}) {
  const t = useT();
  const locale = useLocale();
  const { space } = useTheme();
  const [bytes, setBytes] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const measure = useCallback(() => {
    cacheBytes()
      .then(setBytes)
      .catch(() => setBytes(0));
  }, [cacheBytes]);
  useEffect(measure, [measure]);

  const size = bytes === null ? '…' : formatBytes(locale, bytes);
  const clear = () => {
    setClearing(true);
    clearCache()
      .catch(() => undefined)
      .finally(() => {
        setClearing(false);
        setConfirming(false);
        measure();
      });
  };

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="bodyStrong" accessibilityLiveRegion="polite">
        {t('settings.cacheSize', { size })}
      </Text>
      <Text variant="callout" tone="soft">
        {t('settings.cacheDesc')}
      </Text>
      {confirming ? (
        <View style={{ gap: space.sm }}>
          <Text variant="callout">{t('settings.clearCacheConfirm', { size })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Button label={t('settings.clearCache')} kind="danger" loading={clearing} onPress={clear} />
            <Button label={t('common.cancel')} kind="quiet" onPress={() => setConfirming(false)} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row' }}>
          <Button
            label={t('settings.clearCache')}
            kind="secondary"
            icon="trash"
            disabled={!bytes}
            onPress={() => setConfirming(true)}
          />
        </View>
      )}
    </View>
  );
}
