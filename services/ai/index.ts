import { AIService, AIProviderType } from "./types";
import { GeminiProvider } from "./geminiProvider";
import { OpenAIProvider } from "./openaiProvider";
import { AnthropicProvider } from "./anthropicProvider";

export * from "./types";
export { GeminiProvider } from "./geminiProvider";
export { OpenAIProvider } from "./openaiProvider";
export { AnthropicProvider } from "./anthropicProvider";

/**
 * Robust JSON parser that handles potential markdown wrapping (e.g. ```json ... ```) 
 * returned by some models.
 */
export function parseJSONResponse(text: string): any {
  let cleaned = text.trim();
  
  // Remove starting ```json or ```
  if (cleaned.startsWith("```")) {
    // Matches ```json or ```anyLanguage followed by optional newline
    cleaned = cleaned.replace(/^```(?:json|[a-zA-Z]*)\s*/i, "");
    
    // Remove ending ```
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse JSON string:", cleaned);
    throw err;
  }
}

/**
 * Factory function to retrieve the configured AI Service.
 * Defaults to the provider specified in the AI_PROVIDER environment variable, 
 * falling back to Gemini if not set.
 */
export function getAIService(providerType?: AIProviderType): AIService {
  const selectedProvider = providerType || (process.env.AI_PROVIDER as AIProviderType) || "gemini";

  switch (selectedProvider) {
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "gemini":
    default:
      return new GeminiProvider();
  }
}
