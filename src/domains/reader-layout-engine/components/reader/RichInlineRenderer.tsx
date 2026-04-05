import type { ReactNode } from 'react';
import type { Mark, RichInline } from '@shared/contracts';

import { READER_CONTENT_CLASS_NAMES } from '@domains/reader-shell/constants/readerContentContract';

function applyMark(content: ReactNode, mark: Mark, key: string): ReactNode {
  if (mark === 'bold') {
    return <strong key={key}>{content}</strong>;
  }

  if (mark === 'italic') {
    return <em key={key}>{content}</em>;
  }

  if (mark === 'underline') {
    return <u key={key}>{content}</u>;
  }

  if (mark === 'strike') {
    return <s key={key}>{content}</s>;
  }

  if (mark === 'sup') {
    return <sup key={key}>{content}</sup>;
  }

  return <sub key={key}>{content}</sub>;
}

function renderInlineChild(inline: RichInline, key: string): ReactNode {
  if (inline.type === 'lineBreak') {
    return <br key={key} />;
  }

  if (inline.type === 'link') {
    return (
      <a
        key={key}
        href={inline.href}
        className={READER_CONTENT_CLASS_NAMES.inlineLink}
      >
        <RichInlineRenderer inlines={inline.children} keyPrefix={`${key}:link`} />
      </a>
    );
  }

  let content: ReactNode = inline.text;
  for (const [markIndex, mark] of (inline.marks ?? []).entries()) {
    content = applyMark(content, mark, `${key}:mark:${markIndex}:${mark}`);
  }

  return <span key={key}>{content}</span>;
}

interface RichInlineRendererProps {
  inlines: RichInline[];
  keyPrefix?: string;
}

export default function RichInlineRenderer({
  inlines,
  keyPrefix = 'inline',
}: RichInlineRendererProps) {
  return (
    <>
      {inlines.map((inline, index) => renderInlineChild(inline, `${keyPrefix}:${index}`))}
    </>
  );
}
