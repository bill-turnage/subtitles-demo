/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Upload, Play, Pause, Settings, Languages, Type as TypeIcon, Layers, Check, Loader2, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ISO_LANGUAGES, Subtitle, SubtitleSettings } from './constants';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(0);
  const [sourceLang, setSourceLang] = useState('es');
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SubtitleSettings>({
    fontSize: 24,
    shadow: 'medium',
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const isExportingRef = useRef(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [syncOffset, setSyncOffset] = useState(0);

  // Gemini API Initialization
  const ai = useMemo(() => {
    const key = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
    if (!key) {
      console.warn('Subtitle Maker: No API key found. AI features will be disabled.');
    }
    return new GoogleGenAI({ apiKey: key });
  }, []);

  useEffect(() => {
    console.log('Subtitle Maker: Core initialized.');
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

      if (e.key === 'ArrowLeft') {
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
      } else if (e.key === 'ArrowRight') {
        videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 10);
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

  const formatVideoTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeSRT = (seconds: number): string => {
    const date = new Date(0);
    date.setSeconds(Math.floor(seconds));
    const ms = Math.floor((seconds % 1) * 1000);
    const timePart = date.toISOString().substring(11, 19);
    return `${timePart},${ms.toString().padStart(3, '0')}`;
  };

  const exportSRT = () => {
    if (!subtitles.length) return;
    const content = subtitles.map((sub, i) => {
      return `${i + 1}\n${formatTimeSRT(sub.start)} --> ${formatTimeSRT(sub.end)}\n${sub.text}\n`;
    }).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${videoFile?.name.split('.')[0] || 'subtitles'}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const synchronizeSubtitles = () => {
    if (!subtitles.length || syncOffset === 0) return;
    
    const updatedSubtitles = subtitles.map(sub => ({
      ...sub,
      start: Math.max(0, sub.start + syncOffset),
      end: Math.max(0.1, sub.end + syncOffset)
    }));
    
    setSubtitles(updatedSubtitles);
    setSyncOffset(0); // Reset after sync application
    setError(`Synced: Offset of ${syncOffset > 0 ? '+' : ''}${syncOffset}s applied to ${subtitles.length} entries.`);
    setTimeout(() => setError(null), 3000);
  };

  const exportBurntInVideo = async () => {
    if (!videoRef.current || !videoFile || !subtitles.length) return;

    const video = videoRef.current;
    const originalTime = video.currentTime;
    const originalMuted = video.muted;
    
    setIsExportingVideo(true);
    isExportingRef.current = true;
    setExportProgress(0);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(type => 
      MediaRecorder.isTypeSupported(type)
    ) || 'video/webm';

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 8000000 // Increased to 8Mbps for better quality
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    recorder.onstop = () => {
      if (chunks.length === 0) {
        setError("Export failed: No video data captured.");
        setIsExportingVideo(false);
        isExportingRef.current = false;
        return;
      }
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${videoFile.name.split('.')[0]}_subtitled.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExportingVideo(false);
      isExportingRef.current = false;
      video.muted = originalMuted;
      video.currentTime = originalTime;
      video.pause();
    };

    video.currentTime = 0;
    video.muted = true;
    
    // Improved ready check
    if (video.readyState < 2) {
      await new Promise(resolve => {
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          resolve(true);
        };
        video.addEventListener('loadeddata', onLoaded);
      });
    }

    // Wait for seek to 0
    await new Promise(resolve => {
      if (video.currentTime === 0) resolve(true);
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve(true);
      };
      video.addEventListener('seeked', onSeeked);
    });

    // Small delay to ensure canvas is ready
    await new Promise(resolve => setTimeout(resolve, 300));

    recorder.start(1000); // Collect data in 1s chunks
    await video.play().catch(err => {
      console.error("Playback error during export:", err);
      setIsExportingVideo(false);
      isExportingRef.current = false;
    });

    const renderLoop = () => {
      if (!isExportingRef.current) {
        if (recorder.state !== 'inactive') recorder.stop();
        video.pause();
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const currentTime = video.currentTime;
      const sub = subtitles.find(s => currentTime >= s.start && currentTime <= s.end);
      
      if (sub) {
        ctx.save();
        const fontBase = 1080;
        const relativeSize = settings.fontSize / fontBase;
        const fontSize = Math.max(relativeSize * canvas.height, 20);
        
        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        
        const x = canvas.width / 2;
        const y = canvas.height * 0.92;
        const maxWidth = canvas.width * 0.9;

        if (settings.shadow !== 'none') {
          const blur = settings.shadow === 'small' ? fontSize * 0.05 : 
                      settings.shadow === 'medium' ? fontSize * 0.15 : 
                      fontSize * 0.25;
          ctx.shadowColor = 'rgba(0,0,0,0.9)';
          ctx.shadowBlur = blur;
          ctx.shadowOffsetX = blur / 2;
          ctx.shadowOffsetY = blur / 2;
        }

        ctx.fillStyle = 'white';
        ctx.fillText(sub.text, x, y, maxWidth);
        ctx.restore();
      }

      setExportProgress((video.currentTime / video.duration) * 100);

      if (video.currentTime < video.duration && !video.paused) {
        requestAnimationFrame(renderLoop);
      } else {
        if (recorder.state !== 'inactive') {
          // Slight delay to catch the very last frame
          setTimeout(() => recorder.stop(), 100);
        }
        video.pause();
      }
    };

    renderLoop();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        setVideoFile(file);
        setSubtitles([]);
        setError(null);
      } else {
        setError('Please upload a valid video file.');
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const extractAudio = async (file: File): Promise<string> => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Create custom WAV encoding
    const worker = new Worker(URL.createObjectURL(new Blob([`
      self.onmessage = function(e) {
        const { buffer, sampleRate } = e.data;
        const length = buffer.length * 2 + 44;
        const out = new DataView(new ArrayBuffer(length));
        
        const writeString = (offset, string) => {
          for (let i = 0; i < string.length; i++) {
            out.setUint8(offset + i, string.charCodeAt(i));
          }
        };

        writeString(0, 'RIFF');
        out.setUint32(4, length - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        out.setUint32(16, 16, true);
        out.setUint16(20, 1, true); // PCM
        out.setUint16(22, 1, true); // Mono
        out.setUint32(24, sampleRate, true);
        out.setUint32(28, sampleRate * 2, true);
        out.setUint16(32, 2, true);
        out.setUint16(34, 16, true);
        writeString(36, 'data');
        out.setUint32(40, length - 44, true);

        const channelData = buffer;
        let offset = 44;
        for (let i = 0; i < channelData.length; i++) {
          const s = Math.max(-1, Math.min(1, channelData[i]));
          out.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        }
        self.postMessage(out.buffer, [out.buffer]);
      }
    `], { type: 'application/javascript' })));

    return new Promise((resolve) => {
      worker.onmessage = async (e) => {
        const blob = new Blob([e.data], { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
          audioContext.close();
        };
      };
      // Send only one channel to save space
      const channelData = audioBuffer.getChannelData(0);
      worker.postMessage({ buffer: channelData, sampleRate: audioBuffer.sampleRate });
    });
  };

  const generateSubtitles = async () => {
    if (!videoFile) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Extract ONLY audio to prevent "Allocation size overflow"
      const audioBase64 = await extractAudio(videoFile);
      
      const prompt = `Transcribe this audio and translate it from its source language (${ISO_LANGUAGES.find(l => l.code === sourceLang)?.name}) to English. 
      Output ONLY a JSON array of objects. Each object MUST have 'start' (number, seconds), 'end' (number, seconds), and 'text' (string, English subtitle).
      Example: [{"start": 0.5, "end": 2.5, "text": "Hello world"}]
      CRITICAL: The 'start' and 'end' values MUST BE PRECISELY ALIGNED to the speech timestamps in the audio file.
      Do not hallucinate timestamps. Ensure 'start' is when the word starts and 'end' is when the phrase ends.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/wav",
                data: audioBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                start: { type: Type.NUMBER, description: "Start time in seconds" },
                end: { type: Type.NUMBER, description: "End time in seconds" },
                text: { type: Type.STRING, description: "The English subtitle text" },
              },
              required: ["start", "end", "text"],
            },
          },
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      // Robust JSON cleaning
      let jsonStr = text.trim();
      
      if (jsonStr.startsWith('```')) {
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonStr = match[1];
      }

      const firstBracket = jsonStr.indexOf('[');
      const lastBracket = jsonStr.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
      }

      // JSON Repair Logic for "Unterminated string" or truncated responses
      const parseWithRepair = (raw: string): Subtitle[] => {
        try {
          return JSON.parse(raw);
        } catch (initialError) {
          console.warn('Lumina Subtitles: Initial parse failed, attempting repair...', initialError);
          
          let repaired = raw.trim();
          
          // If it doesn't end with ], it's likely truncated
          if (!repaired.endsWith(']')) {
            // Find the last complete object ending
            const lastCompleteObject = repaired.lastIndexOf('}');
            if (lastCompleteObject !== -1) {
              repaired = repaired.substring(0, lastCompleteObject + 1) + ']';
            } else {
              repaired = repaired + '"]}]'; // Guerilla repair for mid-string truncation
            }
          }

          try {
            return JSON.parse(repaired);
          } catch (secondaryError) {
            // Last resort: manual regex extraction for each object
            console.error('Lumina Subtitles: Repair failed, falling back to regex extraction.', secondaryError);
            const matches = repaired.matchAll(/\{\s*"start":\s*(\d+\.?\d*),\s*"end":\s*(\d+\.?\d*),\s*"text":\s*"([\s\S]*?)"\s*\}/g);
            const subs: Subtitle[] = [];
            for (const match of matches) {
              subs.push({
                start: parseFloat(match[1]),
                end: parseFloat(match[2]),
                text: match[3].replace(/\\"/g, '"')
              });
            }
            return subs;
          }
        }
      };
      
      const parsedSubtitles = parseWithRepair(jsonStr);
      
      if (parsedSubtitles.length === 0) {
        throw new Error("Could not parse any valid subtitles from AI response.");
      }

      const sortedSubtitles = parsedSubtitles.sort((a, b) => a.start - b.start);
      setSubtitles(sortedSubtitles);
    } catch (err) {
      console.error(err);
      setError('Failed to generate subtitles. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    const activeSub = subtitles.find(
      (sub) => time >= sub.start && time <= sub.end
    );
    setCurrentSubtitle(activeSub ? activeSub.text : '');
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="h-screen bg-neutral-950 text-neutral-200 flex flex-col overflow-hidden font-sans">
      {/* Header Navigation */}
      <header className="h-16 border-b border-neutral-800 flex items-center justify-between px-8 bg-neutral-900/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <Video className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-xl font-serif tracking-tight text-white italic">
            Subtitle Maker <span className="text-xs font-sans not-italic text-neutral-500 ml-2 uppercase tracking-widest">v3.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 relative group/export">
          <button 
            disabled={!subtitles.length || isExportingVideo}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 border border-neutral-700 rounded text-sm transition-colors flex items-center gap-2"
          >
            Export Options
            <Settings className="w-3 h-3 opacity-40" />
          </button>
          
          {/* Dropdown Menu */}
          <div className="absolute top-full right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-md shadow-2xl opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-[100] overflow-hidden">
            <button 
              onClick={exportSRT}
              className="w-full text-left px-4 py-3 text-xs hover:bg-neutral-800 transition-colors flex items-center gap-3 border-b border-neutral-800"
            >
              <TypeIcon className="w-4 h-4 text-amber-500" />
              <div>
                <p className="font-semibold text-neutral-200">Export .SRT File</p>
                <p className="text-[10px] text-neutral-500">Standard subtitle format</p>
              </div>
            </button>
            <button 
              onClick={exportBurntInVideo}
              className="w-full text-left px-4 py-3 text-xs hover:bg-neutral-800 transition-colors flex items-center gap-3"
            >
              <Layers className="w-4 h-4 text-amber-500" />
              <div>
                <p className="font-semibold text-neutral-200">Burnt-in Video</p>
                <p className="text-[10px] text-neutral-500">Embed captions into .webm</p>
              </div>
            </button>
          </div>

          <div className="w-10 h-10 rounded-full border border-neutral-700 bg-neutral-800 flex items-center justify-center">
            <span className="text-xs font-bold text-amber-500">JD</span>
          </div>
        </div>
      </header>

      {/* Rendering Overlay */}
      <AnimatePresence>
        {isExportingVideo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md z-[200] flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-24 h-24 relative mb-8">
              <div className="absolute inset-0 border-4 border-neutral-800 rounded-full" />
              <svg className="w-full h-full -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="transparent"
                  stroke="#f59e0b"
                  strokeWidth="4"
                  strokeDasharray="276"
                  strokeDashoffset={276 - (276 * exportProgress) / 100}
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-mono text-amber-500">{Math.round(exportProgress)}%</span>
              </div>
            </div>
            <h2 className="text-2xl font-serif italic text-white mb-2">Burning Subtitles</h2>
            <p className="text-neutral-500 text-sm max-w-sm">
              Please keep this tab active. We are re-encoding your video at its source resolution with embedded captions.
            </p>
            <button 
              onClick={() => {
                setIsExportingVideo(false);
                isExportingRef.current = false;
              }}
              className="mt-8 px-6 py-2 border border-neutral-800 text-neutral-400 text-xs uppercase tracking-widest hover:bg-neutral-800 transition-colors rounded"
            >
              Cancel Render
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden">
        {/* Settings Sidebar */}
        <aside className="w-72 border-r border-neutral-800 bg-neutral-900/30 p-5 flex flex-col gap-3 flex-shrink-0 overflow-y-auto custom-scrollbar">
          
          {/* Upload Section */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">1. Media Source</h3>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-5 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer overflow-hidden group ${
                videoFile 
                  ? 'border-amber-500/30 bg-amber-500/5' 
                  : 'border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800/60'
              }`}
            >
              {videoFile ? (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <Check className="w-7 h-7 text-amber-500 mb-1.5" />
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest px-3 text-center truncate w-full">
                    {videoFile.name}
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-7 h-7 text-neutral-500 group-hover:text-amber-500 transition-colors" />
                  <span className="text-[9px] font-medium text-neutral-400 uppercase tracking-widest">
                    Upload Video
                  </span>
                </>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="video/*"
              className="hidden"
            />
          </section>

          {/* Language Selection */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">2. Language Config</h3>
            <div className="space-y-2.5">
              <label className="block">
                <span className="text-[9px] text-neutral-400 mb-1 block uppercase tracking-tight font-bold">Source Audio (ISO 639)</span>
                <select 
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-neutral-200 cursor-pointer"
                >
                  {ISO_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.code} - {lang.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block opacity-60">
                <span className="text-[9px] text-neutral-400 mb-1 block uppercase tracking-tight font-bold">Output Subtitles</span>
                <div className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-500 font-mono">
                  en - English (Static)
                </div>
              </label>
            </div>
          </section>

          {/* Sync Adjustment */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">3. Sync Syncronize</h3>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${syncOffset !== 0 ? 'bg-amber-500/10 text-amber-500' : 'text-neutral-600'}`}>
                {syncOffset > 0 ? '+' : ''}{syncOffset}s
              </span>
            </div>
            <div className="flex gap-3 items-center">
              <div className="flex-1 space-y-1.5">
                <input 
                  type="range" 
                  min="-20"
                  max="20"
                  step="1"
                  value={syncOffset}
                  onChange={(e) => setSyncOffset(parseInt(e.target.value))}
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[7px] font-mono text-neutral-600 uppercase tracking-widest">
                  <span>-20s</span>
                  <span>0</span>
                  <span>+20s</span>
                </div>
              </div>
              <button
                onClick={synchronizeSubtitles}
                disabled={!subtitles.length || syncOffset === 0}
                className="w-18 px-1.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 border border-neutral-700 rounded text-[8px] uppercase font-bold text-center leading-tight transition-all"
              >
                Syncronize<br/>Subtitles
              </button>
            </div>
          </section>

          {/* Subtitle Styling */}
          <section className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">4. Visual Style</h3>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-[9px] text-neutral-400 uppercase tracking-tight font-bold">Font Size</label>
                  <span className="text-[9px] text-amber-500 font-mono">{settings.fontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="16"
                  max="48"
                  value={settings.fontSize}
                  onChange={(e) => setSettings({ ...settings, fontSize: parseInt(e.target.value) })}
                  className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
              <div>
                <label className="text-[9px] text-neutral-400 uppercase tracking-tight block mb-1.5 font-bold">Drop Shadow Depth</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['none', 'small', 'medium', 'large'] as const).map((s) => (
                    <button 
                      key={s}
                      onClick={() => setSettings({ ...settings, shadow: s })}
                      className={`h-7 border rounded text-[8px] uppercase font-bold transition-all ${
                        settings.shadow === s
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
                          : 'border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="pt-3 mt-auto">
            <button 
              onClick={generateSubtitles}
              disabled={!videoFile || isProcessing}
              className={`w-full py-3.5 font-bold uppercase tracking-widest text-[9px] rounded transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                !videoFile 
                  ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed shadow-none' 
                  : isProcessing
                    ? 'bg-neutral-800 text-amber-500 cursor-wait'
                    : 'bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse hover:animate-none'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Captions'
              )}
            </button>
          </div>
        </aside>

        {/* Video Preview Area */}
        <div className="flex-1 bg-neutral-950 flex flex-col items-center p-8 lg:p-12 relative overflow-y-auto overflow-x-hidden custom-scrollbar">
          {/* Overlay Specs Label */}
          <div className="absolute top-6 right-8 flex items-center gap-6 z-20">
            <div className="text-right">
              <div className="text-[10px] uppercase text-neutral-600 tracking-widest">Resolution</div>
              <div className="text-xs font-mono text-neutral-400">1920 × 1080</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-neutral-600 tracking-widest">Frame Rate</div>
              <div className="text-xs font-mono text-neutral-400">23.976 fps</div>
            </div>
          </div>

          <div className="w-full max-w-4xl relative shadow-2xl shadow-black ring-1 ring-neutral-800 rounded-sm overflow-hidden bg-black aspect-video flex-shrink-0 group">
            {videoSrc ? (
              <>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-full object-contain cursor-pointer"
                  onTimeUpdate={handleTimeUpdate}
                  onClick={togglePlay}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                
                {/* Time Display */}
                <div className="absolute bottom-10 left-4 right-4 flex justify-between z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-sm text-[12px] font-mono text-amber-500 border border-amber-500/30 shadow-lg">
                    {formatVideoTime(currentTime)}
                  </div>
                  <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-sm text-[12px] font-mono text-neutral-300 border border-neutral-700 shadow-lg">
                    -{formatVideoTime((videoRef.current?.duration || 0) - currentTime)}
                  </div>
                </div>

                {/* Subtitle Overlay (Lower 25%) */}
                <div className="absolute bottom-10 left-0 w-full h-[15%] flex flex-col items-center justify-center pb-2 z-10 pointer-events-none">
                  <div className="absolute top-0 w-full border-t border-amber-500/10 border-dashed text-[8px] text-amber-500/30 text-center py-1 uppercase tracking-[0.4em] font-mono opacity-20">
                    Subtitle Area
                  </div>
                  
                  <AnimatePresence mode="wait">
                    {currentSubtitle && (
                      <motion.p
                        key={currentSubtitle}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="font-sans font-medium text-white px-12 text-center"
                        style={{ 
                          fontSize: `${settings.fontSize}px`,
                          lineHeight: 1.2,
                          textShadow: settings.shadow === 'none' ? 'none' : 
                            settings.shadow === 'small' ? '1px 1px 2px rgba(0,0,0,0.8)' :
                            settings.shadow === 'medium' ? '2px 2px 4px rgba(0,0,0,0.8)' :
                            '3px 3px 6px rgba(0,0,0,0.9)'
                        }}
                      >
                        {currentSubtitle}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Play/Pause Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none pb-12">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white">
                    {isPlaying ? <Pause className="w-6 h-6 outline-none" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </div>
                </div>

                {/* Progress Bar / Seek Slider */}
                <div className="absolute bottom-0 w-full h-10 bg-black/40 backdrop-blur-sm flex items-center px-4 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                  <input 
                    type="range"
                    min="0"
                    max={videoRef.current?.duration || 0}
                    step="0.05"
                    value={currentTime}
                    onChange={(e) => {
                      if (videoRef.current) {
                        const val = parseFloat(e.target.value);
                        videoRef.current.currentTime = val;
                        setCurrentTime(val);
                      }
                    }}
                    className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-800 bg-neutral-900/50">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-neutral-800 flex items-center justify-center mb-4">
                  <Video className="w-6 h-6 opacity-30" />
                </div>
                <p className="text-[10px] uppercase tracking-widest font-bold opacity-30">Studio Core Initializing</p>
              </div>
            )}
          </div>

          {error && (
            <div className="w-full max-w-4xl mt-6 p-4 bg-red-950/20 border border-red-900/40 rounded text-red-500 text-[10px] font-mono flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
              STATUS: {error}
            </div>
          )}

          {/* Timeline Section */}
          <div className="w-full max-w-4xl mt-12 mb-8">
            <div className="flex items-center justify-between mb-4 px-1">
              <h4 className="text-[10px] uppercase font-bold tracking-[0.2em] text-neutral-600">Dialogue Timeline</h4>
              <span className="text-[10px] font-mono text-neutral-700">{subtitles.length} Events Logged</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {subtitles.length > 0 ? (
                subtitles.map((sub, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.currentTime = sub.start;
                        videoRef.current.play();
                      }
                    }}
                    className="group bg-neutral-900/50 border border-neutral-800/30 hover:border-amber-500/20 p-4 rounded-sm flex items-start gap-6 transition-all text-left"
                  >
                    <span className="text-[10px] font-mono text-amber-500/40 group-hover:text-amber-500 transition-colors mt-1">
                      {Math.floor(sub.start / 60)}:{(sub.start % 60).toFixed(1).padStart(4, '0')}
                    </span>
                    <p className="text-sm text-neutral-500 group-hover:text-neutral-300 transition-colors flex-1 font-medium">{sub.text}</p>
                  </button>
                ))
              ) : (
                <div className="py-16 border border-neutral-900/50 border-dashed rounded-sm flex flex-col items-center justify-center opacity-10">
                  <Layers className="w-8 h-8 mb-2" />
                  <span className="text-[9px] uppercase tracking-[0.3em] font-bold">No Data Points Rendered</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Status */}
      <footer className="h-8 bg-neutral-900 border-t border-neutral-800 px-6 flex items-center justify-between text-[10px] text-neutral-600 font-mono flex-shrink-0">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-700" />
            <span>RENDER ENGINE: {isProcessing ? 'BUSY' : 'READY'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${subtitles.length > 0 ? 'bg-green-500' : 'bg-neutral-700'}`} />
            <span>SUBTITLES: {subtitles.length > 0 ? 'COMPILED' : 'EMPTY'}</span>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="uppercase tracking-widest opacity-50">Auto-Save Active</span>
          <span className="text-neutral-700">|</span>
          <span className="text-amber-500/50">AIS-CORE-STABLE</span>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #0a0a0a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #404040;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #f59e0b;
          cursor: pointer;
          box-shadow: 0 0 10px rgba(245,158,11,0.5);
        }
      `}} />
    </div>
  );
}
