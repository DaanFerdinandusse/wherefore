"use client";

import { Component, type ReactNode } from "react";

// Catches errors thrown by the map script while it mounts, updates or tears
// down (a rejected key can make it throw during cleanup) and shows the
// fallback instead of taking the whole page down.
export class MapErrorBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
