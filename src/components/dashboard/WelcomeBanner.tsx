import { Coffee, CalendarDays } from "lucide-react";

export function WelcomeBanner() {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-900 via-amber-800 to-amber-700 shadow-lg">
      {/* Subtle noise texture via layered gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-20%,rgba(255,255,255,0.08),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(0,0,0,0.15),transparent)]" />

      <div className="relative flex items-center justify-between gap-4 px-7 py-7">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-white shrink-0 ring-1 ring-white/10">
            <Coffee className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-white/50 text-[11px] font-medium mb-1.5">
              <CalendarDays className="w-3 h-3" />
              <span>{dateStr}</span>
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight tracking-tight">
              {greeting}, <span className="text-amber-200">Barista</span> ☕
            </h1>
            <p className="text-sm text-white/60 mt-1.5">
              Here's your inventory overview for today
            </p>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-white/30 text-xs shrink-0 bg-white/5 rounded-xl px-4 py-2.5 ring-1 ring-white/10">
          <CalendarDays className="w-3.5 h-3.5" />
          <span className="font-medium">{dateStr}</span>
        </div>
      </div>
    </div>
  );
}
