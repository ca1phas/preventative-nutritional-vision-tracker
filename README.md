# 🍏 Preventative Nutritional Vision Tracker

Welcome to the MVP repository! This project bridges the gap between patient self-reporting and clinical monitoring by using multimodal AI to analyze food images and accurately estimate macronutrients.

We are using a lightning-fast, frontend-only architecture powered by **Vite**, **Vanilla JS**, **Tailwind CSS v4**, the **Google GenAI API**, and the **USDA FoodData Central API**.

---

## 🚀 Getting Started

Follow these steps to get the local development server running on your machine.

### 1. Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed (version 18+ is recommended).

### 2. Clone and Install

Clone this repository to your local machine, navigate to the project folder, and install the dependencies:

```bash
git clone <your-repo-url>
cd hackathon-mvp
npm install
```

_(Note: If you run into an `ERESOLVE` error regarding Tailwind and Vite versions, run `npm install --legacy-peer-deps`)_

### 3. Environment Variables (CRITICAL)

For security, we do not commit API keys to GitHub. You must create your own local environment file.

Create a new file in the root directory named exactly **`.env`** and add the following keys. _(Ask the AI Engineer for the actual key values!)_

```env
VITE*GEMINI_API_KEY=your_actual_gemini_api_key_here
VITE_USDA_API_KEY=your_actual_usda_api_key_here
```

_Vite automatically exposes variables prefixed with `VITE_` to our client-side code._

### 4. Run the Server

Start the Vite development server:

```bash
npm run dev
```

Click the `http://localhost:5173` link in your terminal to open the app in your browser. The server will hot-reload instantly anytime you save a file!

---

## 📂 Project Structure

To keep things simple for the hackathon, we have flattened the structure. There is no backend Node.js server; all API calls are handled securely via Vite's environment variables in the browser.

```text
hackathon-mvp/
├── public/ # Static assets (Drop your images here, use absolute paths like /images/img.png)
├── src/ # 🧠 All JavaScript logic and CSS lives here
│ ├── ai-config.js # Gemini JSON schemas and prompt text
│ ├── ai-service.js # The core fetch calls to Gemini and USDA APIs
│ ├── style.css # Tailwind @import and custom CSS rules
│ ├── main.js # Homepage and global UI logic
│ ├── upload.js # Handles image validation & Step 1 AI analysis
│ ├── confirm.js # Handles user edits & Step 2/3 AI mapping
│ └── result.js # Calculates and displays the final live data
├── \*.html # 📄 UI Pages (index, upload, confirm, result, dashboards)
├── .env # (You create this) Local API keys
├── .gitignore # Ignores node_modules and .env
├── package.json # Project dependencies
└── vite.config.js # Tailwind plugin configuration
```

---

## 🧪 How to Test the MVP Flow

When demoing or testing the app, follow this exact path:

1. **Start at `index.html`**: Click "Start Tracking" or "Login".
2. **Mock Login (`login.html`)**: Use `U001` as the User ID and `user123` as the password to access authenticated areas.
3. **Upload (`upload.html`)**: Select a food image (must be standard formats like PNG/JPG/WEBP). When you click "Analyze", it converts the image to Base64 and sends it to **Gemini 2.5 Flash** to guess the ingredients and portion sizes.
4. **Confirm (`confirm.html`)**: The UI populates with Gemini's guesses. You can edit them. Clicking "Run AI Nutrition Analysis" loops through the items, searches the **USDA API** for real matches, and uses **Gemini 3.1 Flash-Lite** to map the raw data cleanly to our nutrition schema.
5. **Results (`result.html`)**: The app totals up the live AI-generated macros and displays the health status banner.

---

## 💡 Notes for the Team

- **State Management:** Because there is no backend database yet, we are passing data between HTML pages using the browser's `sessionStorage`. If you refresh the browser on the `result.html` page without going through the `upload.html` flow first, it may redirect you back to the start!
- **CSS Editing:** All styling should be done in `src/style.css` below the `@import "tailwindcss";` line, or by using Tailwind utility classes directly in the HTML.
