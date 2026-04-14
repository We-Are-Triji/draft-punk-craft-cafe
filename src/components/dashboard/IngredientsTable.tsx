import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  measurement: string;
}

const ingredients: Ingredient[] = [
  { id: "1", name: "Milk", quantity: 0.94, measurement: "liters" },
  { id: "2", name: "Choco Powder", quantity: 3.97, measurement: "kilograms" },
  { id: "3", name: "Sugar", quantity: 5.2, measurement: "kilograms" },
  { id: "4", name: "Coffee Beans", quantity: 2.1, measurement: "kilograms" },
  { id: "5", name: "Vanilla Syrup", quantity: 1.5, measurement: "liters" },
];

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
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">
          Ingredients List
        </CardTitle>
        <Button
          variant="default"
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          Download CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <Input
            placeholder="Search.."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
            <span className="font-medium">Show {PAGE_SIZE}</span>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient Name</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Measurement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((ingredient) => (
              <TableRow key={ingredient.id}>
                <TableCell>{ingredient.name}</TableCell>
                <TableCell>{ingredient.quantity}</TableCell>
                <TableCell>{ingredient.measurement}</TableCell>
              </TableRow>
            ))}
            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No ingredients found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages || 1}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
