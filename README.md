# Devagya — Student Services Assistant

**Team:** DEVAGYA (ID: DEVI11) · **Problem Statement:** DEV-C02 — Student Services Assistant (Meridian)
**Members:** Neeraj (Team Lead), Khushi Tiwari, Tulsi Bansal, Aditya Bharatwal

Devagya is a web chatbot that answers routine campus questions in English, Hindi or Hinglish
(faculty and cabins, fees, exams, rooms, hostels, campus places, question papers, attendance, scholarship guidance).

> **All university data in this project is fictional demo data.** Answers are labelled
> "Demo data — official university information nahi hai".

**Live demo:** https://devagya.vercel.app  ·  **Repository:** https://github.com/radhe-8075/devagya

---

## 1. What is actually implemented

```
Browser (public/: HTML, CSS, JavaScript)
   │  POST /api/chat  { question, context }
   ▼
Express server (server.js)  ── GET /api/health, POST /api/admin/status (staff, key protected)
   │
   ├─ 0. Service-request workflow (workflow.js): apply -> guided form -> Request ID -> tracking
   ├─ 1. Normalise text + fix common typos (edit-distance matching)
   ├─ 2. Detect intent and entities (rules for English / Hindi / Hinglish)
   ├─ 3. Apply conversation context (follow-up questions)
   ├─ 4. Look up answer in knowledge-base.js  (deterministic, no guessing)
   └─ 5. Return formatted answer + follow-up suggestions
```

| Feature | Status |
|---|---|
| Chat UI with quick prompts and clickable follow-up suggestions | Implemented |
| Intent detection: faculty, room, fee, exam, paper, campus, hostel, academic, scholarship, certificate/document, intro | Implemented |
| English / Hindi (Devanagari) / Hinglish questions, **answered in the language of the question** | Implemented (rule based) |
| Typo tolerance (e.g. "facluty", "hostle") | Implemented |
| Follow-up memory (e.g. "uska room kaunsa hai?", "aur MBA ki?") | Implemented |
| Honest fallback for unknown questions and missing records | Implemented |
| Certificate information (bonafide, character) from the demo knowledge base | Implemented |
| **Guided service request**: "I want to apply for a bonafide certificate" asks name, roll number and certificate type one by one, saves the request and returns a Request ID (BON-1001, CHR-1001) | Implemented (English / Hinglish / Hindi) |
| **Request tracking**: "What is the status of my request BON-1001?" | Implemented |
| Staff status change (CLI `node set-status.js` or key-protected `POST /api/admin/status`) | Implemented |
| Safe fallback for topics without verified records (exact timetable, results, marks, admit card, syllabus) | Implemented |
| Optional AI question classifier (OpenAI) | Code present, **disabled in the demo** (no API key set) |
| **LLM answers for unknown questions** (Gemini or OpenAI, `llm.js`): answers only from `knowledge-base.js`, never receives form/personal data, falls back to the rule-based reply if the LLM fails. Needs `GEMINI_API_KEY` (or `OPENAI_API_KEY`) | Implemented, **active only when a key is set** |
| Optional n8n AI helper for unknown questions | Code present, **disabled in the demo** (no webhook set) |
| Events, certificates and documents records | **Not populated yet** — bot says records are unavailable |

## Devagya 2.0 — Smart Campus layer

The devagya-2.0 branch adds an optional Smart Campus dashboard while preserving the original chatbot, language handling, faculty finder and certificate workflow.

| Module | Current implementation | Important limitation |
|---|---|---|
| Devagya AI Brain | Existing English / Hindi / Hinglish chatbot and knowledge-base answers | University records remain demo records |
| Career Navigator | Goal-based roadmap templates and skills-gap comparison | Guidance only; no placement prediction |
| Campus Radar | Category-filtered opportunity and learning activity cards | All entries are sample/demo listings, not verified live registrations |
| Find My Team | Skill-overlap matching against fictional profiles | No real student profiles or public sign-up |
| Campus XP | Browser-local points, daily streak and achievement badges | Progress stays on this device; not linked to grades or attendance |
| StudyMate AI | Explain, summarise, flashcard and practice modes via OpenAI Responses API | Requires OPENAI_API_KEY; unavailable when key is absent |
| Smart Campus Navigator | Safe empty-state directory response | No verified faculty/cabin/location directory is connected |
| Student Services | Existing guided Bonafide / Character request and Request ID tracking | Existing JSON storage is local/temporary on serverless hosting |
| n8n Automation | Server-side webhook dispatch; certificate event hook | Requires a dedicated n8n workflow and environment configuration |
| Authentication / database | Not implemented in this branch | Add a real identity provider and persistent database before real student use |

