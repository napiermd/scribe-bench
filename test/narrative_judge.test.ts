// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractJSON } from '../eval/narrative_judge';

const valid = JSON.stringify({
  dimensions: {
    story_cohesion: 4, clinical_completeness: 3, natural_flow: 5,
    absence_of_artifacts: 4, physician_readability: 4, input_fidelity: 5,
  },
  reasoning: 'ok',
});

describe('extractJSON (narrative)', () => {
  it('parses a valid 6-dimension response', () => {
    const r = extractJSON(valid);
    expect(r.dimensions.natural_flow).toBe(5);
    expect(r.reasoning).toBe('ok');
  });

  it('parses through a ```json fence', () => {
    expect(extractJSON('```json\n' + valid + '\n```').dimensions.story_cohesion).toBe(4);
  });

  it('throws when dimensions are missing', () => {
    expect(() => extractJSON('{"reasoning":"x"}')).toThrow(/dimensions/);
  });

  it('throws when a dimension is out of the 1-5 range', () => {
    const bad = JSON.stringify({ dimensions: { story_cohesion: 6, clinical_completeness: 3, natural_flow: 5, absence_of_artifacts: 4, physician_readability: 4, input_fidelity: 5 }, reasoning: 'r' });
    expect(() => extractJSON(bad)).toThrow(/story_cohesion/);
  });

  it('throws when a dimension is non-numeric', () => {
    const bad = JSON.stringify({ dimensions: { story_cohesion: 'high', clinical_completeness: 3, natural_flow: 5, absence_of_artifacts: 4, physician_readability: 4, input_fidelity: 5 }, reasoning: 'r' });
    expect(() => extractJSON(bad)).toThrow();
  });
});
