import { describe, expect, it } from 'vitest';
import type { Diagnostics } from '../modules/lamplight-engine/src/types';
import { diagnosticsReport, diagnosticsSections, isSilenced } from '../src/settings/diagnostics';

const failed: Diagnostics = {
  engine: {
    status: 'failed',
    error: { code: 'model-missing', message: 'The voice files are missing.', detail: 'FileNotFoundException: engine/vocoder.onnx', at: 1 },
    runtimeVersion: '1.31.0',
    threads: 4,
    loadTimings: { runtime: 3, duration_predictor: 40 },
    modelVersion: 'supertonic3-int8-v1',
    modelLocation: '/data/app/base.apk!/assets/engine',
    modelFiles: [
      { name: 'text_encoder.onnx', bytes: 36_416_150, present: true, stored: true },
      { name: 'vocoder.onnx', bytes: -1, present: false, stored: false },
      { name: 'tts.json', bytes: 8253, present: true, stored: false },
    ],
  },
  player: 'unavailable: IllegalStateException: no queue',
  volume: { media: 0, max: 15, muted: false },
  device: { model: 'SM-A546E', abis: ['arm64-v8a'], sdk: 34 },
  app: { version: '1.0.0' },
  log: ['12:00:00.000 E LamplightEngine: voice model failed to load'],
};

describe('diagnostics', () => {
  it('names the failure, its detail and every model file, flagging what is missing or compressed', () => {
    const engine = diagnosticsSections(failed)[0]?.rows ?? [];
    expect(engine).toContainEqual(['status', 'failed']);
    expect(engine).toContainEqual([
      'error',
      'model-missing: The voice files are missing. (FileNotFoundException: engine/vocoder.onnx)',
    ]);
    expect(engine).toContainEqual(['text_encoder.onnx', '34.7 MB']);
    expect(engine).toContainEqual(['vocoder.onnx', 'MISSING']);
    expect(engine).toContainEqual(['tts.json', '0.0 MB (compressed: loaded into memory)']);
    expect(engine).toContainEqual(['loadTimings', 'runtime 3 · duration_predictor 40']);
  });

  it('keeps a part that could not be read, with the reason', () => {
    expect(diagnosticsSections(failed)[1]).toEqual({
      key: 'player',
      rows: [['error', 'unavailable: IllegalStateException: no queue']],
    });
  });

  it('notices a silent media volume', () => {
    expect(isSilenced(failed)).toBe(true);
    expect(isSilenced({ ...failed, volume: { media: 7, max: 15, muted: false } })).toBe(false);
  });

  it('writes a report with every section and the log', () => {
    const text = diagnosticsReport(failed, new Date('2026-10-24T12:00:00Z'));
    expect(text).toContain('Lamplight diagnostics 2026-10-24T12:00:00.000Z');
    expect(text).toContain('[device]\nmodel: SM-A546E\nabis: arm64-v8a\nsdk: 34');
    expect(text).toContain('[log]\n12:00:00.000 E LamplightEngine: voice model failed to load');
  });
});
