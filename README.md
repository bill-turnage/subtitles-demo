# Subtitle Maker

Subtitle Maker is a professional-grade, AI-powered video subtitling and translation studio. It leverages the **Gemini 3 Flash** model to transcribe video audio, translate it into English, and provide a high-fidelity editing environment for burnt-in caption styling.

![Sophisticated Dark UI](https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&q=80&w=1200)

## 🚀 Features

-   **AI Transcription & Translation**: Automatically translates speech from 30+ ISO languages into English.
-   **Precision Sync Controls**: Adjust subtitle timing with an offset slider to fix alignment issues.
-   **Aesthetic Styling**: Real-time control over font size and drop-shadow depth for professional results.
-   **Keyboard Navigation**:
    -   `Space`: Play/Pause
    -   `Left Arrow`: Jump back 10 seconds
    -   `Right Arrow`: Jump forward 10 seconds
-   **Dual Export Options**:
    -   **Burnt-in Video**: Re-encode video with permanent subtitles at source resolution.
    -   **SRT Export**: Download standard subtitle files for external use.

## 🛠️ Installation & Setup

1.  **Clone & Install**:
    ```bash
    npm install
    ```
2.  **API Key**: Add your `GEMINI_API_KEY` to the `.env` file.
3.  **Run**:
    ```bash
    npm run dev
    ```

## 📜 Change Log

### v3.0 (Latest)
-   **Renamed App**: Rebranded to "Subtitle Maker".
-   **Sync Tools**: Added Subtitle Offset Adjustment slider (-20s to +20s).
-   **Navigation**: Implemented Arrow Key seeking (10s jumps).
-   **UI Refinement**: Compacted sidebar and shifted controls for better focus.
-   **Enhanced Export**: Improved stability of the canvas-based video re-encoder.
-   **Time Tracking**: Added current/remaining time displays on the video player.

### v2.5
-   **Audio-Only AI Pipeline**: Switched to audio extraction for faster processing and to prevent memory overflows.
-   **UI Overhaul**: Introduced the cinematic "Obsidian" theme.

---

## 🛡️ Usage Tips
-   **Alignment**: If subtitles appear too early or late, use the **Syncronize** tool in the sidebar. Adjust the slider and click "Syncronize Subtitles" to apply the shift.
-   **Rendering**: When using "Burn in Video", keep the browser tab active to ensure the high-quality capture process completes successfully.
