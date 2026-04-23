# Lumina Subtitles (LingaSub)

Lumina Subtitles is a professional-grade, AI-powered video subtitling and translation studio. It leverages the **Gemini 3 Flash** model to transcribe video audio, translate it into English, and provide a high-fidelity editing environment for burnt-in caption styling.

![Sophisticated Dark UI](https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80&w=1200)

## 🚀 Features

-   **AI Transcription & Translation**: Automatically detects and translates speech from 30+ ISO languages into English using Gemini AI.
-   **Sophisticated Dark UI**: A professional editing interface designed for focus and precision.
-   **Custom Aesthetic Controls**: Adjust font size and drop-shadow depth with real-time previews.
-   **Burnt-in Video Export**: Re-encode your video with permanent, styled subtitles at source resolution.
-   **SRT Export**: Download industry-standard SubRip subtitle files for external players.
-   **Interactive Timeline**: Navigate through your video by clicking dialogue events in the transcript.

## 🛠️ Installation

### 1. Prerequisites
-   [Node.js](https://nodejs.org/) (v18 or higher)
-   An API Key from [Google AI Studio](https://aistudio.google.com/)

### 2. Clone the Repository
```bash
git clone <your-repo-url>
cd lumina-subtitles
```

### 3. Install Dependencies
```bash
npm install
```

## ⚙️ Configuration

Create a `.env` file in the root directory (or copy from `.env.example`):

```env
GEMINI_API_KEY="YOUR_ACTUAL_API_KEY_HERE"
```

*Note: In the AI Studio environment, this key is automatically managed via the Secrets panel.*

## 🏃 Execution

### Development Mode
Start the development server with Hot Module Replacement (HMR):
```bash
npm run dev
```
The app will be available at `http://localhost:3000`.

### Production Build
Create an optimized production bundle:
```bash
npm run build
```

## 📂 Project Structure

-   `src/App.tsx`: Main application logic, Gemini API integration, and UI.
-   `src/constants.ts`: Language definitions and TypeScript interfaces.
-   `src/index.css`: Tailwind CSS configuration and cinematic font imports.
-   `metadata.json`: App permissions and metadata.

## 🛡️ Security
This application calls the Gemini API directly from the client. Ensure your API key is restricted to authorized domains in the Google Cloud Console for production use.
