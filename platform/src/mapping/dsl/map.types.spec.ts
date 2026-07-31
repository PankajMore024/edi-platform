import { isLoopNode, isSegmentNode, LoopNode, SegmentNode } from './map.types';

describe('map DSL type guards', () => {
  const seg: SegmentNode = { segment: 'BEG', elements: [{ pos: 1, const: '00' }] };
  const loop: LoopNode = { loop: 'N1', segments: [seg] };

  it('identifies segment nodes', () => {
    expect(isSegmentNode(seg)).toBe(true);
    expect(isSegmentNode(loop)).toBe(false);
  });

  it('identifies loop nodes', () => {
    expect(isLoopNode(loop)).toBe(true);
    expect(isLoopNode(seg)).toBe(false);
  });
});
