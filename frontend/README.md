# Omni Frontend

React + TypeScript + Vite + Tailwind. Part of the Omni supply chain agent app.

## Run

```bash
npm install
npm run dev
```

Set in `.env`:

- `VITE_SUPABASE_URL` — Supabase project URL  
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key  
- `VITE_API_URL` — (optional) Backend API base, e.g. `http://localhost:8000`

## Main pages

- **/** — Dashboard  
- **/config** — Configuration (company profile, suppliers, facilities)  
- **/events** — Events Feed (`signal_events`)  
- **/cases** — Risk Cases (table + inline expand; Supabase or API fallback)  
- **/cases/:id** — Case detail  
- **/actions** — Actions & approval (change proposals)  
- **/logs** — Activity log (`audit_log`)  
- **/simulation** — Live Simulation (Run Cycle → real LLM risk assessment)  
- **/agent** — Chatbot (internal data + optional commodity + web search)

See the repo root **README.md** and **docs/ui-mapping.md** for full app and API details.
