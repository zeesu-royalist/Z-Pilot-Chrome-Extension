# 🚀 Z-Pilot

> **AI-Powered Browser Assistant for Chrome & Brave**  
> Control your browser with simple, natural language commands powered by **Google Gemini**.

---

## 🌟 What Can Z-Pilot Do?

* 📄 **Summarize Webpages:** Understand any long article or website in seconds.
* 🌐 **Explain Websites:** Ask *"What does this website do?"* to get an instant breakdown.
* 🎵 **Play on YouTube:** Say *"Play Believer on YouTube"* and Z-Pilot will search and play it.
* 📝 **Safe Form Autofill:** Automatically fill contact/signup forms with a safety preview before submitting.
* 🔒 **100% Private & Secure:** Your Gemini API key stays safe on your local backend and is never exposed in the browser.

---

## ⚡ Quick Start (Setup in 3 Minutes)

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (version 18 or newer) installed on your computer.

---

### Step 1: Start the Backend

Open your terminal and run:

```bash
cd backend
npm install
```

Create your configuration file:
* Duplicate or copy `.env.example` to `.env`
* Open `.env` and paste your free [Gemini API Key](https://aistudio.google.com/):

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

Now start the backend server:

```bash
npm run dev
```

✅ You should see: `[Z-Pilot] Server running at http://127.0.0.1:3000`

---

### Step 2: Build the Extension

Open a **new** terminal window and run:

```bash
cd extension
npm install
npm run build
```

✅ This creates a ready-to-use extension in the `extension/dist` folder.

---

### Step 3: Load into Chrome or Brave

1. Open your browser and go to `chrome://extensions/` (or `brave://extensions/`).
2. Turn **ON** the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left.
4. Select the **`Z-Pilot/extension/dist`** folder.
5. Click the **Extensions** icon (puzzle piece 🧩) on your browser toolbar and **pin Z-Pilot**.

---

## 🎯 How to Use It

1. Click the **Z-Pilot** icon in your browser to open the **Side Panel**.
2. Visit any website (e.g. Wikipedia, YouTube, news sites, or blogs).
3. Type a command in plain English and press **Enter**:
   * *"Explain what this website is about"*
   * *"Summarize this article in 3 bullet points"*
   * *"Play Shape of You on YouTube"*
   * *"Fill this form with my details"*
4. For sensitive actions (like form filling), click **Approve & Execute** to confirm.

---

## 📁 Simple Project Structure

```text
Z-Pilot/
├── backend/            # Express server
│   ├── src/            # API routes and Gemini AI integration
│   ├── .env            # Your secret API keys (never shared)
│   └── tests/          # Automated safety tests
│
└── extension/          # Chrome extension
    ├── src/            # React frontend and browser automation scripts
    ├── public/         # Extension manifest.json and icons
    └── dist/           # Built extension (load this into your browser)
```

---

## 🛠️ Common Fixes & Troubleshooting

| Problem | Simple Solution |
| :--- | :--- |
| **"Backend Disconnected"** | Make sure your backend is running: `cd backend && npm run dev`. |
| **"Gemini API key is not configured"** | Open `backend/.env` and ensure `GEMINI_API_KEY` is pasted correctly without quotes. |
| **Extension didn't update after code changes?** | Run `npm run build` in `extension/`, then click the refresh icon (🔄) on Z-Pilot in `chrome://extensions/`. |
| **Port 3000 already in use?** | Change `PORT=3001` in `backend/.env` and update the port in `extension/src/services/api.ts`. |

---

## 🧪 Running Tests

To verify that all safety checks and planners are working:

```bash
# Test backend
cd backend && npm test

# Test extension
cd extension && npm test
```

---

## 📄 License
MIT License. Free to use and customize!
