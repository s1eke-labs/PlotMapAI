import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function ReloadPrompt() {
  const { t } = useTranslation();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
      if (registration) {
        setInterval(() => { registration.update(); }, 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  function handleUpdate(): void {
    updateServiceWorker(true);
  }

  function handleDismiss(): void {
    setNeedRefresh(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-8"
      onClick={handleDismiss}
    >
      <div
        className="animate-slide-up glass dark:glass-dark flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl ring-1 ring-border-color/40"
        onClick={(e) => e.stopPropagation()}
      >
        <RefreshCw className="h-4.5 w-4.5 shrink-0 text-accent" />
        <span className="text-sm font-medium text-text-primary">
          {t('pwa.updateAvailable')}
        </span>
        <button
          onClick={handleUpdate}
          className="ml-1 cursor-pointer rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover active:scale-95"
        >
          {t('pwa.reload')}
        </button>
      </div>
    </div>
  );
}
