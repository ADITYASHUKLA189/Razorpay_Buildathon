# Reconcilr

**An AI-assisted Finance Reconciliation Agent built for the Razorpay AI Buildathon 2026 (Track 04: AI Finance Controller).**

Reconcilr automates the grueling process of bridging payment-gateway settlement files with internal order ledgers. Rather than throwing a massive LLM at a simple data problem, Reconcilr uses a highly optimized, deterministic three-stage pipeline that relies on AI *only where necessary*.

---

## 🚀 The Pipeline Architecture

Reconcilr processes large batches of unstructured financial data in milliseconds using a cascading triage system:

### Stage 1: Deterministic Exact Match
Resolves 100% clean cases instantly without LLM latency. It executes rigid rules checking for exact order references, expected settled amounts (Gross minus Gateway Fees), and strict date tolerances (within 1 day).

### Stage 2: Rule-Based Fuzzy Match
Unresolved candidates fall to Stage 2, which runs a custom heuristic scoring algorithm. It evaluates:
- **String Similarity (30%):** Bigram Dice coefficient analysis against reference IDs.
- **Amount Tolerance (50%):** Checks for partial payments, floating point discrepancies, or unexpected flat fees.
- **Date Proximity (20%):** Weighs temporal drift.
If a candidate crosses a high threshold and beats the runner-up score by a safe margin, it is auto-matched.

### Stage 3: AI-Assisted Review (Gemini 2.5 Flash)
Genuinely ambiguous edge cases (e.g., identical amounts on the exact same day with corrupted reference IDs) are batched and sent to an LLM. The AI receives highly structured JSON context containing only the top 3 scored candidates and is forced to output a strict JSON decision with readable reasoning.

### Fallbacks & Exceptions
If the AI is unreachable, Reconcilr degrades gracefully back to the highest-scoring Stage 2 candidate. Any settlement or ledger entry left over is flagged as an **Exception** for human review — we *never* force a low-confidence match.

---

## 💻 The Dashboard

We built a gorgeous, Vercel/Linear-inspired dark mode dashboard to visualize the reconciliation process in real-time.

**Features:**
- **Custom CSV Uploading:** Securely parse and upload your own Ledgers and Settlements `.csv` files locally to test the engine, or click "Synth Batch" to instantly generate 52 mathematically crafted edge-cases for testing.
- **Live Streamed Results:** Server-Sent Events (SSE) stream matches to the frontend as the pipeline processes the batch.
- **Interactive Segmented Bar:** Watch the exact, rule-based, and AI matches fill up a visual pipeline bar dynamically.
- **Glassmorphic Table:** A premium data table that elegantly houses your resolution results with Fluid Framer Motion animations. 
- **Expandable Proof of Work:** Click into any AI-matched row to see the exact reasoning the model used, the top candidates it analyzed, and the raw JSON it returned. Click into a Rule-matched row to see the exact mathematical score breakdown.
- **Export to CSV:** One-click generation of a comprehensive, human-readable CSV report complete with summary metrics.

---

## 🛠️ Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** PostgreSQL (Hosted on Supabase)
- **ORM:** Prisma
- **AI Model:** Google Gemini (`gemini-2.5-flash`) via native SDK
- **Styling:** Tailwind CSS (Custom Dark UI Theme)
- **Streaming:** Server-Sent Events (SSE)

---

## ⚙️ Local Setup & Deployment

1. **Clone & Install**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="postgresql://[user]:[password]@[host]:[port]/[db]"
   GEMINI_API_KEY="AIzaSy..."
   ```

3. **Initialize Database**
   ```bash
   npx prisma db push
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to interact with the dashboard.

5. **Deploy on Vercel**
   This repository is pre-configured for seamless Vercel deployment. Because it uses Prisma in Serverless Functions, we have included a `postinstall` script (`prisma generate`). Just import the repository into Vercel, paste your environment variables, and hit Deploy.

---

*Built with precision for the Razorpay AI Buildathon 2026.*
