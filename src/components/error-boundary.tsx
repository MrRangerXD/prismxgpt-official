/**
 * Reusable React error boundary.
 *
 * TanStack Router's route-level `errorComponent` catches loader errors and
 * errors thrown during the initial render of a route component, but it
 * cannot catch errors thrown *inside* portals or lazy sub-trees mounted
 * after the route has committed (modals, sheets, popovers). Wrap those
 * sub-trees in this boundary so a broken modal never white-screens the
 * whole app — the surrounding page keeps working and the user just sees a
 * small inline fallback.
 *
 * The boundary is intentionally silent by default (`fallback={null}`) for
 * cases like optional modal chrome, but callers can pass a rendered
 * fallback and/or an `onError` callback for logging.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: unknown, info: ErrorInfo) => void;
  /** Tag used when forwarding the error to Lovable's reporter. */
  boundary?: string;
};

type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Always surface in the console so dev sessions still see the stack.
    console.error("[ErrorBoundary]", error, info);
    this.props.onError?.(error, info);
    try {
      reportLovableError(error, {
        boundary: this.props.boundary ?? "component_error_boundary",
      });
    } catch {
      // Reporting is best-effort — never let it mask the original error.
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
