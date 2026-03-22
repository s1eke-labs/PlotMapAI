import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useReaderStatePersistence } from '../useReaderStatePersistence';

describe('useReaderStatePersistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when no stored state exists', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toBeNull();
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 0,
      viewMode: 'original',
      isTwoColumn: false,
    });
    expect(result.current.hasHydratedReaderState).toBe(false);
    expect(result.current.hasUserInteractedRef.current).toBe(false);
  });

  it('reads stored state from localStorage', () => {
    localStorage.setItem('reader-state:42', JSON.stringify({
      chapterIndex: 5,
      viewMode: 'summary',
      isTwoColumn: true,
    }));

    const { result } = renderHook(() => useReaderStatePersistence(42));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: 5,
      viewMode: 'summary',
      isTwoColumn: true,
    });
    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 5,
      viewMode: 'summary',
      isTwoColumn: true,
    });
  });

  it('returns null initialStoredState for novelId 0', () => {
    const { result } = renderHook(() => useReaderStatePersistence(0));
    expect(result.current.initialStoredState).toBeNull();
  });

  it('ignores invalid JSON in localStorage', () => {
    localStorage.setItem('reader-state:1', '{invalid json');
    const { result } = renderHook(() => useReaderStatePersistence(1));
    expect(result.current.initialStoredState).toBeNull();
  });

  it('filters invalid fields in stored state', () => {
    localStorage.setItem('reader-state:1', JSON.stringify({
      chapterIndex: 'not-a-number',
      viewMode: 'invalid',
      isTwoColumn: 'yes',
    }));

    const { result } = renderHook(() => useReaderStatePersistence(1));

    expect(result.current.initialStoredState).toEqual({
      chapterIndex: undefined,
      viewMode: undefined,
      isTwoColumn: undefined,
    });
  });

  it('persists state via persistReaderState', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({ chapterIndex: 3, viewMode: 'summary', isTwoColumn: true });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 3,
      viewMode: 'summary',
      isTwoColumn: true,
    });

    const stored = JSON.parse(localStorage.getItem('reader-state:1')!);
    expect(stored).toEqual({ chapterIndex: 3, viewMode: 'summary', isTwoColumn: true });
  });

  it('merges partial updates with existing state', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));

    act(() => {
      result.current.persistReaderState({ chapterIndex: 5, viewMode: 'summary', isTwoColumn: true });
    });

    act(() => {
      result.current.persistReaderState({ chapterIndex: 7 });
    });

    expect(result.current.latestReaderStateRef.current).toEqual({
      chapterIndex: 7,
      viewMode: 'summary',
      isTwoColumn: true,
    });
  });

  it('marks user interaction', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));
    expect(result.current.hasUserInteractedRef.current).toBe(false);

    act(() => { result.current.markUserInteracted(); });
    expect(result.current.hasUserInteractedRef.current).toBe(true);
  });

  it('sets hasHydratedReaderState', () => {
    const { result } = renderHook(() => useReaderStatePersistence(1));
    expect(result.current.hasHydratedReaderState).toBe(false);

    act(() => { result.current.setHasHydratedReaderState(true); });
    expect(result.current.hasHydratedReaderState).toBe(true);
  });

  it('does not write to localStorage when novelId is 0', () => {
    const { result } = renderHook(() => useReaderStatePersistence(0));

    act(() => {
      result.current.persistReaderState({ chapterIndex: 1 });
    });

    // Should not store anything since novelId is 0 (falsy)
    expect(localStorage.getItem('reader-state:0')).toBeNull();
  });
});
