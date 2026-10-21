import { radius } from '@lamplight/tokens';
import { memo } from 'react';
import { Image, StyleSheet, Text as RNText, View } from 'react-native';
import { coverTitleSize, generatedCover, monogram } from '@/library/present';
import { FONT } from '@/theme/fonts';

export interface CoverProps {
  title: string;
  author?: string | null;
  /** Artwork from the file (EPUB cover); otherwise a typographic cover is drawn. */
  uri?: string | null;
  /** Width in dp; height follows the 2:3 book proportion. */
  width: number;
}

/** A book cover: the file's artwork, or the title set in Fraunces on a book-cloth colour. */
export const Cover = memo(function Cover({ title, author, uri, width }: CoverProps) {
  const height = Math.round(width * 1.5);
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.frame, { width, height }]}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }
  const c = generatedCover(title);
  const frame = [styles.frame, { width, height, backgroundColor: c.background }];
  if (width < SMALL) {
    // Too small for a readable title: a monogram over the rule, like a spine stamp.
    const size = Math.round(width * 0.5);
    return (
      <View accessible={false} style={[frame, styles.center]}>
        <RNText
          allowFontScaling={false}
          style={{ fontFamily: FONT.display, fontSize: size, lineHeight: size * 1.2, color: c.ink }}
        >
          {monogram(title)}
        </RNText>
        <View style={[styles.rule, { backgroundColor: c.rule, width: '40%' }]} />
      </View>
    );
  }
  const pad = Math.round(width * 0.09);
  const titleSize = coverTitleSize(title, width - pad * 2);
  return (
    <View accessible={false} style={[frame, { padding: pad }]}>
      <RNText
        allowFontScaling={false}
        numberOfLines={6}
        style={{ fontFamily: FONT.display, fontSize: titleSize, lineHeight: titleSize * 1.15, color: c.ink }}
      >
        {title}
      </RNText>
      <View style={[styles.rule, { backgroundColor: c.rule, marginVertical: Math.round(pad * 0.6) }]} />
      {author ? (
        <RNText
          allowFontScaling={false}
          numberOfLines={2}
          style={{
            fontFamily: FONT.ui,
            fontSize: Math.max(8, Math.round(width * 0.075)),
            color: c.ink,
            opacity: 0.85,
          }}
        >
          {author}
        </RNText>
      ) : null}
    </View>
  );
});

/** Covers narrower than this show a monogram instead of the title. */
const SMALL = 72;

const styles = StyleSheet.create({
  frame: { borderRadius: radius.cover, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  rule: { height: StyleSheet.hairlineWidth * 2, width: '38%' },
});
