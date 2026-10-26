/** The Lamplight mark: a flame that holds an open book. */
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        fill="var(--color-accent)"
        fillRule="evenodd"
        d="M56 3C52 15 63 23 71 33C79 43 82 53 80 65C78 81 66 95 50 95C34 95 20 83 20 66C20 51 29 40 37 31C45 22 53 15 56 3ZM48.6 65C42.6 60.5 36 60 31.5 62V77.5C36 76 42.6 77 48.6 81.5ZM51.4 65C57.4 60.5 64 60 68.5 62V77.5C64 76 57.4 77 51.4 81.5Z"
      />
    </svg>
  );
}
