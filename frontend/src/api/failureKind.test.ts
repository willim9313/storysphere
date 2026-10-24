import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from './client';
import { failureKind, techDetailOf } from './failureKind';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(res: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res))),
  );
}

async function errorOf(res: Response | Error): Promise<unknown> {
  stubFetch(res);
  return apiFetch('/x').then(
    () => null,
    (e: unknown) => e,
  );
}

describe('failureKind', () => {
  it('an app 500 with a JSON body is a page failure', async () => {
    const err = await errorOf(new Response(JSON.stringify({ detail: 'Internal server error' }), { status: 500 }));
    expect(failureKind(err)).toBe('page');
  });

  it('an app 503 with a JSON body is a page failure, not an outage', async () => {
    const err = await errorOf(new Response(JSON.stringify({ detail: 'no provider' }), { status: 503 }));
    expect(failureKind(err)).toBe('page');
  });

  it('a bare 502 from the proxy is a backend failure', async () => {
    const err = await errorOf(new Response('', { status: 502, statusText: 'Bad Gateway' }));
    expect(failureKind(err)).toBe('backend');
    expect(techDetailOf(err)).toBe('502 Bad Gateway');
  });

  it('a rejected fetch is a backend failure', async () => {
    const err = await errorOf(new TypeError('Failed to fetch'));
    expect(failureKind(err)).toBe('backend');
  });

  it('a top-level code next to detail is kept', async () => {
    const err = await errorOf(
      new Response(JSON.stringify({ detail: 'closed', code: 'review_submitted' }), { status: 409 }),
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('review_submitted');
  });
});
