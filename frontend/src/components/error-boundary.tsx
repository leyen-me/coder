"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  className?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[error boundary]", error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        className={
          this.props.className ??
          "flex min-h-0 flex-1 items-center justify-center bg-background px-6 py-8"
        }
        role="alert"
      >
        <div className="flex max-w-md flex-col gap-3 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <div className="space-y-1">
            <h2 className="font-semibold text-lg">
              {this.props.title ?? "Something went wrong"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {this.props.description ??
                "A rendering error interrupted this view. You can retry this section or reload the app."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={this.handleRetry} type="button" variant="secondary">
              Retry
            </Button>
            <Button onClick={this.handleReload} type="button">
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
