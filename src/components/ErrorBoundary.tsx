import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-200 border border-rose-500/30 rounded-xl m-2 select-text">
          <div className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl mb-3 shadow-lg shadow-rose-500/10">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider mb-1">
            {this.props.fallbackTitle || 'Component Execution Guard'}
          </h3>

          <p className="text-xs text-slate-400 text-center max-w-md mb-4 leading-relaxed">
            {this.props.fallbackMessage ||
              'A runtime error was intercepted safely by the SynapseVault error boundary. The rest of the application remains functional.'}
          </p>

          {this.state.error && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 max-w-md w-full mb-4 text-[10px] font-mono text-rose-300/80 overflow-x-auto whitespace-pre-wrap">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <button
            onClick={this.handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Reset Component State</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
