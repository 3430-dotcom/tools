import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, an error thrown during React's render phase unmounts the
 * entire tree with nothing shown -- a fully blank page, indistinguishable
 * from "nothing happened" on a browser with no console access.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            height: '100vh',
            padding: 24,
            textAlign: 'center',
            background: '#0b0d12',
            color: '#e8eaf0',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>문제가 발생했습니다</h2>
          <p style={{ margin: 0, maxWidth: 480, color: '#8a91a6', fontSize: 13, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: '9px 18px',
              borderRadius: 8,
              border: '1px solid #2a3145',
              background: '#1a1f2e',
              color: '#e8eaf0',
              cursor: 'pointer',
            }}
          >
            새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