### Smart Campus API routes

- GET /api/smart-campus/meta — reports which optional integrations are configured.
- GET /api/smart-campus/radar?category=all — returns clearly marked sample opportunities.
- POST /api/smart-campus/career/plan — accepts a goal and list of current skills.
- GET /api/smart-campus/teams?skills=JavaScript,Python — returns fictional sample matches.
- GET /api/smart-campus/directory — safe empty state until verified data is supplied.
- POST /api/smart-campus/study/assist — accepts a topic and mode; uses the configured OpenAI key.
- POST /api/smart-campus/automation/dispatch — requires the x-automation-key header and an allow-listed event.

### Optional Smart Campus environment settings

Set these in the local .env or Vercel Project Settings → Environment Variables. Never put secrets in browser JavaScript or commit a real .env file.

| Variable | Purpose |
|---|---|
| OPENAI_API_KEY | Enables StudyMate generated responses (the existing server-side key may be reused) |
| OPENAI_MODEL | OpenAI model name used by StudyMate |
| N8N_SMART_CAMPUS_WEBHOOK_URL | Dedicated n8n webhook URL; not exposed to the browser |
| AUTOMATION_API_KEY | Protects the manual server-to-server automation dispatch endpoint |

When a certificate request is successfully created, the workflow emits a minimal event containing only Request ID, certificate type and creation time. It does not send the student's name or roll number to n8n. The automatic event is skipped unless N8N_SMART_CAMPUS_WEBHOOK_URL is set. The webhook should validate the event header and use an allow-list for actions.

### Before using with real students

This remains a student project demo, not an official GLA University system. Do not enter real student personal data until authentication, role-based access, consent, retention/deletion, persistent encrypted storage, rate limiting and university approval are in place. Replace every sample opportunity and demo profile with source-backed approved records before showing them as real. Add verified directory entries only with permission. Do not infer fees, exam dates, faculty cabins or policy details.

## 2. Run it locally

Requires Node.js 22 or newer.

```bash
npm install
npm start          # open http://localhost:3000
npm test           # runs the automated tests
```

Optional environment variables (copy `.env.example` to `.env`; never commit `.env`):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional AI question classifier. Leave empty to run fully rule-based. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | LLM for questions the rules cannot understand (Gemini tried first, then OpenAI). |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | Optional n8n workflow used only when local matching cannot understand a question. |
| `PORT` | Local port (default 3000). |
| `REQUESTS_FILE` | Where service requests are saved (default `data/requests.json`). |
| `ADMIN_KEY` | Secret for `POST /api/admin/status`. If empty, that endpoint is disabled. |

Deployed on Vercel from the `main` branch; static files are served from `public/`.

## 3. Tests

`npm test` starts the real server and checks **97 cases**: chat scenarios in English, Hindi and Hinglish
(including follow-up conversations and typo cases), that every suggestion button in all three languages
leads to a real answer, empty and very long input, the health endpoint, that private files
(`server.js`, `.env`, `package.json`) cannot be downloaded, and that the website loads.

Baseline on the original main branch before this upgrade: **97 passed, 0 failed**. Devagya 2.0 branch validation on Node.js 22: **105 passed, 0 failed** (including Smart Campus API, demo-data labelling, integration guard and privacy checks). The existing service-request tests continue to cover apply, Request ID, tracking, Hinglish and Hindi flows, invalid input, cancel, tampered workflow state, safe fallback and the staff status endpoint.

**Stress test:** `node stress-test.js` generates 1,1xx questions (`STRESS_MULT=20 node stress-test.js` generates about 11,100: English, Hinglish and Hindi, polite prefixes and suffixes such as "sir", typos, missing branches, subjects and rooms, other languages, out-of-scope and unsafe inputs) and checks every answer against `knowledge-base.js`. Original main branch baseline: **11,134 of 11,134 passed**. Devagya 2.0 branch validation: **1,084 of 1,084 passed** in the CI run (November 13, 2026). The stress test covers the existing rule-based chatbot; it does not simulate live external AI or n8n calls.

### Sample inputs and outputs

