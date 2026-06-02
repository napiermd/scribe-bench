// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractJsonObject } from '../eval/json';

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips a ```json fence', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips a bare ``` fence', () => {
    expect(extractJsonObject('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('slices the outermost object out of surrounding prose', () => {
    expect(extractJsonObject('Sure! Here it is: {"a":3} hope that helps')).toEqual({ a: 3 });
  });

  it('handles nested objects (last brace is the outer close)', () => {
    expect(extractJsonObject('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
  });

  it('throws on unparseable input', () => {
    expect(() => extractJsonObject('not json at all')).toThrow();
  });

  it('throws on empty input', () => {
    expect(() => extractJsonObject('')).toThrow();
  });
});
