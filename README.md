# LLM Council

![llmcouncil](header.jpg)

The idea of this repo is that instead of asking a question to your favorite LLM provider (e.g. OpenAI GPT 5.1, Google Gemini 3.0 Pro, Anthropic Claude Sonnet 4.5, xAI Grok 4, eg.c), you can group them into your "LLM Council". This repo is a simple, local web app that essentially looks like ChatGPT except it uses OpenRouter to send your query to multiple LLMs, it then asks them to review and rank each other's work, and finally a Chairman LLM produces the final response.

In a bit more detail, here is what happens when you submit a query:

1. **Stage 1: First opinions**. The user query is given to all LLMs individually, and the responses are collected. The individual responses are shown in a "tab view", so that the user can inspect them all one by one.
2. **Stage 2: Review**. Each individual LLM is given the responses of the other LLMs. Under the hood, the LLM identities are anonymized so that the LLM can't play favorites when judging their outputs. The LLM is asked to rank them in accuracy and insight.
3. **Stage 3: Final response**. The designated Chairman of the LLM Council takes all of the model's responses and compiles them into a single final answer that is presented to the user.

## Vibe Code Alert

This project was 99% vibe coded as a fun Saturday hack because I wanted to explore and evaluate a number of LLMs side by side in the process of [reading books together with LLMs](https://x.com/karpathy/status/1990577951671509438). It's nice and useful to see multiple responses side by side, and also the cross-opinions of all LLMs on each other's outputs. I'm not going to support it in any way, it's provided here as is for other people's inspiration and I don't intend to improve it. Code is ephemeral now and libraries are over, ask your LLM to change it in whatever way you like.

## Setup

### 1. Install Dependencies

The project uses [uv](https://docs.astral.sh/uv/) for project management.

**Backend:**
```bash
uv sync
```

**Frontend:**
```bash
cd frontend
npm install
cd ..
```

### 2. Configure API Key

Create a `.env` file in the project root:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_API_KEY_SECRET=sb_secret_...
STRIPE_API_KEY_SECRET=sk_test_...
STRIPE_API_KEY_PUBLIC=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PRO_DAILY_TOKEN_CREDITS=200000
```

Get your API key at [openrouter.ai](https://openrouter.ai/). Make sure to purchase the credits you need, or sign up for automatic top up.
Get your Supabase values in **Project Settings -> API**.
Keep `SUPABASE_API_KEY_SECRET` server-side only. Do not expose it in frontend env files.
Configure Stripe webhooks to `POST /api/billing/webhook` so successful checkouts upgrade the user plan.

### 3. Create Supabase Database Tables

Run the SQL in `backend/supabase_schema.sql` inside your Supabase project (SQL Editor).

This creates the `conversations` and `messages` tables, indexes, and Row Level Security policies so users can only access their own rows.
It also creates `account_credits`, `billing_payments`, and credit RPC functions used by the app.

### 4. Configure Models (Optional)

Set `COUNCIL_ENV` in `.env` to choose the model set:

```bash
COUNCIL_ENV=development
```

Supported values:
- `development` / `dev` / `local` uses:
  - `openai/gpt-5-nano`
  - `x-ai/grok-4-fast`
  - `google/gemini-2.5-flash-lite`
  - `anthropic/claude-3-haiku`
  - `x-ai/grok-4.1-fast`
- `production` (default) uses:
  - `openai/gpt-5.1`
  - `google/gemini-3-pro-preview`
  - `anthropic/claude-sonnet-4.5`
  - `x-ai/grok-4`

You can still force a specific chairman model with:

```bash
CHAIRMAN_MODEL=openai/gpt-5.1
```

Or edit `backend/config.py` directly:

```python
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "x-ai/grok-4",
]

CHAIRMAN_MODEL = "google/gemini-3-pro-preview"
```

## Running the Application

**Option 1: Use the start script**
```bash
./start.sh
```

**Option 2: Run manually**

Terminal 1 (Backend):
```bash
uv run python -m backend.main
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

## Railway Production Deployment (Backend)

Deploy only the backend API service to Railway from this repository.

1. Create a Railway service from the repo.
2. Keep the start command aligned with `railway.toml`:

```bash
uv run uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8001}
```

3. Set backend environment variables in Railway:

```bash
OPENROUTER_API_KEY=sk-or-v1-...
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_API_KEY_SECRET=sb_secret_...
COUNCIL_ENV=production
```

For first successful boot, `OPENROUTER_API_KEY`, `SUPABASE_URL`, and `SUPABASE_API_KEY_SECRET` must be set. `COUNCIL_ENV=production` keeps model selection explicit in Railway.

4. Deploy and verify the service responds on `/` with:

```json
{"status":"ok","service":"LLM Council API"}
```

## Credits

- Credits are token-based and available only for **PRO** accounts.
- Daily PRO quota: `200,000` tokens (auto-renewed once per day).
- Conversation usage (token usage) is deducted from this quota.
- When daily quota reaches `0`, new conversations/messages are blocked until next day renewal.

## Pricing

- The app now includes a dedicated **Pricing** page.
- Available plans:
  - **Free**
  - **Pro**: `R$90` per month (Stripe Checkout)
- Processed Stripe sessions are persisted in `billing_payments`, linked to `user_id`, so it is easy to audit which account had which payment processed.
- Example audit query:
  - `select * from public.billing_payments where user_id = 'ACCOUNT_UUID' order by processed_at desc;`
- Direct URLs:
  - `http://localhost:5173/pricing`
  - `http://localhost:5173/account`

## Tech Stack

- **Backend:** FastAPI (Python 3.10+), async httpx, OpenRouter API, Supabase Auth
- **Frontend:** React + Vite, react-markdown for rendering
- **Storage:** Supabase Postgres (`conversations` + `messages` tables)
- **Package Management:** uv for Python, npm for JavaScript
