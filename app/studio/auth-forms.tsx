"use client";

import { useActionState } from "react";
import { beginEnrollment, confirmFactor, sendPasswordReset, signIn, updatePassword } from "./auth-actions";

function Feedback({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="notice error" role="alert">{error}</p>;
  return message ? <p className="notice" role="status">{message}</p> : null;
}

export function LoginForm({ disabled }: { disabled: boolean }) {
  const [feedback, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} className="auth-fields">
      <label>Email address<input name="email" autoComplete="username" type="email" required maxLength={254} /></label>
      <label>Password<input name="password" autoComplete="current-password" type="password" required maxLength={256} /></label>
      <Feedback {...feedback} />
      <button className="primary" disabled={pending || disabled}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export function ForgotForm({ disabled }: { disabled: boolean }) {
  const [feedback, action, pending] = useActionState(sendPasswordReset, {});
  return (
    <form action={action} className="auth-fields">
      <label>Email address<input name="email" autoComplete="email" type="email" required maxLength={254} /></label>
      <Feedback {...feedback} />
      <button className="primary" disabled={pending || disabled}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

export function ResetForm() {
  const [feedback, action, pending] = useActionState(updatePassword, {});
  return (
    <form action={action} className="auth-fields">
      <label>New password<input name="password" autoComplete="new-password" type="password" required minLength={12} maxLength={72} /></label>
      <label>Confirm new password<input name="confirmation" autoComplete="new-password" type="password" required minLength={12} maxLength={72} /></label>
      <Feedback {...feedback} />
      <button className="primary" disabled={pending}>{pending ? "Saving…" : "Update password"}</button>
    </form>
  );
}

type Factor = { id: string; name: string };

function CodeForm({ factors, next }: { factors: Factor[]; next: "reset" | "studio" }) {
  const [feedback, action, pending] = useActionState(confirmFactor, {});
  return (
    <form action={action} className="auth-fields">
      <input name="next" type="hidden" value={next} />
      {factors.length === 1 ? <input name="factor" type="hidden" value={factors[0].id} /> : (
        <label>Authenticator
          <select name="factor" required>
            {factors.map(factor => <option key={factor.id} value={factor.id}>{factor.name}</option>)}
          </select>
        </label>
      )}
      <label>Authentication code
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      </label>
      <Feedback {...feedback} />
      <button className="primary" disabled={pending}>{pending ? "Verifying…" : "Verify"}</button>
    </form>
  );
}

export function AuthenticatorForm({ factors, next }: { factors: Factor[]; next: "reset" | "studio" }) {
  const [setup, action, pending] = useActionState(beginEnrollment, {});
  if (factors.length) return <CodeForm factors={factors} next={next} />;

  return setup.id ? (
    <>
      <p>Scan this code in your authenticator app, then enter the six-digit code it generates.</p>
      <img src={setup.qr} width="168" height="168" alt="Authenticator setup QR code" />
      <details>
        <summary>Enter setup key manually</summary>
        <code>{setup.secret}</code>
      </details>
      <CodeForm factors={[{ id: setup.id, name: "Studio" }]} next={next} />
    </>
  ) : (
    <form action={action} className="auth-fields">
      <Feedback {...setup} />
      <button className="primary" disabled={pending}>{pending ? "Preparing…" : "Set up authenticator"}</button>
    </form>
  );
}
