# Devagya — Student Services Assistant

**Team:** DEVAGYA (ID: DEVI11) · **Problem Statement:** DEV-C02 — Student Services Assistant (Meridian)
**Members:** Neeraj (Team Lead), Khushi Tiwari, Tulsi Bansal, Aditya Bharatwal

Devagya is a web chatbot that answers routine campus questions in English, Hindi or Hinglish
(faculty and cabins, fees, exams, rooms, hostels, campus places, question papers, attendance, scholarship guidance).

> **All university data in this project is fictional demo data.** Answers are labelled
> "Demo data — official university information nahi hai".

**Live demo:** `<paste your Vercel link here>`  ·  **Repository:** `<paste your GitHub link here>`

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
| Optional n8n AI helper for unknown questions | Code present, **disabled in the demo** (no webhook set) |
| Events, certificates and documents records | **Not populated yet** — bot says records are unavailable |

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
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | Optional n8n workflow used only when local matching cannot understand a question. |
| `PORT` | Local port (default 3000). |
| `REQUESTS_FILE` | Where service requests are saved (default `data/requests.json`). |
| `ADMIN_KEY` | Secret for `POST /api/admin/status`. If empty, that endpoint is disabled. |

Deployed on Vercel from the `main` branch; static files are served from `public/`.

## 3. Tests

`npm test` starts the real server and checks **75 cases**: chat scenarios in English, Hindi and Hinglish
(including follow-up conversations and typo cases), that every suggestion button in all three languages
leads to a real answer, empty and very long input, the health endpoint, that private files
(`server.js`, `.env`, `package.json`) cannot be downloaded, and that the website loads.

Latest run: **75 passed, 0 failed.** The service-request tests cover apply, Request ID, tracking, Hinglish and Hindi flows, invalid input, cancel, a tampered workflow state, the safe fallback and the staff status endpoint.

### Sample inputs and outputs

| Input | Output |
|---|---|
| `Who is the CSE HOD?` | `👤 Dr. Aarav Sharma` · `🏫 CSE • HOD • B.Tech` · `📍 Room 3001, Academic Block A, 3rd Floor` |
| `Data Structures exam kab hai?` | `📅 Data Structures — Mid-Semester` · `🗓️ Sun, 15 Nov, 2026 ⏰ 10:00 AM` · `📍 Academic Block A` (and the End-Semester exam) |
| `hostel fee kitni hai` | `💳 B.Tech CSE — hostel fee` · `₹85,000 per year (2026-2027)` |
| `Dr. Neha Verma CSE` then `uska room kaunsa hai?` | `👤 Dr. Neha Verma` · `📍 Room 302, Academic Block A, 3rd Floor` |
| `B.Tech CSE tuition fee` then `aur MBA ki?` | `💳 MBA MBA — tuition fee` · `₹90,000 per semester (2026-2027)` |
| `Room 9999 kis block mein hai?` | `Room 9999 ka record nahi mila. Main block guess nahi karunga.` |
| `Where is the library?` | `🏛️ Central Library` · `📍 Library Block L, Ground Floor` (English answer) |
| `लाइब्रेरी कहाँ है?` | Same record, with the demo-data notice in Hindi |

## 4. Known limitations and failure cases

- The knowledge base is small and fictional; real deployment needs approved university records.
- Understanding is rule based, so unusual phrasings can fall back to a polite "I couldn't understand" reply (in the user's language) with suggested questions.
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
| n8n webhook | Optional helper; **not used in the demo** |
| Vercel | Hosting |
| Datasets / pretrained models | None. All data is hand-written demo data in `knowledge-base.js` |
| Templates | None; the website was written for this project |
| AI-assisted tools | AI coding assistants (ChatGPT and Claude) were used for development help, debugging and documentation. The team reviewed and tested the result. |

## 6. Demo setup instructions

- Open the live link, click **Ask Devagya**, and try: `tum kon ho`, `English teacher`, `Exam fees kitni hai?`, `Girls hostel list`, then a follow-up such as `uska room kaunsa hai?`.
- No login or credentials are needed. Use only dummy names and roll numbers: the request demo saves them in `data/requests.json` on the machine running the server.
- Request demo: `I need information about a bonafide certificate` → `I want to apply for a bonafide certificate` → name → roll number → `Bonafide Certificate` → note the Request ID → `What is the status of my request BON-1001?`. To show a status change, run `node set-status.js BON-1001 "Under Review"` and ask again.
- Safe fallback demo: `What is the exact timetable for next semester?`
- Backup: run locally with `npm install && npm start` and open `http://localhost:3000`. Keep a short screen recording of the demo as a clearly labelled backup.
