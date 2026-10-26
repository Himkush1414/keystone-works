/** Small line icons for the demonstrations, drawn for this site (24 px grid, 2 px strokes). */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const PlayIcon = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"
      fill="currentColor"
    />
  </svg>
);

export const PauseIcon = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);

export const PrevIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M6 5v14M19 5 9 12l10 7V5Z" {...S} />
  </svg>
);

export const NextIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M18 5v14M5 5l10 7-10 7V5Z" {...S} />
  </svg>
);

export const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" {...S} />
  </svg>
);

export const ListIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" {...S} />
  </svg>
);

export const PlaneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d="M10.5 3.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5V9l7.5 4.5v2L13.5 13v5l2.5 2v1.5L12 20.5l-4 1V20l2.5-2v-5L3 15.5v-2L10.5 9V3.5Z"
      {...S}
    />
  </svg>
);

export const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2.5" {...S} />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" {...S} />
  </svg>
);

/** Play or pause, as one round button. */
export function PlayPause({
  playing,
  onClick,
  label,
  size = 52,
  className,
}: {
  playing: boolean;
  onClick(): void;
  label: string;
  size?: number;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={className}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={playing ? `Pause ${label}` : `Play ${label}`}
    >
      {playing ? <PauseIcon size={Math.round(size * 0.46)} /> : <PlayIcon size={Math.round(size * 0.46)} />}
    </button>
  );
}
