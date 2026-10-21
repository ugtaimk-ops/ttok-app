import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capgo/capacitor-speech-recognition";
import type { PluginListenerHandle } from "@capacitor/core";
import { Camera, CameraOff, Mic, MicOff, Pause, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { emptyMeasurements, summarizePractice, type OfflinePracticeResult, type PracticeMeasurements } from "../lib/offlinePracticeAnalysis";
import { useScreenBack } from "../lib/screenBack";
import type { ScriptItem } from "../types";

type Phase = "ready" | "running" | "paused" | "result";
const asset = (name: string) => `${import.meta.env.BASE_URL}offline-practice/${name}`;
const formatTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default function OfflinePractice({ userId, topic, scripts, isActive }: { userId: string; topic: string; scripts: ScriptItem[]; isActive: boolean }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [seconds, setSeconds] = useState(0);
  const [targetMinutes, setTargetMinutes] = useState("3");
  const [customMinutes, setCustomMinutes] = useState("3");
  const [frontCamera, setFrontCamera] = useState(true);
  const [poseEnabled, setPoseEnabled] = useState(true);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [speechLanguage, setSpeechLanguage] = useState<"ko-KR" | "en-US">("ko-KR");
  const [speechStatus, setSpeechStatus] = useState("시작하면 음성 인식 권한을 요청합니다.");
  const [liveCaption, setLiveCaption] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [customScript, setCustomScript] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [showPrompter, setShowPrompter] = useState(true);
  const [prompterSize, setPrompterSize] = useState<"sm" | "base" | "lg">("base");
  const [micActive, setMicActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState("카메라와 마이크 권한을 허용하면 기기에서만 분석합니다.");
  const [result, setResult] = useState<OfflinePracticeResult | null>(null);
  const storageKey = `ttok_offline_practice_${userId || "guest"}`;
  const selectedScript = scripts.find(script => script.id === selectedScriptId);
  const prompterText = selectedScriptId === "custom" ? customScript : selectedScript?.script || "";
  const effectiveTopic = selectedScript?.topic || customTopic || topic;
  const [history, setHistory] = useState<OfflinePracticeResult[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const faceRef = useRef<FaceLandmarker | null>(null);
  const poseRef = useRef<PoseLandmarker | null>(null);
  const visionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const metricsRef = useRef<PracticeMeasurements>(emptyMeasurements(180000));
  const phaseRef = useRef<Phase>("ready");
  const segmentStart = useRef(0);
  const elapsedBeforeSegment = useRef(0);
  const lastAudioSample = useRef(0);
  const silenceRun = useRef(0);
  const silenceCounted = useRef(false);
  const noiseFloor = useRef(-55);
  const previousDbfs = useRef<number | null>(null);
  const previousFaceForward = useRef<boolean | null>(null);
  const previousShoulderX = useRef<number | null>(null);
  const visionErrors = useRef(0);
  const disposed = useRef(false);
  const busyRef = useRef(false);
  const activeRef = useRef(isActive);
  activeRef.current = isActive;
  const requestId = useRef(0);
  const speechGeneration = useRef(0);
  const speechListeners = useRef<PluginListenerHandle[]>([]);
  const speechStopPromise = useRef<Promise<void>>(Promise.resolve());
  const transcriptRef = useRef("");

  const stopSpeech = useCallback(() => {
    speechGeneration.current++;
    speechStopPromise.current = speechStopPromise.current.then(async () => {
      await SpeechRecognition.setPTTState({ held: false }).catch(() => {});
      await SpeechRecognition.stop().catch(() => {});
    });
    for (const listener of speechListeners.current.splice(0)) void listener.remove();
  }, []);

  const startSpeech = useCallback(async () => {
    if (!speechEnabled) { setSpeechStatus("음성 인식을 사용하지 않습니다."); return; }
    if (!Capacitor.isNativePlatform()) {
      setSpeechStatus("실시간 자막은 Android·iOS 앱에서 지원합니다."); return;
    }
    const generation = ++speechGeneration.current;
    const sessionPrefix = transcriptRef.current.trim();
    try {
      await speechStopPromise.current;
      if (generation !== speechGeneration.current || phaseRef.current !== "running") return;
      setSpeechStatus("음성 인식을 연결하는 중...");
      const { available } = await SpeechRecognition.available();
      if (!available) throw new Error("이 기기에 음성 인식 서비스가 없습니다.");
      const permissions = await SpeechRecognition.requestPermissions();
      if (permissions.speechRecognition !== "granted") throw new Error("마이크·음성 인식 권한을 허용해 주세요.");
      if (generation !== speechGeneration.current || phaseRef.current !== "running") return;
      const partial = await SpeechRecognition.addListener("partialResults", event => {
        if (generation !== speechGeneration.current || phaseRef.current !== "running") return;
        const text = (event.accumulatedText || [event.accumulated, event.matches?.[0]].filter(Boolean).join(" ") || "").trim();
        if (text) {
          // Continuous PTT sends the entire accumulated text, not one new sentence.
          transcriptRef.current = [sessionPrefix, text].filter(Boolean).join(" ").trim();
          setLiveCaption(transcriptRef.current);
        }
      });
      speechListeners.current.push(partial);
      const error = await SpeechRecognition.addListener("error", event => {
        if (generation === speechGeneration.current && phaseRef.current === "running")
          setSpeechStatus(`음성 인식이 중단됐어요 (${event.code}). 발표는 계속할 수 있습니다.`);
      });
      speechListeners.current.push(error);
      if (generation !== speechGeneration.current || phaseRef.current !== "running") { stopSpeech(); return; }
      await SpeechRecognition.setPTTState({ held: true });
      await SpeechRecognition.start({ language: speechLanguage, partialResults: true, continuousPTT: true, popup: false, maxResults: 1 });
      if (generation === speechGeneration.current && phaseRef.current === "running") setSpeechStatus("음성 인식 중 · 말하는 내용이 아래에 표시됩니다.");
      else stopSpeech();
    } catch (error) {
      if (generation === speechGeneration.current) {
        setSpeechStatus(error instanceof Error ? `음성 인식을 시작하지 못했어요: ${error.message}` : "음성 인식을 시작하지 못했어요.");
        stopSpeech();
      }
    }
  }, [speechEnabled, speechLanguage, stopSpeech]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
      setHistory(Array.isArray(stored) ? stored.slice(0, 20) : []);
    } catch { setHistory([]); }
  }, [storageKey]);
  useEffect(() => {
    if (!selectedScriptId && scripts.length) setSelectedScriptId(scripts[scripts.length - 1].id);
  }, [scripts, selectedScriptId]);

  const stopDevices = useCallback(() => {
    stopSpeech();
    requestId.current++;
    if (visionTimer.current) clearTimeout(visionTimer.current);
    if (audioTimer.current) clearInterval(audioTimer.current);
    if (clockTimer.current) clearInterval(clockTimer.current);
    visionTimer.current = null;
    audioTimer.current = null;
    clockTimer.current = null;
    cameraRef.current?.getTracks().forEach(track => track.stop());
    micRef.current?.getTracks().forEach(track => track.stop());
    cameraRef.current = null;
    micRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    void audioRef.current?.close();
    audioRef.current = null;
    analyserRef.current = null;
    if (!disposed.current) { setCameraActive(false); setMicActive(false); }
  }, [stopSpeech]);

  const closeModels = useCallback(() => {
    faceRef.current?.close();
    poseRef.current?.close();
    faceRef.current = null;
    poseRef.current = null;
  }, []);

  const elapsed = () => elapsedBeforeSegment.current + (phaseRef.current === "running" ? performance.now() - segmentStart.current : 0);

  const finish = useCallback(() => {
    if (phaseRef.current !== "running" && phaseRef.current !== "paused") return;
    const ms = elapsed();
    metricsRef.current.elapsedMs = ms;
    metricsRef.current.recognitionLanguage = speechEnabled ? speechLanguage : undefined;
    metricsRef.current.recognizedText = transcriptRef.current.trim();
    metricsRef.current.longestPauseMs = Math.max(metricsRef.current.longestPauseMs, silenceRun.current);
    stopDevices();
    phaseRef.current = "result";
    setPhase("result");
    const summary = summarizePractice(effectiveTopic, { ...metricsRef.current, audioDbfs: [...metricsRef.current.audioDbfs] });
    setResult(summary);
    setHistory(previous => {
      const next = [summary, ...previous].slice(0, 20);
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { setStatus("기기 저장 공간이 부족해 결과를 저장하지 못했어요."); }
      return next;
    });
  }, [stopDevices, effectiveTopic, storageKey, speechEnabled, speechLanguage]);

  // Vision is capped at 5 video frames per second (up to two inferences per
  // frame). Slow devices automatically use a longer delay.
  const sampleVision = useCallback(() => {
    if (phaseRef.current !== "running") return;
    const video = videoRef.current;
    const started = performance.now();
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      const m = metricsRef.current;
      try {
        if (faceRef.current) {
          const face = faceRef.current.detectForVideo(video, started).faceLandmarks[0];
          m.faceSamples++;
          if (face) {
            m.faceDetected++;
            const width = Math.abs(face[454].x - face[234].x);
            const middle = (face[454].x + face[234].x) / 2;
            const forward = width > 0.05 && Math.abs(face[1].x - middle) / width < 0.16;
            if (forward) m.faceForward++;
            if (previousFaceForward.current === true && !forward) m.faceTurns++;
            previousFaceForward.current = forward;
          } else previousFaceForward.current = null;
        }
        if (poseRef.current) {
          const pose = poseRef.current.detectForVideo(video, started).landmarks[0];
          m.poseSamples++;
          if (pose && pose[11].visibility > 0.5 && pose[12].visibility > 0.5) {
            m.poseDetected++;
            const shoulders = Math.abs(pose[11].x - pose[12].x);
            const shoulderX = (pose[11].x + pose[12].x) / 2;
            if (shoulders > 0.05) {
              if (Math.abs(pose[11].y - pose[12].y) / shoulders > 0.14) m.shoulderTiltSamples++;
              if (pose[23].visibility > 0.5 && pose[24].visibility > 0.5 &&
                  Math.abs(shoulderX - (pose[23].x + pose[24].x) / 2) / shoulders > 0.2) m.torsoTiltSamples++;
            }
            if (previousShoulderX.current !== null && Math.abs(shoulderX - previousShoulderX.current) > 0.12) m.movementSamples++;
            previousShoulderX.current = shoulderX;
          } else previousShoulderX.current = null;
        }
        visionErrors.current = 0;
      } catch {
        // A camera frame can become unavailable while the OS switches apps.
        if (++visionErrors.current >= 3) {
          faceRef.current?.close();
          poseRef.current?.close();
          faceRef.current = null;
          poseRef.current = null;
          setStatus("영상 분석 모델이 중단됐어요. 연습을 다시 시작하면 재시도합니다.");
        }
      }
    }
    visionTimer.current = setTimeout(sampleVision, Math.max(200, (performance.now() - started) * 3));
  }, []);

  const sampleAudio = useCallback(() => {
    if (phaseRef.current !== "running" || !analyserRef.current) return;
    const samples = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(samples);
    let power = 0;
    for (const value of samples) power += value * value;
    const rms = Math.sqrt(power / samples.length);
    const dbfs = Math.max(-90, 20 * Math.log10(Math.max(rms, 0.00001)));
    const now = performance.now();
    const delta = Math.min(250, Math.max(0, now - lastAudioSample.current));
    lastAudioSample.current = now;
    const m = metricsRef.current;
    m.audioSamples++;
    if (m.audioSamples <= 20) noiseFloor.current = Math.min(noiseFloor.current, dbfs);
    else if (dbfs < noiseFloor.current + 5) noiseFloor.current = noiseFloor.current * 0.95 + dbfs * 0.05;
    const speaking = dbfs > Math.max(-48, noiseFloor.current + 9);
    if (speaking) {
      m.speechSamples++;
      m.speechMs += delta;
      m.longestPauseMs = Math.max(m.longestPauseMs, silenceRun.current);
      silenceRun.current = 0;
      silenceCounted.current = false;
    } else {
      m.silenceMs += delta;
      silenceRun.current += delta;
      if (silenceRun.current >= 2000 && !silenceCounted.current && m.speechMs > 0) {
        m.longPauses++;
        silenceCounted.current = true;
      }
    }
    if (speaking && dbfs < -38) m.lowVolumeSamples++;
    if (previousDbfs.current !== null && Math.abs(dbfs - previousDbfs.current) > 18) m.abruptVolumeChanges++;
    previousDbfs.current = dbfs;
    if (m.audioSamples % 10 === 0 && m.audioDbfs.length < 1800) m.audioDbfs.push(Math.round(dbfs));
  }, []);

  const loadModels = useCallback(async () => {
    if (faceRef.current && (!poseEnabled || poseRef.current)) return;
    setStatus("기기에 포함된 얼굴·자세 분석 모델을 여는 중...");
    const { FilesetResolver, FaceLandmarker, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(asset("wasm"));
    if (!faceRef.current) faceRef.current = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: asset("face_landmarker.task"), delegate: "CPU" },
      runningMode: "VIDEO", numFaces: 1,
    });
    if (poseEnabled && !poseRef.current) poseRef.current = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: asset("pose_landmarker_lite.task"), delegate: "CPU" },
      runningMode: "VIDEO", numPoses: 1,
    });
  }, [poseEnabled]);

  const openDevices = useCallback(async () => {
    const request = ++requestId.current;
    let cameraOk = false;
    let micOk = false;
    try {
      const camera = cameraRef.current?.getVideoTracks().some(track => track.readyState === "live")
        ? cameraRef.current
        : await navigator.mediaDevices.getUserMedia({ video: { facingMode: frontCamera ? "user" : "environment", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!activeRef.current || disposed.current || document.hidden || request !== requestId.current) {
        camera.getTracks().forEach(track => track.stop()); return false;
      }
      cameraRef.current = camera;
      if (videoRef.current) { videoRef.current.srcObject = camera; void videoRef.current.play().catch(() => {}); }
      cameraOk = true;
      setCameraActive(true);
    } catch { setCameraActive(false); }
    let microphone: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!activeRef.current || disposed.current || document.hidden || request !== requestId.current) {
        microphone.getTracks().forEach(track => track.stop()); stopDevices(); return false;
      }
      context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(microphone);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // Deliberately never connects to speakers.
      micRef.current = microphone;
      audioRef.current = context;
      analyserRef.current = analyser;
      micOk = true;
      setMicActive(true);
    } catch {
      microphone?.getTracks().forEach(track => track.stop());
      if (context) void context.close();
      setMicActive(false);
    }
    if (!cameraOk && !micOk) {
      setStatus("카메라와 마이크 접근이 거부되었어요. 기기 설정에서 권한을 확인해 주세요.");
      return false;
    }
    if (cameraOk) {
      try { await loadModels(); }
      catch { setStatus("얼굴·자세 모델을 열지 못했어요. 음성·시간만 분석합니다."); closeModels(); }
    }
    if (!activeRef.current || disposed.current || document.hidden || request !== requestId.current) {
      stopDevices();
      return false;
    }
    if (!cameraOk) setStatus("카메라를 사용할 수 없어 목소리와 시간만 분석합니다.");
    else if (!micOk) setStatus("마이크를 사용할 수 없어 얼굴·자세와 시간만 분석합니다.");
    else if (faceRef.current) setStatus("카메라·음량 분석은 기기에서 처리합니다. 음성 자막은 기기 음성 인식 서비스를 사용합니다.");
    return true;
  }, [frontCamera, loadModels, closeModels, stopDevices]);

  const previewCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("카메라를 사용할 수 없는 환경이에요."); return; }
    const request = ++requestId.current;
    try {
      cameraRef.current?.getTracks().forEach(track => track.stop());
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: frontCamera ? "user" : "environment" }, audio: false });
      if (!activeRef.current || disposed.current || document.hidden || request !== requestId.current) {
        camera.getTracks().forEach(track => track.stop()); return;
      }
      cameraRef.current = camera;
      if (videoRef.current) { videoRef.current.srcObject = camera; void videoRef.current.play().catch(() => {}); }
      setCameraActive(true);
      setStatus("카메라 미리보기 중입니다. 시작하면 마이크 권한도 요청합니다.");
    } catch { setCameraActive(false); setStatus("카메라 권한을 허용해 주세요. 카메라 없이 마이크만으로도 연습할 수 있습니다."); }
  };

  const resume = useCallback(async () => {
    if (phaseRef.current !== "paused" || busyRef.current) return false;
    busyRef.current = true;
    setPreparing(true);
    try {
      if (!await openDevices()) return false;
      segmentStart.current = performance.now();
      lastAudioSample.current = segmentStart.current;
      phaseRef.current = "running";
      setPhase("running");
      void startSpeech();
      visionTimer.current = setTimeout(sampleVision, 200);
      audioTimer.current = setInterval(sampleAudio, 100);
      clockTimer.current = setInterval(() => {
        const ms = elapsed();
        setSeconds(Math.floor(ms / 1000));
        if (ms >= 30 * 60000) finish();
      }, 250);
      return true;
    } finally { busyRef.current = false; setPreparing(false); }
  }, [openDevices, sampleVision, sampleAudio, finish, startSpeech]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "running") return;
    elapsedBeforeSegment.current = elapsed();
    phaseRef.current = "paused";
    setPhase("paused");
    stopDevices();
    setStatus("일시정지했습니다. 재개하면 카메라와 마이크를 다시 연결합니다.");
    setSpeechStatus("음성 인식이 일시정지되었습니다.");
  }, [stopDevices]);

  const start = async () => {
    if (phaseRef.current !== "ready" || busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("이 환경에서는 카메라·마이크를 사용할 수 없어요. HTTPS 또는 설치된 앱에서 실행해 주세요.");
      return;
    }
    const target = targetMinutes === "custom" ? Number(customMinutes) : Number(targetMinutes);
    if (!Number.isFinite(target) || target < 1 || target > 30) { setStatus("목표 시간은 1~30분으로 설정해 주세요."); return; }
    metricsRef.current = emptyMeasurements(target * 60000);
    elapsedBeforeSegment.current = 0;
    silenceRun.current = 0;
    silenceCounted.current = false;
    previousDbfs.current = null;
    previousFaceForward.current = null;
    previousShoulderX.current = null;
    visionErrors.current = 0;
    transcriptRef.current = "";
    setLiveCaption("");
    setSeconds(0);
    setResult(null);
    phaseRef.current = "paused";
    if (!await resume()) { phaseRef.current = "ready"; setPhase("ready"); }
  };

  const reset = () => {
    stopDevices();
    phaseRef.current = "ready";
    setPhase("ready");
    setResult(null);
    setSeconds(0);
    transcriptRef.current = "";
    setLiveCaption("");
  };

  useEffect(() => {
    if (!isActive) {
      if (phaseRef.current === "running") pause();
      else stopDevices();
    }
  }, [isActive, pause, stopDevices]);
  useScreenBack(() => {
    if (phaseRef.current === "running") { pause(); return true; }
    if (phaseRef.current === "paused" || phaseRef.current === "result") { reset(); return true; }
    return false;
  }, isActive, 1);
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      if (phaseRef.current === "running") pause();
      else stopDevices();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause, stopDevices]);
  useEffect(() => {
    // React StrictMode replays effects in development. Re-enable on setup.
    disposed.current = false;
    return () => {
      disposed.current = true;
      stopDevices();
      closeModels();
    };
  }, [stopDevices, closeModels]);

  const scoreLabels: Record<keyof OfflinePracticeResult["scores"], string> = {
    delivery: "전달력", face: "카메라 방향 응시 추정", posture: "자세·움직임", pace: "말하기 속도", time: "시간 관리",
  };
  const shown = result;

  return <div className="space-y-5 pb-12">
    <div className="rounded-[28px] border border-brand/15 bg-white dark:bg-slate-900 dark:border-slate-800 p-5 space-y-2">
      <h2 className="text-lg font-black text-slate-900 dark:text-white">기기 내 발표 연습</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">카메라 영상과 음성 원본은 앱 서버에 저장하거나 보내지 않습니다. 얼굴 방향·자세·음량은 기기에서 분석합니다. 음성 인식을 켜면 기기의 음성 인식 서비스가 인터넷으로 음성을 처리할 수 있습니다. 인식된 문장은 이 기기에만 저장됩니다.</p>
      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">음성 인식은 인터넷과 기기 서비스에 따라 달라집니다. 자막은 실제 인식 결과이며 발음·말하기 속도 점수는 제공하지 않습니다.</p>
    </div>

    {(phase === "ready" || phase === "paused" || phase === "running") && <>
      {phase === "ready" && <div className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"><h3 className="text-sm font-black dark:text-white">연습할 대본</h3><select value={selectedScriptId} onChange={e => setSelectedScriptId(e.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm dark:text-white"><option value="">대본 없이 연습하기</option>{scripts.map(script => <option value={script.id} key={script.id}>{script.title}</option>)}<option value="custom">직접 입력하기</option></select>{!selectedScript && <input value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder="발표 주제 (선택)" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-sm dark:text-white" />}{selectedScriptId === "custom" && <textarea value={customScript} onChange={e => setCustomScript(e.target.value)} rows={4} placeholder="연습할 대본을 입력해 주세요" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm dark:text-white" />}</div>}
      <div className="relative overflow-hidden rounded-[28px] bg-slate-950 aspect-video flex items-center justify-center">
        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${frontCamera ? "scale-x-[-1]" : ""}`} />
        {!cameraActive && <span className="absolute text-white/70 text-xs flex items-center gap-2"><CameraOff size={17} /> 카메라 미리보기 없음</span>}
        {phase === "running" && prompterText && showPrompter && <div className={`absolute top-3 left-3 right-3 max-h-[45%] overflow-y-auto rounded-xl bg-slate-950/80 p-3 text-white whitespace-pre-wrap ${prompterSize === "sm" ? "text-xs" : prompterSize === "lg" ? "text-lg" : "text-sm"}`}>{prompterText}</div>}
        <div className="absolute bottom-3 left-3 flex gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cameraActive ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"}`}><Camera size={12} className="inline mr-1" />{cameraActive ? "카메라 켜짐" : "카메라 꺼짐"}</span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${micActive ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300"}`}>{micActive ? <Mic size={12} className="inline mr-1" /> : <MicOff size={12} className="inline mr-1" />}{micActive ? "마이크 입력 중" : "마이크 꺼짐"}</span>
        </div>
      </div>
      <div className="rounded-[24px] border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex justify-between items-center"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">경과 시간</span><strong className="text-2xl text-brand tabular-nums">{formatTime(seconds * 1000)}</strong></div>
        {phase === "ready" && <>
          <div className="flex flex-wrap gap-2">{["1", "3", "5", "custom"].map(value => <button key={value} onClick={() => setTargetMinutes(value)} className={`px-3 py-2 rounded-xl text-xs font-bold ${targetMinutes === value ? "bg-brand text-white" : "bg-slate-100 dark:bg-slate-800 dark:text-white"}`}>{value === "custom" ? "직접 입력" : `${value}분`}</button>)}</div>
          {targetMinutes === "custom" && <label className="text-xs text-slate-600 dark:text-slate-300">목표 시간(분) <input type="number" min="1" max="30" value={customMinutes} onChange={e => setCustomMinutes(e.target.value)} className="ml-2 w-20 p-2 rounded-lg border dark:bg-slate-800" /></label>}
          <div className="flex flex-wrap gap-2"><button onClick={previewCamera} disabled={preparing} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 dark:text-white text-xs font-bold"><Camera size={14} className="inline mr-1" /> 카메라 미리보기</button><button onClick={() => { cameraRef.current?.getTracks().forEach(track => track.stop()); cameraRef.current = null; setCameraActive(false); setFrontCamera(!frontCamera); }} disabled={preparing} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 dark:text-white text-xs font-bold"><RotateCcw size={14} className="inline mr-1" />{frontCamera ? "후면 카메라" : "전면 카메라"}</button><label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={poseEnabled} onChange={e => setPoseEnabled(e.target.checked)} /> 자세 분석 사용</label></div>
          <div className="flex flex-wrap items-center gap-2 text-xs dark:text-white"><label className="flex items-center gap-2"><input type="checkbox" checked={speechEnabled} onChange={e => setSpeechEnabled(e.target.checked)} /> 실시간 음성 인식</label>{speechEnabled && <><span>인식 언어</span><button onClick={() => setSpeechLanguage("ko-KR")} className={`rounded-lg px-3 py-2 ${speechLanguage === "ko-KR" ? "bg-brand text-white" : "bg-slate-100 dark:bg-slate-800"}`}>한국어</button><button onClick={() => setSpeechLanguage("en-US")} className={`rounded-lg px-3 py-2 ${speechLanguage === "en-US" ? "bg-brand text-white" : "bg-slate-100 dark:bg-slate-800"}`}>English</button></>}</div>
          <button onClick={start} disabled={preparing} className="w-full rounded-2xl bg-brand disabled:opacity-60 text-white py-3.5 font-black flex items-center justify-center gap-2"><Play size={16} /> {preparing ? "분석 모델 준비 중..." : "발표 연습 시작"}</button>
        </>}
        {phase === "running" && <div className="flex gap-2"><button onClick={pause} className="flex-1 rounded-2xl bg-slate-200 dark:bg-slate-700 dark:text-white py-3 font-bold"><Pause size={16} className="inline mr-1" /> 일시정지</button><button onClick={finish} className="flex-1 rounded-2xl bg-rose-600 text-white py-3 font-bold"><Square size={16} className="inline mr-1" /> 발표 종료</button></div>}
        {phase === "running" && prompterText && <div className="flex flex-wrap items-center gap-2 text-xs dark:text-white"><button onClick={() => setShowPrompter(!showPrompter)} className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1.5">대본 {showPrompter ? "숨기기" : "보기"}</button>{(["sm", "base", "lg"] as const).map((size, index) => <button key={size} onClick={() => setPrompterSize(size)} className={`rounded-lg px-2 py-1.5 ${prompterSize === size ? "bg-brand text-white" : "bg-slate-100 dark:bg-slate-800"}`}>{["작게", "중간", "크게"][index]}</button>)}</div>}
        {phase === "paused" && <div className="flex gap-2"><button onClick={resume} disabled={preparing} className="flex-1 rounded-2xl bg-brand disabled:opacity-60 text-white py-3 font-bold"><Play size={16} className="inline mr-1" /> {preparing ? "준비 중..." : "재개"}</button><button onClick={finish} disabled={preparing} className="flex-1 rounded-2xl bg-rose-600 disabled:opacity-60 text-white py-3 font-bold"><Square size={16} className="inline mr-1" /> 종료</button></div>}
        <p role="status" className="text-xs text-slate-500 dark:text-slate-400">{status}</p>
        {speechEnabled && phase !== "ready" && <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm dark:text-white"><p className="font-bold text-xs text-brand">실시간 자막 · {speechLanguage === "ko-KR" ? "한국어" : "English"}</p><p className="mt-1 min-h-6 whitespace-pre-wrap" aria-live="polite">{liveCaption || "아직 인식된 말이 없습니다."}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{speechStatus}</p></div>}
      </div>
    </>}

    {phase === "result" && shown && <div className="space-y-4">
      <div className="rounded-[28px] border border-brand/15 bg-white dark:bg-slate-900 dark:border-slate-800 p-6">
        <h3 className="text-lg font-black dark:text-white">{shown.topic} 발표 결과</h3>
        <div className="mt-3 text-4xl font-black text-brand">{shown.score === null ? "분석 불가" : `${shown.score}점`}</div>
        <p className="mt-2 text-xs text-slate-500">측정 가능한 항목만 다시 가중하여 계산한 연습용 참고 점수입니다. 발표 능력의 절대 평가가 아닙니다.</p>
        <p className="mt-2 text-sm dark:text-slate-200">발표 {formatTime(shown.durationSeconds * 1000)} · 목표 {formatTime(shown.targetSeconds * 1000)}</p>
      </div>
      <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 space-y-2">{(Object.keys(shown.scores) as (keyof typeof shown.scores)[]).map(key => <div key={key} className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-2 text-sm dark:text-white"><span>{scoreLabels[key]}</span><strong>{shown.scores[key] === null ? "분석 불가" : `${shown.scores[key]}점`}</strong></div>)}</div>
      {shown.measurements.recognizedText && <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 text-sm dark:text-white"><h4 className="font-black mb-2">인식된 발표 내용 · {shown.measurements.recognitionLanguage === "en-US" ? "English" : "한국어"}</h4><p className="whitespace-pre-wrap">{shown.measurements.recognizedText}</p><p className="mt-2 text-xs text-slate-500">음성 인식 결과에는 누락·오인식이 있을 수 있습니다. 이 기록은 이 기기에만 저장됩니다.</p></div>}
      <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 space-y-2 text-sm dark:text-white"><h4 className="font-black">얼굴 방향·자세 측정</h4><p>얼굴 인식 {shown.measurements.faceDetected}/{shown.measurements.faceSamples}표본 · 카메라 방향 추정 {shown.measurements.faceForward}/{shown.measurements.faceDetected}표본 · 방향 이탈 {shown.measurements.faceTurns}회</p><p>상체 인식 {shown.measurements.poseDetected}/{shown.measurements.poseSamples}표본 · 어깨 기울기 {shown.measurements.shoulderTiltSamples}표본 · 상체 기울기 {shown.measurements.torsoTiltSamples}표본</p><p className="text-xs text-slate-500">눈의 실제 시선이나 체형을 측정하지 않습니다. 카메라 각도, 앉은 자세, 조명의 영향을 받습니다.</p></div>
      <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 text-sm dark:text-white space-y-2"><h4 className="font-black">발화·침묵</h4><p>발화 신호 {formatTime(shown.measurements.speechMs)} · 침묵 {formatTime(shown.measurements.silenceMs)}</p><p>2초 이상 멈춤 {shown.measurements.longPauses}회 · 가장 긴 침묵 {formatTime(shown.measurements.longestPauseMs)}</p><div className="h-3 flex rounded-full overflow-hidden bg-slate-200"><span className="bg-brand" style={{ width: `${shown.measurements.speechMs / Math.max(1, shown.measurements.speechMs + shown.measurements.silenceMs) * 100}%` }} /></div><p className="text-xs text-slate-500">마이크 신호 기반 추정치로, 의도적인 쉼을 구별하지 않습니다.</p></div>
      {shown.measurements.audioDbfs.length > 0 && <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 dark:text-white"><h4 className="font-black text-sm mb-3">상대적인 음량 변화 (dBFS)</h4><div className="h-20 flex items-end gap-px overflow-hidden" aria-label="시간별 마이크 입력 상대 음량">{shown.measurements.audioDbfs.map((db, index) => <span key={index} className="bg-brand min-w-[2px] flex-1" style={{ height: `${Math.max(2, (db + 90) / 90 * 100)}%` }} />)}</div><p className="text-xs text-slate-500 mt-2">실제 음압(dB SPL)이 아니며 기기·거리의 영향을 받습니다.</p></div>}
      <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 space-y-3 text-sm dark:text-white"><h4 className="font-black">관찰 결과와 다음 연습</h4>{shown.strengths.map((message, i) => <p key={`good${i}`} className="text-emerald-700 dark:text-emerald-300">잘한 점: {message}</p>)}{shown.improvements.map((message, i) => <p key={`improve${i}`} className="text-amber-700 dark:text-amber-300">개선할 점: {message}</p>)}{!shown.strengths.length && !shown.improvements.length && <p>분석 가능한 표본이 부족해 평가 문장을 만들지 않았어요.</p>}<p className="border-t pt-3 font-semibold dark:border-slate-700">다음 연습: {shown.nextAction}</p></div>
      <button onClick={reset} className="w-full rounded-2xl bg-brand text-white py-3 font-bold">다시 연습하기</button>
    </div>}

    {history.length > 0 && phase === "ready" && <div className="rounded-[24px] bg-white dark:bg-slate-900 p-5 dark:text-white"><div className="flex justify-between items-center"><h3 className="font-black text-sm">이 기기에 저장된 연습 결과</h3><button onClick={() => { localStorage.removeItem(storageKey); setHistory([]); }} className="text-xs text-rose-600 flex items-center gap-1"><Trash2 size={13} /> 기록 삭제</button></div><div className="mt-3 space-y-2">{history.slice(0, 5).map(item => <button key={item.id} onClick={() => { setResult(item); phaseRef.current = "result"; setPhase("result"); }} className="w-full text-left rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-xs">{item.date} · {item.topic} · {item.score === null ? "분석 불가" : `${item.score}점`}</button>)}</div></div>}
  </div>;
}
