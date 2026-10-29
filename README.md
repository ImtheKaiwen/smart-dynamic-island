# Smart Dynamic Island

A Windows-oriented desktop overlay built with Electron. The interface combines notification-style cards, Firebase-based events, media status/control, and an optional local FastAPI/LangGraph assistant backend.

## Current architecture

```text
.
├── main.js / preload.js       # Electron main process and isolated renderer bridge
├── index.html / renderer.js   # Overlay interface and local-backend integration
├── firebase.js                # Firebase event transport configured from environment variables
├── sender.html                # Standalone Firebase event sender
├── backend/                   # FastAPI, AI-agent, message, screen, and Windows media helpers
├── package.json               # Electron dependencies and start scripts
└── .env.example               # Required configuration names without secrets
```

The Electron interface expects the optional Python service at `http://127.0.0.1:8000`. The desktop app does not currently start that service automatically.

## Configuration

Copy `.env.example` to `.env` and provide your own Firebase and Google API configuration. Never commit the populated `.env` file.

## Run the Electron interface

```bash
npm install
npm start
```

## Optional Python backend

The backend uses FastAPI, Uvicorn, LangGraph/LangChain Google integrations, `python-dotenv`, Requests, PyAutoGUI, and Windows SDK media APIs. A Python dependency manifest is not currently included, so compatible versions must be established before the backend is reproducible.

After preparing a Windows Python environment and its dependencies:

```bash
cd backend
python main.py
```

`media_listener.py` is a separate Windows media-session listener and is not started by `main.py`.

## Security and privacy

This is an experimental local desktop assistant. When enabled, backend tools can run shell commands, list directories, create files, read/write message history, and capture the screen. Use it only in a trusted local environment, review tool calls, restrict API/Firebase access, and avoid storing sensitive conversation or screenshot data in the repository.

## Validation status

Static syntax checks pass for the existing JavaScript and Python files. End-to-end startup was not verified because Python dependency versions and external Firebase/Google credentials are not included.
