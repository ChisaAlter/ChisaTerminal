import { Component, type ErrorInfo, type ReactNode } from 'react'

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
            <div>组件加载失败，请重载窗口</div>
            <button
              type="button"
              onClick={this.reset}
              className="mt-2 px-3 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
            >
              重试
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
