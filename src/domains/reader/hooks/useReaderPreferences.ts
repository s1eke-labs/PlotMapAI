import type { ReaderPageTurnMode } from '../constants/pageTurnMode';

import { useCallback, useEffect, useMemo } from 'react';

import { READER_THEMES } from '../constants/readerThemes';
import {
  ensureSessionPreferencesHydrated,
  setReaderPageTurnMode,
  setReaderTheme,
  setTypography,
  useReaderSessionSelector,
} from './sessionStore';

const HEADER_BG_MAP: Record<string, string> = {
  auto: 'bg-bg-primary',
  paper: 'bg-white',
  parchment: 'bg-[#f4ecd8]',
  green: 'bg-[#c7edcc]',
  night: 'bg-[#1a1a1a]',
};

export function useReaderPreferences() {
  useEffect(() => {
    ensureSessionPreferencesHydrated();
  }, []);

  const fontSize = useReaderSessionSelector((state) => state.fontSize);
  const readerTheme = useReaderSessionSelector((state) => state.readerTheme);
  const pageTurnMode = useReaderSessionSelector((state) => state.pageTurnMode);
  const lineSpacing = useReaderSessionSelector((state) => state.lineSpacing);
  const paragraphSpacing = useReaderSessionSelector((state) => state.paragraphSpacing);
  const preferences = useMemo(() => ({
    fontSize,
    readerTheme,
    pageTurnMode,
    lineSpacing,
    paragraphSpacing,
  }), [fontSize, lineSpacing, pageTurnMode, paragraphSpacing, readerTheme]);

  const currentTheme = READER_THEMES[preferences.readerTheme] || READER_THEMES.auto;
  const headerBg = HEADER_BG_MAP[preferences.readerTheme] || HEADER_BG_MAP.auto;

  const handleSetFontSize = useCallback((nextFontSize: number) => {
    setTypography({ fontSize: nextFontSize });
  }, []);

  const handleSetReaderTheme = useCallback((nextReaderTheme: string) => {
    setReaderTheme(nextReaderTheme);
  }, []);

  const handleSetPageTurnMode = useCallback((nextPageTurnMode: ReaderPageTurnMode) => {
    setReaderPageTurnMode(nextPageTurnMode);
  }, []);

  const handleSetLineSpacing = useCallback((nextLineSpacing: number) => {
    setTypography({ lineSpacing: nextLineSpacing });
  }, []);

  const handleSetParagraphSpacing = useCallback((nextParagraphSpacing: number) => {
    setTypography({ paragraphSpacing: nextParagraphSpacing });
  }, []);

  return {
    ...preferences,
    setFontSize: handleSetFontSize,
    setReaderTheme: handleSetReaderTheme,
    setPageTurnMode: handleSetPageTurnMode,
    setLineSpacing: handleSetLineSpacing,
    setParagraphSpacing: handleSetParagraphSpacing,
    currentTheme,
    headerBg,
  };
}
