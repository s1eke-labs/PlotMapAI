import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BottomSheet from '../BottomSheet';

function getDragHandle(container: HTMLElement): HTMLDivElement {
  const handle = container.querySelector('div.flex.touch-none.select-none.justify-center.pt-5.pb-1');
  if (!(handle instanceof HTMLDivElement)) {
    throw new Error('drag handle not found');
  }
  return handle;
}

describe('BottomSheet', () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks drag progress without closing when the gesture stays below threshold', async () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title">
        Panel content
      </BottomSheet>,
    );

    const handle = getDragHandle(container);
    const dialog = screen.getByRole('dialog');
    const backdrop = container.querySelector('button[aria-hidden="true"]');

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 120 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 180 });

    expect(dialog).toHaveStyle({ transform: 'translateY(60px)' });
    expect(backdrop).not.toBeNull();
    expect(Number((backdrop as HTMLButtonElement).style.opacity)).toBeLessThan(1);

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 180 });

    await waitFor(() => {
      expect(onClose).not.toHaveBeenCalled();
      expect(dialog.style.transform).toBe('');
    });
  });

  it('closes when the downward drag distance crosses the close threshold', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title">
        Panel content
      </BottomSheet>,
    );

    const handle = getDragHandle(container);

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 120 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 320 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 320 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the downward drag velocity is high even if the distance is short', () => {
    const onClose = vi.fn();
    const timestamps = [100, 116, 132];
    vi.spyOn(Date, 'now').mockImplementation(() => timestamps.shift() ?? 148);

    const { container } = render(
      <BottomSheet isOpen={true} onClose={onClose} title="Panel title">
        Panel content
      </BottomSheet>,
    );

    const handle = getDragHandle(container);

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 140 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 140 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
