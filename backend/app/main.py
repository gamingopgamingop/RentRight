from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

load_dotenv()

APP_NAME = "RentRight AI API"
PROVIDER = os.getenv("LLM_PROVIDER", "nvidia").strip().lower()
MODEL_NAME = os.getenv("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b").strip()
API_BASE_URL = os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
API_KEY = os.getenv("NVIDIA_API_KEY", "").strip() if PROVIDER == "nvidia" else os.getenv("LLM_API_KEY", "").strip()
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://rent-right-beta.vercel.app,http://localhost:5173",
    ).split(",")
    if origin.strip()
]
MAX_MESSAGES = int(os.getenv("MAX_MESSAGES", "24"))
MAX_MESSAGE_CHARS = int(os.getenv("MAX_MESSAGE_CHARS", "6000"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "800"))
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "20"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

app = FastAPI(
    title=APP_NAME,
    version="1.0.0",
    description="Server-side, OpenAI-compatible chat gateway for RentRight.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Simple per-process protection for small deployments. Use a shared Redis-backed
# limiter at scale; do not treat this in-memory limiter as a distributed control.
_request_times: dict[str, deque[float]] = defaultdict(deque)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message content cannot be blank.")
        return value


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    model: str | None = None
    temperature: float = Field(default=0.4, ge=0, le=1)
    max_tokens: int = Field(default=600, ge=1, le=MAX_OUTPUT_TOKENS)

    @field_validator("messages")
    @classmethod
    def require_user_message(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if not any(message.role == "user" for message in messages):
            raise ValueError("At least one user message is required.")
        if sum(len(message.content) for message in messages) > 24000:
            raise ValueError("Conversation is too large.")
        return messages


def check_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    history = _request_times[client_ip]
    while history and history[0] < cutoff:
        history.popleft()
    if len(history) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again shortly.")
    history.append(now)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": APP_NAME}


@app.get("/api/chat/models")
async def models() -> dict[str, object]:
    # Do not return API keys or upstream provider credentials.
    return {"provider": PROVIDER, "default_model": MODEL_NAME}


@app.post("/api/chat")
async def chat(payload: ChatRequest, request: Request) -> dict[str, object]:
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(client_ip)

    if PROVIDER not in {"nvidia", "openai-compatible", "ollama"}:
        raise HTTPException(status_code=500, detail="Unsupported LLM_PROVIDER configuration.")

    if PROVIDER == "nvidia" and not API_KEY:
        raise HTTPException(status_code=503, detail="Chat provider is not configured. Set NVIDIA_API_KEY on the backend.")
    if PROVIDER == "openai-compatible" and not API_KEY:
        raise HTTPException(status_code=503, detail="Chat provider is not configured. Set LLM_API_KEY on the backend.")

    messages = [
        {
            "role": message.role,
            "content": message.content,
        }
        for message in payload.messages
    ]

    # Add product context only when the caller did not provide a system message.
    # Do not trust this assistant for legal, financial, or safety-critical decisions.
    if not messages or messages[0]["role"] != "system":
        messages.insert(
            0,
            {
                "role": "system",
                "content": (
                    "You are RentRight Assistant, a helpful guide for rental discovery. "
                    "Explain rent, deposits, move-in costs, listing comparisons, viewing preparation, "
                    "and platform features clearly. Never claim a listing, landlord, identity, price, "
                    "or property is verified unless the application data explicitly confirms it. "
                    "Do not request passwords, OTPs, payment credentials, or unnecessary sensitive data. "
                    "For legal or safety matters, provide general information and encourage users to "
                    "verify details with appropriate local professionals. Do not invent live listings "
                    "or claim you performed actions outside this chat."
                ),
            },
        )

    request_body = {
        "model": payload.model or MODEL_NAME,
        "messages": messages,
        "temperature": payload.temperature,
        "max_tokens": payload.max_tokens,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=8.0)) as client:
            response = await client.post(
                f"{API_BASE_URL}/chat/completions",
                headers=headers,
                json=request_body,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The AI provider timed out. Please retry.")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Unable to connect to the configured AI provider.")

    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="The AI provider is busy or its rate limit was reached.")
    if response.status_code >= 400:
        # Never relay upstream bodies: they can contain implementation details.
        raise HTTPException(status_code=502, detail=f"AI provider returned HTTP {response.status_code}.")

    try:
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="The AI provider returned an unexpected response.")

    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(status_code=502, detail="The AI provider returned an empty response.")

    return {
        "id": data.get("id"),
        "model": data.get("model", payload.model or MODEL_NAME),
        "message": {"role": "assistant", "content": answer.strip()},
    }


async def _generate_text(system_prompt: str, user_prompt: str) -> str:
    """Call the configured OpenAI-compatible model for bounded feature drafts."""
    if PROVIDER == "nvidia" and not API_KEY:
        raise HTTPException(status_code=503, detail="Chat provider is not configured.")
    if PROVIDER == "openai-compatible" and not API_KEY:
        raise HTTPException(status_code=503, detail="Chat provider is not configured.")
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=8.0)) as client:
            response = await client.post(
                f"{API_BASE_URL}/chat/completions",
                headers=headers,
                json={
                    "model": MODEL_NAME,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.4,
                    "max_tokens": 700,
                    "stream": False,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="The AI provider timed out.")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Unable to connect to the AI provider.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"AI provider returned HTTP {response.status_code}.")
    try:
        answer = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise HTTPException(status_code=502, detail="The AI provider returned an unexpected response.")
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(status_code=502, detail="The AI provider returned an empty response.")
    return answer.strip()


from .platform import router as platform_router
app.include_router(platform_router)
