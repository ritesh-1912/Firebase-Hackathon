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
        <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-[#09090B] text-[#F4F4F5]">
          <div className="max-w-md w-full bg-[#111114] border border-white/[0.08] rounded-xl p-6 text-center space-y-4">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#F4F4F5]">
                {this.props.fallbackTitle || 'Component Execution Guard'}
              </h3>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                {this.props.fallbackMessage ||
                  'An unexpected error was safely intercepted without crashing the workspace.'}
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#09090B] border border-white/[0.08] rounded-lg p-2.5 text-[11px] font-mono text-rose-300 overflow-x-auto text-left">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#18181B] hover:bg-white/[0.08] text-[#F4F4F5] border border-white/[0.08] rounded-lg text-xs font-medium transition duration-150 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#A1A1AA]" />
              <span>Reset View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
