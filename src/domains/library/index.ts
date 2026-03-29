export { libraryApi } from './api/libraryApi';
export type { NovelView } from './api/libraryApi';

export function loadBookshelfPage() {
  return import('./pages/BookshelfPage');
}

export function loadBookDetailPage() {
  return import('./pages/BookDetailPage');
}
