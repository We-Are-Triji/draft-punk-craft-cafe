import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface IngredientOption {
  name: string;
  unit: string;
}

interface IngredientComboboxProps {
  options: IngredientOption[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function IngredientCombobox({
  options,
  value,
  onChange,
  placeholder = "Select or type...",
  className,
  id,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  const handleSelect = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (!open) setOpen(true);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30",
          className
        )}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {filtered.map((opt) => (
            <li
              key={opt.name}
              onMouseDown={() => handleSelect(opt.name)}
              className={cn(
                "px-2.5 py-1.5 text-xs cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors",
                opt.name === value && "bg-amber-50 dark:bg-amber-950/20 font-medium"
              )}
            >
              {opt.name} <span className="text-muted-foreground">({opt.unit})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
