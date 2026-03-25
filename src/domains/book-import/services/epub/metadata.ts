import { extractTextContent, findElements, getAttribute } from './markup';
import type { OpfMetadata } from './types';

const NON_CONTENT_TITLE = /^(?:cover|封面|table\s+of\s+contents?|目录|contents?|copyright|版权|title\s*page|书名页|half\s*title|dedication|献词|acknowledg?ments?|致谢|foreword|序言|preface|前言|about\s+the\s+author|关于作者|colophon|出版信息|imprint)$/iu;
const NON_CONTENT_HREF = /(?:^|\/)(?:cover|toc|title|copyright|dedication|front|back|acknowledg|preface|foreword|colophon|about)[^/]*$/iu;

function getMetadataField(metadataMarkup: string, field: string): string {
  const element = findElements(metadataMarkup, field)[0];
  return element ? extractTextContent(element.innerContent) : '';
}

function getMetadataTags(metadataMarkup: string): string[] {
  const tags: string[] = [];
  for (const element of findElements(metadataMarkup, 'subject')) {
    const text = extractTextContent(element.innerContent);
    if (text) tags.push(text);
  }
  return tags;
}

export function parseOpfMetadata(opfXml: string): OpfMetadata {
  const metadataMarkup = findElements(opfXml, 'metadata')[0]?.innerContent || '';
  const coverMeta = findElements(metadataMarkup, 'meta')
    .find((element) => getAttribute(element.attributes, 'name').toLowerCase() === 'cover');

  return {
    author: getMetadataField(metadataMarkup, 'creator'),
    coverId: coverMeta ? getAttribute(coverMeta.attributes, 'content') : '',
    description: getMetadataField(metadataMarkup, 'description'),
    tags: getMetadataTags(metadataMarkup),
    title: getMetadataField(metadataMarkup, 'title'),
  };
}

export function extractBookMetadata(metadata: OpfMetadata, fileName: string): {
  title: string;
  author: string;
  description: string;
  tags: string[];
} {
  return {
    title: metadata.title || fileName.replace(/\.epub$/i, ''),
    author: metadata.author,
    description: metadata.description,
    tags: metadata.tags,
  };
}

export function extractTitleFromHtml(html: string): string {
  for (const selector of ['title', 'h1', 'h2', 'h3']) {
    const element = findElements(html, selector)[0];
    if (!element) {
      continue;
    }

    const text = extractTextContent(element.innerContent);
    if (text) {
      return text;
    }
  }
  return '';
}

export function isNonContentPage(title: string, href: string): boolean {
  return NON_CONTENT_TITLE.test(title.trim()) || NON_CONTENT_HREF.test(href);
}
