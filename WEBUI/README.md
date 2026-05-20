# Xscaffold WEBUI

Independent operations console for Xscaffold.

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
