import { useState, useRef, useEffect, useCallback } from 'react';
import { AlignJustify, AlignVerticalSpaceAround, Columns2, Type, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils/cn';

interface ReaderToolbarProps {
  fontSize: number;
  setFontSize: (size: number) => void;
  lineSpacing: number;
  setLineSpacing: (spacing: number) => void;
  paragraphSpacing: number;
  setParagraphSpacing: (spacing: number) => void;
  isTwoColumn: boolean;
  setIsTwoColumn: (two: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  navigationMode: 'chapter' | 'page';
  readerTheme: string;
  setReaderTheme: (theme: string) => void;
}

type SliderKey = 'fontSize' | 'lineSpacing' | 'paragraphSpacing' | null;

export default function ReaderToolbar({
  fontSize,
  setFontSize,
  lineSpacing,
  setLineSpacing,
  paragraphSpacing,
  setParagraphSpacing,
  isTwoColumn,
  setIsTwoColumn,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  navigationMode,
  readerTheme,
  setReaderTheme
}: ReaderToolbarProps) {
  const { t } = useTranslation();
  const [activeSlider, setActiveSlider] = useState<SliderKey>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const toggleSlider = useCallback((key: SliderKey) => {
    setActiveSlider(prev => prev === key ? null : key);
  }, []);

  useEffect(() => {
    if (!activeSlider) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      const btn = buttonRefs.current[activeSlider];
      if (btn?.contains(target)) return;
      setActiveSlider(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [activeSlider]);

  const themes = [
    { id: 'auto', color: 'transparent', label: t('reader.bgPresets.auto') },
    { id: 'paper', color: '#ffffff', label: t('reader.bgPresets.paper') },
    { id: 'parchment', color: '#f4ecd8', label: t('reader.bgPresets.parchment') },
    { id: 'green', color: '#c7edcc', label: t('reader.bgPresets.green') },
    { id: 'night', color: '#1a1a1a', label: t('reader.bgPresets.night') },
  ];

  const sliders: Array<{
    key: Exclude<SliderKey, null>;
    icon: typeof Type;
    label: string;
    value: number;
    display: string;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
  }> = [
      { key: 'fontSize', icon: Type, label: t('reader.fontSize'), value: fontSize, display: `${fontSize}px`, min: 14, max: 32, step: 1, onChange: setFontSize },
      { key: 'lineSpacing', icon: AlignJustify, label: t('reader.lineSpacing'), value: lineSpacing, display: lineSpacing.toFixed(1), min: 1.0, max: 3.0, step: 0.1, onChange: setLineSpacing },
      { key: 'paragraphSpacing', icon: AlignVerticalSpaceAround, label: t('reader.paragraphSpacing'), value: paragraphSpacing, display: `${paragraphSpacing}px`, min: 0, max: 32, step: 2, onChange: setParagraphSpacing },
    ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-bg-secondary/90 dark:bg-brand-800/90 backdrop-blur-xl rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl border border-border-color z-40 transition-all hover:bg-bg-secondary dark:hover:bg-brand-800">

      <div className="flex items-center gap-2 border-r border-border-color/50 pr-5">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="p-2 rounded-full hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
          title={t(navigationMode === 'page' ? 'reader.prevPage' : 'reader.prev')}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="p-2 rounded-full hover:bg-muted-bg disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
          title={t(navigationMode === 'page' ? 'reader.nextPage' : 'reader.next')}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-border-color/50 pr-5 relative">
        {sliders.map(({ key, icon: Icon, label, display, min, max, step, onChange, value }) => (
          <div key={key} className="relative">
            <button
              ref={el => { buttonRefs.current[key] = el; }}
              onClick={() => toggleSlider(key)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-sm transition-colors",
                activeSlider === key ? "bg-accent text-white" : "hover:bg-muted-bg text-text-primary"
              )}
              title={label}
            >
              <Icon className="w-4 h-4" />
              <span className="font-medium text-xs">{display}</span>
            </button>
            {activeSlider === key && (
              <div
                ref={popoverRef}
                className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-bg-secondary dark:bg-brand-800 border border-border-color rounded-xl px-5 py-4 shadow-xl min-w-[200px]"
              >
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2.5 h-2.5 bg-bg-secondary dark:bg-brand-800 border-r border-b border-border-color" />
                <div className="text-xs text-text-secondary mb-2 text-center">{label}</div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="flex-1 accent-accent h-1.5 cursor-pointer"
                  />
                  <span className="text-sm font-mono text-text-primary min-w-[3.5ch] text-right">{display}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-r border-border-color/50 pr-5">
        <button
          onClick={() => setIsTwoColumn(false)}
          className={cn(
            "p-2 rounded-full transition-colors",
            !isTwoColumn ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.singleColumn')}
        >
          <AlignJustify className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsTwoColumn(true)}
          className={cn(
            "p-2 rounded-full transition-colors hidden md:block",
            isTwoColumn ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary hover:bg-muted-bg"
          )}
          title={t('reader.twoColumn')}
        >
          <Columns2 className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        {themes.map(theme => (
          <button
            key={theme.id}
            onClick={() => setReaderTheme(theme.id)}
            className={cn(
              "w-6 h-6 rounded-full border transition-all flex items-center justify-center overflow-hidden",
              readerTheme === theme.id ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-secondary scale-110" : "border-border-color hover:scale-105",
              theme.id === 'auto' && "bg-gradient-to-tr from-white to-brand-900"
            )}
            style={{ backgroundColor: theme.id === 'auto' ? undefined : theme.color }}
            title={theme.label}
          >
            {theme.id === 'auto' && <div className="sr-only">Auto</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
