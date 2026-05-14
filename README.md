# OpsAssist — by BYTEBUILDERS

AI-powered ticket classification web app. Users submit support requests; AI auto-routes them to the right department (HR / IT / Finance / Operations) and assigns a priority (High / Medium / Low).

## Admin access

The Admin Dashboard is protected by a default password:

```
Password: OpsAdmin@2026
```

Open `/admin` and sign in to view, filter, and search all submitted tickets.

## System Architecture

- **Frontend**: React + TanStack Start, Tailwind CSS, shadcn/ui components. Two surfaces: `/` (user submission) and `/admin` (password-gated dashboard).
- **Backend**: TanStack server functions (`createServerFn`) handle ticket submission and listing. No separate API server needed.
- **Database**: Lovable Cloud (PostgreSQL) with a `tickets` table — `user_name`, `title`, `details`, `category`, `priority`, `created_at`.
- **AI Classification Flow**: On submit, the server function sends the ticket title + details to Lovable AI (`google/gemini-2.5-flash`) with a strict JSON system prompt that returns `{ category, priority }`. If the AI is unavailable, a keyword-based heuristic (e.g. "urgent" → High, "vpn/laptop" → IT) provides a graceful fallback.
- **Priority Logic**: AI weighs urgency words ("urgent", "down", "asap", "blocker" → High; "whenever", "minor" → Low) and overall tone of the description.
- **Admin Authentication**: A simple client-side password check (default `OpsAdmin@2026`) gates the dashboard via `sessionStorage`. Suitable for demo/presentation; for production replace with full auth.

## Stack

React • Tailwind CSS • TanStack Start • Lovable Cloud • Lovable AI Gateway
