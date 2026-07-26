export interface UserProfile {
  name: string;
  school: string;
  schoolCode?: string;
  officeCode?: string;
  officeName?: string;
  schoolKind?: string;
  grade: string;
  classNum: string;
  goal: string;
  avatarUrl: string;
  allergies?: number[];
  uid?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
}

export type TodoCategory = "homework" | "general" | "exam" | "assessment";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  dueDate: string;
  category: TodoCategory;
  subject?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  subject: string;
  supplies?: string;
  dueDate?: string;
  criteria?: string;
  submissionMethod?: string;
  presentationTime?: string;
  type: "assessment" | "exam" | "study" | "homework";
}

export interface ScriptItem {
  id: string;
  title: string;
  topic: string;
  script: string;
  outline: string[];
  tips: string[];
  date: string;
  time: string;
  grade: string;
  subject: string;
  audience: string;
  tone: string;
  purpose: string;
  style: string;
}

export interface PracticeLog {
  id: string;
  topic: string;
  date: string;
  totalScore: number;
  duration: number;
  scores: {
    eye_contact: number;
    voice: number;
    pronunciation: number;
    posture: number;
    gestures: number;
    expression: number;
  };
  voiceAnalysis: {
    speed: string;
    pronunciation: string;
    intonation: string;
    volume: string;
    pauses: string;
    anxiety: string;
    fillerWordsCount: number;
    connectivity: string;
  };
  videoAnalysis: {
    eyeContact: string;
    posture: string;
    expression: string;
    gestures: string;
    movement: string;
    bodySway: string;
  };
  feedback: string[];
}

export interface StudyItem {
  id: string;
  title: string;
  actionType: "summary" | "quiz" | "note" | "question";
  content: string;
  extraData: string[];
  date: string;
  sourceText?: string;
}
