import { Card, CardContent } from "@/components/ui/card";
import { Coffee } from "lucide-react";

export function WelcomeBanner() {
  return (
    <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
      <CardContent className="flex flex-col items-center gap-3 py-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-800 text-white">
          <Coffee className="w-6 h-6" />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Welcome to Draft Punk Craft Cafe Inventory Management System
        </p>
      </CardContent>
    </Card>
  );
}
