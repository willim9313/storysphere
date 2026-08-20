import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';

import { ChatContextProvider, useChatContext, useChatDispatch, type PageContext } from './ChatContext';

/**
 * These assert wiring, not markup.
 *
 * The bug they guard against is invisible to both `tsc` and the pure-function
 * tests: chat state and chat actions used to share one context, so every
 * streamed token re-rendered all nine pages that only ever call
 * setPageContext. Nothing about that is a type error, and the UI renders
 * correctly the whole time — it is just needlessly expensive.
 *
 * Render counts are tallied in a dep-less effect rather than during render,
 * so the probes stay pure (react-hooks/globals). An effect with no dep array
 * runs after every render of its own component and not at all when that
 * component doesn't re-render, which is exactly the signal being measured.
 *
 * `children` is a stable element here, as it is in BookLayout, so a consumer
 * re-renders only when a context it actually subscribes to changes.
 */
describe('ChatContextProvider', () => {
  interface Probe {
    page: number;
    widget: number;
    dispatches: unknown[];
    seen?: PageContext;
    setPageContext?: (ctx: Partial<PageContext>) => void;
  }

  function setup() {
    const probe: Probe = { page: 0, widget: 0, dispatches: [] };

    function PageConsumer() {
      const dispatch = useChatDispatch();
      useEffect(() => {
        probe.page += 1;
        probe.dispatches.push(dispatch);
        probe.setPageContext = dispatch.setPageContext;
      });
      return null;
    }

    function WidgetConsumer() {
      const chat = useChatContext();
      useEffect(() => {
        probe.widget += 1;
        probe.seen = chat.pageContext;
      });
      return null;
    }

    render(
      <ChatContextProvider>
        <PageConsumer />
        <WidgetConsumer />
      </ChatContextProvider>,
    );

    return {
      probe,
      setPageContext: (ctx: Partial<PageContext>) => act(() => probe.setPageContext?.(ctx)),
    };
  }

  it('leaves page consumers alone when chat state changes', () => {
    const h = setup();
    expect(h.probe.page).toBe(1);
    expect(h.probe.widget).toBe(1);

    h.setPageContext({ page: 'graph', bookId: 'book-1' });

    // The widget renders the conversation, so it has to follow the state.
    expect(h.probe.widget).toBe(2);
    // A page that only publishes its context has no reason to re-render.
    expect(h.probe.page).toBe(1);
  });

  it('keeps the dispatch object identity stable across state changes', () => {
    const h = setup();
    h.setPageContext({ page: 'timeline' });
    h.setPageContext({ page: 'reader' });

    // A fresh identity every render is what makes an effect with setPageContext
    // in its deps re-run forever — and every page has exactly that effect.
    expect(new Set(h.probe.dispatches).size).toBe(1);
  });

  it('clears fields the incoming page is not allowed to carry', () => {
    const h = setup();

    h.setPageContext({ page: 'reader', bookId: 'b1', chapterId: 'c1' });
    expect(h.probe.seen).toMatchObject({ page: 'reader', bookId: 'b1', chapterId: 'c1' });

    // graph carries bookId but not chapterId, so chapterId has to drop.
    h.setPageContext({ page: 'graph' });
    expect(h.probe.seen?.bookId).toBe('b1');
    expect(h.probe.seen?.chapterId).toBeUndefined();
  });

  it('gives inert no-ops outside the provider', () => {
    const errors: unknown[] = [];

    function Orphan() {
      const dispatch = useChatDispatch();
      const chat = useChatContext();
      useEffect(() => {
        try {
          dispatch.setPageContext({ page: 'library' });
        } catch (err) {
          errors.push(err);
        }
      }, [dispatch]);
      return <span>{String(chat.isChatOpen)}</span>;
    }

    // Pages outside /books/:bookId render with no ChatContextProvider above them.
    const { container } = render(<Orphan />);
    expect(errors).toHaveLength(0);
    expect(container.textContent).toBe('false');
  });
});
