# SpendWise Backend

Node.js + Express API that verifies **Firebase Auth** ID tokens and reads/writes the same **Cloud Firestore** collections the Flutter app uses.

## What it provides

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check (no auth) |
| GET | `/api/me` | Current user profile |
| GET/POST | `/api/expenses` | List / upsert one expense |
| POST | `/api/expenses/bulk` | Bulk upsert expenses |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET / POST `/bulk` | `/api/categories` | Categories |
| GET / PUT | `/api/budgets` | Monthly budget |
| GET / POST `/bulk` | `/api/recurring` | Recurring expenses |
| POST | `/ai/parse-expense` | Natural-language → structured expense (Groq) |
| POST | `/ai/suggest-category` | Note → category suggestion |
| POST | `/ai/ask` | Expense Q&A agent turn (tool calls run on device) |
| POST | `/ai/insights` | Monthly insight from aggregates |
| POST | `/ai/budget-advice` | Budget tips from aggregates |
| GET | `/ai/status` | AI configured? + remaining daily quota |

## AI (Groq)

API keys stay on the server (`GROQ_API_KEY`). Never put them in the Flutter app.

```bash
# .env
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
AI_DAILY_LIMIT=40
```

`POST /ai/parse-expense` body:

```json
{
  "text": "Yesterday lunch 250",
  "categories": ["Food", "Transport", "Other"],
  "today": "2026-10-28"
}
```

The model must return JSON only; the server validates amount, category (must be in the list), and date before responding. Daily limit is per Firebase uid (if Bearer token present) or IP.

### Ask agent (`POST /ai/ask`)

Client sends chat `messages`. Groq may reply with `tool_calls` (`get_total`, `list_expenses`, `compare_months`). The **Flutter app** runs those against SQLite and posts tool results back in a follow-up `/ai/ask` call until a final natural-language `message` is returned.

Firestore layout (same as the app):

```
users/{uid}
  settings: { currency, themeMode, monthlyBudget, ... }
  expenses/{expenseId}
  categories/{categoryId}
  recurring/{recurringId}
```

## Setup (after you create Firebase)

1. Firebase Console → Project settings → Service accounts → **Generate new private key**
2. Save it as `serviceAccountKey.json` in this folder (gitignored)
3. Enable **Email/Password** Auth and create a **Firestore** database
4. Copy env file and install:

```bash
cd spendwise-backend
cp .env.example .env
npm install
npm run dev
```

5. In the Flutter app → Settings → **Backend API URL**
   - Android emulator: `http://10.0.2.2:3000`
   - Real device (same Wi‑Fi): `http://YOUR_LAN_IP:3000`

## Auth

Authenticated routes expect:

```
Authorization: Bearer <Firebase ID token>
```

The Flutter app attaches this automatically when Firebase is configured and the user is signed in.

## Privacy

- The Flutter app requires an explicit **AI consent** toggle before calling `/ai/*`.
- `/ai/parse-expense` only receives the user’s one-line text, category name list, and today’s date — not the full SQLite history.
- Keep `GROQ_API_KEY` in environment variables (local `.env` or Render). Never ship it in the mobile app.

## Deploy (Render free)

1. Push this folder to GitHub (no `serviceAccountKey.json` / `.env`).
2. New Web Service → build `npm install`, start `npm start`.
3. Set env: `FIREBASE_SERVICE_ACCOUNT_BASE64` (base64 of the service-account JSON — avoids PEM `\n` issues), `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b`, `AI_DAILY_LIMIT`, `ALLOWED_ORIGINS=*`.
4. Put the public HTTPS URL in the app: Settings → Backend API URL.

Generate base64 locally:

```bash
node -e "console.log(require('fs').readFileSync('serviceAccountKey.json').toString('base64'))"
```

## Note

Day-to-day sync can stay **client → Firestore** (already in the app). AI routes proxy Groq so the API key never ships in the APK.
