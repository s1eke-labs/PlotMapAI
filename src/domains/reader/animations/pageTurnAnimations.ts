import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

export type PageTurnDirection = 'next' | 'prev';

export interface PageTurnAnimationCustom {
  direction: PageTurnDirection;
}

export interface PageTurnAnimationTarget {
  [key: string]: number | string | undefined;
  opacity?: number;
  x?: number | string;
  zIndex?: number;
}

export interface PageTurnAnimationDefinition {
  initial: (custom: PageTurnAnimationCustom) => PageTurnAnimationTarget;
  animate: (custom: PageTurnAnimationCustom) => PageTurnAnimationTarget;
  exit: (custom: PageTurnAnimationCustom) => PageTurnAnimationTarget;
  transition: {
    duration: number;
    ease: [number, number, number, number];
  };
}

function getDirectionalOffset(direction: PageTurnDirection): string {
  return direction === 'next' ? '100%' : '-100%';
}

function getReverseDirectionalOffset(direction: PageTurnDirection): string {
  return direction === 'next' ? '-100%' : '100%';
}

export function getPageTurnAnimation(
  mode: Exclude<ReaderPageTurnMode, 'scroll'>,
): PageTurnAnimationDefinition {
  if (mode === 'cover') {
    return {
      initial: ({ direction }) => ({
        x: direction === 'next' ? 0 : '-100%',
        zIndex: direction === 'next' ? 1 : 2,
      }),
      animate: ({ direction }) => ({
        x: 0,
        zIndex: direction === 'next' ? 1 : 2,
      }),
      exit: ({ direction }) => ({
        x: direction === 'next' ? '-100%' : 0,
        zIndex: direction === 'next' ? 2 : 1,
      }),
      transition: {
        duration: 1,
        ease: [0.22, 1, 0.36, 1],
      },
    };
  }

  if (mode === 'slide') {
    return {
      initial: ({ direction }) => ({
        x: getDirectionalOffset(direction),
        zIndex: 2,
      }),
      animate: () => ({
        x: 0,
        zIndex: 2,
      }),
      exit: ({ direction }) => ({
        x: getReverseDirectionalOffset(direction),
        zIndex: 1,
      }),
      transition: {
        duration: 1,
        ease: [0.22, 1, 0.36, 1],
      },
    };
  }

  return {
    initial: () => ({
      x: 0,
      zIndex: 1,
    }),
    animate: () => ({
      x: 0,
      zIndex: 1,
    }),
    exit: () => ({
      x: 0,
      zIndex: 1,
    }),
    transition: {
      duration: 0,
      ease: [0.22, 1, 0.36, 1],
    },
  };
}
