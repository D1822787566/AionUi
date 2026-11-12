import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RendererRecovery from '@/renderer/components/layout/RendererRecovery';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const PersistentFailure = () => {
  throw new Error('persistent fixture');
};

describe('renderer recovery boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('automatically remounts a view after a transient render failure', async () => {
    let failed = true;
    const View = () => {
      if (failed) throw new TypeError('render fixture');
      return <div>Recovered content</div>;
    };
    render(
      <RendererRecovery>
        <View />
      </RendererRecovery>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('common.rendererRecovery.retrying');
    failed = false;
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Recovered content')).toBeInTheDocument();
  });

  it('shows a reload action after a persistent error without retrying forever', async () => {
    render(
      <RendererRecovery>
        <PersistentFailure />
      </RendererRecovery>
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('common.rendererRecovery.description');
    expect(screen.getByRole('button', { name: 'common.reload' })).toBeInTheDocument();
    const count = vi.mocked(console.error).mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(vi.mocked(console.error).mock.calls.length).toBe(count);
  });
});
