"use client";

export default function DashboardError({ reset }: { reset: () => void }) {
  return <section className="studio-panel" aria-live="polite">
    <h1>Studio request failed</h1>
    <p>The data could not be loaded. Try again.</p>
    <button className="button" onClick={reset}>Try again</button>
  </section>;
}
