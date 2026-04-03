import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseReaderMobileBackParams {
  fallbackHref: string;
  isSidebarOpen: boolean;
  closeSidebar: () => void;
}

interface UseReaderMobileBackResult {
  handleMobileBack: () => void;
}

function getHistoryIndex(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' ? state.idx : 0;
}

export function useReaderMobileBack({
  fallbackHref,
  isSidebarOpen,
  closeSidebar,
}: UseReaderMobileBackParams): UseReaderMobileBackResult {
  const navigate = useNavigate();

  const handleMobileBack = useCallback(() => {
    if (isSidebarOpen) {
      closeSidebar();
      return;
    }

    if (getHistoryIndex() > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackHref, { replace: true });
  }, [closeSidebar, fallbackHref, isSidebarOpen, navigate]);

  return {
    handleMobileBack,
  };
}
