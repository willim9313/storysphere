import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { isLlmUnconfigured, LLM_SETTINGS_PATH } from '@/api/failureKind';
import { LlmUnconfiguredNotice } from './LlmUnconfiguredNotice';

describe('isLlmUnconfigured', () => {
  it('503 with an application body is the unconfigured state', () => {
    expect(isLlmUnconfigured(new ApiError(503, 'LLM provider is not configured', true))).toBe(true);
  });

  it('a bare gateway 503 (no JSON body) is an outage, not this state', () => {
    expect(isLlmUnconfigured(new ApiError(503, 'Service Unavailable', false))).toBe(false);
  });

  it('other statuses and non-ApiErrors are not', () => {
    expect(isLlmUnconfigured(new ApiError(502, 'x', true))).toBe(false);
    expect(isLlmUnconfigured(new Error('network'))).toBe(false);
    expect(isLlmUnconfigured(undefined)).toBe(false);
  });
});

describe('LlmUnconfiguredNotice', () => {
  it('shows the settled copy and links to the LLM settings panel', () => {
    // useTranslation without an initialised i18n returns the key itself.
    render(
      <MemoryRouter>
        <LlmUnconfiguredNotice />
      </MemoryRouter>,
    );
    expect(screen.getByText('failure.llmUnconfigured')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'failure.llmSettings' });
    expect(link.getAttribute('href')).toBe(LLM_SETTINGS_PATH);
  });
});
