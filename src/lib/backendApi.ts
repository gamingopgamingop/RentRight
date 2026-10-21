import { auth } from "../firebase/firebaseConfig";

/**
 * RentRight backend client.
 *
 * Set VITE_CHAT_API_URL to the deployed backend origin (for example,
 * https://api.example.com). This URL is public configuration, not a secret.
 * Firebase ID tokens are sent only for protected calls; never put model keys
 * or service-account credentials in Vite variables.
 */
const API_BASE = (import.meta.env.VITE_CHAT_API_URL as string | undefined)?.replace(/\/$/, "");

export class BackendApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "BackendApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  if (!API_BASE) {
    throw new BackendApiError("Backend URL is not configured. Set VITE_CHAT_API_URL.", 0);
  }

  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  if (authenticated) {
    const user = auth.currentUser;
    if (!user) throw new BackendApiError("Please sign in before using this feature.", 401);
    headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed (HTTP ${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") message = data.detail;
    } catch {
      // Keep the safe fallback message.
    }
    throw new BackendApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, value?: unknown): RequestInit => ({
  method,
  ...(value === undefined ? {} : { body: JSON.stringify(value) }),
});

export const backendApi = {
  health: () => request<{ status: string; service: string }>("/health"),
  models: () => request<{ provider: string; default_model: string }>("/api/chat/models"),

  listProperties: (filters: Record<string, string | number | boolean | undefined> = {}) => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<{ items: unknown[]; count: number }>(
      `/api/properties${query.size ? `?${query.toString()}` : ""}`,
    );
  },
  getProperty: (id: string | number) => request<unknown>(`/api/properties/${encodeURIComponent(String(id))}`),
  createProperty: (payload: Record<string, unknown>) =>
    request<unknown>("/api/properties", { ...json("POST", payload) }, true),
  updateProperty: (id: string | number, payload: Record<string, unknown>) =>
    request<unknown>(`/api/properties/${encodeURIComponent(String(id))}`, { ...json("PATCH", { payload }) }, true),
  deleteProperty: (id: string | number) =>
    request<void>(`/api/properties/${encodeURIComponent(String(id))}`, json("DELETE"), true),

  createInquiry: (propertyId: string | number, payload: Record<string, unknown>) =>
    request<unknown>(`/api/properties/${encodeURIComponent(String(propertyId))}/inquiries`, { ...json("POST", { payload }) }, true),
  myInquiries: () => request<{ items: unknown[] }>("/api/me/inquiries", {}, true),
  ownerInquiries: () => request<{ items: unknown[] }>("/api/owner/inquiries", {}, true),
  createViewing: (propertyId: string | number, payload: Record<string, unknown>) =>
    request<unknown>(`/api/properties/${encodeURIComponent(String(propertyId))}/viewings`, { ...json("POST", { payload }) }, true),
  reportProperty: (propertyId: string | number, payload: Record<string, unknown>) =>
    request<unknown>(`/api/properties/${encodeURIComponent(String(propertyId))}/reports`, { ...json("POST", { payload }) }, true),
  savedProperties: () => request<{ items: unknown[] }>("/api/me/saved-properties", {}, true),
  saveProperty: (propertyId: string | number) =>
    request<unknown>(`/api/me/saved-properties/${encodeURIComponent(String(propertyId))}`, json("PUT"), true),
  unsaveProperty: (propertyId: string | number) =>
    request<void>(`/api/me/saved-properties/${encodeURIComponent(String(propertyId))}`, json("DELETE"), true),

  createReview: (propertyId: string | number, payload: Record<string, unknown>) =>
    request<unknown>(`/api/properties/${encodeURIComponent(String(propertyId))}/reviews`, { ...json("POST", { payload }) }, true),
  listReviews: (propertyId: string | number) =>
    request<{ items: unknown[] }>(`/api/properties/${encodeURIComponent(String(propertyId))}/reviews`),
  updateOwnerInquiry: (inquiryId: string, payload: Record<string, unknown>) =>
    request<unknown>(`/api/owner/inquiries/${encodeURIComponent(inquiryId)}`, { ...json("PATCH", { payload }) }, true),
  renewOwnerProperty: (propertyId: string | number) =>
    request<unknown>(`/api/owner/properties/${encodeURIComponent(String(propertyId))}/renew`, json("POST"), true),
  recordPropertyView: (propertyId: string | number) =>
    request<{ accepted: boolean }>(`/api/properties/${encodeURIComponent(String(propertyId))}/views`, json("POST")),
  contact: (payload: Record<string, unknown>) =>
    request<{ ticket: string; status: string }>("/api/contact", json("POST", { payload })),
  createVoiceSession: (payload: Record<string, unknown>) =>
    request<unknown>("/api/voice/sessions", { ...json("POST", { payload }) }, true),
  verifyProperty: (propertyId: string | number, payload: Record<string, unknown>) =>
    request<unknown>(`/api/admin/properties/${encodeURIComponent(String(propertyId))}/verification`, { ...json("POST", { payload }) }, true),

  ownerDashboard: () => request<Record<string, unknown>>("/api/owner/dashboard", {}, true),
  adminMetrics: () => request<Record<string, unknown>>("/api/admin/metrics", {}, true),
  adminReports: () => request<{ items: unknown[] }>("/api/admin/reports", {}, true),
  moderateReport: (id: string, payload: Record<string, unknown>) =>
    request<unknown>(`/api/admin/reports/${encodeURIComponent(id)}`, { ...json("PATCH", { payload }) }, true),

  tool: <T = unknown>(name: string, payload: Record<string, unknown>) =>
    request<T>(`/api/tools/${encodeURIComponent(name)}`, json("POST", { payload }), name === "maintenance" || name === "payment-reminders" || name === "inspection-checklists"),
  aiFeature: (feature: string, details: Record<string, unknown>) =>
    request<{ feature: string; content: string; isDraft: boolean }>("/api/ai/features", json("POST", { payload: { feature, details } })),
  chat: (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, max_tokens = 600) =>
    request<{ model: string; message: { role: "assistant"; content: string } }>(
      "/api/chat",
      json("POST", { messages, max_tokens }),
    ),
};
