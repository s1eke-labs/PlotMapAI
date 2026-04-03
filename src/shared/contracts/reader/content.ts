export interface Chapter {
  index: number;
  title: string;
  wordCount: number;
}

export interface ChapterContent extends Chapter {
  content: string;
  totalChapters: number;
  hasPrev: boolean;
  hasNext: boolean;
}
