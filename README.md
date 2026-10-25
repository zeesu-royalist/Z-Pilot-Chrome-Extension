# 🚀 Z-Pilot: AI-Powered Browser Assistant & Automation Agent

> A modern, secure, and extensible AI browser assistant for Google Chrome and Brave, powered by **Google Gemini** and built with **Manifest V3**, **React**, **TypeScript**, and **Express.js**.

---

## 📖 Table of Contents

1. [Product Overview](#-product-overview)
2. [Architecture & Workflow](#-architecture--workflow)
3. [Key Features](#-key-features)
4. [Technology Stack](#-technology-stack)
5. [Prerequisites](#-prerequisites)
6. [Project Structure](#-project-structure)
7. [Installation & Setup](#-installation--setup)
8. [Getting a Google Gemini API Key](#-getting-a-google-gemini-api-key)
9. [Running the Backend](#-running-the-backend)
10. [Building the Extension](#-building-the-extension)
11. [Loading the Extension in Chrome & Brave](#-loading-the-extension-in-chrome--brave)
12. [Step-by-Step Feature Testing Guide](#-step-by-step-feature-testing-guide)
13. [Security & Privacy Architecture](#-security--privacy-architecture)
14. [Testing & Quality Verification](#-testing--quality-verification)
15. [Known Limitations](#-known-limitations)
16. [Troubleshooting Guide](#-troubleshooting-guide)
17. [Future Roadmap](#-future-roadmap)

---

## 💡 Product Overview

**Z-Pilot** transforms your web browser into an intelligent workspace. Instead of manually navigating menus, searching through documentation, copying text, or filling repetitive form fields, you can instruct Z-Pilot using natural language in a sleek, non-intrusive **Chrome Side Panel**.

Z-Pilot reads the active page with your permission, consults Google Gemini to determine a structured action plan, previews consequential actions for user approval, and executes supported browser actions with real DOM verification.

---

## 🏛️ Architecture & Workflow

Z-Pilot enforces a strict **separation of concerns** between AI decision planning, browser execution, and secret management:

```
┌─────────────────────────────────────────────────────────────┐
│                      Chrome Browser                         │
│                                                             │
│   ┌─────────────────────┐        ┌──────────────────────┐   │
│   │  Active Web Page    │        │  Z-Pilot Side Panel  │   │
│   │  (DOM / Inputs)     │        │  (React + Tailwind)  │   │
│   └──────────▲──────────┘        └──────────▲───────────┘   │
│              │                              │               │
│              │ Chrome Messaging             │               │
│              ▼                              ▼               │
│   ┌─────────────────────┐        ┌──────────────────────┐   │
│   │ Content Script      │◄───────┤ Extension App State  │   │
│   │ (page-agent.ts)     │        │ (Storage + Executor) │   │
│   └─────────────────────┘        └──────────▲───────────┘   │
└─────────────────────────────────────────────┼───────────────┘
                                              │ HTTP JSON
                                              │ (localhost)
                                              ▼
                        ┌─────────────────────────────────────┐
                        │      Z-Pilot Express Backend        │
                        │                                     │
                        │  • Rate Limiting & Helmet Security  │
                        │  • Payload Sanitization             │
                        │  • Agent Planner (Zod Validation)   │
                        │  • Secret Storage (GEMINI_API_KEY)  │
                        └─────────────────▲───────────────────┘
                                          │ Google GenAI SDK
                                          ▼
                        ┌─────────────────────────────────────┐
                        │          Google Gemini AI           │
                        │      (gemini-2.5-flash / JSON)      │
                        └─────────────────────────────────────┘
```

### The Autonomous Agent Execution Cycle:

1. **User Command:** User opens side panel and issues an instruction (e.g. *"Fill out this form with my details"* or *"Play Arijit Singh on YouTube"*).
2. **Context Collection:** Extension queries the active tab and extracts clean page text and discovered form metadata via the content script.
3. **Context Sanitization:** Page text is bounded (up to 15,000 characters) and flagged as **untrusted data**.
4. **Backend Planning:** The Express backend prompts Google Gemini using low temperature (`0.2`) and strict system instructions to produce a structured JSON action plan.
5. **Allowlist Validation:** The backend validates every proposed action against an allowed list using **Zod**. Arbitrary JavaScript execution is impossible.
6. **User Approval (Consequential Actions):** If an action modifies page state (like `FILL_FORM`), Z-Pilot renders an **Action Preview** card with a list of values to be entered, target URL, and risk level. Execution pauses until the user clicks **Approve & Execute**.
7. **Action Execution & Verification:** The browser action service runs the approved actions step-by-step and inspects DOM return values.
8. **Feedback:** Success or failure status for each step is reported directly in the chat interface.

---

## ✨ Key Features

- **🌐 Website Understanding & Page Explainer:** Explains the purpose, key features, and user capabilities of any active website in concise bullet points.
- **📄 Page Summarization:** Extracts readable page content and returns highlights without advertisements or clutter.
- **🎵 YouTube Navigation & Playback:** Parses song queries, searches YouTube, selects the top video result, and attempts playback.
- **📝 Safe Form Detection & Autofill:** Discovers inputs, labels, selects, and textareas across forms, previews values, requires explicit user approval, dispatches synthetic input/change events, and verifies field values.
- **👤 Local Profile Manager:** Store personal details (name, email, phone, company, address) securely in your browser's local sandbox for 1-click form autofill.
- **🔒 Security First:** Your Gemini API key never touches the extension bundle or client memory. Untrusted webpage text is isolated to prevent prompt injection.
- **🎨 Sleek Dark-Mode SaaS UI:** Designed with an electric violet aesthetic, custom scrollbars, auto-resizing input textarea, active tab status indicator, and interactive suggested prompt cards.
- **🛑 Plan Cancellation:** Stop or cancel ongoing action plans at any time.

---

## 🛠️ Technology Stack

### Extension Frontend
- **Framework:** React 18
- **Language:** TypeScript 5.7
- **Bundler:** Vite 6
- **Styling:** Tailwind CSS 3.4
- **Icons:** Lucide React
- **Architecture:** Chrome Extension Manifest V3 (Side Panel API, Tabs API, Scripting API, Storage API)

### Backend
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Language:** TypeScript (ES2022 / NodeNext)
- **Validation:** Zod
- **Security:** Helmet, express-rate-limit, cors

### AI Engine
- **Provider:** Google Gemini API
- **SDK:** Official `@google/genai` SDK
- **Model:** `gemini-2.5-flash` (configurable via `GEMINI_MODEL`)
- **Mode:** Structured JSON Schema Output

---

## 📋 Prerequisites

Before starting, ensure you have:
1. **Node.js** (v18 or higher recommended, tested on Node v22)
2. **npm** (v9 or higher)
3. **Google Chrome** or **Brave Browser** (Chromium-based browser supporting Manifest V3 Side Panel)
4. A free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

---

## 📂 Project Structure

```
Z-Pilot/
├── backend/                         # Express.js + Gemini AI Backend
│   ├── src/
│   │   ├── middleware/
│   │   │   └── security.ts          # Rate limiting, payload truncation, error handling
│   │   ├── routes/
│   │   │   ├── chat.ts              # POST /api/chat endpoint with Zod validation
│   │   │   └── health.ts            # GET /api/health diagnostic endpoint
│   │   ├── services/
│   │   │   ├── agent-planner.ts     # Action allowlist, Zod schemas, risk assessment
│   │   │   └── gemini.ts            # GoogleGenAI client, prompt templates, structured output
│   │   ├── types/
│   │   │   └── index.ts             # Shared backend types
│   │   ├── app.ts                   # Express app configuration & CORS
│   │   └── server.ts                # Server entry point
│   ├── tests/
│   │   ├── planner.test.ts          # Action validation & plan sanitization tests
│   │   └── security.test.ts         # Middleware & payload truncation tests
│   ├── .env.example                 # Environment variables template
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── extension/                       # Chrome Manifest V3 Extension
│   ├── public/
│   │   ├── icons/                   # Generated PNG icons (16, 32, 48, 128 px)
│   │   └── manifest.json            # Manifest V3 specification
│   ├── src/
│   │   ├── background/
│   │   │   └── service-worker.ts    # Service worker managing side panel click events
│   │   ├── content/
│   │   │   └── page-agent.ts        # DOM inspector, text extractor, form filler
│   │   ├── components/
│   │   │   ├── Header.tsx           # Brand header with status dot & actions
│   │   │   ├── WelcomeScreen.tsx    # Greeting & interactive prompt cards
│   │   │   ├── ChatWindow.tsx       # Auto-scrolling conversation feed
│   │   │   ├── ChatMessage.tsx      # Messages with steps, approval cards, copy tool
│   │   │   ├── ChatInput.tsx        # Multiline input, page badge, send/stop controls
│   │   │   ├── ActionPreview.tsx    # User confirmation card for form filling
│   │   │   ├── SettingsPanel.tsx    # Connection diagnostics, backend URL, clear history
│   │   │   └── ProfileModal.tsx     # Local autofill profile manager
│   │   ├── services/
│   │   │   ├── api.ts               # Backend communication & timeout handling
│   │   │   ├── browser-actions.ts   # Tab management & action execution engine
│   │   │   └── storage.ts           # chrome.storage.local wrapper with fallback
│   │   ├── types/
│   │   │   └── index.ts             # Extension TypeScript interfaces
│   │   ├── App.tsx                  # Main application orchestrator
│   │   ├── main.tsx                 # React DOM mount point
│   │   └── styles.css               # Tailwind directives & custom scrollbars
│   ├── tests/
│   │   └── browser-actions.test.ts  # Browser action safety & storage tests
│   ├── sidepanel.html               # Side panel entry HTML
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts               # Multi-entry Vite bundler configuration
│
├── .gitignore                       # Git ignore rules for node_modules, dist, .env
└── README.md                        # Complete documentation
```

---

## 🔑 Getting a Google Gemini API Key

1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
2. Sign in with your Google Account.
3. Click **"Get API key"** in the top navigation.
4. Click **"Create API key"** (select an existing Google Cloud project or create a free new one).
5. Copy your generated API key.

---

## ⚙️ Installation & Setup

Clone or open the repository directory:
```bash
cd /Users/zeesuroyalist/Documents/Z-Pilot
```

### 1. Install Backend Dependencies
```bash
cd backend
npm install
```

### 2. Configure Backend Environment
Copy the `.env.example` file to create `.env`:
```bash
cp .env.example .env
```

Open `backend/.env` in your text editor and insert your Gemini API key:
```env
HOST=127.0.0.1
PORT=3000
GEMINI_API_KEY=AIzaSy...your_actual_key_here
GEMINI_MODEL=gemini-2.5-flash
ALLOWED_ORIGINS=*
NODE_ENV=development
```

### 3. Install Extension Dependencies
```bash
cd ../extension
npm install
```

---

## 🏃 Running the Backend

In the `backend/` directory, start the development server:
```bash
npm run dev
```

You should see:
```
----------------------------------------------------
🚀 Z-Pilot AI Assistant Backend
----------------------------------------------------
✅ Gemini API Key detected.
🧠 Model configured: gemini-2.5-flash
⚡ Server running on http://127.0.0.1:3000
🩺 Health check: http://127.0.0.1:3000/api/health
----------------------------------------------------
```

To verify the backend is active, open `http://127.0.0.1:3000/api/health` in your browser. You should receive:
```json
{
  "status": "ok",
  "service": "Z-Pilot Backend",
  "version": "1.0.0",
  "gemini": {
    "configured": true,
    "model": "gemini-2.5-flash",
    "status": "ready"
  }
}
```

---

## 📦 Building the Extension

In the `extension/` directory, run:
```bash
npm run build
```

This compiles TypeScript and builds the production-ready extension into `extension/dist/`:
- `dist/manifest.json`: Manifest V3 config
- `dist/sidepanel.html`: Extension Side Panel UI
- `dist/background.js`: Service worker
- `dist/content.js`: Self-contained page content script
- `dist/icons/`: High-resolution extension icons
- `dist/assets/`: Bundled React components and Tailwind CSS

---

## 🌐 Loading the Extension in Chrome & Brave

### In Google Chrome:
1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** via the toggle switch in the top-right corner.
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select the **`extension/dist/`** directory (inside `Z-Pilot/extension/dist`).
6. Click the Extensions puzzle icon in the Chrome toolbar and pin **Z-Pilot**.
7. Click the **Z-Pilot** icon in the toolbar. The **Z-Pilot Side Panel** will open on the right side of your browser!

### In Brave Browser:
1. Open Brave Browser.
2. Navigate to `brave://extensions/`.
3. Enable **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"**.
5. Select the **`extension/dist/`** folder.
6. Pin **Z-Pilot** and click its icon to open the Side Panel.

---

## 🧪 Step-by-Step Feature Testing Guide

### Test 1: Website Understanding & Explanation
1. Navigate to any website (e.g. [https://news.ycombinator.com](https://news.ycombinator.com) or [https://wikipedia.org](https://wikipedia.org)).
2. Open the Z-Pilot Side Panel.
3. Notice that the active tab title appears in the input badge.
4. Click the **"Explain this website"** card or type:
   > *"Explain what this website does and its main purpose."*
5. Z-Pilot extracts page text, sends it to the backend, and returns a clear, structured summary explaining the site's functionality.

### Test 2: Webpage Summarization
1. Navigate to a long article or documentation page (e.g. [https://react.dev](https://react.dev)).
2. Type in Z-Pilot:
   > *"Summarize this page and give me the key points."*
3. Z-Pilot digests the content and provides bulleted takeaways.

### Test 3: YouTube Search & Video Playback
1. Open Z-Pilot and type:
   > *"Open YouTube and play a song by Arijit Singh."*
2. Z-Pilot plans two actions:
   - Action 1: Search YouTube for the query.
   - Action 2: Find the top video result and initiate playback.
3. The browser automatically navigates to YouTube, finds the result, and reports playback status in the chat.

### Test 4: Safe Form Detection, Preview & Autofill
1. First, click the **Settings icon** (⚙️) in the Z-Pilot header.
2. Click **"Edit Profile"** under Form Autofill Profile.
3. Enter your sample information (e.g., Full Name: `Jane Doe`, Email: `jane@example.com`, Phone: `+1 555-0199`, Company: `Acme Inc`).
4. Click **"Save Profile"**.
5. Navigate to any web page containing a form (or a test form).
6. In Z-Pilot, type:
   > *"Find the form on this page and fill it using my profile details."*
7. **Notice the Security Preview Card:**
   - Z-Pilot detects the form fields on the page.
   - It matches them with your saved profile.
   - It **does NOT modify the page immediately**.
   - An **Action Preview** card appears displaying the exact fields and values to be entered with risk level.
8. Click **"Approve & Execute"**.
9. The content script fills the fields, fires standard DOM `input` and `change` events for React/Vue compatibility, verifies that the values applied, and confirms the result.

### Test 5: Web Search
1. In Z-Pilot, type:
   > *"Search Google for JavaScript interview questions."*
2. Z-Pilot navigates to Google search with the encoded query.

---

## 🛡️ Security & Privacy Architecture

Security was designed into Z-Pilot from the foundation:

1. **API Key Isolation:**
   - The `GEMINI_API_KEY` is exclusively read by the Node.js backend.
   - It is never compiled into the extension bundle, stored in `chrome.storage`, or exposed in network requests from the client.
2. **Untrusted Page Content Defense:**
   - Webpage titles, URLs, and DOM text are treated as **untrusted data**.
   - System prompts enforce strict safety boundaries: prompt injections or malicious instructions embedded in webpage text are ignored.
3. **Constrained Action Schema:**
   - Z-Pilot supports only 9 predefined action types (`NAVIGATE`, `SEARCH_WEB`, `SEARCH_YOUTUBE`, `READ_CURRENT_PAGE`, `SUMMARIZE_PAGE`, `FILL_FORM`, `WAIT_FOR_PAGE`, `ASK_USER`, `REPORT_RESULT`).
   - Every action is strictly validated with Zod against an allowlist before execution.
   - Execution of arbitrary JavaScript strings (e.g. `eval` or dynamic code strings) is strictly prohibited.
4. **Mandatory Approval for Consequential Actions:**
   - Any action that inputs data into form fields (`FILL_FORM`) is forced to `requiresApproval: true` and `riskLevel: 'medium'` by the backend validator.
   - Automatic submission of payment forms, credit card numbers, or passwords is blocked.
5. **Restricted Pages Protection:**
   - Content scripts and actions are prevented from executing on protected browser pages (`chrome://*`, `chrome-extension://*`, `edge://*`, `brave://*`, and Chrome Web Store).
6. **Local-Only Storage:**
   - Conversation history and autofill profile data remain solely in `chrome.storage.local` within your local browser.

---

## 🧪 Testing & Quality Verification

Both the backend and extension include automated test suites.

### Running Backend Tests:
```bash
cd backend
npm test
```
Tests verify (10 test cases):
- Action allowlist constraints.
- Rejection and sanitization of unsupported actions.
- Protocol injection guards (rejects `javascript:`, `file:`, `data:`).
- Mandatory approval enforcement on `FILL_FORM`.
- Sensitive credential filtering (passwords, PINs, cards).
- Secret redacting from error logs and traces.
- Payload size truncation and sanitization.

### Running Extension Tests:
```bash
cd extension
npm test
```
Tests verify (8 test cases):
- Restricted URL detection (`chrome://`, `about:blank`, webstore).
- Permitted standard web URLs.
- Storage service fallback and message history length bounding.
- Action plan approval memory transformation.
- Dangerous navigation target rejection in browser action executor.

### Running Typechecks & Builds:
```bash
# Backend build
cd backend && npm run build

# Extension build
cd ../extension && npm run build
```

---

## ⚠️ Known Limitations

1. **Browser Internal Pages:** Chrome security policies prohibit extensions from injecting content scripts into `chrome://` or Chrome Web Store pages. Z-Pilot displays a safe warning when active on these pages.
2. **YouTube Autoplay Restrictions:** Modern Chromium browsers enforce autoplay policies that may block unmuted audio/video until the user interacts with the page. Z-Pilot attempts playback and informs the user if a click is needed.
3. **Complex Dynamic SPAs:** Forms rendered inside cross-origin `<iframe>` elements or closed Shadow DOMs cannot be accessed by standard content scripts due to browser sandbox restrictions.
4. **Localhost Backend:** The backend is configured for local development. If deploying to a remote server, configure HTTPS, token authentication, and strict CORS origins.

---

## 🔧 Troubleshooting Guide

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Backend disconnected" / Status red** | Backend server is not running on port 3000 | Open terminal in `backend/` and run `npm run dev`. |
| **"Gemini API key missing in backend/.env"** | `GEMINI_API_KEY` placeholder has not been replaced | Add your Gemini key to `backend/.env` and restart backend. |
| **"Could not access page contents"** | Active tab is an internal page or was opened before extension loaded | Reload the webpage tab or navigate to a standard public website. |
| **Port 3000 already in use** | Another service is using port 3000 | Change `PORT=3001` in `backend/.env` and update backend URL in Z-Pilot Settings. |
| **Extension won't load in Chrome** | Incorrect folder selected in "Load unpacked" | Select `Z-Pilot/extension/dist`, not the root folder or `src/`. Make sure you ran `npm run build` first. |

---

## 🚀 Future Roadmap

- [ ] Multi-tab parallel research workflows.
- [ ] Voice-input support for hands-free browser driving.
- [ ] Export page summaries directly to Notion or Google Docs.
- [ ] Custom user-defined automation macros (e.g. daily morning routine).

---

## 📄 License

This project is licensed under the MIT License.
