import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageCheck, PackageMinus, Eye, Trash2 } from "lucide-react";

const stats = [
  {
    title: "Stock In Today",
    value: "24",
    icon: PackageCheck,
    color: "text-green-500",
  },
  {
    title: "Stock Out Today",
    value: "18",
    icon: PackageMinus,
    color: "text-blue-500",
  },
  {
    title: "Sample Items",
    value: "5",
    icon: Eye,
    color: "text-purple-500",
  },
  {
    title: "Wastage Items",
    value: "3",
    icon: Trash2,
    color: "text-red-500",
  },
];

export function StatsCards() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
