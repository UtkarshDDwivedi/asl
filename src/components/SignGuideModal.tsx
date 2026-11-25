import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, BookOpen, ExternalLink } from 'lucide-react';
import { dictionaryUrl, fetchAllAslLabels } from '../services/aslWordsService';
import type { SignLabel } from '../ml/meta';
import type { RecognitionMode, SignGuideItem } from '../types';

interface SignGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeMode: RecognitionMode;
  wordLabels?: SignLabel[];
  onSelectForPractice?: (symbol: string, category: SignGuideItem['category']) => void;
}

export const ASL_CATALOG: SignGuideItem[] = [
  {
    symbol: 'ILY (🤟)',
    name: 'I Love You',
    category: 'gesture',
    description: 'Thumb, Index finger, and Pinky finger fully extended upright. Middle and ring fingers curled down into palm.',
    tips: 'Iconic universal ASL sign expressing love.',
    emoji: '🤟',
  },
  {
    symbol: 'HELLO (5)',
    name: 'Hello / Open Hand',
    category: 'gesture',
    description: 'All 5 fingers fully extended and spread naturally facing forward.',
    tips: 'Also used for number 5 or Stop.',
    emoji: '🖐️',
  },
  {
    symbol: 'THUMBS UP (👍)',
    name: 'Thumbs Up / Good / Yes',
    category: 'gesture',
    description: 'Fist closed tight with thumb pointing straight up.',
    tips: 'Used for affirmative, good, or yes.',
    emoji: '👍',
  },
  {
    symbol: 'THUMBS DOWN (👎)',
    name: 'Thumbs Down / Bad / No',
    category: 'gesture',
    description: 'Fist closed tight with thumb pointing straight down.',
    tips: 'Used for negative, bad, or no.',
    emoji: '👎',
  },
  {
    symbol: 'OK (F)',
    name: 'OK / Letter F',
    category: 'gesture',
    description: 'Index fingertip touches thumb tip forming a circle. Middle, ring, and pinky extended upward.',
    tips: 'Forms the letter F in ASL alphabet.',
    emoji: '👌',
  },
  {
    symbol: 'V',
    name: 'Peace / Letter V',
    category: 'alphabet',
    description: 'Index and middle fingers extended in a V-shape. Ring, pinky, and thumb folded.',
    tips: 'Keep fingers spread apart.',
    emoji: '✌️',
  },
  {
    symbol: 'L',
    name: 'Letter L',
    category: 'alphabet',
    description: 'Thumb and index finger extended at a 90-degree right angle (forming an L). Other fingers folded.',
    tips: 'Make sure thumb is horizontal and index is vertical.',
    emoji: '👆',
  },
  {
    symbol: 'Y',
    name: 'Letter Y',
    category: 'alphabet',
    description: 'Thumb and pinky extended out sideways. Index, middle, and ring curled in.',
    tips: 'Resembles the "hang loose" or "shaka" shape.',
    emoji: '🤙',
  },
  {
    symbol: 'I',
    name: 'Letter I',
    category: 'alphabet',
    description: 'Only the pinky finger extended straight up. Thumb crossed over other folded fingers.',
    tips: 'Keep pinky straight and upright.',
    emoji: '🤏',
  },
  {
    symbol: 'W',
    name: 'Letter W',
    category: 'alphabet',
    description: 'Index, middle, and ring fingers extended upward in a W shape. Pinky and thumb curled.',
    tips: 'Represents 3 fingers up.',
    emoji: '🖐️',
  },
  {
    symbol: 'B',
    name: 'Letter B',
    category: 'alphabet',
    description: 'Four fingers (index, middle, ring, pinky) extended upright together. Thumb folded across palm.',
    tips: 'Keep four fingers straight and pressed together.',
    emoji: '✋',
  },
  {
    symbol: 'D',
    name: 'Letter D',
    category: 'alphabet',
    description: 'Index finger pointing straight up. Thumb touches the curled middle, ring, and pinky.',
    tips: 'Looks like a lowercase "d".',
    emoji: '☝️',
  },
  {
    symbol: 'C',
    name: 'Letter C',
    category: 'alphabet',
    description: 'Hand curved to form a C cup shape, with thumb below and fingers arched above.',
    tips: 'Show the profile curve to the camera.',
    emoji: '🤏',
  },
  {
    symbol: 'O',
    name: 'Letter O',
    category: 'alphabet',
    description: 'All fingertips curve to touch the thumb tip, making an "O" shape.',
    tips: 'Keep the circular hole clearly visible.',
    emoji: '⭕',
  },
  {
    symbol: 'A',
    name: 'Letter A',
    category: 'alphabet',
    description: 'Fingers curled into a fist, with thumb resting straight upright against the side of the index finger.',
    tips: 'Thumb must be alongside, not folded across the front.',
    emoji: '✊',
  },
  {
    symbol: 'S',
    name: 'Letter S',
    category: 'alphabet',
    description: 'Fist with thumb wrapped across the front of the curled fingers.',
    tips: 'Contrast with A: in S, thumb crosses over fingers.',
    emoji: '👊',
  },
  {
    symbol: 'U',
    name: 'Letter U',
    category: 'alphabet',
    description: 'Index and middle fingers extended straight up pressed tightly together.',
    tips: 'Unlike V, keep the two fingers touching.',
    emoji: '✌️',
  },
];

