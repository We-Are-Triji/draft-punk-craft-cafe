import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LowStockAlertProps {
  count: number;
}

export function LowStockAlert({ count }: LowStockAlertProps) {
  return (
    <Card className="border-2 border-red-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-center">
          Number of Low Stock Ingredients
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold text-center text-amber-500">{count}</p>
      </CardContent>
    </Card>
  );
}
