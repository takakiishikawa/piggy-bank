"use client";

import { useState } from "react";
import { PiggyBank } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@takaki/go-design-system";

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.26A7.2 7.2 0 0 1 4.86 12c0-.78.14-1.54.38-2.26V6.63H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.37l4-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.11C6.22 6.89 8.87 4.77 12 4.77z" />
    </svg>
  );
}

export default function LoginPageRoute() {
  const [loading, setLoading] = useState(false);

  async function handleGoogleSignIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/gmail.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: "var(--color-primary-subtle)", opacity: 0.6 }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full blur-3xl"
        style={{ backgroundColor: "var(--color-primary-subtle)", opacity: 0.4 }}
      />

      <Card
        className="relative w-full max-w-sm rounded-2xl p-8"
        style={{
          borderColor: "var(--color-border-default)",
          boxShadow: "0 1px 2px rgba(120,72,10,.04), 0 8px 24px rgba(120,72,10,.08)",
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-primary-subtle)" }}
          >
            <PiggyBank size={26} style={{ color: "var(--color-primary)" }} />
          </div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            PiggyBank
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
            Keep your base spending low, spend freely when it counts.
          </p>
        </div>

        <Button
          type="button"
          size="lg"
          className="mt-7 w-full gap-3 text-base transition-all hover:opacity-90 active:scale-[0.98]"
          onClick={handleGoogleSignIn}
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <GoogleIcon size={18} />
          )}
          {loading ? "Signing in..." : "Continue with Google"}
        </Button>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--color-text-subtle)" }}>
          By continuing, you agree to our{" "}
          <a
            href="/terms"
            className="underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-subtle)" }}
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--color-text-subtle)" }}
          >
            Privacy Policy
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
