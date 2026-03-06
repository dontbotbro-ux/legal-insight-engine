import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

let googleScriptPromise: Promise<void> | null = null;

const loadGoogleScript = () => {
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in script."));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
};

const GoogleSignInButton = ({ compact = false }: { compact?: boolean }) => {
  const { setUserFromProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId) {
      alert("Google login is not configured. Set VITE_GOOGLE_CLIENT_ID in .env.local.");
      return;
    }

    setLoading(true);
    try {
      await loadGoogleScript();
      const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: async (response) => {
          if (!response.access_token) {
            setLoading(false);
            return;
          }

          try {
            const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: {
                Authorization: `Bearer ${response.access_token}`,
              },
            });
            if (!userInfoRes.ok) {
              setLoading(false);
              return;
            }

            const profile = (await userInfoRes.json()) as {
              sub?: string;
              name?: string;
              email?: string;
              picture?: string;
            };

            if (!profile.sub) {
              setLoading(false);
              return;
            }

            setUserFromProfile({
              sub: profile.sub,
              name: profile.name ?? "Google User",
              email: profile.email ?? "",
              picture: profile.picture,
            });
          } finally {
            setLoading(false);
          }
        },
      });

      tokenClient?.requestAccessToken({ prompt: "consent" });
    } catch {
      setLoading(false);
      alert("Unable to start Google Sign In. Check popup blockers and try again.");
    }
  };

  return (
    <Button variant="outline" size={compact ? "sm" : "default"} onClick={() => void handleSignIn()} disabled={loading}>
      Sign In
    </Button>
  );
};

export default GoogleSignInButton;
