# RentRight frontend route → backend API map

This map covers the React routes declared in `src/App.tsx`. The backend endpoints and a typed client are committed on `feat/nemotron-chat-backend`. **Creating an API client does not automatically replace the existing demo/localStorage logic inside every page**; use this map while migrating each page to live API calls.

| Frontend route / component | Backend API | Coverage / integration notes |
|---|---|---|
| `/` | `GET /api/properties` | Featured properties; connect the homepage data source. |
| `/properties` | `GET /api/properties` with filters | Search, budget, locality, status and verification filters. |
| `/property/:id` | `GET /api/properties/{id}`, `POST /api/properties/{id}/views`, `GET/POST /api/properties/{id}/reviews` | Detail, views and renter reviews. |
| `/compare` | `GET /api/properties` | Compare selected property data client-side; no dedicated compare persistence is required yet. |
| `/affordability` | `POST /api/tools/affordability` | Server-side affordability calculation. |
| `/roommate-matcher` | `POST /api/tools/roommate-match` | Compares only supplied lifestyle answers. |
| `/inspection-checklist` | `POST /api/tools/inspection-checklists`, `GET /api/me/records/inspection-checklist` | Save and retrieve signed-in user's checklist records. |
| `/locality-compare` | `POST /api/tools/locality-compare` | API scaffold only; requires verified locality data for live comparisons. |
| `/commute-calculator` | `POST /api/tools/commute` | Estimate from user-provided distance/speed/fare. |
| `/split-rent` | `POST /api/tools/split-rent` | Equal or weighted rent split. |
| `/fake-detector` | `POST /api/tools/fake-listing-check` | Checklist signals only, not an authenticity verdict. |
| `/heatmap` | `POST /api/tools/heatmap` | Map-ready data pass-through; needs a trusted geospatial/rent dataset. |
| `/ai-negotiator` | `POST /api/tools/negotiation` or `POST /api/ai/features` | Deterministic draft or Nemotron-generated draft. |
| `/deposit-trust` | `POST /api/tools/deposit-trust` | Evidence checklist, not a legal or credit score. |
| `/rent-agreement` | `POST /api/tools/rent-agreement-draft` | Input checklist only; not a legally certified agreement. |
| `/safety-helpline` | `POST /api/tools/safety` | General safety information; not emergency dispatch. |
| `/maintenance` | `POST/GET /api/tools/maintenance` | User-owned maintenance records. |
| `/broker-fee` | `POST /api/tools/broker-fee` | Fee estimate. |
| `/moving-cost` | `POST /api/tools/moving-cost` or `POST /api/ai/features` | Calculator or AI-generated moving-plan draft. |
| `/payment-reminder` | `POST/GET /api/tools/payment-reminders` | User-owned reminder records; a real notification scheduler is not included yet. |
| `/tools` | Combination of the tool endpoints above | Directory/landing page, not a separate data service. |
| `/owner/enquiries` | `GET /api/owner/inquiries`, `PATCH /api/owner/inquiries/{id}` | Requires Firebase ID token; server verifies listing ownership. |
| `/owner/dashboard` | `GET /api/owner/dashboard`, `POST /api/owner/properties/{id}/renew` | Owner counts, inquiry summary and listing renewal. |
| `/dashboard` | `GET /api/me/inquiries`, `GET /api/me/saved-properties`, `GET /api/me/records/{type}` | Connect each dashboard panel to the relevant user-owned records. |
| `/login`, `/register` | Firebase Authentication | Backend protected routes verify Firebase ID tokens. Do not use demo login or localStorage role values for authorization. |
| `/contact` | `POST /api/contact` | Stores contact form submission as a support ticket. |
| `/about`, `/unauthorized`, `/login`, `/register`, `/not-found` | Usually none | Static pages or Firebase client-side auth. |
| ChatBot | `POST /api/chat` | Open-model chat; update the ChatBot component to use `backendApi.chat`. |
| VoiceCallAgent | `POST /api/voice/sessions` | Stores session metadata only; speech recognition/TTS provider integration is still required. |
| OutperoCallWidget | Provider-specific secured server endpoint required | No outbound calling provider integration is implemented by these changes. Never expose provider credentials in the browser. |
| Admin tools | `GET /api/admin/metrics`, `GET /api/admin/reports`, `PATCH /api/admin/reports/{id}`, `POST /api/admin/properties/{id}/verification` | Requires Firebase UID allowlisting via `FIREBASE_ADMIN_UIDS`. |

## Current deployment status

- Backend route code and a frontend API helper are committed to this branch.
- Frontend pages have **not yet all been refactored** to call the new APIs.
- Hosted backend deployment, Firebase service identity configuration, database migration/backup setup, and end-to-end tests remain required.
- SQLite is only for local development. Set `DATABASE_URL` to managed PostgreSQL before a multi-instance production deployment.
