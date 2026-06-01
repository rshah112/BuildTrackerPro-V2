import { Component, type ReactNode } from 'react'
import { isChunkError, reloadOnceForChunk, clearChunkReloadGuard } from '../lib/chunkReload'

interface State {
  error: Error | null
}

/** Catches render/lazy-import errors so a single screen failure can't black out the whole
 *  app. On a stale-chunk error (common after a deploy when reopening the installed PWA) it
 *  auto-reloads once; otherwise it shows a recovery screen. Key it by route (pathname) so
 *  navigating elsewhere clears the error. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    if (isChunkError(error)) reloadOnceForChunk()
  }

  private retry = () => {
    clearChunkReloadGuard()
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-screen" role="alert">
          <h1>Something went wrong</h1>
          <p className="muted">The app hit an unexpected error. Reloading usually fixes it.</p>
          <button type="button" className="btn btn-primary" onClick={this.retry}>
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
