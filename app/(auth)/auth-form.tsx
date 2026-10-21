"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth/client";
import { authErrorMessage, validateAuthForm, type AuthMode } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";

// The one form behind /sign-in and /sign-up. Email and password go through the
// auth client (our /api/auth proxy sets the session cookie), then a full page
// load to the destination so the server renders with the new session.

const COPY = {
  "sign-in": {
    title: "Sign in",
    submit: "Sign in",
    pending: "Signing in",
    google: "Sign in with Google",
    switchText: "New to Tastebrief?",
    switchLink: "Create an account",
    switchHref: "/sign-up",
  },
  "sign-up": {
    title: "Create your account",
    submit: "Create account",
    pending: "Creating account",
    google: "Sign up with Google",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/sign-in",
  },
} as const;

function nextPath(): string {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fields = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    const invalid = validateAuthForm(fields, mode);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setNotice(null);
    setPending("email");
    try {
      if (mode === "sign-in") {
        const { error: authError } = await authClient.signIn.email({
          email: fields.email,
          password: fields.password,
        });
        if (authError) {
          setError(authErrorMessage(authError, mode));
          return;
        }
      } else {
        const { data, error: authError } = await authClient.signUp.email({
          email: fields.email,
          password: fields.password,
          name: fields.name.trim(),
        });
        if (authError) {
          setError(authErrorMessage(authError, mode));
          return;
        }
        if (!data?.token) {
          setNotice("Check your inbox. Open the confirmation link we sent, then sign in.");
          return;
        }
      }
      window.location.assign(nextPath());
    } catch {
      setError(authErrorMessage(null, mode));
    } finally {
      setPending((current) => (current === "email" ? null : current));
    }
  }

  async function onGoogle() {
    setError(null);
    setPending("google");
    try {
      const { error: authError } = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}${nextPath()}`,
      });
      if (authError) {
        setError("Google sign-in did not start. Try again, or use your email and password.");
        setPending(null);
      }
    } catch {
      setError("Google sign-in did not start. Try again, or use your email and password.");
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-title text-ink">{copy.title}</h1>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        {mode === "sign-up" ? (
          <Field label="Your name" name="name" type="text" autoComplete="name" />
        ) : null}
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
        />

        {error ? (
          <p role="alert" className="text-body text-amber">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-body text-text-2">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending !== null}
          className="mt-2 h-12 rounded-pill bg-ink px-6 text-body text-surface-raised transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending === "email" ? copy.pending : copy.submit}
        </button>
      </form>

      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px flex-1 bg-rule" />
        <span className="label-caps text-text-2">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        disabled={pending !== null}
        className="h-12 rounded-pill border border-pill-outline px-6 text-body text-ink transition-colors hover:bg-surface-raised disabled:opacity-60"
      >
        {pending === "google" ? "Opening Google" : copy.google}
      </button>

      <p className="text-body text-text-2">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
          {copy.switchLink}
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label-caps text-text-2">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full rounded-none border-0 border-b border-rule bg-transparent py-2 font-sans text-body-lg text-ink transition-colors placeholder:text-text-2 hover:border-rule-strong focus:border-ink focus:outline-none focus-visible:outline-none"
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-body text-text-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
