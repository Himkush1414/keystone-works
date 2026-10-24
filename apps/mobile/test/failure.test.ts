import { describe, expect, it } from 'vitest';
import { failureOf } from '../src/player/failure';

describe('failureOf', () => {
  it('keeps a native failure as it is', () => {
    const e = Object.assign(new Error('Another app is holding the audio.'), { code: 'audio-focus' });
    expect(failureOf(e, 'fallback')).toEqual({
      code: 'audio-focus',
      message: 'Another app is holding the audio.',
    });
  });

  it('unwraps the innermost cause of an exception thrown inside a native function', () => {
    const e = Object.assign(
      new Error(
        "Call to function 'LamplightEngine.loadQueue' has been rejected.\n→ Caused by: queue.json: No such file",
      ),
      { code: 'ERR_FUNCTION_CALL' },
    );
    expect(failureOf(e, 'fallback')).toEqual({
      code: 'ERR_FUNCTION_CALL',
      message: 'queue.json: No such file',
    });
  });

  it('falls back to the given words when there is nothing to show', () => {
    expect(failureOf(undefined, 'The voice could not start.')).toEqual({
      code: 'unknown',
      message: 'The voice could not start.',
    });
  });
});
