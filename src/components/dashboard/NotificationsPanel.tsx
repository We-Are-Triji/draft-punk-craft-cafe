import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, PackageCheck, CameraIcon, Bell } from "lucide-react";

const notifications = [
  {
    id: "1",
    icon: AlertTriangle,
    iconColor: "text-red-500",
    iconBg: "bg-red-50 dark:bg-red-950/40",
    title: "Milk critically low",
    detail: "Only 0.94 L remaining",
    time: "2m ago",
  },
  {
    id: "2",
    icon: CameraIcon,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    title: "Latte scanned",
    detail: "Ingredients deducted",
    time: "15m ago",
  },
  {
    id: "3",
    icon: PackageCheck,
    iconColor: "text-green-500",
    iconBg: "bg-green-50 dark:bg-green-950/40",
    title: "Stock received",
    detail: "Coffee Beans +5 kg",
    time: "1h ago",
  },
  {
    id: "4",
    icon: AlertTriangle,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    title: "Vanilla Syrup low",
    detail: "1.5 L remaining",
    time: "2h ago",
  },
  {
    id: "5",
    icon: CameraIcon,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    title: "Cappuccino scanned",
    detail: "Ingredients deducted",
    time: "3h ago",
  },
];

export function NotificationsPanel() {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
            <Bell className="w-4 h-4 text-amber-700" />
          </div>
          <CardTitle className="text-sm font-semibold">Activity</CardTitle>
        </div>
        <Badge variant="secondary" className="text-[10px] h-5">
          {notifications.length} new
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-default"
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${n.iconBg}`}
            >
              <n.icon className={`w-3.5 h-3.5 ${n.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-medium text-foreground truncate">
                  {n.title}
                </p>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {n.time}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {n.detail}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
