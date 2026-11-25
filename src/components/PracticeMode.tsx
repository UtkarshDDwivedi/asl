import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Trophy,
  Flame,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audio';
import { ASL_CATALOG } from './SignGuideModal';
import { dictionaryUrl, fetchAllAslLabels } from '../services/aslWordsService';
import type { SignLabel } from '../ml/meta';
import type {
  RecognitionMode,
  RecognitionResult,
  WordPipelineStatus,
  WordPredictionEvent,
} from '../types';

interface PracticeModeProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: RecognitionMode;
  onRequestModeChange: (mode: RecognitionMode) => void;
  currentDetectedSign: RecognitionResult | null;
  latestWordPrediction: WordPredictionEvent | null;
  wordPipelineStatus: WordPipelineStatus;
  wordLabels?: SignLabel[];
  targetSymbolOverride?: string | null;
  targetCategoryOverride?: string | null;
}

export const PracticeMode: React.FC<PracticeModeProps> = ({
  isOpen,
  onClose,
  activeMode,
  onRequestModeChange,
  currentDetectedSign,
  latestWordPrediction,
  wordPipelineStatus,
  wordLabels,
  targetSymbolOverride,
  targetCategoryOverride,
}) => {
  const [practiceDeck, setPracticeDeck] = useState<'static' | 'words'>(
    activeMode === 'asl-words' ? 'words' : 'static',
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [matchedTime, setMatchedTime] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [wordFeedback, setWordFeedback] = useState<string | null>(null);
  const [loadedLabels, setLoadedLabels] = useState<SignLabel[]>([]);

  const lastHandledPredictionRef = useRef<WordPredictionEvent | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (targetCategoryOverride === 'word') {
      setPracticeDeck('words');
      onRequestModeChange('asl-words');
    } else if (targetCategoryOverride) {
      setPracticeDeck('static');
      onRequestModeChange('fingerspell');
    } else {
      setPracticeDeck(activeMode === 'asl-words' ? 'words' : 'static');
    }
  }, [isOpen, targetCategoryOverride, activeMode, onRequestModeChange]);

  useEffect(() => {
    if (!isOpen) return;
    if (wordLabels && wordLabels.length > 0) {
      setLoadedLabels(wordLabels);
      return;
    }
    let cancelled = false;
    fetchAllAslLabels()
      .then((signs) => {
        if (!cancelled) setLoadedLabels(signs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen, wordLabels]);

  const wordPracticeItems = useMemo(
    () =>
      loadedLabels.map((entry) => ({
        symbol: entry.sign,
        name: entry.label,
        tips:
          entry.heldOutTop1 !== null
            ? `Model accuracy on this sign: ${Math.round(entry.heldOutTop1 * 100)}%`
            : 'Perform the sign with shoulders & hands visible, then pause briefly.',
        description: 'Perform this dynamic ASL word sign in front of the camera and pause briefly when finished.',
        lookupUrl: dictionaryUrl(entry),
      })),
    [loadedLabels],
  );

  const practiceItems = practiceDeck === 'words' ? wordPracticeItems : ASL_CATALOG;
  const currentTarget =
    practiceItems.length > 0 ? practiceItems[currentIndex % practiceItems.length] : null;

  useEffect(() => {
    if (targetSymbolOverride && practiceItems.length > 0) {
      const idx = practiceItems.findIndex(
        (it) => it.symbol.toLowerCase() === targetSymbolOverride.toLowerCase(),
      );
      if (idx !== -1) setCurrentIndex(idx);
    }
  }, [targetSymbolOverride, practiceItems]);

  // Clear stale prediction reference whenever target changes
  useEffect(() => {
    lastHandledPredictionRef.current = latestWordPrediction;
    setWordFeedback(null);
    setMatchedTime(0);
  }, [currentIndex, practiceDeck, isOpen]);

  // Static pose matching (Fingerspelling & Gestures)
  useEffect(() => {
    if (
      !isOpen ||
      practiceDeck !== 'static' ||
      isSuccess ||
      !currentTarget ||
      !currentDetectedSign
    ) {
      if (practiceDeck === 'static') setMatchedTime(0);
      return;
    }

    const matches =
      currentDetectedSign.sign.toUpperCase() === currentTarget.symbol.toUpperCase() ||
      (currentTarget.symbol.includes(currentDetectedSign.sign) &&
        currentDetectedSign.sign !== '...');

    if (matches && currentDetectedSign.confidence >= 0.75) {
      const interval = setInterval(() => {
        setMatchedTime((prev) => {
          if (prev >= 1) {
            clearInterval(interval);
            setIsSuccess(true);
            sounds.playWordComplete();
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
            setScore((s) => s + 10);
            setStreak((st) => st + 1);
            setTimeout(() => {
              setCurrentIndex((idx) => (idx + 1) % practiceItems.length);
              setIsSuccess(false);
              setMatchedTime(0);
            }, 1200);
            return 1;
          }
          return prev + 0.15;
        });
      }, 100);
      return () => clearInterval(interval);
    } else {
      setMatchedTime(0);
    }
  }, [isOpen, practiceDeck, isSuccess, currentTarget, currentDetectedSign, practiceItems.length]);

  // Dynamic 250-Word ASL matching
  useEffect(() => {
    if (
      !isOpen ||
      practiceDeck !== 'words' ||
      isSuccess ||
      !currentTarget ||
      !latestWordPrediction ||
      latestWordPrediction === lastHandledPredictionRef.current
    ) {
      return;
    }

    lastHandledPredictionRef.current = latestWordPrediction;

    if (latestWordPrediction.kind === 'discarded') return;

    const top = latestWordPrediction.top;
    const targetLower = currentTarget.symbol.toLowerCase();
    const matchedCandidate = top.find((g) => g.sign.toLowerCase() === targetLower);
    const top1Matches =
      top[0]?.sign.toLowerCase() === targetLower && latestWordPrediction.kind === 'recognized';

    if (top1Matches || (matchedCandidate && matchedCandidate.probability >= 0.25)) {
      setMatchedTime(1);
      setWordFeedback(null);
      setIsSuccess(true);
      sounds.playWordComplete();
      confetti({ particleCount: 60, spread: 65, origin: { y: 0.7 } });
      setScore((s) => s + 20);
      setStreak((st) => st + 1);
      setTimeout(() => {
        setCurrentIndex((idx) => (idx + 1) % practiceItems.length);
        setIsSuccess(false);
        setMatchedTime(0);
      }, 1300);
    } else if (top[0]) {
      setWordFeedback(
        `Detected "${top[0].label}" (${Math.round(top[0].probability * 100)}%) — try "${currentTarget.name}" again`,
      );
      setMatchedTime(Math.min((matchedCandidate?.probability ?? 0) * 2, 0.7));
    }
  }, [isOpen, practiceDeck, isSuccess, currentTarget, latestWordPrediction, practiceItems.length]);

  if (!isOpen) return null;

  const switchDeck = (deck: 'static' | 'words') => {
    setPracticeDeck(deck);
    setCurrentIndex(0);
    setIsSuccess(false);
    setMatchedTime(0);
    setWordFeedback(null);
    onRequestModeChange(deck === 'words' ? 'asl-words' : 'fingerspell');
  };

  const nextTarget = () => {
    setIsSuccess(false);
    setMatchedTime(0);
    setWordFeedback(null);
    if (practiceItems.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % practiceItems.length);
    }
  };

  const resetStats = () => {
    setScore(0);
    setStreak(0);
    setMatchedTime(0);
    setIsSuccess(false);
    setWordFeedback(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Interactive Practice</h2>
              <p className="text-xs text-slate-400">Match the target sign using your camera</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Deck Switcher */}
        <div className="px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-center gap-2">
          <button
            onClick={() => switchDeck('static')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              practiceDeck === 'static'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Alphabet &amp; Gestures
          </button>
          <button
            onClick={() => switchDeck('words')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              practiceDeck === 'words'
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>250 ASL Words</span>
          </button>
        </div>

        {/* Gamification Stats Bar */}
        <div className="bg-slate-950 px-6 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400 font-medium">Score:</span>
            <span className="text-white font-bold font-mono">{score} pts</span>
          </div>

          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
            <span className="text-slate-400 font-medium">Streak:</span>
            <span className="text-orange-400 font-bold font-mono">{streak}x</span>
          </div>

          <button
            onClick={resetStats}
            title="Reset Score"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Target Sign Card */}
        {currentTarget ? (
          <div className="p-8 flex flex-col items-center text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-2">
              {practiceDeck === 'words' ? 'Target ASL Word' : 'Target Sign'}
            </span>

            <div className="min-w-24 px-5 h-24 rounded-3xl bg-indigo-500/10 border-2 border-indigo-500/40 flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/10 relative">
              <span
                className={`font-black text-white ${
                  practiceDeck === 'words' ? 'text-2xl capitalize' : 'text-4xl'
                }`}
              >
                {practiceDeck === 'words' ? currentTarget.name : currentTarget.symbol}
              </span>
              {isSuccess && (
                <div className="absolute inset-0 bg-emerald-500/20 rounded-3xl flex items-center justify-center animate-in zoom-in-75">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                </div>
              )}
            </div>

            <h3 className="text-2xl font-bold text-white mb-1 capitalize">{currentTarget.name}</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-3 leading-relaxed">
              {currentTarget.description}
            </p>

            {'lookupUrl' in currentTarget && currentTarget.lookupUrl && (
              <a
                href={currentTarget.lookupUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 mb-3"
              >
                <span>Watch how to sign &ldquo;{currentTarget.name}&rdquo;</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <div className="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-400 italic mb-5">
              {currentTarget.tips}
            </div>

            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>
                  {practiceDeck === 'words'
                    ? wordPipelineStatus === 'signing'
                      ? 'Recording sign...'
                      : wordPipelineStatus === 'loading'
                        ? 'Loading 250-word model...'
                        : wordFeedback || 'Ready — sign and pause briefly'
                    : `Current: ${currentDetectedSign?.sign || 'No hand detected'}`}
                </span>
                <span>{Math.round(matchedTime * 100)}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 rounded-full ${
                    isSuccess ? 'bg-emerald-400' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                  }`}
                  style={{ width: `${Math.min(matchedTime * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-400">
            Loading 250-word ASL vocabulary...
          </div>
        )}

        {/* Footer actions */}
        <div className="p-5 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
          <button
            onClick={nextTarget}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all ml-auto"
          >
            <span>Skip Sign</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
