export type AIProviderType = "gemini" | "openai" | "anthropic";

export interface GenerateContentOptions {
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: "text/plain" | "application/json";
  responseSchema?: {
    type: string; // e.g. "OBJECT", "ARRAY"
    properties?: Record<string, any>;
    required?: string[];
  };
  imageBase64?: string;
  imageMimeType?: string;
  videoBase64?: string;
  videoMimeType?: string;
  temperature?: number;
  tier?: "fast" | "general" | "complex";
  modelOverride?: string;
  costContext?: { uid: string; feature: "script" | "practice" | "assessment" | "study" | "problem" | "report" };
  maxOutputTokens?: number;
}

export interface AIService {
  generateContent(options: GenerateContentOptions): Promise<string>;
}
