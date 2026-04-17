import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Coffee, Eye, EyeOff } from "lucide-react";
import heroImg from "@/assets/draft-punk-craft-cafe.jpg";
import { getSupabaseClient } from "@/lib/supabaseClient";

interface LoginScreenProps {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      onLogin();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to login right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-amber-900/20 dark:bg-background p-4">
      <div className="flex w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl border border-amber-200 dark:border-amber-800 bg-card">
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

            {/* Google button */}
            <Button
              variant="outline"
              className="w-full rounded-full py-5 font-medium"
              disabled
              title="Google login is intentionally disabled for this demo."
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground uppercase">or</span>
              <Separator className="flex-1" />
            </div>

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