export const SignGuideModal: React.FC<SignGuideModalProps> = ({
  isOpen,
  onClose,
  activeMode,
  wordLabels,
  onSelectForPractice,
}) => {
  const [filter, setFilter] = useState<'all' | 'alphabet' | 'gesture' | 'word'>(
    activeMode === 'asl-words' ? 'word' : 'all',
  );
  const [search, setSearch] = useState('');
  const [fetchedLabels, setFetchedLabels] = useState<SignLabel[]>([]);

  useEffect(() => {
    setFilter(activeMode === 'asl-words' ? 'word' : 'all');
  }, [activeMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (wordLabels && wordLabels.length > 0) {
      setFetchedLabels(wordLabels);
      return;
    }
    let cancelled = false;
    fetchAllAslLabels()
      .then((signs) => {
        if (!cancelled) setFetchedLabels(signs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen, wordLabels]);

  const wordCatalog: SignGuideItem[] = useMemo(
    () =>
      fetchedLabels.map((entry) => ({
        symbol: entry.sign,
        name: entry.label,
        category: 'word' as const,
        description: `Google ASL Signs (250-word vocabulary, class #${entry.index}). Perform with shoulders and hands visible, then pause briefly.`,
        tips:
          entry.heldOutTop1 !== null
            ? `Model benchmark accuracy: ${Math.round(entry.heldOutTop1 * 100)}%`
            : 'Included in 250-word ONNX classifier',
        emoji: '🤟',
        lookupUrl: dictionaryUrl(entry),
        heldOutTop1: entry.heldOutTop1,
      })),
    [fetchedLabels],
  );

  const combinedCatalog = useMemo(() => [...ASL_CATALOG, ...wordCatalog], [wordCatalog]);

  if (!isOpen) return null;

  const filteredItems = combinedCatalog.filter((item) => {
    const matchesFilter = filter === 'all' || item.category === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.symbol.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const tabs: Array<{ key: 'all' | 'alphabet' | 'gesture' | 'word'; label: string }> = [
    { key: 'all', label: `All (${combinedCatalog.length})` },
    { key: 'word', label: `250 ASL Words (${wordCatalog.length})` },
    { key: 'alphabet', label: 'Alphabet' },
    { key: 'gesture', label: 'Gestures' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">ASL Reference Guide</h2>
              <p className="text-xs text-slate-400">
                Explore fingerspelling letters, gestures, and all 250 Google ASL Signs words
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 sm:p-6 bg-slate-900/60 border-b border-slate-800/80 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 self-stretch sm:self-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === tab.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search 250 words, letter, tip..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Catalog Cards Grid */}
        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={`${item.category}-${item.symbol}`}
              className="bg-slate-950/70 border border-slate-800/80 hover:border-indigo-500/50 rounded-2xl p-4 flex flex-col justify-between transition-all group hover:shadow-lg hover:shadow-indigo-500/5"
            >
              <div>
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-2xl shrink-0">{item.emoji || '✋'}</span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-100 text-base truncate capitalize">
                        {item.name}
                      </h3>
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-indigo-400">
                        {item.category === 'word' ? '250-Word ASL' : item.category}
                      </span>
                    </div>
                  </div>
                  {item.category !== 'word' && (
                    <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">
                      {item.symbol}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mb-3">{item.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="italic truncate">{item.tips}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {item.lookupUrl && (
                    <a
                      href={item.lookupUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Look up sign video on SigningSavvy"
                      className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5 font-medium"
                    >
                      <span>Sign</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {onSelectForPractice && (
                    <button
                      onClick={() => {
                        onSelectForPractice(item.symbol, item.category);
                        onClose();
                      }}
                      className="text-indigo-400 font-semibold hover:text-indigo-300 whitespace-nowrap"
                    >
                      Practice →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
