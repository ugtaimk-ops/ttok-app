import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center bg-slate-50 dark:bg-slate-950">
          <p className="text-lg font-black text-slate-800 dark:text-slate-100">
            문제가 발생했습니다
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
            예상치 못한 오류로 화면을 표시할 수 없습니다. 아래 버튼을 눌러 다시 시도해 주세요.
          </p>
          <button
            onClick={this.handleReload}
            className="mt-2 px-6 py-3 rounded-2xl bg-brand text-white font-black text-sm shadow-md shadow-brand/20"
          >
            다시 시작하기
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
