# Xscaffold WEBUI

Independent operations console for Xscaffold. Vanilla ESM modules, no build step.

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

## Structure (V2.1)

```
WEBUI/
├── index.html        Shell + modal markup; loads ./app.js as ES module
├── server.js         Static server + transparent /api/* reverse proxy
├── styles.css        Layout/component styles (matches Uiconstraints)
├── theme.css         CSS custom properties (color tokens)
├── app.js            Bootstrap: collect DOM, load state, start router/poller
├── lib/
│   ├── api.js        fetch wrapper + envelope error parsing
│   ├── state.js      Single global state + localStorage persistence
│   ├── dom.js        Element id registry
│   ├── router.js     Hash router (#/view or #/view/id)
│   ├── poller.js     5s interval poller (visibility-aware, failure degrade)
│   ├── modal.js      Trace/log modal controls
│   ├── actions.js    Cross-view actions (runWorkflow, createAgent, openExecutionTrace)
│   └── utils.js      escapeHtml / formatTime / showToast
└── views/
    ├── index.js      Dispatcher (state.view → renderer)
    ├── components.js Shared HTML fragments + resource-list/action binders
    ├── runtime.js
    ├── inbox.js
    ├── executions.js Includes status filter, workflow filter, pagination
    ├── workflows.js
    ├── agents.js
    ├── assistant.js
    └── settings.js
```

## Routing

Hash router. Examples:

- `#/runtime` — Runtime overview (default)
- `#/executions` — Executions list
- `#/executions/exec_abc123` — Drill into a specific execution
- `#/inbox` — Failed/stuck/timeout executions
- `#/workflows/demo-add` — Workflow detail with manual trigger
- `#/agents/<id>` — Agent profile
- `#/settings` — Connection settings

Browser back/forward and full reload preserve the active view. Unknown hashes fall back to `#/runtime`.

## Auto refresh

A poll loop runs every 5 seconds in the foreground tab. It pulls `/healthz`, `/readyz`, `/workflows`, `/workflows/executions` (with current filters), and `/agents`.

- Pauses when the tab is hidden (`document.visibilityState === 'hidden'`).
- After 3 consecutive failures the poller stops and a toast is shown. Reload the page to restart.

## Browser support

ES modules required. Tested on current Chromium / Firefox / Safari. No transpile step.
