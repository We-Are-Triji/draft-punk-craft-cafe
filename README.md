# Draft Punk Craft Cafe

Presentation-only ERP inventory prototype for BS Industrial Engineering capstone.

## Tech Stack

- React + Vite + TypeScript
- Supabase (Database, API, Realtime, Storage)
- OpenRouter API (vision models) for image-based detection

## Environment Setup

1. Copy `.env.example` into `.env`.
2. Fill in your Supabase and OpenRouter credentials.

Required variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_OPENROUTER_API_KEY`
- `VITE_OPENROUTER_MODEL`

Recommended free-tier model setup:

- `VITE_OPENROUTER_MODEL=nvidia/nemotron-nano-12b-v2-vl:free`
- `VITE_OPENROUTER_MODEL_FALLBACKS=`
- `VITE_OPENROUTER_MAX_MODELS_PER_REQUEST=1`
- `VITE_OPENROUTER_MAX_RETRIES=1`

Notes:

- The app supports fallback model lists and cooldown/retry throttling in `.env.example`.
- Model availability can change on OpenRouter; if a model is unavailable, swap to another currently listed `:free` vision model in your OpenRouter dashboard.

## Supabase Schema

Run the SQL migration in `supabase/migrations/20260415_issue8_inventory_ai_scan.sql` inside the Supabase SQL editor.

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

## Local Run

```bash
npm install
npm run dev
```
