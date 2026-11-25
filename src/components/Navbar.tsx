import React from 'react';
import { Hand, BookOpen, Target, Volume2, VolumeX, Sparkles, Type } from 'lucide-react';
import type { RecognitionMode, WordPipelineStatus } from '../types';

interface NavbarProps {
  mode: RecognitionMode;
  onModeChange: (mode: RecognitionMode) => void;
  ttsEnabled: boolean;
  onToggleTts: () => void;
  onOpenGuide: () => void;
  onOpenPractice: () => void;
  fps: number;
  modelReady: boolean;
  wordPipelineStatus: WordPipelineStatus;
}

export const Navbar: React.FC<NavbarProps> = ({
  mode,
  onModeChange,
  ttsEnabled,
  onToggleTts,
  onOpenGuide,
  onOpenPractice,
  fps,
  modelReady,
  wordPipelineStatus,
}) => {
  const isWordMode = mode === 'asl-words';
  const activeReady = isWordMode
    ? wordPipelineStatus === 'ready' ||
      wordPipelineStatus === 'signing' ||
      wordPipelineStatus === 'thinking'
    : modelReady;

  const statusText = isWordMode
    ? wordPipelineStatus === 'error'
      ? 'Word Model Error'
      : activeReady
        ? 'Holistic + ONNX Ready'
        : 'Loading 250-Word AI...'
    : modelReady
      ? 'Hand Model Ready'
      : 'Loading Model...';

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-slate-900/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Hand className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">SignSync</span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {isWordMode ? '250-Word ASL AI' : 'Fingerspelling'}
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              In-Browser MediaPipe &amp; ONNX Sign Language Translator
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-950/90 border border-slate-800">
          <button
            onClick={() => onModeChange('fingerspell')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              !isWordMode
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Alphabet (A–Z)</span>
          </button>
          <button
            onClick={() => onModeChange('asl-words')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              isWordMode
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm shadow-cyan-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>250 ASL Words</span>
          </button>
        </div>

        {/* Center Status Indicators */}
        <div className="hidden xl:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                wordPipelineStatus === 'error' && isWordMode
                  ? 'bg-red-400'
                  : activeReady
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="text-slate-300 font-mono">{statusText}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400 font-mono">{fps} FPS</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleTts}
            title={ttsEnabled ? 'Mute Speech' : 'Enable Speech'}
            className={`p-2 rounded-xl transition-all border ${
              ttsEnabled
                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-600/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button
            onClick={onOpenGuide}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium transition-all shadow-sm"
          >
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Sign Guide</span>
          </button>

          <button
            onClick={onOpenPractice}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-600/20"
          >
            <Target className="w-4 h-4 text-cyan-200" />
            <span>Practice</span>
          </button>
        </div>
      </div>
    </header>
  );
};
