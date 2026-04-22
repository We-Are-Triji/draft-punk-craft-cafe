import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ChevronRight,
  Edit3,
  Save,
  Coffee,
  Utensils,
  Trash2,
  Plus,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { createProduct, deleteProduct, updateProduct } from '@/lib/recipesService';
import type { ProductIngredientInput, ProductWithIngredients } from '@/types/recipes';

interface EditableIngredient {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  price: string;
}

interface ProductDraft {
  name: string;
  category: string;
  description: string;
  is_active: boolean;
  properties: string;
  ingredients: EditableIngredient[];
}

interface NewProductForm {
  name: string;
  category: string;
  description: string;
  properties: string;
}

const INITIAL_NEW_PRODUCT: NewProductForm = {
  name: '',
  category: 'Food',
  description: '',
  properties: '{}',
};

const SKELETON_PRODUCTS_COUNT = 6;
const SKELETON_INGREDIENT_ROWS = 6;

const DEFAULT_INGREDIENT_PRICES: Record<string, number> = {
  rice: 65,
  eggs: 10,
  chicken: 280,
  pork: 320,
  beef: 450,
  milk: 95,
  sugar: 50,
  flour: 45,
  butter: 140,
  oil: 110,
  salt: 15,
  pepper: 30,
  garlic: 25,
  onion: 35,
  tomato: 45,
  cheese: 190,
  cream: 120,
  lemon: 25,
  lime: 20,
  ginger: 40,
  soy: 60,
  vinegar: 55,
  potato: 40,
  carrot: 35,
  celery: 45,
  lettuce: 65,
  bread: 85,
  pasta: 75,
  noodles: 80,
  chocolate: 170,
  vanilla: 250,
  cinnamon: 100,
  coffee: 280,
  tea: 140,
  water: 5,
  gin: 650,
  rum: 550,
  vodka: 600,
  whiskey: 850,
  wine: 450,
  beer: 170,
  coke: 85,
  soda: 65,
  juice: 110,
  syrup: 190,
};

function getDefaultPrice(ingredientName: string): string {
  const normalized = ingredientName.trim().toLowerCase();
  for (const [key, price] of Object.entries(DEFAULT_INGREDIENT_PRICES)) {
    if (normalized.includes(key)) {
      return price.toFixed(2);
    }
  }
  return '55.00';
}

function formatQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(3)));
}

function toProductDraft(product: ProductWithIngredients): ProductDraft {
  return {
    name: product.name,
    category: product.category,
    description: product.description ?? '',
    is_active: product.is_active,
    properties: JSON.stringify(product.properties ?? {}, null, 2),
    ingredients: product.ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      quantity: formatQuantity(ingredient.quantity),
      unit: ingredient.unit,
      price: getDefaultPrice(ingredient.name),
    })),
  };
}

function parseProperties(rawValue: string): Record<string, unknown> {
  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    return {};
  }

  const parsed = JSON.parse(trimmedValue);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Properties must be a JSON object. Example: {"spicy": true}');
  }

  return parsed as Record<string, unknown>;
}

function normalizeIngredientInput(
  draftIngredients: EditableIngredient[]
): ProductIngredientInput[] {
  return draftIngredients
    .map((ingredient, index) => {
      const parsedQuantity = Number(ingredient.quantity);

      return {
        name: ingredient.name.trim(),
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : 0,
        unit: ingredient.unit.trim() || 'pcs',
        sort_order: index,
      };
    })
    .filter((ingredient) => ingredient.name.length > 0);
}

