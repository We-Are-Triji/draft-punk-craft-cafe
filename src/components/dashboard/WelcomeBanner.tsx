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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-900 via-amber-800 to-amber-700 shadow-lg">
      {/* Decorative shapes */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/[0.04]" />
      <div className="absolute top-4 right-20 w-28 h-28 rounded-full bg-white/[0.03]" />
      <div className="absolute -bottom-8 right-40 w-24 h-24 rounded-full bg-white/[0.03]" />
      <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-white/[0.02]" />

      <div className="relative flex items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-white shrink-0">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-white/40 text-[11px] mb-1">
              <CalendarDays className="w-3 h-3" />
              <span>{dateStr}</span>
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">
              {greeting}, <span className="text-amber-200">Barista</span> ☕
            </h1>
            <p className="text-sm text-white/50 mt-1">
              Here's your inventory overview for today
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-white/40 text-xs shrink-0">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{dateStr}</span>
        </div>
      </div>
    </div>
  );
}
