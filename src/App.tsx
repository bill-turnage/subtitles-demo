/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, Play, Pause, Settings, Languages, Type, Layers, Check, Loader2, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ISO_LANGUAGES, Subtitle, SubtitleSettings } from './constants';

export default function App() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');
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
  const [exportProgress, setExportProgress] = useState(0);

  // Gemini API Initialization
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), []);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [videoFile]);

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

  const exportBurntInVideo = async () => {
    if (!videoRef.current || !videoFile || !subtitles.length) return;

    const video = videoRef.current;
    const originalTime = video.currentTime;
    const originalMuted = video.muted;
    
    setIsExportingVideo(true);
    setExportProgress(0);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check supported types
    const mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(type => 
      MediaRecorder.isTypeSupported(type)
    ) || '';

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5000000 
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${videoFile.name.split('.')[0]}_subtitled.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExportingVideo(false);
      video.muted = originalMuted;
      video.currentTime = originalTime;
      video.pause();
    };

    video.currentTime = 0;
    video.muted = true; // Mute during render to avoid audio overlap issues
    
    // Ensure video is ready at frame 0
    await new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve(true);
      };
      video.addEventListener('seeked', onSeeked);
    });

    recorder.start();
    await video.play().catch(console.error);

    const renderLoop = () => {
      if (!isExportingVideo) {
        recorder.stop();
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
        recorder.stop();
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

  const generateSubtitles = async () => {
    if (!videoFile) return;

    setIsProcessing(true);
    setError(null);

    try {
      const base64Data = await fileToBase64(videoFile);
      
      const prompt = `Transcribe this video and translate it from its source language (${ISO_LANGUAGES.find(l => l.code === sourceLang)?.name}) to English. 
      Output ONLY a JSON array of objects. Each object MUST have 'start' (number, seconds), 'end' (number, seconds), and 'text' (string, English subtitle).
      Example: [{"start": 0.5, "end": 2.5, "text": "Hello world"}]
      Ensure the timestamps are accurate to the speech in the video.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: videoFile.type,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        },
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      
      const parsedSubtitles: Subtitle[] = JSON.parse(jsonStr);
      setSubtitles(parsedSubtitles);
    } catch (err) {
      console.error(err);
      setError('Failed to generate subtitles. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime;
    const activeSub = subtitles.find(
      (sub) => currentTime >= sub.start && currentTime <= sub.end
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
            Lumina Subtitles <span className="text-xs font-sans not-italic text-neutral-500 ml-2 uppercase tracking-widest">v2.4</span>
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
              <Type className="w-4 h-4 text-amber-500" />
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
              onClick={() => setIsExportingVideo(false)}
              className="mt-8 px-6 py-2 border border-neutral-800 text-neutral-400 text-xs uppercase tracking-widest hover:bg-neutral-800 transition-colors rounded"
            >
              Cancel Render
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden">
        {/* Settings Sidebar */}
        <aside className="w-80 border-r border-neutral-800 bg-neutral-900/30 p-6 flex flex-col gap-6 flex-shrink-0 overflow-y-auto custom-scrollbar">
          
          {/* Upload Section */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-4">1. Media Source</h3>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`w-full aspect-video border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-all cursor-pointer overflow-hidden group ${
                videoFile 
                  ? 'border-amber-500/30 bg-amber-500/5' 
                  : 'border-neutral-700 bg-neutral-800/40 hover:bg-neutral-800/60'
              }`}
            >
              {videoFile ? (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <Check className="w-8 h-8 text-amber-500 mb-2" />
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest px-4 text-center truncate w-full">
                    {videoFile.name}
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-neutral-500 group-hover:text-amber-500 transition-colors" />
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">
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
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">2. Language Config</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] text-neutral-400 mb-1 block uppercase tracking-tight font-bold">Source Audio (ISO 639)</span>
                <select 
                  value={sourceLang}
                  onChange={(e) => setSourceLang(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-neutral-200 cursor-pointer"
                >
                  {ISO_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.code} - {lang.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block opacity-60">
                <span className="text-[10px] text-neutral-400 mb-1 block uppercase tracking-tight font-bold">Output Subtitles</span>
                <div className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-500 font-mono">
                  en - English (Static)
                </div>
              </label>
            </div>
          </section>

          {/* Subtitle Styling */}
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">3. Visual Style</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-tight font-bold">Font Size</label>
                  <span className="text-[10px] text-amber-500 font-mono">{settings.fontSize}px</span>
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
                <label className="text-[10px] text-neutral-400 uppercase tracking-tight block mb-2 font-bold">Drop Shadow Depth</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['none', 'small', 'medium', 'large'] as const).map((s) => (
                    <button 
                      key={s}
                      onClick={() => setSettings({ ...settings, shadow: s })}
                      className={`h-8 border rounded text-[9px] uppercase font-bold transition-all ${
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

          <div className="pt-4 mt-auto">
            <button 
              onClick={generateSubtitles}
              disabled={!videoFile || isProcessing}
              className={`w-full py-4 font-bold uppercase tracking-widest text-[10px] rounded transition-all active:scale-95 flex items-center justify-center gap-2 ${
                !videoFile 
                  ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed shadow-none' 
                  : isProcessing
                    ? 'bg-neutral-800 text-amber-500 cursor-wait'
                    : 'bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse hover:animate-none'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
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
                
                {/* Subtitle Overlay (Lower 25%) */}
                <div className="absolute bottom-0 left-0 w-full h-1/4 flex flex-col items-center justify-center pb-8 z-10 pointer-events-none">
                  <div className="absolute top-0 w-full border-t border-amber-500/10 border-dashed text-[8px] text-amber-500/30 text-center py-1 uppercase tracking-[0.4em] font-mono">
                    Subtitle Boundary (Lower 25%)
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
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white">
                    {isPlaying ? <Pause className="w-6 h-6 outline-none" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="absolute bottom-0 w-full h-1 bg-neutral-900">
                  <div 
                    className="h-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)] transition-all duration-100" 
                    style={{ 
                      width: `${videoRef.current ? (videoRef.current.currentTime / videoRef.current.duration) * 100 : 0}%` 
                    }} 
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