| Input | Output |
|---|---|
| `Who is the CSE HOD?` | `👤 Dr. Aarav Sharma` · `🏫 CSE • HOD • B.Tech` · `📍 Room 3001, Academic Block A, 3rd Floor` |
| `Data Structures exam kab hai?` | `📅 Data Structures — Mid-Semester` · `🗓️ Sun, 15 Nov, 2026 ⏰ 10:00 AM` · `📍 Academic Block A` (and the End-Semester exam) |
| `hostel fee kitni hai` | `💳 B.Tech CSE — hostel fee` · `₹85,000 per year (2026-2027)` |
| `Dr. Neha Verma CSE` then `uska room kaunsa hai?` | `👤 Dr. Neha Verma` · `📍 Room 302, Academic Block A, 3rd Floor` |
| `B.Tech CSE tuition fee` then `aur MBA ki?` | `💳 MBA — tuition fee` · `₹90,000 per semester (2026-2027)` |
| `Room 9999 kis block mein hai?` | `Room 9999 ka record nahi mila. Main block guess nahi karunga.` |
| `Where is the library?` | `🏛️ Central Library` · `📍 Library Block L, Ground Floor` (English answer) |
| `लाइब्रेरी कहाँ है?` | Same record, with the demo-data notice in Hindi |

## 4. Known limitations and failure cases

- The knowledge base is small and fictional; real deployment needs approved university records.
- Understanding is mainly rule based; unusual phrasings go to the LLM (only if its key is set and it answers in time) or else fall back to a polite "I couldn't understand" reply with suggested questions. LLM answers (marked 🤖) can vary in quality and are not covered by the automated tests (the tests use a mock LLM).
- Only English, Hindi (Devanagari) and Hinglish are supported. Text in another script (for example Tamil) gets a message saying so.
- Hindi support covers common words and phrases, not every possible sentence.
- Some records are marked "to be confirmed" (English/Maths faculty cabins, hostel and café locations); the bot says so instead of guessing.
- The demo has three faculty records with the same name (different departments), so a name-only query returns all matches.
- Events, certificates and documents have no records yet.
- Service requests are saved in a local JSON file (`data/requests.json`). This is fine for a local demo. On Vercel the disk is temporary, so a real database is needed for permanent storage.
- Requests are **not sent to any real university office**; there is no student login, so anyone who knows a Request ID can see its status (the name is masked, the roll number is never shown). A real deployment needs login, role-based access and an encrypted database.
- Only two certificate types are supported in the request flow (Bonafide, Character). Status changes are made by staff through the CLI or the key-protected endpoint.
- Follow-up memory keeps only the last topic and is stored in the browser, not on the server.
- Faculty "Cabin Finder" search on the page reuses the chat backend.

**Next steps:** load approved university data with source and last-updated fields, add events/certificates records, add more Hindi (Devanagari) phrasings, add logging of unanswered questions, and pilot with real students.

## 5. Disclosure of third-party components and AI assistance

| Component | Use |
|---|---|
| Node.js, Express 5 | Backend server (open source) |
| dotenv | Loads local environment variables (open source) |
| openai (npm package) | Optional classifier client; **not used in the demo (no key configured)** |
| Google Gemini API (`llm.js`) | LLM for questions the rules cannot understand. Active only when `GEMINI_API_KEY` is set. It receives only the question text and the content of `knowledge-base.js`, never service-request or personal data; answers marked 🤖 come from it. If it fails, the rule-based reply is used. |
| n8n webhook | Optional helper; **not used in the demo** |
| Vercel | Hosting |
| Datasets / pretrained models | No dataset. All data is hand-written demo data in `knowledge-base.js`. The only pretrained model is the Gemini LLM called through its API (see above). |
| Templates | None; the website was written for this project |
| AI-assisted tools | AI coding assistants (ChatGPT and Claude) were used for development help, debugging and documentation. The team reviewed and tested the result. |

## 6. Demo setup instructions

- Open the live link, click **Ask Devagya**, and try: `tum kon ho`, `English teacher`, `Exam fees kitni hai?`, `Girls hostel list`, then a follow-up such as `uska room kaunsa hai?`.
- No login or credentials are needed. Use only dummy names and roll numbers: the request demo saves them in `data/requests.json` on the machine running the server.
- Request demo: `I need information about a bonafide certificate` → `I want to apply for a bonafide certificate` → name → roll number → `Bonafide Certificate` → note the Request ID → `What is the status of my request BON-1001?`. To show a status change, run `node set-status.js BON-1001 "Under Review"` and ask again.
- Safe fallback demo: `What is the exact timetable for next semester?`
- Backup: run locally with `npm install && npm start` and open `http://localhost:3000`. Keep a short screen recording of the demo as a clearly labelled backup.
