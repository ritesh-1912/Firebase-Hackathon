import { Component, type ErrorInfo, type ReactNode } from 'react';

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
        <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-[#FBFBF9] text-[#141413]">
          <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E6E6E2] rounded-lg p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="font-serif text-lg font-medium text-[#141413]">
                {this.props.fallbackTitle || 'Component Error'}
              </h3>
              <p className="text-[13px] text-[#63635E] leading-relaxed">
                {this.props.fallbackMessage ||
                  'An unexpected rendering error occurred. Resetting the view restores normal operation.'}
              </p>
            </div>

            {this.state.error && (
              <div className="bg-[#FBFBF9] border border-[#E6E6E2] rounded-md p-2.5 text-[12px] font-mono text-[#B91C1C] overflow-x-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <button
              type="button"
              onClick={this.handleReset}
              className="h-8 px-3.5 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[13px] font-medium transition duration-150 cursor-pointer"
            >
              Reset view
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
