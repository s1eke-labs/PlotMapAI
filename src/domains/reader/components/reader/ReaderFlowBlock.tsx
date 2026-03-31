import type { CSSProperties } from 'react';
import type {
  ReaderImagePageItem,
  ReaderTextPageItem,
  StaticReaderNode,
  StaticTextLine,
} from '../../utils/readerLayout';

import { useReaderImageResource } from '../../hooks/useReaderImageResource';

interface ReaderFlowBlockProps {
  imageRenderMode: 'paged' | 'scroll';
  item: StaticReaderNode;
  novelId: number;
  positionStyle?: CSSProperties;
}

interface RenderImageItem {
  displayHeight: number;
  displayWidth: number | string;
  height: number;
  imageKey: string;
  marginAfter: number;
  marginBefore: number;
}

interface RenderTextItem {
  font: string;
  fontSizePx: number;
  height: number;
  kind: 'heading' | 'text';
  lineHeightPx: number;
  lines: StaticTextLine[];
  marginAfter: number;
  marginBefore: number;
}

function serializeTextLines(lines: StaticTextLine[]): string {
  if (lines.length === 0) {
    return '\u00a0';
  }

  return lines
    .map((line) => (line.text.length > 0 ? line.text : '\u00a0'))
    .join('\n');
}

function ReaderLayoutImage({
  imageKey,
  imageRenderMode,
  novelId,
  style,
}: {
  imageKey: string;
  imageRenderMode: 'paged' | 'scroll';
  novelId: number;
  style: CSSProperties;
}) {
  const imageUrl = useReaderImageResource(novelId, imageKey);
  if (!imageUrl) {
    return null;
  }

  return (
    <img
      src={imageUrl}
      alt=""
      className="mx-auto block rounded-lg shadow-md"
      decoding="async"
      draggable={false}
      loading={imageRenderMode === 'paged' ? 'eager' : 'lazy'}
      style={style}
    />
  );
}

export default function ReaderFlowBlock({
  imageRenderMode,
  item,
  novelId,
  positionStyle,
}: ReaderFlowBlockProps) {
  let imageItem: RenderImageItem | null = null;
  let textItem: RenderTextItem | null = null;

  if ('block' in item) {
    if (item.block.kind === 'blank') {
      return null;
    }

    if (item.block.kind === 'image') {
      imageItem = {
        displayHeight: item.displayHeight ?? item.contentHeight,
        displayWidth: item.displayWidth ?? '100%',
        height: item.height,
        imageKey: item.block.imageKey ?? '',
        marginAfter: item.marginAfter,
        marginBefore: item.marginBefore,
      };
    } else {
      textItem = {
        font: item.font,
        fontSizePx: item.fontSizePx,
        height: item.height,
        kind: item.block.kind,
        lineHeightPx: item.lineHeightPx,
        lines: item.lines,
        marginAfter: item.marginAfter,
        marginBefore: item.marginBefore,
      };
    }
  } else {
    if (item.kind === 'blank') {
      return null;
    }

    if (item.kind === 'image') {
      const pageImageItem = item as ReaderImagePageItem;
      imageItem = {
        displayHeight: pageImageItem.displayHeight,
        displayWidth: pageImageItem.displayWidth,
        height: pageImageItem.height,
        imageKey: pageImageItem.imageKey,
        marginAfter: pageImageItem.marginAfter,
        marginBefore: pageImageItem.marginBefore,
      };
    } else {
      const pageTextItem = item as ReaderTextPageItem;
      textItem = {
        font: pageTextItem.font,
        fontSizePx: pageTextItem.fontSizePx,
        height: pageTextItem.height,
        kind: pageTextItem.kind,
        lineHeightPx: pageTextItem.lineHeightPx,
        lines: pageTextItem.lines,
        marginAfter: pageTextItem.marginAfter,
        marginBefore: pageTextItem.marginBefore,
      };
    }
  }

  if (imageItem) {
    return (
      <div
        style={{
          ...positionStyle,
          height: imageItem.height,
          paddingBottom: imageItem.marginAfter,
          paddingTop: imageItem.marginBefore,
        }}
      >
        <ReaderLayoutImage
          imageKey={imageItem.imageKey}
          imageRenderMode={imageRenderMode}
          novelId={novelId}
          style={{
            height: imageItem.displayHeight,
            maxWidth: '100%',
            width: imageItem.displayWidth,
          }}
        />
      </div>
    );
  }

  if (!textItem) {
    return null;
  }

  const textStyle = {
    font: textItem.font,
    fontSize: `${textItem.fontSizePx}px`,
    lineHeight: `${textItem.lineHeightPx}px`,
  } satisfies CSSProperties;
  const serializedText = serializeTextLines(textItem.lines);

  return (
    <div
      style={{
        ...positionStyle,
        height: textItem.height,
        paddingBottom: textItem.marginAfter,
        paddingTop: textItem.marginBefore,
      }}
    >
      {textItem.kind === 'heading' ? (
        <h2
          data-testid="reader-flow-text-fragment"
          className="text-center"
          style={{
            ...textStyle,
            overflow: 'hidden',
            whiteSpace: 'pre',
          }}
        >
          {serializedText}
        </h2>
      ) : (
        <div
          data-testid="reader-flow-text-fragment"
          className="opacity-90"
          style={{
            ...textStyle,
            overflow: 'hidden',
            whiteSpace: 'pre',
          }}
        >
          {serializedText}
        </div>
      )}
    </div>
  );
}
