import { Dashboard } from './Dashboard';
import { PinView } from './PinView';
import { CaptureOverlay } from './CaptureOverlay';
import { CaptureHub } from './CaptureHub';
import { CaptureLauncher } from './CaptureLauncher';
import { AiAssistantWindow } from './AiAssistantWindow';
import { ToastViewport } from './components/ToastViewport';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

// ---------------------------------------------------------------------------
// Route configuration table
// ---------------------------------------------------------------------------

type RouteConfig = {
  view: string;
  component: () => JSX.Element;
};

const ROUTES: RouteConfig[] = [
  {
    view: 'pin',
    component: () => {
      const query = new URLSearchParams(window.location.search);
      const recordId = query.get('recordId') ?? '';
      const cardId = query.get('cardId') ?? recordId;
      return <PinView recordId={recordId} cardId={cardId} />;
    }
  },
  {
    view: 'capture-overlay',
    component: () => <CaptureOverlay />
  },
  {
    view: 'capture-hub',
    component: () => <CaptureHub />
  },
  {
    view: 'capture-launcher',
    component: () => <CaptureLauncher />
  },
  {
    view: 'ai-assistant',
    component: () => <AiAssistantWindow />
  }
];

function resolveView(view: string | null): JSX.Element {
  const matched = view ? ROUTES.find((route) => route.view === view) : undefined;
  return matched ? matched.component() : <Dashboard />;
}

interface RendererErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class RendererErrorBoundary extends Component<{ children: ReactNode }, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = {
    hasError: false,
    message: ''
  };

  static getDerivedStateFromError(error: unknown): RendererErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'unknown-render-error';
    return {
      hasError: true,
      message
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[renderer] uncaught render error', {
      error,
      componentStack: info.componentStack
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f3',
          color: '#1f1f1f',
          fontFamily: 'SF Pro Text, system-ui, sans-serif'
        }}
      >
        <div
          style={{
            width: 'min(520px, 90vw)',
            background: '#ffffff',
            border: '1px solid rgba(31,31,31,0.1)',
            borderRadius: '14px',
            padding: '18px 20px',
            boxShadow: '0 14px 28px rgba(0,0,0,0.08)'
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>控制面板渲染失败</h2>
          <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            当前窗口遇到运行时异常，已进入安全兜底界面。你可以点击下方按钮重试。
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>错误信息: {this.state.message || 'unknown'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 14,
              height: 32,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid rgba(31,31,31,0.14)',
              background: '#ffffff',
              cursor: 'pointer'
            }}
          >
            重新加载控制面板
          </button>
        </div>
      </main>
    );
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App(): JSX.Element {
  const query = new URLSearchParams(window.location.search);
  const view = query.get('view');

  return (
    <RendererErrorBoundary>
      {resolveView(view)}
      <ToastViewport />
    </RendererErrorBoundary>
  );
}