export const RecipesScreen = () => {
  const { products, loading, error, refresh } = useProducts();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'food' | 'drink'>('all');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductForm>(INITIAL_NEW_PRODUCT);
  const [ingredientPrices, setIngredientPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (products.length === 0) {
      setSelectedProductId(null);
      return;
    }

    const selectedStillExists = selectedProductId
      ? products.some((product) => product.id === selectedProductId)
      : false;

    if (!selectedStillExists) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = activeFilter === 'all' || product.category.toLowerCase().includes(activeFilter);
        return matchesSearch && matchesFilter;
      }),
    [products, searchTerm, activeFilter]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const selectedForView = isEditing && draft ? draft : null;

  const getIngredientPrice = (ingredientId: string, ingredientName: string): string => {
    return ingredientPrices[ingredientId] ?? getDefaultPrice(ingredientName);
  };

  const handleChangePrice = (ingredientId: string, value: string) => {
    setIngredientPrices((prev) => ({ ...prev, [ingredientId]: value }));
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    setIsEditing(false);
    setDraft(null);
    setActionError(null);
  };

  const handleStartEdit = () => {
    if (!selectedProduct) {
      return;
    }

    setDraft(toProductDraft(selectedProduct));
    setIsEditing(true);
    setActionError(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
    setActionError(null);
  };

  const handleChangeDraftField = <K extends keyof ProductDraft>(
    field: K,
    value: ProductDraft[K]
  ) => {
    setDraft((previousDraft) => {
      if (!previousDraft) {
        return previousDraft;
      }

      return {
        ...previousDraft,
        [field]: value,
      };
    });
  };

  const handleChangeIngredient = (
    ingredientId: string,
    field: keyof EditableIngredient,
    value: string
  ) => {
    setDraft((previousDraft) => {
      if (!previousDraft) {
        return previousDraft;
      }

      return {
        ...previousDraft,
        ingredients: previousDraft.ingredients.map((ingredient) =>
          ingredient.id === ingredientId ? { ...ingredient, [field]: value } : ingredient
        ),
      };
    });
  };

  const handleAddIngredient = () => {
    setDraft((previousDraft) => {
      if (!previousDraft) {
        return previousDraft;
      }

      return {
        ...previousDraft,
        ingredients: [
          ...previousDraft.ingredients,
          {
            id: `temp-${Date.now()}-${Math.round(Math.random() * 1000)}`,
            name: '',
            quantity: '0',
            unit: 'pcs',
            price: '55.00',
          },
        ],
      };
    });
  };

  const handleDeleteIngredient = (ingredientId: string) => {
    setDraft((previousDraft) => {
      if (!previousDraft) {
        return previousDraft;
      }

      return {
        ...previousDraft,
        ingredients: previousDraft.ingredients.filter(
          (ingredient) => ingredient.id !== ingredientId
        ),
      };
    });
  };

  const handleSave = async () => {
    if (!selectedProduct || !draft) {
      return;
    }

    const trimmedName = draft.name.trim();

    if (!trimmedName) {
      setActionError('Product name is required.');
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      const parsedProperties = parseProperties(draft.properties);

      await updateProduct(selectedProduct.id, {
        name: trimmedName,
        category: draft.category.trim() || 'Food',
        description: draft.description.trim() || null,
        is_active: draft.is_active,
        properties: parsedProperties,
        ingredients: normalizeIngredientInput(draft.ingredients),
      });

      await refresh();
      setIsEditing(false);
      setDraft(null);
    } catch (saveError) {
      setActionError(
        saveError instanceof Error ? saveError.message : 'Failed to save product.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct || isEditing || saving) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedProduct.name}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setActionError(null);

    try {
      await deleteProduct(selectedProduct.id);
      await refresh();
    } catch (deleteError) {
      setActionError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete product.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newProduct.name.trim()) {
      setActionError('New product name is required.');
      return;
    }

    setActionError(null);
    setIsCreating(true);

    try {
      const parsedProperties = parseProperties(newProduct.properties);
      const createdProduct = await createProduct({
        name: newProduct.name.trim(),
        category: newProduct.category.trim() || 'Food',
        description: newProduct.description.trim() || null,
        properties: parsedProperties,
        ingredients: [],
      });

      await refresh();
      setSelectedProductId(createdProduct.id);
      setIsCreateModalOpen(false);
      setNewProduct(INITIAL_NEW_PRODUCT);
    } catch (createError) {
      setActionError(
        createError instanceof Error ? createError.message : 'Failed to create product.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 p-2 h-[calc(100vh-120px)] animate-in fade-in duration-500">
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-black text-gray-800 dark:text-foreground">Add Product</h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewProduct(INITIAL_NEW_PRODUCT);
                }}
                className="text-gray-400 dark:text-muted-foreground hover:text-gray-700 dark:text-foreground transition-colors"
                type="button"
              >
                <X size={20} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleCreateProduct}>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-muted-foreground mb-2">
                  Product Name
                </label>
                <input
                  value={newProduct.name}
                  onChange={(event) =>
                    setNewProduct((previousValue) => ({
                      ...previousValue,
                      name: event.target.value,
                    }))
                  }
                  className="w-full p-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#3E2723]"
                  placeholder="Example: Iced Mocha"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-muted-foreground mb-2">
                    Category
                  </label>
                  <input
                    value={newProduct.category}
                    onChange={(event) =>
                      setNewProduct((previousValue) => ({
                        ...previousValue,
                        category: event.target.value,
                      }))
                    }
                    className="w-full p-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#3E2723]"
                    placeholder="Food or Drinks"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-muted-foreground mb-2">
                    Description
                  </label>
                  <input
                    value={newProduct.description}
                    onChange={(event) =>
                      setNewProduct((previousValue) => ({
                        ...previousValue,
                        description: event.target.value,
                      }))
                    }
                    className="w-full p-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#3E2723]"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-muted-foreground mb-2">
                  Properties JSON
                </label>
                <textarea
                  value={newProduct.properties}
                  onChange={(event) =>
                    setNewProduct((previousValue) => ({
                      ...previousValue,
                      properties: event.target.value,
                    }))
                  }
                  className="w-full min-h-28 p-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-xs font-mono outline-none focus:ring-1 focus:ring-[#3E2723]"
                  placeholder='{"station": "bar"}'
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground text-sm font-bold"
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 py-3 rounded-xl bg-[#3E2723] text-white text-sm font-bold disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="w-full lg:w-1/3 bg-white dark:bg-card rounded-3xl border border-gray-100 dark:border-border shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-50 dark:border-border/50 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-gray-800 dark:text-foreground">Draft Punk Recipes</h2>
            <button
              className="inline-flex items-center gap-2 px-3 py-2 bg-[#3E2723] text-white rounded-xl text-xs font-bold"
              onClick={() => setIsCreateModalOpen(true)}
              type="button"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder={`Search ${products.length} items...`}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-muted/50 border border-gray-100 dark:border-border rounded-xl text-sm focus:ring-1 focus:ring-[#3E2723] outline-none"
              />
            </div>

            <div className="flex gap-2 p-1 bg-gray-50 dark:bg-muted/50 rounded-xl border border-gray-100 dark:border-border">
              {(['all', 'food', 'drink'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                    activeFilter === filter
                      ? 'bg-white dark:bg-card text-[#3E2723] dark:text-amber-400 shadow-sm'
                      : 'text-gray-400 dark:text-muted-foreground hover:text-gray-600 dark:hover:text-foreground'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: SKELETON_PRODUCTS_COUNT }).map((_, index) => (
                <div key={`product-skeleton-${index}`} className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-200 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-3 w-40 rounded bg-gray-200 animate-pulse" />
                      <div className="h-2 w-20 rounded bg-gray-100 dark:bg-muted animate-pulse" />
                    </div>
                  </div>
                  <div className="w-4 h-4 rounded bg-gray-100 dark:bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!loading && filteredProducts.length === 0 && (
            <p className="p-6 text-sm text-gray-400 dark:text-muted-foreground font-semibold">No products found.</p>
          )}

          {!loading &&
            filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product.id)}
                className={`w-full p-5 flex items-center justify-between group transition-all ${
                  selectedProductId === product.id
                    ? 'bg-[#FFF5F0] dark:bg-amber-950/30 border-l-4 border-l-[#3E2723]'
                    : 'hover:bg-gray-50 dark:hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3 text-left">
                  <div
                    className={`p-2 rounded-lg transition-colors ${
                      selectedProductId === product.id
                        ? 'bg-[#3E2723] text-white'
                        : 'bg-gray-100 dark:bg-muted text-gray-400 dark:text-muted-foreground'
                    }`}
                  >
                    {product.category.toLowerCase().includes('drink') ? (
                      <Coffee size={18} />
                    ) : (
                      <Utensils size={18} />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-foreground text-sm tracking-tight">
                      {product.name}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-bold uppercase tracking-widest">
                      {product.category}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className={
                    selectedProductId === product.id ? 'text-[#3E2723]' : 'text-gray-200 dark:text-muted-foreground'
                  }
                />
              </button>
            ))}
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-card rounded-3xl border border-gray-100 dark:border-border shadow-sm flex flex-col overflow-hidden">
        {loading && (
          <>
            <div className="p-8 border-b border-gray-50 dark:border-border/50 bg-gray-50 dark:bg-muted/30">
              <div className="h-10 w-80 max-full rounded-xl bg-gray-200 dark:bg-muted animate-pulse" />
              <div className="h-3 w-64 max-full rounded mt-3 bg-gray-100 dark:bg-muted animate-pulse" />

              <div className="flex flex-wrap gap-3 mt-7">
                <div className="h-12 w-40 rounded-2xl bg-gray-200 dark:bg-muted animate-pulse" />
                <div className="h-12 w-40 rounded-2xl bg-gray-100 dark:bg-muted animate-pulse" />
              </div>
            </div>

            <div className="p-8 flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-300 dark:text-muted-foreground uppercase tracking-widest border-b border-gray-100 dark:border-border">
                    <th className="pb-4 px-2">Ingredient Name</th>
                    <th className="pb-4 px-2 w-36">Qty</th>
                    <th className="pb-4 px-2 w-32">Unit</th>
                    <th className="pb-4 px-2 w-32">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-border/50">
                  {Array.from({ length: SKELETON_INGREDIENT_ROWS }).map((_, index) => (
                    <tr key={`ingredient-skeleton-${index}`}>
                      <td className="py-5 px-2">
                        <div className="h-4 w-48 max-full rounded bg-gray-200 animate-pulse" />
                      </td>
                      <td className="py-5 px-2">
                        <div className="h-8 w-20 rounded-xl bg-gray-200 animate-pulse" />
                      </td>
                      <td className="py-5 px-2">
                        <div className="h-4 w-14 rounded bg-gray-100 dark:bg-muted animate-pulse" />
                      </td>
                      <td className="py-5 px-2">
                        <div className="h-4 w-16 rounded bg-gray-100 dark:bg-muted animate-pulse" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!selectedProduct && !loading && (
          <div className="p-8 h-full flex flex-col items-center justify-center text-center">
            <h3 className="text-xl font-black text-gray-800 dark:text-foreground">No Product Selected</h3>
            <p className="text-sm text-gray-400 dark:text-muted-foreground mt-2 mb-6">
              Add your first product to start managing recipe ingredients.
            </p>
            <button
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#3E2723] text-white font-bold text-sm"
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={16} /> Add Product
            </button>
          </div>
        )}

        {!loading && selectedProduct && (
          <>
            <div className="p-8 border-b border-gray-50 dark:border-border/50 bg-gray-50 dark:bg-muted/30 space-y-4">
              {selectedForView ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <input
                      value={selectedForView.name}
                      onChange={(event) =>
                        handleChangeDraftField('name', event.target.value)
                      }
                      className="w-full p-3 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card text-2xl font-black tracking-tight text-gray-800 dark:text-foreground outline-none focus:ring-1 focus:ring-[#3E2723]"
                    />
                    <input
                      value={selectedForView.category}
                      onChange={(event) =>
                        handleChangeDraftField('category', event.target.value)
                      }
                      className="w-full p-3 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card text-sm font-bold text-gray-700 dark:text-foreground outline-none focus:ring-1 focus:ring-[#3E2723]"
                    />
                  </div>

                  <textarea
                    value={selectedForView.description}
                    onChange={(event) =>
                      handleChangeDraftField('description', event.target.value)
                    }
                    className="w-full p-3 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card text-sm text-gray-700 dark:text-foreground outline-none focus:ring-1 focus:ring-[#3E2723]"
                    placeholder="Description (optional)"
                  />

                  <label className="inline-flex items-center gap-3 text-sm font-bold text-gray-700 dark:text-foreground">
                    <input
                      type="checkbox"
                      checked={selectedForView.is_active}
                      onChange={(event) =>
                        handleChangeDraftField('is_active', event.target.checked)
                      }
                    />
                    Product is active
                  </label>
                </>
              ) : (
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-black text-gray-800 dark:text-foreground tracking-tighter uppercase">
                      {selectedProduct.name}
                    </h1>
                    <p className="text-gray-400 dark:text-muted-foreground text-xs font-bold uppercase tracking-widest mt-1">
                      {selectedProduct.category} • Bill of Materials Management
                    </p>
                    {selectedProduct.description && (
                      <p className="text-sm text-gray-500 dark:text-muted-foreground mt-2 max-w-2xl">
                        {selectedProduct.description}
                      </p>
                    )}
                    {!selectedProduct.is_active && (
                      <span className="inline-flex items-center mt-3 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-black uppercase tracking-widest">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {!isEditing ? (
                  <>
                    <button
                      onClick={handleStartEdit}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg bg-[#3E2723] text-white"
                      type="button"
                    >
                      <Edit3 size={18} /> Edit Recipe
                    </button>
                    <button
                      onClick={handleDeleteProduct}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 disabled:opacity-50"
                      type="button"
                    >
                      <Trash2 size={18} /> Delete Product
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg bg-emerald-500 text-white disabled:opacity-50"
                      type="button"
                    >
                      <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground disabled:opacity-50"
                      type="button"
                    >
                      <X size={18} /> Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-8 flex-1 overflow-auto">
              {(error || actionError) && (
                <div className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>{actionError ?? error}</span>
                </div>
              )}

              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-300 dark:text-muted-foreground uppercase tracking-widest border-b border-gray-100 dark:border-border">
                    <th className="pb-4 px-2">Ingredient Name</th>
                    <th className="pb-4 px-2 w-36">Qty</th>
                    <th className="pb-4 px-2 w-32">Unit</th>
                    <th className="pb-4 px-2 w-32">Price</th>
                    {isEditing && <th className="pb-4 px-2 w-20 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-border/50">
                  {(selectedForView?.ingredients ?? selectedProduct.ingredients).map((ingredient) => (
                    <tr key={ingredient.id} className="group">
                      <td className="py-5 px-2 font-bold text-gray-700 dark:text-foreground text-lg tracking-tight">
                        {isEditing && selectedForView ? (
                          <input
                            type="text"
                            value={ingredient.name}
                            onChange={(event) =>
                              handleChangeIngredient(
                                ingredient.id,
                                'name',
                                event.target.value
                              )
                            }
                            className="w-full p-2 bg-gray-50 dark:bg-muted/50 border border-gray-200 dark:border-border rounded-xl text-sm font-bold outline-none focus:ring-1 focus:ring-[#3E2723]"
                          />
                        ) : (
                          ingredient.name
                        )}
                      </td>
                      <td className="py-5 px-2">
                        {isEditing && selectedForView ? (
                          <input
                            type="number"
                            step="0.01"
                            value={ingredient.quantity}
                            onChange={(event) =>
                              handleChangeIngredient(
                                ingredient.id,
                                'quantity',
                                event.target.value
                              )
                            }
                            className="w-28 p-2 bg-gray-50 dark:bg-muted/50 border border-gray-200 dark:border-border rounded-xl font-bold text-center outline-none focus:ring-1 focus:ring-[#3E2723]"
                          />
                        ) : (
                          <span className="font-mono font-black text-2xl text-[#3E2723] dark:text-amber-400">
                            {typeof ingredient.quantity === 'number'
                              ? formatQuantity(ingredient.quantity)
                              : ingredient.quantity}
                          </span>
                        )}
                      </td>
                      <td className="py-5 px-2">
                        {isEditing && selectedForView ? (
                          <input
                            type="text"
                            value={ingredient.unit}
                            onChange={(event) =>
                              handleChangeIngredient(
                                ingredient.id,
                                'unit',
                                event.target.value
                              )
                            }
                            className="w-24 p-2 bg-gray-50 dark:bg-muted/50 border border-gray-200 dark:border-border rounded-xl font-bold text-center uppercase outline-none focus:ring-1 focus:ring-[#3E2723]"
                          />
                        ) : (
                          <span className="inline-flex items-center text-[#3E2723] dark:text-amber-400 font-black uppercase text-[10px] tracking-widest">
                            {ingredient.unit}
                          </span>
                        )}
                      </td>
                      <td className="py-5 px-2">
                        {isEditing && selectedForView ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={getIngredientPrice(ingredient.id, ingredient.name)}
                            onChange={(event) =>
                              handleChangePrice(ingredient.id, event.target.value)
                            }
                            className="w-24 p-2 bg-gray-50 dark:bg-muted/50 border border-gray-200 dark:border-border rounded-xl font-bold text-center outline-none focus:ring-1 focus:ring-[#3E2723]"
                          />
                        ) : (
                          <span
                            className="inline-flex items-center gap-0.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer hover:underline"
                            title="Click edit to change price"
                            onClick={handleStartEdit}
                          >
                            ₱{getIngredientPrice(ingredient.id, ingredient.name)}
                          </span>
                        )}
                      </td>
                      {isEditing && selectedForView && (
                        <td className="py-5 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteIngredient(ingredient.id)}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:bg-red-100 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}

                  {!isEditing && selectedProduct.ingredients.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-sm font-semibold text-gray-400 dark:text-muted-foreground">
                        No ingredients yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {isEditing && selectedForView && (
                <>
                  <div className="mt-8 flex gap-4">
                    <button
                      className="flex items-center gap-2 text-gray-400 dark:text-muted-foreground font-bold text-xs hover:text-[#3E2723] transition-colors"
                      onClick={handleAddIngredient}
                      type="button"
                    >
                      <Plus size={16} /> Add Ingredient
                    </button>
                  </div>

                  <div className="mt-8">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-muted-foreground mb-2">
                      Product Properties JSON
                    </label>
                    <textarea
                      value={selectedForView.properties}
                      onChange={(event) =>
                        handleChangeDraftField('properties', event.target.value)
                      }
                      className="w-full min-h-36 p-3 rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 text-xs font-mono text-gray-700 dark:text-foreground outline-none focus:ring-1 focus:ring-[#3E2723]"
                      placeholder='{"station": "kitchen", "tag": "seasonal"}'
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};