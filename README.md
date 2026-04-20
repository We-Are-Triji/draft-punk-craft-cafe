# Draft Punk Craft Cafe

Presentation-only ERP inventory prototype for BS Industrial Engineering capstone.

## Tech Stack

- React + Vite + TypeScript
- Supabase (Database, API, Realtime, Storage)
- Groq API (primary vision inference)
- OpenRouter Qwen free models (OCR-text fallback)

## Environment Setup

1. Copy `.env.example` into `.env`.
2. Fill in your Supabase, Groq, and optional OpenRouter credentials.

Required variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_GROQ_API_KEY`

Primary model setup (Groq):

- `VITE_GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct`
- `VITE_GROQ_MODEL_FALLBACKS=meta-llama/llama-4-maverick-17b-128e-instruct`

Optional fallback setup (OpenRouter Qwen free text models):

- `VITE_OPENROUTER_API_KEY=...`
- `VITE_OPENROUTER_QWEN_FALLBACK_MODELS=qwen/qwen3-next-80b-a3b-instruct:free,qwen/qwen3-coder:free`

Notes:

- Groq is used first for both stock-in and stock-out image scans.
- If Groq fails, the app runs local OCR and then tries OpenRouter Qwen free text fallback models.
- OpenRouter currently exposes very limited Qwen free modalities; check live availability before changing fallback model IDs.

## Supabase Schema

Run all SQL files in `supabase/migrations/` in timestamp order inside the Supabase SQL editor.

Recent migrations:

- `20260420135131_issue11_scan_images_bucket.sql` creates/configures the `scan-images` Storage bucket and required upload/read policies used by stock-in and stock-out image confirmations.
- `20260420140740_issue12_inventory_pricing.sql` adds ingredient pricing columns (`price_amount`, `price_basis_quantity`, `price_basis_unit`) to `inventory_items`.
- `20260420162000_seed_initial_ingredient_prices.sql` seeds initial ingredient prices from `Food-Ingredients-Prices.csv` using strict matching to existing recipe ingredients only.

It creates:

- `inventory_items`
- `stock_transactions`
- `image_cache`

And enables realtime publication for dashboard-ready updates.

## Issue #8 Implementation Scope

The Scan screen now includes:

- Drag-and-drop image upload
- AI scan button
- Cache-first recognition (image hash -> `image_cache`)
- Result preview card with dish/item, confidence, and ingredients to deduct
- Confirm and Cancel buttons

Important behavior:

- No stock deduction happens during scan.
- Deduction is posted only after explicit user confirmation.
- Stock-in updates inventory levels only and is not recorded in transaction logs.
- Transaction logs are limited to manual sale creation and successful AI-assisted stock-out confirmations.

## Local Run

```bash
npm install
npm run dev
```
