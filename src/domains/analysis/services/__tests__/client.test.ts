import { describe, expect, it } from 'vitest';
import { AnalysisExecutionError } from '../errors';
import { extractJsonObject } from '../client';

describe('analysis output helpers', () => {
  it('extracts json from fenced model output', () => {
    expect(extractJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it('extracts the first json object embedded in text', () => {
    expect(extractJsonObject('结果如下：{"hello":"world"}谢谢')).toEqual({ hello: 'world' });
  });

  it('throws when content does not contain a valid json object', () => {
    expect(() => extractJsonObject('not-json')).toThrow(
      new AnalysisExecutionError('AI 返回内容不是合法 JSON。'),
    );
  });
});
