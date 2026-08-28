import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n/index.js'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 text-red-500 text-sm">
            <div>{i18n.t('common.load_error')}</div>
            <button
              type="button"
              onClick={this.reset}
              className="mt-2 px-3 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
            >
              {i18n.t('common.retry')}
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
