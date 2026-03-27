import { describe, expect, it } from 'vitest';
import { htmlToText } from '../epub/htmlToText';

describe('htmlToText', () => {
  it('removes blocked tag content even when the closing tag contains extra whitespace', () => {
    const html = '<div>Intro</div><script>alert(1)</script\t\n bar><p>Body</p>';
    expect(htmlToText(html)).toBe('Intro\nBody');
  });

  it('removes navigation-like blocks identified by class or id', () => {
    const html = '<section class="top-nav">Skip me</section><p>Keep me</p><div id="page-nav">And me too</div>';
    expect(htmlToText(html)).toBe('Keep me');
  });

  it('strips title attributes from inline elements', () => {
    const html = '<p>See <abbr title="HyperText Markup Language">HTML</abbr> for details.</p>';
    expect(htmlToText(html)).toBe('See HTML for details.');
  });

  it('strips title attributes from block elements', () => {
    const html = '<p title="intro paragraph">Welcome to the book.</p>';
    expect(htmlToText(html)).toBe('Welcome to the book.');
  });

  it('strips multiple attributes including title', () => {
    const html = '<span class="note" id="n1" title="footnote 1">important</span>';
    expect(htmlToText(html)).toBe('important');
  });
});
