# Reconcilr

AI-assisted finance reconciliation agent for Razorpay AI Buildathon 2026.

## Overview
Reconcilr bridges the gap between payment-gateway settlement files and internal order ledgers using a three-stage pipeline:
1. **Exact Match**: Joins on normalized reference, expected settled amount (Gross - Fee), and date within 1 day.
2. **Rule-based Fuzzy Match**: Scores remaining items using Dice coefficient string similarity and heuristics.
3. **AI-assisted Review**: Uses Gemini API for genuinely ambiguous pairs, falling back to rule-based candidates if AI is unavailable.

## Tech Stack
- Next.js 14 (App Router)
- PostgreSQL & Prisma
- Tailwind CSS & shadcn/ui
- Gemini SDK (`gemini-2.5-flash`)
- Server-Sent Events (SSE) for realtime frontend updates
- Vitest for unit tests

## Local Setup

1. Copy `.env.example` to `.env` and fill in your details:
   ```
   cp .env.example .env
   ```
   Required variables:
   - `DATABASE_URL`: Hosted PostgreSQL connection string (Neon or Supabase free tier).
   - `GEMINI_API_KEY`: Gemini API Key.

2. Install dependencies:
   ```
   npm install
   ```

3. Initialize the database schema:
   ```
   npx prisma db push
   ```

4. Run unit tests:
   ```
   npm run test
   ```

5. Start the dev server:
   ```
   npm run dev
   ```

## Deploying
This project is designed to be deployed to Vercel as a single unit (Frontend + API Routes). 
Connect the repository to your Vercel account, set `DATABASE_URL` and `ANTHROPIC_API_KEY` in the Vercel Environment Variables dashboard, and deploy.
