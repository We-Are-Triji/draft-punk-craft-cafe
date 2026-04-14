import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface Notification {
  id: string;
  message: string;
  details: string;
  timestamp: string;
}

const notifications: Notification[] = [
  {
    id: "1",
    message: "Critical level ingredients:",
    details: "- Milk: 0.94 left",
    timestamp: "May 25, 2025, 7:02 AM",
  },
  {
    id: "2",
    message: "Critical level ingredients:",
    details: "- Milk: 0.96 left",
    timestamp: "May 25, 2025, 7:01 AM",
  },
  {
    id: "3",
    message: "Critical level ingredients:",
    details: "- Milk: 0.98 left",
    timestamp: "May 25, 2025, 6:46 AM",
  },
];

export function NotificationsPanel() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notifications.map((n) => (
          <div key={n.id} className="flex gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-foreground font-medium">{n.message}</p>
              <p className="text-muted-foreground">{n.details}</p>
              <p className="text-xs text-muted-foreground mt-1">{n.timestamp}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
