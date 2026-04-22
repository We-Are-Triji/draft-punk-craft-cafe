import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Coffee, Eye, EyeOff } from "lucide-react";
import heroImg from "@/assets/draft-punk-craft-cafe.jpg";
import {
  getRememberSessionPreference,
  getSupabaseClient,
  setRememberSessionPreference,
} from "@/lib/supabaseClient";

const REMEMBERED_EMAIL_STORAGE_KEY = "draftpunk.rememberedEmail";

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(getRememberSessionPreference);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY);

    if (rememberedEmail) {
      setEmail(rememberedEmail);
    }
  }, []);

  const handleEmailPasswordLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      setRememberSessionPreference(rememberMe);

      if (typeof window !== "undefined") {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, normalizedEmail);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
        }
      }

      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setPassword("");
        setShowPassword(false);
        return;
      }

      onLogin();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to login right now. Please try again."
      );
      setPassword("");
      setShowPassword(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-background dark:to-background p-4">
      <div className="flex w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl border border-amber-200/60 dark:border-border bg-card">
        {/* Left — Form */}
        <div className="flex flex-col justify-between w-full md:w-1/2 p-8 md:p-10">
          <div>
            {/* Brand */}
            <div className="flex items-center gap-2 mb-10">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-800 text-white">
                <Coffee className="w-4 h-4" />
              </div>
              <span className="font-semibold tracking-wide text-foreground">
                DRAFT PUNK
              </span>
            </div>

            {/* Heading */}
            <h1 className="text-2xl font-bold text-foreground">Login</h1>
            <p className="text-sm text-muted-foreground mt-1 mb-8">
              Craft Cafe Inventory Management System
            </p>

            {/* Form fields */}
            <form className="flex flex-col gap-4" onSubmit={handleEmailPasswordLogin}>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="rounded-lg py-5"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="rounded-lg py-5 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="rounded border-border accent-amber-800"
                />
                <span className="text-muted-foreground">Remember Me</span>
              </label>

              {errorMessage ? (
                <p className="text-sm text-destructive">{errorMessage}</p>
              ) : null}

              <Button
                type="submit"
                className="w-full rounded-full py-5 bg-amber-800 hover:bg-amber-900 text-white font-medium mt-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Logging in..." : "Login"}
              </Button>
            </form>
          </div>
        </div>

        {/* Right — Hero image */}
        <div className="hidden md:block w-1/2 relative">
          <img
            src={heroImg}
            alt="Draft Punk Craft Cafe"
            className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "60% center" }}
          />
        </div>
      </div>
    </div>
  );
}
