import type { ProductIngredientInput, ProductWithIngredients } from '@/types/recipes';

export interface CsvRecipeIngredientsEntry {
  recipeName: string;
  recipeKey: string;
  ingredients: string[];
}

export interface RecipeCsvProductMatch {
  productId: string;
  productName: string;
  matchedCsvRecipeName: string | null;
  inventoryMatchedIngredients: string[];
  missingIngredients: string[];
}

export interface RecipeCsvAuditResult {
  matches: RecipeCsvProductMatch[];
  matchedProductsCount: number;
  productsWithInventoryCoverageCount: number;
  productsWithMissingCount: number;
}

const INGREDIENT_TOKEN_STOP_WORDS = new Set([
  'fresh',
  'dried',
  'dry',
  'large',
  'small',
  'boneless',
  'skinless',
  'ground',
  'toasted',
  'fine',
  'coarse',
  'chunk',
  'chunks',
  'fillet',
  'whole',
  'extra',
  'virgin',
  'sparkling',
]);

const MEASUREMENT_PREFIX_WORDS = new Set([
  'g',
  'kg',
  'mg',
  'ml',
  'l',
  'oz',
  'lb',
  'tsp',
  'tbsp',
  'cup',
  'cups',
  'piece',
  'pieces',
  'pc',
  'pcs',
  'can',
  'cans',
  'gram',
  'grams',
  'milligram',
  'milligrams',
  'milliliter',
  'milliliters',
  'liter',
  'liters',
  'ounce',
  'ounces',
  'pound',
  'pounds',
]);

const RECIPE_TOKEN_STOP_WORDS = new Set(['the', 'and', 'a', 'an']);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string, stopWords: Set<string>): string[] {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .filter((token) => token.length > 0)
    .filter((token) => !stopWords.has(token));
}

function buildRecipeKey(recipeName: string): string {
  return tokenize(recipeName, RECIPE_TOKEN_STOP_WORDS).join(' ');
}

function buildIngredientKey(ingredientName: string): string {
  return tokenize(ingredientName, INGREDIENT_TOKEN_STOP_WORDS).join(' ');
}

function isQuantityToken(token: string): boolean {
  const normalizedToken = token.trim().toLowerCase().replace(/,/g, '');

  return (
    /^\d+(?:\.\d+)?$/.test(normalizedToken) ||
    /^\d+\/\d+$/.test(normalizedToken) ||
    /^\d+\s+\d+\/\d+$/.test(normalizedToken) ||
    /^\d+(?:\.\d+)?[a-z]+$/.test(normalizedToken)
  );
}

