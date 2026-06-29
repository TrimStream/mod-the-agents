# Mod the Agents

Real-time multi-agent debate platform. Any text or image input is simultaneously contested by four agents with hardcoded epistemic identities. Human injects mid-debate. Synthesis closes the loop.

Built for the Cerebras × Google DeepMind Gemma 4 Hackathon.

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Express + Node + TypeScript (tsx)
- **Model:** `gemma-4-31b` on Cerebras (OpenAI-compatible API)
- **Streaming:** SSE from server → client with 30ms token batching

---

## Setup

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment

```bash
cp server/.env.example server/.env
# Edit server/.env and add your CEREBRAS_API_KEY
```

### 3. Run

Terminal 1 (server):
```bash
cd server && npm run dev
```

Terminal 2 (client):
```bash
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Architecture

```
User input (text + optional image)
       │
       ▼
POST /api/debate/start
       │
       ├──► Agent 0 (Pragmatist)  ─┐
       ├──► Agent 1 (Skeptic)      ├── parallel Cerebras streams → SSE → UI
       ├──► Agent 2 (Optimist)     │
       └──► Agent 3 (Devil's Adv.) ┘
                │
                ▼
       Round 1 complete → generate injection suggestions (Cerebras)
                │
                ▼
       User selects type (Constraint / Evidence / Flip Agent)
       User types injection or picks suggestion chip
                │
                ▼
POST /api/debate/:id/inject
       │
       ├──► All agents receive: original input + all R1 responses + injection
       ├──► Parallel stream → SSE → UI (Round 2 panels)
                │
                ▼
       Synthesis agent receives all 8 responses
       Streams structured verdict → UI
```

## Agents

| Agent | Identity |
|-------|----------|
| Pragmatist | What actually works in practice |
| Skeptic | What's being ignored or assumed |
| Optimist | What opportunity is being missed |
| Devil's Advocate | Attacks the dominant position |

## Notes

- In-memory session state — sessions are lost on server restart
- Base64 image support only (Cerebras limitation at time of writing)
- `reasoning_effort` is off by default for speed; enable in `server/src/index.ts` if wanted
- Token batching at 30ms intervals prevents excessive React re-renders at Cerebras TPS
