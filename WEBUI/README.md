# Xscaffold WEBUI

Independent operations console for Xscaffold. Vanilla ESM modules + Tailwind CDN + design-token CSS. No build step.

## Run

Start the backend first:

```bash
npm run dev
```

Start the UI from this directory:

```bash
npm start
```

Defaults:

- UI: `http://127.0.0.1:5173`
- Backend proxy target: `http://localhost:3000`

Override the backend target when needed:

```bash
BACKEND_URL=http://localhost:3000 npm start
```

PowerShell:

```powershell
$env:BACKEND_URL='http://localhost:3000'; npm start
```

The UI stores the JWT token in browser `localStorage` and sends it as `Authorization: Bearer <token>`.

## Structure

```
WEBUI/
├── index.html        Shell — SVG nav + viewBody swap + modal/toast
├── server.js         Static server + transparent /api/* reverse proxy
├── tokens.css        Single source of design tokens (color/spacing/typography/components)
├── tw-tokens.js      Tailwind CDN config bridging tokens.css variables
├── app.css           Shell-level component styles (nav-icon, modal, toast, helpers)
├── app.js            Bootstrap — collect DOM, load state, start router, kick off poller
├── lib/
│   ├── api.js        fetch wrapper + envelope error parsing
│   ├── state.js      Single global state + localStorage persistence
│   ├── dom.js        Shell-level element registry
│   ├── router.js     Hash router (#/view or #/view/id) with whitelist + legacy redirects
│   ├── poller.js     5s interval poller (visibility-aware, failure degrade)
│   ├── modal.js      Trace/log modal controls
│   ├── actions.js    Cross-view actions (runWorkflow, openExecutionTrace, …)
│   └── utils.js      escapeHtml / formatTime / showToast
└── views/
    ├── index.js      Dispatcher (state.view → renderer) + nav highlight sync
    ├── runtime.js    Runtime list + metrics/health/logs (live probes + mock placeholders)
    ├── agents.js     Live /agents list + agent profile (mock tasks/history/automation ownership)
    ├── automation.js Live /workflows list + execution history (mock trigger/schedule/IOO toggle)
    ├── inbox.js      Failed executions filter + detail (mock trace skeleton + event timeline)
    ├── executions.js Full executions list with status/workflow filter + pagination + trace modal
    ├── assistant.js  project-assistant-digest manual trigger form (no nav entry, hash only)
    └── settings.js   API base + JWT token + runtime info
```

## Routing

Hash router. Primary nav (4 icons):

- `#/runtime` — Runtime overview (default)
- `#/agents` — Agents profile
- `#/automation` — Automation rules
- `#/inbox` — Failed/stuck/timeout executions
- `#/settings` — Connection settings (gear icon)

Hash-only entries (no nav button):

- `#/executions` — Full executions list with pagination
- `#/assistant` — Project assistant digest trigger

Legacy hash `#/workflows` automatically redirects to `#/automation`.

Browser back/forward and full reload preserve the active view. Unknown hashes fall back to `#/runtime`.

## Auto refresh

A poll loop runs every 5 seconds in the foreground tab. It pulls `/healthz`, `/readyz`, `/workflows`, `/workflows/executions`, and `/agents`. View renderers consume `state.*` directly.

- Pauses when the tab is hidden (`document.visibilityState === 'hidden'`).
- After 3 consecutive failures the poller stops and a toast is shown. Reload the page to restart.

## Design tokens

All visual decisions go through `tokens.css` CSS variables. Tailwind CDN is loaded with `tw-tokens.js` mapping utility classes to those variables. Do not introduce arbitrary colors, sizes, or spacing — extend `tokens.css` first.

## Backend field reality check

Many design fields exceed what the current backend exposes. Live vs mock per view:

| View | Live | Mock |
|---|---|---|
| runtime | `/healthz` `/readyz` summary | runtime list, uptime, heartbeat, workload, memory, spark, live logs, health checks |
| agents | `/agents` list (name, model, tools, status, updatedAt) | tasks queue, execution history, automation ownership |
| automation | `/workflows` registry + recent `executions` table | cron schedule, next run, retry policy, success rate spark, Issue Output Mode toggle |
| inbox | `/workflows/executions?status=FAILED/STUCK/TIMEOUT` | trace step expansion, runtime event timeline |
| executions | full `/workflows/executions` with pagination + trace modal | — |
| assistant | `/workflows/project-assistant-digest/execute` | — |
| settings | localStorage persisted | — |

Mock placeholders are labeled `mock` in the UI so it stays honest.

## Browser support

ES modules required. Tested on current Chromium / Firefox / Safari. No transpile step.
