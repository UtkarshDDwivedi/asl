import React, { useState, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { CameraView } from './components/CameraView';
import { TranslationPanel } from './components/TranslationPanel';
import { SignGuideModal } from './components/SignGuideModal';
import { PracticeMode } from './components/PracticeMode';
import {
  RecognitionMode,
  RecognitionResult,
  WordPipelineStatus,
  WordPredictionEvent,
} from './types';
import type { SignLabel } from './ml/meta';
import { sounds } from './utils/audio';

export const App: React.FC = () => {
  // Recognition mode: Fingerspelling (A-Z) vs 250-Word ASL AI
  const [mode, setMode] = useState<RecognitionMode>('asl-words');

  // Translation state
  const [currentWord, setCurrentWord] = useState<string>('');
  const [sentence, setSentence] = useState<string>('');
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [holdDuration, setHoldDuration] = useState<number>(500);

  // MediaPipe & System state
  const [fps, setFps] = useState<number>(0);
  const [modelReady, setModelReady] = useState<boolean>(false);
  const [wordPipelineStatus, setWordPipelineStatus] = useState<WordPipelineStatus>('loading');
  const [wordLabels, setWordLabels] = useState<SignLabel[]>([]);
  const [currentDetectedSign, setCurrentDetectedSign] = useState<RecognitionResult | null>(null);
  const [latestWordPrediction, setLatestWordPrediction] = useState<WordPredictionEvent | null>(null);

  // Gesture stabilization / hold logic (Fingerspelling mode)
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [holdingSign, setHoldingSign] = useState<string | null>(null);

  const holdSignRef = useRef<string | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const lastCommittedTimeRef = useRef<number>(0);

  // Modals
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isPracticeOpen, setIsPracticeOpen] = useState<boolean>(false);
  const [practiceTargetOverride, setPracticeTargetOverride] = useState<string | null>(null);
  const [practiceCategoryOverride, setPracticeCategoryOverride] = useState<string | null>(null);

  const handleModeChange = useCallback((nextMode: RecognitionMode) => {
    setMode(nextMode);
    holdSignRef.current = null;
    holdStartTimeRef.current = null;
    setHoldingSign(null);
    setHoldProgress(0);
    setCurrentDetectedSign(null);
    setLatestWordPrediction(null);
  }, []);

  // Commit a letter or complete sign to the word/sentence (Fingerspelling mode)
  const commitSign = useCallback(
    (signResult: RecognitionResult) => {
      const now = performance.now();
      if (now - lastCommittedTimeRef.current < 700) return;
      lastCommittedTimeRef.current = now;

      const rawSign = signResult.sign;

      if (rawSign.startsWith('ILY')) {
        setSentence((prev) => (prev ? prev + ' I LOVE YOU' : 'I LOVE YOU'));
        sounds.playWordComplete();
        if (ttsEnabled) sounds.speakText('I love you');
      } else if (rawSign.startsWith('HELLO')) {
        setSentence((prev) => (prev ? prev + ' HELLO' : 'HELLO'));
        sounds.playWordComplete();
        if (ttsEnabled) sounds.speakText('Hello');
      } else if (rawSign.startsWith('THUMBS UP')) {
        setSentence((prev) => (prev ? prev + ' YES' : 'YES'));
        sounds.playWordComplete();
        if (ttsEnabled) sounds.speakText('Yes');
      } else if (rawSign.startsWith('THUMBS DOWN')) {
        setSentence((prev) => (prev ? prev + ' NO' : 'NO'));
        sounds.playWordComplete();
        if (ttsEnabled) sounds.speakText('No');
      } else if (rawSign.startsWith('OK')) {
        setSentence((prev) => (prev ? prev + ' OK' : 'OK'));
        sounds.playWordComplete();
        if (ttsEnabled) sounds.speakText('OK');
      } else if (signResult.type === 'letter' && rawSign.length === 1 && rawSign !== '?') {
        setCurrentWord((prev) => prev + rawSign);
        sounds.playLetterCommit();
      }
    },
    [ttsEnabled],
  );

  // Handle live sign stream in Fingerspelling mode
  const handleSignDetected = useCallback(
    (result: RecognitionResult) => {
      setCurrentDetectedSign(result);

      if (result.sign === '...' || result.confidence < 0.75) {
        holdSignRef.current = null;
        holdStartTimeRef.current = null;
        setHoldingSign(null);
        setHoldProgress(0);
        return;
      }

      const now = performance.now();

      if (holdSignRef.current !== result.sign) {
        holdSignRef.current = result.sign;
        holdStartTimeRef.current = now;
        setHoldingSign(result.sign);
        setHoldProgress(0);
      } else if (holdStartTimeRef.current) {
        const elapsed = now - holdStartTimeRef.current;
        const progress = Math.min(elapsed / holdDuration, 1);
        setHoldProgress(progress);

        if (progress >= 1) {
          commitSign(result);
          holdStartTimeRef.current = now + 400;
          setHoldProgress(0);
        }
      }
    },
    [holdDuration, commitSign],
  );

  // Handle 250-Word ASL recognition events
  const handleWordPrediction = useCallback(
    (event: WordPredictionEvent) => {
      setLatestWordPrediction(event);
      if (event.kind === 'recognized' && event.top[0] && !isPracticeOpen) {
        const word = event.top[0].label.toUpperCase();
        setSentence((prev) => (prev ? `${prev} ${word}` : word));
        sounds.playWordComplete();
        if (ttsEnabled) sounds.speakText(event.top[0].label);
      }
    },
    [ttsEnabled, isPracticeOpen],
  );

  // Tap a top-3 word candidate to insert or replace the last recognized word
  const handleSelectWordCandidate = useCallback(
    (word: string, replaceLast: boolean) => {
      setSentence((prev) => {
        const parts = prev.trim() ? prev.trim().split(/\s+/) : [];
        if (replaceLast && parts.length > 0) {
          parts[parts.length - 1] = word;
          return parts.join(' ');
        }
        return parts.length > 0 ? `${parts.join(' ')} ${word}` : word;
      });
      sounds.playWordComplete();
      if (ttsEnabled) sounds.speakText(word.toLowerCase());
    },
    [ttsEnabled],
  );

  const handleAddSpace = () => {
    if (currentWord) {
      if (ttsEnabled) sounds.speakText(currentWord.toLowerCase());
      sounds.playWordComplete();
      setSentence((prev) => (prev ? `${prev} ${currentWord}` : currentWord));
      setCurrentWord('');
    } else if (sentence && !sentence.endsWith(' ')) {
      setSentence((prev) => prev + ' ');
    }
  };

  const handleBackspace = () => {
    if (currentWord.length > 0) {
      setCurrentWord((prev) => prev.slice(0, -1));
    } else if (sentence.length > 0) {
      if (mode === 'asl-words') {
        const words = sentence.trim().split(/\s+/);
        words.pop();
        setSentence(words.join(' '));
      } else {
        setSentence((prev) => prev.slice(0, -1).trimEnd());
      }
    }
  };

  const handleClear = () => {
    setCurrentWord('');
    setSentence('');
    setLatestWordPrediction(null);
  };

  const handleSelectSuggestion = (word: string) => {
    if (ttsEnabled) sounds.speakText(word.toLowerCase());
    sounds.playWordComplete();
    setSentence((prev) => (prev ? `${prev} ${word}` : word));
    setCurrentWord('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        mode={mode}
        onModeChange={handleModeChange}
        ttsEnabled={ttsEnabled}
        onToggleTts={() => setTtsEnabled(!ttsEnabled)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenPractice={() => {
          setPracticeTargetOverride(null);
          setPracticeCategoryOverride(null);
          setIsPracticeOpen(true);
        }}
        fps={fps}
        modelReady={modelReady}
        wordPipelineStatus={wordPipelineStatus}
      />

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
          {/* Left/Main Column: Real-Time Camera with Mesh & Overlay */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col min-h-[420px] sm:min-h-[500px]">
            <CameraView
              mode={mode}
              onSignDetected={handleSignDetected}
              onWordPrediction={handleWordPrediction}
              onWordPipelineStatus={setWordPipelineStatus}
              onWordLabelsLoaded={setWordLabels}
              onFpsUpdate={setFps}
              onModelLoaded={setModelReady}
              holdProgress={holdProgress}
              currentHoldingSign={holdingSign}
              wordPipelineStatus={wordPipelineStatus}
              latestWordPrediction={latestWordPrediction}
            />
          </div>

          {/* Right Column: Live Translation Panel */}
          <div className="lg:col-span-5 xl:col-span-4 flex flex-col">
            <TranslationPanel
              mode={mode}
              currentWord={currentWord}
              sentence={sentence}
              onAddSpace={handleAddSpace}
              onBackspace={handleBackspace}
              onClear={handleClear}
              onSelectSuggestion={handleSelectSuggestion}
              onSelectWordCandidate={handleSelectWordCandidate}
              latestWordPrediction={latestWordPrediction}
              ttsEnabled={ttsEnabled}
              holdDuration={holdDuration}
              onHoldDurationChange={setHoldDuration}
            />
          </div>
        </div>

        {/* Quick Tips Footer Info */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>
              {mode === 'asl-words' ? (
                <>
                  <strong className="text-slate-200">250-Word ASL Mode:</strong> Keep both shoulders
                  and hands in frame, perform a sign naturally, and pause briefly when finished.
                </>
              ) : (
                <>
                  <strong className="text-slate-200">Fingerspelling Mode:</strong> Hold your hand
                  steady in front of the camera to type letters into words.
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsGuideOpen(true)}
              className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4"
            >
              View 250-Word &amp; Alphabet Guide
            </button>
            <span className="text-slate-600">|</span>
            <button
              onClick={() => {
                setPracticeTargetOverride(null);
                setPracticeCategoryOverride(null);
                setIsPracticeOpen(true);
              }}
              className="text-indigo-400 hover:text-indigo-300 font-semibold underline underline-offset-4"
            >
              Start Practice Trainer
            </button>
          </div>
        </div>
      </main>

      {/* ASL Reference Catalog Modal */}
      <SignGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        activeMode={mode}
        wordLabels={wordLabels}
        onSelectForPractice={(symbol, category) => {
          setPracticeTargetOverride(symbol);
          setPracticeCategoryOverride(category);
          setIsPracticeOpen(true);
        }}
      />

      {/* Interactive Practice Mode Modal */}
      <PracticeMode
        isOpen={isPracticeOpen}
        onClose={() => setIsPracticeOpen(false)}
        activeMode={mode}
        onRequestModeChange={handleModeChange}
        currentDetectedSign={currentDetectedSign}
        latestWordPrediction={latestWordPrediction}
        wordPipelineStatus={wordPipelineStatus}
        wordLabels={wordLabels}
        targetSymbolOverride={practiceTargetOverride}
        targetCategoryOverride={practiceCategoryOverride}
      />
    </div>
  );
};

export default App;
