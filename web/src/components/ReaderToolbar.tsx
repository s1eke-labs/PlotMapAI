import { AlignJustify, Columns2, Type, ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils/cn';

interface ReaderToolbarProps {
  fontSize: number;
  setFontSize: (size: number) => void;
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

export default function ReaderToolbar({
  fontSize,
  setFontSize,
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

  const themes = [
    { id: 'auto', color: 'transparent', label: t('reader.bgPresets.auto') },
    { id: 'paper', color: '#ffffff', label: t('reader.bgPresets.paper') },
    { id: 'parchment', color: '#f4ecd8', label: t('reader.bgPresets.parchment') },
    { id: 'green', color: '#c7edcc', label: t('reader.bgPresets.green') },
    { id: 'night', color: '#1a1a1a', label: t('reader.bgPresets.night') },
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-bg-secondary/90 dark:bg-brand-800/90 backdrop-blur-xl rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl border border-border-color z-40 transition-all hover:bg-bg-secondary dark:hover:bg-brand-800">
      
      <div className="flex items-center gap-2 border-r border-border-color/50 pr-6">
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

      <div className="flex items-center gap-4 border-r border-border-color/50 pr-6">
        <button
          onClick={() => setFontSize(Math.max(14, fontSize - 2))}
          className="p-1 rounded hover:bg-muted-bg transition-colors text-text-primary"
          title={t('reader.fontSize')}
        >
          <Type className="w-4 h-4" />
        </button>
        <span className="text-text-primary/80 text-sm font-medium min-w-[3ch] text-center">
          {fontSize}
        </span>
        <button
          onClick={() => setFontSize(Math.min(32, fontSize + 2))}
          className="p-1 rounded hover:bg-muted-bg transition-colors text-text-primary"
          title={t('reader.fontSize')}
        >
          <Type className="w-6 h-6" />
        </button>
      </div>

      <div className="flex items-center gap-2">
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
