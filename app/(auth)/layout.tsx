import Link from "next/link";

// Sign-in and sign-up share the canvas, the wordmark and one centered card.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-canvas px-6 py-16">
      <Link href="/" className="font-display text-wordmark text-ink">
        Wherefore
      </Link>
      <div className="w-full max-w-md rounded-card bg-surface px-8 py-10 sm:px-12 sm:py-12">{children}</div>
      <p className="max-w-sm text-center text-body text-text-2">
        Itineraries built from what your client already loves.
      </p>
    </main>
  );
}
