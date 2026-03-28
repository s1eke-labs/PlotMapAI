import { describe, expect, it } from 'vitest';

import { getPageTurnAnimation } from '../pageTurnAnimations';

describe('pageTurnAnimations', () => {
  it('reveals the next page by sliding the current page away in cover mode', () => {
    const animation = getPageTurnAnimation('cover');

    expect(animation.initial({ direction: 'next' })).toMatchObject({ x: 0, zIndex: 1 });
    expect(animation.animate({ direction: 'next' })).toMatchObject({ x: 0, zIndex: 1 });
    expect(animation.exit({ direction: 'next' })).toMatchObject({ x: '-100%', zIndex: 2 });
  });

  it('pulls the previous page in from the left in cover mode', () => {
    const animation = getPageTurnAnimation('cover');

    expect(animation.initial({ direction: 'prev' })).toMatchObject({ x: '-100%', zIndex: 2 });
    expect(animation.animate({ direction: 'prev' })).toMatchObject({ x: 0, zIndex: 2 });
    expect(animation.exit({ direction: 'prev' })).toMatchObject({ x: 0, zIndex: 1 });
  });

  it('builds slide animation targets in both directions', () => {
    const animation = getPageTurnAnimation('slide');

    expect(animation.initial({ direction: 'next' })).toMatchObject({ x: '100%', zIndex: 2 });
    expect(animation.animate({ direction: 'next' })).toMatchObject({ x: 0, zIndex: 2 });
    expect(animation.exit({ direction: 'next' })).toMatchObject({ x: '-100%', zIndex: 1 });
    expect(animation.initial({ direction: 'prev' })).toMatchObject({ x: '-100%', zIndex: 2 });
    expect(animation.exit({ direction: 'prev' })).toMatchObject({ x: '100%', zIndex: 1 });
  });

  it('keeps none mode static without positional transitions', () => {
    const animation = getPageTurnAnimation('none');

    expect(animation.initial({ direction: 'next' })).toEqual({ x: 0, zIndex: 1 });
    expect(animation.animate({ direction: 'next' })).toEqual({ x: 0, zIndex: 1 });
    expect(animation.exit({ direction: 'prev' })).toEqual({ x: 0, zIndex: 1 });
    expect(animation.transition.duration).toBe(0);
  });
});
