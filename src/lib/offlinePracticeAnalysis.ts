/** Measurements from the live camera and microphone. No media is retained. */
export interface PracticeMeasurements {
  elapsedMs: number;
  targetMs: number;
  audioSamples: number;
  speechSamples: number;
  speechMs: number;
  silenceMs: number;
  longPauses: number;
  longestPauseMs: number;
  audioDbfs: number[];
  lowVolumeSamples: number;
  abruptVolumeChanges: number;
  faceSamples: number;
  faceDetected: number;
  faceForward: number;
  faceTurns: number;
  poseSamples: number;
  poseDetected: number;
  shoulderTiltSamples: number;
  torsoTiltSamples: number;
  movementSamples: number;
}

export type ScoreName = "delivery" | "face" | "posture" | "pace" | "time";
export interface OfflinePracticeResult {
  id: string;
  date: string;
  topic: string;
  durationSeconds: number;
  targetSeconds: number;
  score: number | null;
  scores: Record<ScoreName, number | null>;
  measurements: PracticeMeasurements;
  strengths: string[];
  improvements: string[];
  nextAction: string;
}

export function emptyMeasurements(targetMs: number): PracticeMeasurements {
  return {
    elapsedMs: 0, targetMs, audioSamples: 0, speechSamples: 0, speechMs: 0, silenceMs: 0,
    longPauses: 0, longestPauseMs: 0, audioDbfs: [], lowVolumeSamples: 0,
    abruptVolumeChanges: 0, faceSamples: 0, faceDetected: 0,
    faceForward: 0, faceTurns: 0, poseSamples: 0, poseDetected: 0,
    shoulderTiltSamples: 0, torsoTiltSamples: 0, movementSamples: 0,
  };
}

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : 0;

/** Transparent rehearsal heuristics, not an objective measure of speaking ability. */
export function summarizePractice(topic: string, measurements: PracticeMeasurements): OfflinePracticeResult {
  const m = measurements;
  const speechRatio = pct(m.speechMs, m.speechMs + m.silenceMs);
  const faceRatio = pct(m.faceForward, m.faceDetected);
  const visibility = pct(m.faceDetected, m.faceSamples);
  const poseVisibility = pct(m.poseDetected, m.poseSamples);
  const lowVolumeRatio = pct(m.lowVolumeSamples, m.speechSamples);
  const scores: Record<ScoreName, number | null> = {
    delivery: m.audioSamples >= 15 && m.speechMs >= 1000
      ? clamp(100 - lowVolumeRatio * 0.55 - Math.min(30, m.abruptVolumeChanges * 3) - Math.min(25, m.longPauses * 3)) : null,
    face: m.faceSamples >= 8 && m.faceDetected >= 5
      ? clamp(faceRatio * 0.75 + visibility * 0.25 - Math.min(20, m.faceTurns * 2)) : null,
    posture: m.poseSamples >= 8 && m.poseDetected >= 5
      ? clamp(100 - pct(m.shoulderTiltSamples, m.poseDetected) * 0.3
        - pct(m.torsoTiltSamples, m.poseDetected) * 0.3
        - pct(m.movementSamples, m.poseDetected) * 0.2
        - (100 - poseVisibility) * 0.2) : null,
    pace: null, // No verified, fully offline Korean STT is bundled.
    time: m.targetMs > 0 && m.elapsedMs >= 3000
      ? clamp(100 - Math.abs(m.elapsedMs - m.targetMs) / m.targetMs * 100) : null,
  };
  const weights: Record<ScoreName, number> = { delivery: 30, face: 20, posture: 20, pace: 20, time: 10 };
  const available = (Object.keys(scores) as ScoreName[]).filter(key => scores[key] !== null);
  const sumWeights = available.reduce((sum, key) => sum + weights[key], 0);
  const score = sumWeights > 0
    ? clamp(available.reduce((sum, key) => sum + (scores[key] || 0) * weights[key], 0) / sumWeights)
    : null;
  const strengths: string[] = [];
  const improvements: string[] = [];
  if (m.audioSamples >= 15) {
    if (m.speechMs < 1000) improvements.push("마이크에서 충분한 발화 신호를 감지하지 못했어요. 마이크 권한과 거리를 확인해 주세요.");
    if (speechRatio >= 55) strengths.push(`분석한 마이크 구간의 ${speechRatio}%에서 발화 신호가 감지됐어요.`);
    if (lowVolumeRatio >= 35) improvements.push(`마이크 입력의 ${lowVolumeRatio}%가 상대적으로 작았어요. 기기와 거리를 조정해 보세요.`);
    if (m.longPauses > 0) improvements.push(`2초 이상 멈춘 구간이 ${m.longPauses}번 있었어요. 다음 문장을 미리 생각하며 연습해 보세요.`);
    if (m.longPauses === 0 && m.speechMs >= 3000) strengths.push("2초 이상 긴 멈춤이 감지되지 않았어요.");
  }
  if (m.faceDetected >= 5) {
    if (faceRatio >= 70) strengths.push(`얼굴이 보인 구간의 ${faceRatio}%에서 카메라 방향을 향한 것으로 추정했어요.`);
    else improvements.push(`얼굴이 보인 구간 중 카메라 방향 응시 추정 비율이 ${faceRatio}%였어요. 카메라 높이를 맞춰 보세요.`);
  }
  if (m.poseDetected >= 5 && m.shoulderTiltSamples > m.poseDetected * 0.3) {
    improvements.push(`상체가 보인 ${m.poseDetected}개 표본 중 ${m.shoulderTiltSamples}개에서 어깨 기울기가 감지됐어요. 카메라 위치도 확인해 보세요.`);
  }
  if (m.targetMs > 0 && m.elapsedMs >= 3000) {
    const difference = Math.round((m.elapsedMs - m.targetMs) / 1000);
    if (Math.abs(difference) <= 10) strengths.push(`설정한 목표 시간과 ${Math.abs(difference)}초 차이로 마쳤어요.`);
    else improvements.push(`설정한 목표 시간보다 ${Math.abs(difference)}초 ${difference > 0 ? "길었어요" : "짧았어요"}.`);
  }
  const nextAction = improvements[0] || "같은 주제로 다시 발표하며 음량과 카메라 방향을 비교해 보세요.";
  return {
    id: `offline_practice_${Date.now()}`,
    date: new Date().toLocaleDateString("sv-SE"),
    topic: topic.trim() || "자유 발표",
    durationSeconds: Math.round(m.elapsedMs / 1000),
    targetSeconds: Math.round(m.targetMs / 1000),
    score, scores, measurements: m,
    strengths: strengths.slice(0, 3), improvements: improvements.slice(0, 3), nextAction,
  };
}
