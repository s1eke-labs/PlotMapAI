import { parseTxt } from './txtParser';
import { parseEpub } from './epubParser';

export interface ParsedBook {
  title: string;
  author: string;
  description: string;
  coverBlob: Blob | null;
  chapters: Array<{ title: string; content: string }>;
  rawText: string;
  encoding: string;
  totalWords: number;
  fileHash: string;
  tags: string[];
  images: Array<{ imageKey: string; blob: Blob }>;
}

export async function parseBook(
  file: File,
  tocRules: Array<{ rule: string }>,
): Promise<ParsedBook> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'txt') return parseTxt(file, tocRules);
  if (ext === 'epub') return parseEpub(file);
  throw new Error(`Unsupported file type: .${ext}`);
}
