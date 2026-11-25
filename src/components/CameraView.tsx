import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
  Check,
} from 'lucide-react';
import { mediaPipeService } from '../services/mediaPipeService';
import { classifyHandGesture } from '../services/aslRecognizer';
import { AslWordsEngine, drawHolisticFrame } from '../services/aslWordsService';
import type { Frame } from '../ml/landmarks';
import type { SignLabel } from '../ml/meta';
import type {
  FramingStatus,
  RecognitionMode,
  RecognitionResult,
  WordPipelineStatus,
  WordPredictionEvent,
} from '../types';

interface CameraViewProps {
  mode: RecognitionMode;
  onSignDetected: (result: RecognitionResult) => void;
  onWordPrediction: (event: WordPredictionEvent) => void;
  onWordPipelineStatus: (status: WordPipelineStatus) => void;
  onWordLabelsLoaded: (labels: SignLabel[]) => void;
  onFpsUpdate: (fps: number) => void;
  onModelLoaded: (ready: boolean) => void;
  holdProgress: number;
  currentHoldingSign: string | null;
  wordPipelineStatus: WordPipelineStatus;
  latestWordPrediction: WordPredictionEvent | null;
  wordDiscardNotice: string | null;
  wordConfidenceThreshold: number;
}

const FRAMING_HINT: Record<FramingStatus, string | null> = {
  ok: null,
  nothing: 'Step into view with hands and shoulders visible',
  'no-hands': 'Raise your hands to start signing',
  partial: 'Tip: step back slightly so both shoulders are visible',
  crowded: 'Multiple people detected — keep 1 signer in frame',
};

