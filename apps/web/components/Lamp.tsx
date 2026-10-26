/**
 * The hero's illustration: Lamplight's flame over an open book, its light falling on the pages. Drawn for
 * this site; the flame breathes (off under reduced motion) and a few motes drift in the light.
 */
export function Lamp({ className }: { className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 600"
      role="img"
      aria-label="A flame burning over an open book"
    >
      <defs>
        <radialGradient id="lamp-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F6C27A" stopOpacity="0.55" />
          <stop offset="0.35" stopColor="#E59B47" stopOpacity="0.22" />
          <stop offset="1" stopColor="#E59B47" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lamp-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE7B3" />
          <stop offset="0.55" stopColor="#F2A54C" />
          <stop offset="1" stopColor="#B85E17" />
        </linearGradient>
        <linearGradient id="lamp-page-l" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#FBEFD9" />
          <stop offset="1" stopColor="#D9C6A5" />
        </linearGradient>
        <linearGradient id="lamp-page-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FBEFD9" />
          <stop offset="1" stopColor="#CDB892" />
        </linearGradient>
        <filter id="lamp-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <circle cx="300" cy="270" r="270" fill="url(#lamp-halo)" />
      <g className="lamp-motes" fill="#F6C27A">
        <circle cx="210" cy="190" r="2.2" />
        <circle cx="390" cy="150" r="1.6" />
        <circle cx="350" cy="250" r="1.9" />
        <circle cx="240" cy="290" r="1.4" />
        <circle cx="420" cy="230" r="1.2" />
      </g>
      {/* The open book */}
      <g transform="translate(0 40)">
        <path
          d="M300 430 C 250 405, 170 400, 92 418 L 92 488 C 170 470, 250 474, 300 500 Z"
          fill="#7A5A33"
          opacity="0.55"
        />
        <path
          d="M300 414 C 248 386, 170 380, 96 398 L 96 470 C 170 452, 248 456, 300 484 Z"
          fill="url(#lamp-page-l)"
        />
        <path
          d="M300 414 C 352 386, 430 380, 504 398 L 504 470 C 430 452, 352 456, 300 484 Z"
          fill="url(#lamp-page-r)"
        />
        <path d="M300 414 L 300 484" stroke="#A88B62" strokeWidth="1.5" />
        <g stroke="#8E7652" strokeWidth="2" strokeLinecap="round" opacity="0.55">
          <path d="M126 416 C 180 406, 232 408, 276 424" />
          <path d="M126 432 C 180 422, 232 424, 276 440" />
          <path d="M126 448 C 170 440, 210 441, 250 452" />
          <path d="M324 424 C 368 408, 420 406, 474 416" />
          <path d="M324 440 C 368 424, 420 422, 474 432" />
          <path d="M350 454 C 390 441, 430 440, 474 448" />
        </g>
        <path
          d="M324 424 C 368 408, 420 406, 474 416"
          stroke="#E59B47"
          strokeWidth="9"
          strokeLinecap="round"
          opacity="0.28"
        />
      </g>
      {/* The flame: the brand mark's shape, without the book cut-out */}
      <g className="lamp-flame">
        <path
          d="M318 70C311 96 333 113 349 135C365 157 371 179 367 205C363 240 339 270 307 270C275 270 247 244 247 207C247 175 265 151 281 131C297 111 313 96 318 70Z"
          fill="#F2A54C"
          filter="url(#lamp-soft)"
          opacity="0.75"
        />
        <path
          d="M318 70C311 96 333 113 349 135C365 157 371 179 367 205C363 240 339 270 307 270C275 270 247 244 247 207C247 175 265 151 281 131C297 111 313 96 318 70Z"
          fill="url(#lamp-flame)"
        />
        <path
          d="M307 160C302 178 322 190 324 212C326 234 316 250 304 250C290 250 280 238 282 220C284 202 300 188 307 160Z"
          fill="#FFF3D6"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}
