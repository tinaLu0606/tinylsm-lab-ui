import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react'

interface State {
  error?: Error
}

export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('TinyLSM Lab render failure', error, info)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="fatal-error">
          <p className="eyebrow">Frontend failure</p>
          <h1>TinyLSM Lab could not render</h1>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload interface
          </button>
        </main>
      )
    }
    return this.props.children
  }
}