function countTokenOverlap(leftTokens: Set<string>, rightTokens: Set<string>): number {
  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function isIngredientMatch(existingIngredient: string, candidateIngredient: string): boolean {
  const existingKey = buildIngredientKey(existingIngredient);
  const candidateKey = buildIngredientKey(candidateIngredient);

  if (!existingKey || !candidateKey) {
    return false;
  }

  if (existingKey === candidateKey) {
    return true;
  }

  if (existingKey.includes(candidateKey) || candidateKey.includes(existingKey)) {
    return true;
  }

  const existingTokens = new Set(existingKey.split(' ').filter((token) => token.length > 0));
  const candidateTokens = new Set(candidateKey.split(' ').filter((token) => token.length > 0));

  if (existingTokens.size === 0 || candidateTokens.size === 0) {
    return false;
  }

  const overlap = countTokenOverlap(existingTokens, candidateTokens);
  const smallestTokenCount = Math.min(existingTokens.size, candidateTokens.size);

  return overlap / smallestTokenCount >= 0.75;
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];

    if (character === '"') {
      const isEscapedQuote = inQuotes && csvText[index + 1] === '"';

      if (isEscapedQuote) {
        currentField += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && csvText[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentField);
      currentField = '';

      if (currentRow.some((cell) => cell.trim().length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += character;
  }

  currentRow.push(currentField);

  if (currentRow.some((cell) => cell.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function removeQuantityAndPrefixWords(cellValue: string): string {
  let value = cellValue.trim();

  if (!value) {
    return '';
  }

  value = value.replace(/^"|"$/g, '').trim();
  value = value.replace(/^(?:\([^)]*\)\s*)+/, '').trim();

  if (!value) {
    return '';
  }

  const tokens = value.split(/\s+/).filter((token) => token.length > 0);

  while (tokens.length > 0) {
    const normalizedToken = normalizeText(tokens[0]);

    if (isQuantityToken(tokens[0])) {
      tokens.shift();
      continue;
    }

    if (!normalizedToken || !MEASUREMENT_PREFIX_WORDS.has(normalizedToken)) {
      break;
    }

    tokens.shift();
  }

  return tokens.join(' ').trim();
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const likelyHeaderCells = row
      .slice(1)
      .filter((cell) => {
        const trimmed = cell.trim();

        if (!trimmed) {
          return false;
        }

        return /[a-zA-Z]/.test(trimmed) && !/^\d/.test(trimmed);
      });

    if (likelyHeaderCells.length >= 2) {
      return index;
    }
  }

  return -1;
}

function findBestRecipeMatch(
  productName: string,
  csvEntries: CsvRecipeIngredientsEntry[]
): CsvRecipeIngredientsEntry | null {
  const productKey = buildRecipeKey(productName);

  if (!productKey) {
    return null;
  }

  const exactMatch = csvEntries.find((entry) => entry.recipeKey === productKey) ?? null;

  if (exactMatch) {
    return exactMatch;
  }

  const productTokens = new Set(productKey.split(' ').filter((token) => token.length > 0));

  let bestMatch: CsvRecipeIngredientsEntry | null = null;
  let bestScore = 0;

  for (const entry of csvEntries) {
    const entryTokens = new Set(entry.recipeKey.split(' ').filter((token) => token.length > 0));

    if (entryTokens.size === 0) {
      continue;
    }

    const overlap = countTokenOverlap(productTokens, entryTokens);

    if (overlap === 0) {
      continue;
    }

    const minTokenCount = Math.min(productTokens.size, entryTokens.size);
    const score = overlap / minTokenCount;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestScore >= 0.6 ? bestMatch : null;
}

function toCsvValue(value: string | number | boolean | null | undefined): string {
  const normalized = value === null || value === undefined ? '' : String(value);

  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function parseRecipeIngredientsCsv(csvText: string): CsvRecipeIngredientsEntry[] {
  const rows = parseCsvRows(csvText);
  const headerRowIndex = findHeaderRowIndex(rows);

  if (headerRowIndex < 0) {
    return [];
  }

  const headerRow = rows[headerRowIndex];
  const dataRows = rows.slice(headerRowIndex + 1);
  const entries: CsvRecipeIngredientsEntry[] = [];

  for (let columnIndex = 1; columnIndex < headerRow.length; columnIndex += 1) {
    const recipeName = headerRow[columnIndex]?.trim();

    if (!recipeName) {
      continue;
    }

    const uniqueIngredients = new Map<string, string>();

    for (const row of dataRows) {
      const rawCellValue = row[columnIndex] ?? '';
      const ingredientName = removeQuantityAndPrefixWords(rawCellValue);

      if (!ingredientName) {
        continue;
      }

      const key = buildIngredientKey(ingredientName);

      if (!key || uniqueIngredients.has(key)) {
        continue;
      }

      uniqueIngredients.set(key, ingredientName);
    }

    entries.push({
      recipeName,
      recipeKey: buildRecipeKey(recipeName),
      ingredients: [...uniqueIngredients.values()],
    });
  }

  return entries;
}

export function buildRecipeCsvAudit(
  products: ProductWithIngredients[],
  csvEntries: CsvRecipeIngredientsEntry[],
  inventoryIngredientNames: string[] = []
): RecipeCsvAuditResult {
  const normalizedInventoryIngredientNames = inventoryIngredientNames
    .map((ingredientName) => ingredientName.trim())
    .filter((ingredientName) => ingredientName.length > 0);

  const matches: RecipeCsvProductMatch[] = products.map((product) => {
    const matchedEntry = findBestRecipeMatch(product.name, csvEntries);

    if (!matchedEntry) {
      return {
        productId: product.id,
        productName: product.name,
        matchedCsvRecipeName: null,
        inventoryMatchedIngredients: [],
        missingIngredients: [],
      };
    }

    const currentIngredientNames = product.ingredients.map((ingredient) => ingredient.name);
    const inventoryMatchedIngredients: string[] = [];

    const missingIngredients = matchedEntry.ingredients.filter((ingredientName) => {
      const matchesRecipeIngredient = currentIngredientNames.some((currentName) =>
        isIngredientMatch(currentName, ingredientName)
      );

      if (matchesRecipeIngredient) {
        return false;
      }

      const matchesInventoryIngredient = normalizedInventoryIngredientNames.some((inventoryName) =>
        isIngredientMatch(inventoryName, ingredientName)
      );

      if (matchesInventoryIngredient) {
        inventoryMatchedIngredients.push(ingredientName);
        return false;
      }

      return true;
    });

    return {
      productId: product.id,
      productName: product.name,
      matchedCsvRecipeName: matchedEntry.recipeName,
      inventoryMatchedIngredients,
      missingIngredients,
    };
  });

  const matchedProductsCount = matches.filter(
    (match) => match.matchedCsvRecipeName !== null
  ).length;
  const productsWithInventoryCoverageCount = matches.filter(
    (match) => match.inventoryMatchedIngredients.length > 0
  ).length;
  const productsWithMissingCount = matches.filter(
    (match) => match.missingIngredients.length > 0
  ).length;

  return {
    matches,
    matchedProductsCount,
    productsWithInventoryCoverageCount,
    productsWithMissingCount,
  };
}

export function mergeMissingIngredients(
  existingIngredients: ProductIngredientInput[],
  missingIngredients: string[]
): ProductIngredientInput[] {
  const merged = [...existingIngredients];

  for (const ingredientName of missingIngredients) {
    const alreadyExists = merged.some((existingIngredient) =>
      isIngredientMatch(existingIngredient.name, ingredientName)
    );

    if (alreadyExists) {
      continue;
    }

    merged.push({
      name: ingredientName,
      quantity: 0,
      unit: 'pcs',
      sort_order: merged.length,
    });
  }

  return merged;
}

export function buildRecipesExportCsv(products: ProductWithIngredients[]): string {
  const rows = [
    [
      'product_id',
      'product_name',
      'category',
      'is_active',
      'ingredient_id',
      'ingredient_name',
      'quantity',
      'unit',
      'sort_order',
    ].join(','),
  ];

  const sortedProducts = [...products].sort((left, right) => left.name.localeCompare(right.name));

  for (const product of sortedProducts) {
    const sortedIngredients = [...product.ingredients].sort(
      (left, right) => left.sort_order - right.sort_order
    );

    if (sortedIngredients.length === 0) {
      rows.push(
        [
          toCsvValue(product.id),
          toCsvValue(product.name),
          toCsvValue(product.category),
          toCsvValue(product.is_active),
          '',
          '',
          '',
          '',
          '',
        ].join(',')
      );
      continue;
    }

    for (const ingredient of sortedIngredients) {
      rows.push(
        [
          toCsvValue(product.id),
          toCsvValue(product.name),
          toCsvValue(product.category),
          toCsvValue(product.is_active),
          toCsvValue(ingredient.id),
          toCsvValue(ingredient.name),
          toCsvValue(ingredient.quantity),
          toCsvValue(ingredient.unit),
          toCsvValue(ingredient.sort_order),
        ].join(',')
      );
    }
  }

  return rows.join('\n');
}

export function buildRecipeCsvMissingReportCsv(auditResult: RecipeCsvAuditResult): string {
  const rows = [
    [
      'product_id',
      'product_name',
      'matched_csv_recipe_name',
      'missing_ingredient_count',
      'missing_ingredients',
    ].join(','),
  ];

  const orderedMatches = [...auditResult.matches].sort((left, right) => {
    const missingCountDelta = right.missingIngredients.length - left.missingIngredients.length;

    if (missingCountDelta !== 0) {
      return missingCountDelta;
    }

    return left.productName.localeCompare(right.productName);
  });

  for (const match of orderedMatches) {
    if (!match.matchedCsvRecipeName || match.missingIngredients.length === 0) {
      continue;
    }

    rows.push(
      [
        toCsvValue(match.productId),
        toCsvValue(match.productName),
        toCsvValue(match.matchedCsvRecipeName),
        toCsvValue(match.missingIngredients.length),
        toCsvValue(match.missingIngredients.join(' | ')),
      ].join(',')
    );
  }

  return rows.join('\n');
}
