# RentRight AI Chat Backend

A small FastAPI service that keeps model-provider credentials on the server and exposes a constrained chat endpoint for the RentRight frontend.

## Model options

- **NVIDIA hosted Nemotron:** OpenAI-compatible hosted API. Requires an NVIDIA API key in the backend environment.
- **Ollama:** Run a compatible Nemotron model locally or on a private machine. No provider API key is needed for a local-only endpoint.
- **Any OpenAI-compatible server:** For example, a self-hosted vLLM or SGLang endpoint.

Model availability, licensing, hardware requirements, and provider quotas vary by model and deployment method. The backend does not download model weights itself.

## Run locally

From the repository root:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set `NVIDIA_API_KEY` for hosted NVIDIA inference. Keep this file out of Git. Then run:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check: http://127.0.0.1:8000/health  
API documentation: http://127.0.0.1:8000/docs

## Test chat

```bash
curl -X POST http://127.0.0.1:8000/api/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"How should I compare two rental listings?\"}]}"
```

On PowerShell, use `curl.exe` or send a JSON body using `Invoke-RestMethod`.

## Docker

```bash
docker build -t rentright-chat-backend .
docker run --rm -p 8000:8000 --env-file .env rentright-chat-backend
```

## Connect the frontend

Call `POST https://YOUR-BACKEND-HOST/api/chat` with JSON:

```json
{
  "messages": [
    {"role": "user", "content": "How do I compare move-in costs?"}
  ],
  "temperature": 0.4,
  "max_tokens": 600
}
```

Read `message.content` from the response. Set the backend URL in the frontend's public configuration (for Vite, a variable such as `VITE_CHAT_API_URL` is fine because it is only the backend URL, not a secret). Never put the NVIDIA API key in frontend code.

## Security and deployment notes

- Set `ALLOWED_ORIGINS` to the exact deployed frontend origin(s).
- The built-in rate limiter is per process and resets on restart. For multi-instance production, use a shared Redis-backed limiter and upstream spending limits.
- Add authentication/authorization if chat history or user-specific rental data is introduced. Do not accept arbitrary user IDs as proof of identity.
- Configure provider credentials only in your backend hosting environment.
- Do not expose a private Ollama or vLLM port directly to the public internet. Put it behind a private network or authenticated gateway.
- The API intentionally does not stream responses yet; streaming can be added when the frontend integration is known.
- This is a starter service. Run dependency scanning, integration tests, and deployment checks before production use.
