export type BookImportProgressStage =
  | 'hashing'
  | 'decoding'
  | 'unzipping'
  | 'opf'
  | 'toc'
  | 'chapters'
  | 'images'
  | 'finalizing';

export interface BookImportProgress {
  progress: number;
  stage: BookImportProgressStage;
}
