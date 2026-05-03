import { Component, type ReactNode } from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
          <div className="text-center max-w-sm">
            <h1 className="text-xl font-bold mb-4">出错了</h1>
            <p className="text-sm text-red-400 mb-4 bg-red-900/50 p-3 rounded-lg text-left break-all font-mono">
              {this.state.error?.message || '未知错误'}
            </p>
            <p className="text-xs text-gray-400 mb-2">请截图发给开发者</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
