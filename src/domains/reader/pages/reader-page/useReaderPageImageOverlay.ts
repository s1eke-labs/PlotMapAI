import type {
  ReaderImageActivationPayload,
  ReaderImageGalleryEntry,
  ReaderImageViewerState,
} from '../../utils/readerImageGallery';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ReaderImageViewer from '../../components/reader/ReaderImageViewer';
import { readerApi } from '../../api/readerApi';
import { clearReaderImageResourcesForNovel } from '../../utils/readerImageResourceCache';
import { createReaderImageEntryId } from '../../utils/readerImageGallery';
import { useReaderPageContext } from './ReaderPageContext';

interface UseReaderPageImageOverlayParams {
  dismissBlockedInteraction: () => void;
  isEnabled: boolean;
}

interface UseReaderPageImageOverlayResult {
  imageViewerProps: React.ComponentProps<typeof ReaderImageViewer>;
  isImageViewerOpen: boolean;
  handleImageActivate: (payload: ReaderImageActivationPayload) => void;
  handleRegisterImageElement: (
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => void;
  closeImageViewer: () => void;
}

const INITIAL_IMAGE_VIEWER_STATE: ReaderImageViewerState = {
  activeEntry: null,
  isIndexLoading: false,
  isOpen: false,
  originRect: null,
  scale: 1,
  translateX: 0,
  translateY: 0,
};

function createClosedImageViewerState(
  previousState: ReaderImageViewerState,
): ReaderImageViewerState {
  return {
    ...previousState,
    isIndexLoading: false,
    isOpen: false,
    scale: 1,
    translateX: 0,
    translateY: 0,
  };
}

export function useReaderPageImageOverlay({
  dismissBlockedInteraction,
  isEnabled,
}: UseReaderPageImageOverlayParams): UseReaderPageImageOverlayResult {
  const { novelId } = useReaderPageContext();
  const [imageGalleryEntries, setImageGalleryEntries] = useState<ReaderImageGalleryEntry[]>([]);
  const [isImageGalleryIndexResolved, setIsImageGalleryIndexResolved] = useState(false);
  const [imageViewerState, setImageViewerState] = useState<ReaderImageViewerState>(
    INITIAL_IMAGE_VIEWER_STATE,
  );

  const imageGalleryEntriesRef = useRef<ReaderImageGalleryEntry[]>([]);
  const imageElementRegistryRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const imageViewerFocusRestoreRef = useRef<HTMLElement | null>(null);
  const imageGalleryIndexLoadTokenRef = useRef(0);
  const imageGalleryIndexPromiseRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    imageGalleryEntriesRef.current = imageGalleryEntries;
  }, [imageGalleryEntries]);

  useEffect(() => {
    imageGalleryEntriesRef.current = [];
    imageElementRegistryRef.current.clear();
    imageViewerFocusRestoreRef.current = null;
    imageGalleryIndexLoadTokenRef.current += 1;
    imageGalleryIndexPromiseRef.current = null;
    startTransition(() => {
      setIsImageGalleryIndexResolved(false);
      setImageGalleryEntries([]);
      setImageViewerState(INITIAL_IMAGE_VIEWER_STATE);
    });
  }, [novelId]);

  useEffect(() => () => {
    imageGalleryIndexLoadTokenRef.current += 1;
    imageGalleryIndexPromiseRef.current = null;
  }, []);

  useEffect(() => {
    if (isEnabled) {
      return;
    }

    setImageViewerState((previousState) => (
      previousState.isOpen
        ? createClosedImageViewerState(previousState)
        : previousState
    ));
  }, [isEnabled]);

  useEffect(() => {
    return () => {
      clearReaderImageResourcesForNovel(novelId);
    };
  }, [novelId]);

  const setImageViewerLoading = useCallback((isIndexLoading: boolean) => {
    setImageViewerState((previousState) => (
      previousState.isIndexLoading === isIndexLoading
        ? previousState
        : {
          ...previousState,
          isIndexLoading,
        }
    ));
  }, []);

  const syncImageViewerLoadingState = useCallback(() => {
    setImageViewerLoading(Boolean(imageGalleryIndexPromiseRef.current));
  }, [setImageViewerLoading]);

  const ensureImageGalleryEntriesLoaded = useCallback(async (): Promise<boolean> => {
    if (isImageGalleryIndexResolved) {
      return true;
    }

    const existingPromise = imageGalleryIndexPromiseRef.current;
    if (existingPromise) {
      return existingPromise;
    }

    const loadToken = imageGalleryIndexLoadTokenRef.current;
    const loadPromise = readerApi.getImageGalleryEntries(novelId)
      .then((entries) => {
        if (imageGalleryIndexLoadTokenRef.current !== loadToken) {
          return false;
        }

        imageGalleryEntriesRef.current = entries;
        setImageGalleryEntries(entries);
        setIsImageGalleryIndexResolved(true);
        return true;
      })
      .catch(() => false);

    const trackedPromise = loadPromise.finally(() => {
      if (imageGalleryIndexPromiseRef.current === trackedPromise) {
        imageGalleryIndexPromiseRef.current = null;
      }
      syncImageViewerLoadingState();
    });

    imageGalleryIndexPromiseRef.current = trackedPromise;
    syncImageViewerLoadingState();
    return trackedPromise;
  }, [isImageGalleryIndexResolved, novelId, syncImageViewerLoadingState]);

  useEffect(() => {
    ensureImageGalleryEntriesLoaded();
  }, [ensureImageGalleryEntriesLoaded]);

  const getImageOriginRect = useCallback(
    (entry: ReaderImageGalleryEntry | null): DOMRect | null => {
      if (!entry) {
        return null;
      }

      const element = imageElementRegistryRef.current.get(createReaderImageEntryId(entry));
      if (!element || !element.isConnected) {
        return null;
      }

      return element.getBoundingClientRect();
    },
    [],
  );

  const handleRegisterImageElement = useCallback((
    entry: Pick<ReaderImageGalleryEntry, 'blockIndex' | 'chapterIndex' | 'imageKey'>,
    element: HTMLButtonElement | null,
  ) => {
    const entryId = createReaderImageEntryId(entry);
    if (element) {
      imageElementRegistryRef.current.set(entryId, element);
      return;
    }

    const registeredElement = imageElementRegistryRef.current.get(entryId);
    if (!registeredElement || !registeredElement.isConnected) {
      imageElementRegistryRef.current.delete(entryId);
    }
  }, []);

  const closeImageViewer = useCallback(() => {
    const focusTarget = imageViewerFocusRestoreRef.current;
    setImageViewerState((previousState) => (
      previousState.isOpen
        ? createClosedImageViewerState(previousState)
        : previousState
    ));
    window.setTimeout(() => {
      if (focusTarget && focusTarget.isConnected) {
        focusTarget.focus();
      }
    }, 0);
  }, []);

  const handleImageActivate = useCallback((payload: ReaderImageActivationPayload) => {
    imageViewerFocusRestoreRef.current = payload.sourceElement;
    dismissBlockedInteraction();
    const nextActiveEntry = imageGalleryEntriesRef.current.find((entry) => (
      entry.chapterIndex === payload.chapterIndex
      && entry.blockIndex === payload.blockIndex
      && entry.imageKey === payload.imageKey
    )) ?? {
      blockIndex: payload.blockIndex,
      chapterIndex: payload.chapterIndex,
      imageKey: payload.imageKey,
      order: 0,
    };

    setImageViewerState({
      activeEntry: nextActiveEntry,
      isIndexLoading: !isImageGalleryIndexResolved,
      isOpen: true,
      originRect: payload.sourceElement.getBoundingClientRect(),
      scale: 1,
      translateX: 0,
      translateY: 0,
    });
    if (!isImageGalleryIndexResolved) {
      ensureImageGalleryEntriesLoaded();
    }
  }, [
    dismissBlockedInteraction,
    ensureImageGalleryEntriesLoaded,
    isImageGalleryIndexResolved,
  ]);

  const activeImageEntryId = imageViewerState.activeEntry
    ? createReaderImageEntryId(imageViewerState.activeEntry)
    : null;
  const activeImageIndex = useMemo(() => (
    activeImageEntryId
      ? imageGalleryEntries.findIndex(
        (entry) => createReaderImageEntryId(entry) === activeImageEntryId,
      )
      : -1
  ), [activeImageEntryId, imageGalleryEntries]);
  const activeImageEntry = activeImageIndex >= 0
    ? imageGalleryEntries[activeImageIndex] ?? null
    : imageViewerState.activeEntry;

  const handleNavigateImage = useCallback(async (direction: 'next' | 'prev'): Promise<boolean> => {
    const currentEntry = activeImageEntry;
    if (!currentEntry) {
      return false;
    }

    if (!isImageGalleryIndexResolved) {
      const didResolveIndex = await ensureImageGalleryEntriesLoaded();
      if (!didResolveIndex) {
        return false;
      }
    }

    const currentEntryId = createReaderImageEntryId(currentEntry);
    let currentIndex = imageGalleryEntriesRef.current.findIndex(
      (entry) => createReaderImageEntryId(entry) === currentEntryId,
    );
    if (currentIndex === -1) {
      currentIndex = activeImageIndex;
    }

    const step = direction === 'next' ? 1 : -1;
    const candidateEntry = currentIndex >= 0
      ? imageGalleryEntriesRef.current[currentIndex + step] ?? null
      : null;
    if (candidateEntry) {
      setImageViewerState((previousState) => ({
        ...previousState,
        activeEntry: candidateEntry,
        isIndexLoading: false,
      }));
      return true;
    }

    return false;
  }, [
    activeImageEntry,
    activeImageIndex,
    ensureImageGalleryEntriesLoaded,
    isImageGalleryIndexResolved,
  ]);

  return {
    imageViewerProps: {
      activeEntry: activeImageEntry,
      activeIndex: activeImageIndex,
      canNavigateNext: Boolean(
        isImageGalleryIndexResolved
        && activeImageEntry
        && activeImageIndex >= 0
        && activeImageIndex < imageGalleryEntries.length - 1,
      ),
      canNavigatePrev: Boolean(
        isImageGalleryIndexResolved
        && activeImageEntry
        && activeImageIndex > 0,
      ),
      entries: imageGalleryEntries,
      getOriginRect: getImageOriginRect,
      isIndexResolved: isImageGalleryIndexResolved,
      isIndexLoading: imageViewerState.isIndexLoading,
      isOpen: imageViewerState.isOpen,
      novelId,
      onRequestClose: closeImageViewer,
      onRequestNavigate: handleNavigateImage,
    },
    isImageViewerOpen: imageViewerState.isOpen,
    handleImageActivate,
    handleRegisterImageElement,
    closeImageViewer,
  };
}
