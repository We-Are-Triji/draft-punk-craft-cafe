# Draft Punk Craft Cafe

Presentation-only ERP inventory prototype for BS Industrial Engineering capstone.

## Tech Stack

- React + Vite + TypeScript
- Supabase (Database, API, Realtime, Storage)
- Gemini API (`gemini-2.0-flash`) for image-based detection

## Environment Setup

1. Copy `.env.example` into `.env`.
2. Fill in your Supabase and Gemini credentials.

Required variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_STORAGE_BUCKET`
- `VITE_GEMINI_API_KEY`
- `VITE_GEMINI_MODEL`

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
