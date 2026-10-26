'use client';

/**
 * One audio element for the whole page: starting a demo stops whatever else was playing, the way one phone
 * plays one thing at a time. Listeners hear position updates every animation frame while playing.
 */
type Listener = { onTime?(ms: number): void; onEnd?(): void; onStop?(): void };

let audio: HTMLAudioElement | null = null;
let owner: Listener | null = null;
let frame = 0;

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(frame);
      const o = owner;
      owner = null;
      o?.onEnd?.();
    });
  }
  return audio;
}

function tick() {
  if (audio && owner) owner.onTime?.(audio.currentTime * 1000);
  if (audio && !audio.paused) frame = requestAnimationFrame(tick);
}

/** Plays `src` from `fromMs` for `listener`, stopping anyone else. Resolves false if the browser refused. */
export async function play(src: string, listener: Listener, fromMs = 0, rate = 1): Promise<boolean> {
  const a = element();
  if (owner && owner !== listener) owner.onStop?.();
  owner = listener;
  if (!a.src.endsWith(src)) a.src = src;
  a.playbackRate = rate;
  a.volume = 1;
  try {
    if (fromMs > 0 || a.currentTime > 0) a.currentTime = fromMs / 1000;
    await a.play();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
    return true;
  } catch {
    owner = null;
    return false;
  }
}

/** Stops playback if `listener` owns it (or always, without one). */
export function stop(listener?: Listener) {
  if (!audio || (listener && owner !== listener)) return;
  audio.pause();
  cancelAnimationFrame(frame);
  const o = owner;
  owner = null;
  o?.onStop?.();
}

export function setRate(rate: number) {
  if (audio) audio.playbackRate = rate;
}

export function setVolume(v: number) {
  if (audio) audio.volume = Math.max(0, Math.min(1, v));
}

export const playing = (listener: Listener) => owner === listener && !!audio && !audio.paused;