export const CameraView: React.FC<CameraViewProps> = ({
  mode,
  onSignDetected,
  onWordPrediction,
  onWordPipelineStatus,
  onWordLabelsLoaded,
  onFpsUpdate,
  onModelLoaded,
  holdProgress,
  currentHoldingSign,
  wordPipelineStatus,
  latestWordPrediction,
  wordDiscardNotice,
  wordConfidenceThreshold,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const holisticFrameRef = useRef<Frame | null>(null);
  const engineRef = useRef<AslWordsEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Keep latest callbacks in refs so state changes (like TTS or Practice modal) never restart the ML engine
  const callbacksRef = useRef({
    onSignDetected,
    onWordPrediction,
    onWordPipelineStatus,
    onWordLabelsLoaded,
    onFpsUpdate,
    onModelLoaded,
  });
  callbacksRef.current = {
    onSignDetected,
    onWordPrediction,
    onWordPipelineStatus,
    onWordLabelsLoaded,
    onFpsUpdate,
    onModelLoaded,
  };

  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [activeSign, setActiveSign] = useState<RecognitionResult | null>(null);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>('nothing');

  const frameCountRef = useRef<number>(0);
  const lastFpsTimeRef = useRef<number>(performance.now());

  // Sync confidence threshold updates without restarting engine
  useEffect(() => {
    engineRef.current?.setMinConfidence(wordConfidenceThreshold);
  }, [wordConfidenceThreshold]);

  // Initialize HandLandmarker when in fingerspelling mode
  useEffect(() => {
    if (mode !== 'fingerspell') return;
    let isMounted = true;
    mediaPipeService
      .init()
      .then(() => {
        if (isMounted) callbacksRef.current.onModelLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to initialize MediaPipe:', err);
        if (isMounted) {
          setErrorMessage('Failed to load MediaPipe hand model.');
          callbacksRef.current.onModelLoaded(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mode]);

  // Initialize 250-Word ASL Holistic + ONNX Engine when in asl-words mode
  useEffect(() => {
    if (mode !== 'asl-words' || !isCameraActive) {
      engineRef.current?.dispose();
      engineRef.current = null;
      holisticFrameRef.current = null;
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    setErrorMessage(null);
    callbacksRef.current.onWordPipelineStatus('loading');

    const engine = new AslWordsEngine();
    engineRef.current = engine;

    engine.start(
      video,
      {
        onReady: (_meta, labels) => {
          if (cancelled) return;
          callbacksRef.current.onWordLabelsLoaded(labels);
          callbacksRef.current.onWordPipelineStatus('ready');
        },
        onError: (message) => {
          if (cancelled) return;
          setErrorMessage(`250-Word ASL Engine: ${message}`);
          callbacksRef.current.onWordPipelineStatus('error');
        },
        onFramingStatus: (status) => {
          if (!cancelled) setFramingStatus(status);
        },
        onSigningStart: () => {
          if (!cancelled) callbacksRef.current.onWordPipelineStatus('signing');
        },
        onClassifying: () => {
          if (!cancelled) callbacksRef.current.onWordPipelineStatus('thinking');
        },
        onPrediction: (event) => {
          if (cancelled) return;
          callbacksRef.current.onWordPipelineStatus('ready');
          callbacksRef.current.onWordPrediction(event);
        },
        onFrameLandmarks: (frame) => {
          if (!cancelled) holisticFrameRef.current = frame;
        },
      },
      wordConfidenceThreshold,
    );

    return () => {
      cancelled = true;
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      holisticFrameRef.current = null;
    };
  }, [mode, isCameraActive]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    let active = true;
    try {
      setErrorMessage(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!active || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(() => undefined);
        setIsCameraActive(true);
      };
    } catch (err: unknown) {
      console.error('Camera access error:', err);
      const msg =
        err instanceof Error ? err.message : 'Camera permission denied or camera not found.';
      setErrorMessage(msg);
      setIsCameraActive(false);
    }

    return () => {
      active = false;
    };
  }, [facingMode]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        setErrorMessage(null);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (!cancelled) {
            videoRef.current?.play().catch(() => undefined);
            setIsCameraActive(true);
          }
        };
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Camera access error:', err);
          const msg =
            err instanceof Error ? err.message : 'Camera permission denied or camera not found.';
          setErrorMessage(msg);
          setIsCameraActive(false);
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode]);

  // Main Render & Detection Loop
  const renderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }

        const width = canvas.width;
        const height = canvas.height;

        // Draw mirrored camera frame
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -width, 0, width, height);
        ctx.restore();

        const now = performance.now();

        if (mode === 'fingerspell') {
          const results = mediaPipeService.detectForVideo(video, now);
          if (results && results.landmarks && results.landmarks.length > 0) {
            const firstHandLandmarks = results.landmarks[0];
            if (showLandmarks) {
              mediaPipeService.drawLandmarks(ctx, firstHandLandmarks, width, height, true);
            }
            const recognition = classifyHandGesture(firstHandLandmarks);
            if (results.handednesses && results.handednesses[0]?.[0]?.categoryName) {
              recognition.handedness = results.handednesses[0][0].categoryName as 'Left' | 'Right';
            }
            setActiveSign(recognition);
            callbacksRef.current.onSignDetected(recognition);
          } else {
            setActiveSign(null);
            callbacksRef.current.onSignDetected({
              sign: '...',
              confidence: 0,
              type: 'letter',
              description: 'No hand detected',
            });
          }
        } else {
          if (showLandmarks && holisticFrameRef.current) {
            drawHolisticFrame(ctx, holisticFrameRef.current, width, height, true);
          }
        }

        frameCountRef.current++;
        if (now - lastFpsTimeRef.current >= 1000) {
          const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
          callbacksRef.current.onFpsUpdate(fps);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(renderLoop);
  }, [mode, showLandmarks]);

  useEffect(() => {
    if (isCameraActive) {
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraActive, renderLoop]);

  const framingHint = mode === 'asl-words' ? FRAMING_HINT[framingStatus] : null;
  const topWord = latestWordPrediction?.top[0];

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl shadow-indigo-950/20">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      <div className="relative flex-1 w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {isCameraActive ? (
          <canvas ref={canvasRef} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <CameraOff className="w-16 h-16 text-slate-600 mb-4 animate-bounce" />
            <h3 className="text-lg font-semibold text-slate-300">Camera is Paused</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">
              Click the turn on camera button below to resume real-time sign detection.
            </p>
            <button
              onClick={() => void startCamera()}
              className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-all"
            >
              Resume Camera
            </button>
          </div>
        )}

        {/* Fingerspelling Live Detected Gesture Overlay Badge */}
        {mode === 'fingerspell' && isCameraActive && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-indigo-500/30 shadow-xl">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-500/50">
              <span className="text-xl font-black text-white">
                {activeSign && activeSign.sign !== '...' ? activeSign.sign : '—'}
              </span>
              {activeSign &&
                activeSign.sign !== '...' &&
                holdProgress > 0 &&
                currentHoldingSign === activeSign.sign && (
                  <svg className="absolute -inset-1 w-14 h-14 -rotate-90 pointer-events-none">
                    <circle
                      cx="28"
                      cy="28"
                      r="24"
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="3"
                      strokeDasharray="150"
                      strokeDashoffset={150 - 150 * holdProgress}
                      className="transition-all duration-75"
                    />
                  </svg>
                )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                  {activeSign && activeSign.sign !== '...' ? activeSign.type : 'Waiting'}
                </span>
                {activeSign && activeSign.sign !== '...' && (
                  <span className="text-[11px] text-slate-400">
                    {Math.round(activeSign.confidence * 100)}% match
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium truncate max-w-[180px]">
                {activeSign
                  ? activeSign.description || 'Recognized Sign'
                  : 'Show one hand in view'}
              </p>
            </div>
          </div>
        )}

        {/* 250-Word ASL Live Status & Prediction Overlay */}
        {mode === 'asl-words' && isCameraActive && (
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-xs">
            <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-cyan-500/30 shadow-xl">
              <div
                className={`flex items-center justify-center w-11 h-11 rounded-xl border ${
                  wordPipelineStatus === 'loading' || wordPipelineStatus === 'thinking'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : wordPipelineStatus === 'signing'
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 animate-pulse'
                      : latestWordPrediction?.kind === 'recognized'
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                        : 'bg-indigo-600/30 border-indigo-500/50 text-white'
                }`}
              >
                {wordPipelineStatus === 'loading' || wordPipelineStatus === 'thinking' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-cyan-400">
                    {wordPipelineStatus === 'loading'
                      ? 'Loading AI'
                      : wordPipelineStatus === 'signing'
                        ? 'Recording Sign...'
                        : wordPipelineStatus === 'thinking'
                          ? 'Classifying...'
                          : latestWordPrediction?.kind === 'recognized'
                            ? 'Recognized'
                            : latestWordPrediction?.kind === 'not-sure'
                              ? 'Low Confidence'
                              : 'Ready'}
                  </span>
                  {topWord &&
                    wordPipelineStatus !== 'signing' &&
                    wordPipelineStatus !== 'thinking' && (
                      <span className="text-[11px] text-slate-400 font-mono">
                        {Math.round(topWord.probability * 100)}%
                      </span>
                    )}
                </div>
                <p className="text-sm text-white font-bold truncate">
                  {wordPipelineStatus === 'loading'
                    ? 'Initializing Holistic + ONNX'
                    : wordPipelineStatus === 'signing'
                      ? 'Pause briefly when done'
                      : wordPipelineStatus === 'thinking'
                        ? 'Running 250-word model'
                        : topWord
                          ? topWord.label.toUpperCase()
                          : 'Sign a word to translate'}
                </p>
              </div>
            </div>

            {wordDiscardNotice && wordPipelineStatus === 'ready' && (
              <div className="bg-slate-900/90 backdrop-blur-md border border-indigo-500/30 text-indigo-200 text-[11px] px-3 py-1.5 rounded-xl shadow-lg">
                {wordDiscardNotice}
              </div>
            )}

            {framingHint && wordPipelineStatus !== 'loading' && (
              <div className="bg-slate-900/85 backdrop-blur-md border border-amber-500/30 text-amber-200 text-[11px] px-3 py-1.5 rounded-xl shadow-lg">
                {framingHint}
              </div>
            )}
          </div>
        )}

        {/* Framing indicator badge on top-right in 250-Word mode */}
        {mode === 'asl-words' && isCameraActive && wordPipelineStatus !== 'loading' && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/70 text-[11px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                framingStatus === 'ok'
                  ? 'bg-emerald-400'
                  : framingStatus === 'partial'
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300">
              {framingStatus === 'ok'
                ? 'Framing OK'
                : framingStatus === 'partial'
                  ? 'Shoulders clipped'
                  : framingStatus === 'no-hands'
                    ? 'No hands'
                    : framingStatus === 'crowded'
                      ? '2+ people'
                      : 'No signer'}
            </span>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="absolute top-14 right-4 z-30 max-w-md bg-red-950/90 border border-red-500/50 text-red-200 text-xs p-3 rounded-xl backdrop-blur-md shadow-xl">
            <p className="font-semibold">Notice:</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        )}

        {/* Quick Floating Camera Toolbar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-700/80 shadow-2xl">
          <button
            onClick={isCameraActive ? stopCamera : () => void startCamera()}
            title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
            className={`p-2 rounded-xl transition-all ${
              isCameraActive
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-red-600/30 text-red-400 hover:bg-red-600/40 border border-red-500/40'
            }`}
          >
            {isCameraActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowLandmarks(!showLandmarks)}
            title={showLandmarks ? 'Hide landmark mesh' : 'Show landmark mesh'}
            className={`p-2 rounded-xl transition-all ${
              showLandmarks
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {showLandmarks ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
            title="Flip camera"
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {mode === 'asl-words' && wordPipelineStatus === 'signing' && (
            <button
              onClick={() => engineRef.current?.flush()}
              title="Classify current sign immediately"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Finish Sign</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
