export interface MarkupElement {
  attributes: Record<string, string>;
  end: number;
  innerContent: string;
  raw: string;
  selfClosing: boolean;
  start: number;
  tagName: string;
}

interface ParsedMarkupTag {
  attributes: Record<string, string>;
  isClosing: boolean;
  isSpecial: boolean;
  localName: string;
  name: string;
  selfClosing: boolean;
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t' || char === '\f';
}

function isTagNameStartChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === '_';
}

function isTagNameChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return isTagNameStartChar(char)
    || (code >= 48 && code <= 57)
    || char === ':'
    || char === '_'
    || char === '-'
    || char === '.';
}

function getLocalName(name: string): string {
  return name.split(':').pop()?.toLowerCase() || '';
}

export function findTagEnd(markup: string, start: number): number {
  let quote: '"' | '\'' | null = null;
  for (let index = start + 1; index < markup.length; index += 1) {
    const char = markup[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '>') {
      return index;
    }
  }

  return -1;
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s"'=<>`/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;

  for (const match of source.matchAll(attributePattern)) {
    const rawName = match[1];
    if (!rawName) {
      continue;
    }

    const name = rawName.toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    attributes[name] = value;
  }

  return attributes;
}

export function parseMarkupTag(rawTagContent: string): ParsedMarkupTag | null {
  let index = 0;
  while (index < rawTagContent.length && isWhitespace(rawTagContent[index])) {
    index += 1;
  }

  const marker = rawTagContent[index];
  if (!marker) {
    return null;
  }

  if (marker === '!' || marker === '?') {
    return {
      attributes: {},
      isClosing: false,
      isSpecial: true,
      localName: '',
      name: '',
      selfClosing: true,
    };
  }

  let isClosing = false;
  if (marker === '/') {
    isClosing = true;
    index += 1;
    while (index < rawTagContent.length && isWhitespace(rawTagContent[index])) {
      index += 1;
    }
  }

  if (!isTagNameStartChar(rawTagContent[index] ?? '')) {
    return null;
  }

  const nameStart = index;
  index += 1;
  while (index < rawTagContent.length && isTagNameChar(rawTagContent[index])) {
    index += 1;
  }

  const name = rawTagContent.slice(nameStart, index);
  let tail = rawTagContent.length - 1;
  while (tail >= index && isWhitespace(rawTagContent[tail])) {
    tail -= 1;
  }

  const selfClosing = !isClosing && rawTagContent[tail] === '/';
  const attributesSource = rawTagContent.slice(index, selfClosing ? tail : rawTagContent.length);

  return {
    attributes: parseAttributes(attributesSource),
    isClosing,
    isSpecial: false,
    localName: getLocalName(name),
    name,
    selfClosing,
  };
}

export function findElements(markup: string, localName: string): MarkupElement[] {
  const normalizedLocalName = localName.toLowerCase();
  const elements: MarkupElement[] = [];
  const stack: Array<{
    attributes: Record<string, string>;
    start: number;
    tagEnd: number;
    tagName: string;
  }> = [];

  let index = 0;
  while (index < markup.length) {
    const tagStart = markup.indexOf('<', index);
    if (tagStart === -1) {
      break;
    }

    if (markup.startsWith('<!--', tagStart)) {
      const commentEnd = markup.indexOf('-->', tagStart + 4);
      index = commentEnd === -1 ? markup.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(markup, tagStart);
    if (tagEnd === -1) {
      break;
    }

    const tag = parseMarkupTag(markup.slice(tagStart + 1, tagEnd));
    if (!tag || tag.isSpecial || tag.localName !== normalizedLocalName) {
      index = tagEnd + 1;
      continue;
    }

    if (tag.isClosing) {
      const open = stack.pop();
      if (open) {
        elements.push({
          attributes: open.attributes,
          end: tagEnd + 1,
          innerContent: markup.slice(open.tagEnd + 1, tagStart),
          raw: markup.slice(open.start, tagEnd + 1),
          selfClosing: false,
          start: open.start,
          tagName: open.tagName,
        });
      }
      index = tagEnd + 1;
      continue;
    }

    if (tag.selfClosing) {
      elements.push({
        attributes: tag.attributes,
        end: tagEnd + 1,
        innerContent: '',
        raw: markup.slice(tagStart, tagEnd + 1),
        selfClosing: true,
        start: tagStart,
        tagName: tag.name,
      });
      index = tagEnd + 1;
      continue;
    }

    stack.push({
      attributes: tag.attributes,
      start: tagStart,
      tagEnd,
      tagName: tag.name,
    });
    index = tagEnd + 1;
  }

  elements.sort((left, right) => left.start - right.start);
  return elements;
}

export function getAttribute(attributes: Record<string, string>, name: string): string {
  const normalizedName = name.toLowerCase();
  if (normalizedName in attributes) {
    return attributes[normalizedName];
  }

  for (const [attributeName, value] of Object.entries(attributes)) {
    if (getLocalName(attributeName) === normalizedName) {
      return value;
    }
  }

  return '';
}

export function decodeHtmlEntities(input: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: '\'',
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return input
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
      if (entity.startsWith('#x')) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF
          ? match
          : String.fromCodePoint(codePoint);
      }

      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF
          ? match
          : String.fromCodePoint(codePoint);
      }

      return namedEntities[entity.toLowerCase()] ?? match;
    })
    .replace(/\u00a0/gu, ' ');
}

export function extractTextContent(markup: string): string {
  return decodeHtmlEntities(
    markup
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
      .replace(/<!--[\s\S]*?-->/gu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim();
}
