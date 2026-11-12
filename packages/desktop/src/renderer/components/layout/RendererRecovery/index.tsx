import React from 'react';
import RendererRecoveryView from './RendererRecoveryView';

type State = { failed: boolean; retried: boolean };

/** Keep rendering errors from unmounting the entire window indefinitely. */
export default class RendererRecovery extends React.Component<React.PropsWithChildren, State> {
  state: State = { failed: false, retried: false };
  private timer?: ReturnType<typeof setTimeout>;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Record code locations, without serializing props, messages, or credentials.
    console.error('[RendererRecovery] React tree failed', {
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack?.split('\n').slice(1, 12).join('\n') : undefined,
      componentStack: info.componentStack,
      retried: this.state.retried,
    });
    if (!this.state.retried) {
      this.timer = setTimeout(() => this.setState({ failed: false, retried: true }), 1000);
    }
  }

  componentWillUnmount(): void {
    clearTimeout(this.timer);
  }

  render(): React.ReactNode {
    return this.state.failed ? <RendererRecoveryView retrying={!this.state.retried} /> : this.props.children;
  }
}
