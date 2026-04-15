import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  max: number;
  measurement: string;
  category: string;
  lastUpdated: string;
}

const ingredients: Ingredient[] = [
  { id: "1", name: "Milk", quantity: 0.94, max: 5, measurement: "liters", category: "Dairy", lastUpdated: "2 min ago" },
  { id: "2", name: "Choco Powder", quantity: 3.97, max: 10, measurement: "kilograms", category: "Powder", lastUpdated: "1 hr ago" },
  { id: "3", name: "Sugar", quantity: 5.2, max: 15, measurement: "kilograms", category: "Sweetener", lastUpdated: "3 hrs ago" },
  { id: "4", name: "Coffee Beans", quantity: 2.1, max: 8, measurement: "kilograms", category: "Beans", lastUpdated: "30 min ago" },
  { id: "5", name: "Vanilla Syrup", quantity: 1.5, max: 6, measurement: "liters", category: "Syrup", lastUpdated: "45 min ago" },
];

function getStatus(qty: number, max: number) {
  const pct = qty / max;
  if (pct <= 0.2) return { label: "Critical", color: "text-red-600 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/40" };
  if (pct <= 0.4) return { label: "Low", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/40" };
  return { label: "Normal", color: "text-green-600 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900/40" };
}

const PAGE_SIZE = 5;

export function IngredientsTable() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-sm font-semibold">
            Ingredients Inventory
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {ingredients.length} items tracked
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search ingredients..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 max-w-xs h-9 text-sm"
          />
        </div>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Ingredient</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Category</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Quantity</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Level</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((item) => {
                const status = getStatus(item.quantity, item.max);
                const pct = Math.round((item.quantity / item.max) * 100);
                return (
                  <TableRow key={item.id} className="hover:bg-muted/20">
                    <TableCell className="text-sm font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.quantity} {item.measurement}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              pct <= 20
                                ? "bg-red-500"
                                : pct <= 40
                                  ? "bg-amber-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-[11px] text-muted-foreground">
                      {item.lastUpdated}
                    </TableCell>
                  </TableRow>
                );
              })}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No ingredients found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
