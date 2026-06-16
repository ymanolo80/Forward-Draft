import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | undefined;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Forward Draft crashed", error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            maxWidth: 520,
            margin: "12vh auto",
            padding: "0 24px",
            textAlign: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Forward Draft hit a problem</h1>
          <p style={{ opacity: 0.8, lineHeight: 1.5 }}>
            The app ran into an unexpected error. Your saved project files are stored separately and should be safe.
          </p>
          <pre
            style={{
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "rgba(127, 127, 127, 0.12)",
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              margin: "16px 0",
            }}
          >
            {this.state.error.message}
          </pre>
          <button onClick={this.handleReload} style={{ padding: "10px 18px", fontSize: 15, borderRadius: 8, cursor: "pointer" }}>
            Reload Forward Draft
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
