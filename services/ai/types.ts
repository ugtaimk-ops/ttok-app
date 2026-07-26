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
  temperature?: number;
  tier?: "fast" | "general" | "complex";
}

export interface AIService {
  generateContent(options: GenerateContentOptions): Promise<string>;
}
