import type { ReactNode } from "react";

export function AuthCard({ title, description, children }: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <img src="/assets/favicon.svg" alt="" width="40" height="40" />
          <span>ARCH ACRE <small>Studio</small></span>
        </div>
        <h1 id="auth-title">{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </section>
    </main>
  );
}
