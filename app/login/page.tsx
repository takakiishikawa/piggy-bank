"use client";

import { LoginPage } from "@takaki/go-design-system";
import { createClient } from "@/lib/supabase/client";
import { PiggyBank } from "lucide-react";

export default function LoginPageRoute() {
  async function handleGoogleSignIn() {
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
    <LoginPage
      productName="PiggyBank"
      productLogo={<PiggyBank size={24} style={{ color: "var(--color-primary)" }} />}
      tagline="Keep your base spending low, spend freely when it counts."
      onGoogleSignIn={handleGoogleSignIn}
    />
  );
}
