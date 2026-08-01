import { GoogleGenAI, Type } from "@google/genai";
import { AIService, GenerateContentOptions } from "./types";

// Module-level (not per-instance) so the "which key is currently good" state
// survives across requests - server.ts calls getAIService() fresh on every
// route, which would otherwise create a brand-new GeminiProvider (and lose
// this state) on every single call.
let cachedApiKeys: string[] | null = null;
let currentKeyIndex = 0;
const clientCache = new Map<string, GoogleGenAI>();

function getApiKeys(): string[] {
  if (cachedApiKeys) return cachedApiKeys;

  // GEMINI_API_KEYS (plural) holds a comma-separated list of keys to rotate
  // through when one runs out of quota - e.g. several free-tier keys from
  // different Google accounts. Falls back to the single GEMINI_API_KEY for
  // backward compatibility.
  const multi = process.env.GEMINI_API_KEYS;
  if (multi && multi.trim()) {
    cachedApiKeys = multi.split(",").map((k) => k.trim()).filter(Boolean);
  } else if (process.env.GEMINI_API_KEY) {
    cachedApiKeys = [process.env.GEMINI_API_KEY];
  } else {
    cachedApiKeys = [];
  }
  return cachedApiKeys;
}

function isQuotaError(error: any): boolean {
  const errorMsg = String(error?.message || error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RESOURCE_EXHAUSTED") ||
    errorMsg.includes("Quota exceeded") ||
    error?.status === 429 ||
    error?.statusCode === 429
  );
}

export class GeminiProvider implements AIService {
  private getClient(apiKey: string): GoogleGenAI {
    let client = clientCache.get(apiKey);
    if (!client) {
      client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      clientCache.set(apiKey, client);
    }
    return client;
  }

  // Helper to convert simple schema declarations to GoogleGenAI SDK's structure
  private convertSchema(schema: any): any {
    if (!schema) return undefined;

    // GoogleGenAI SDK uses Type enum or lowercase string values
    const mapType = (t: string) => {
      switch (t.toUpperCase()) {
        case "OBJECT": return Type.OBJECT;
        case "ARRAY": return Type.ARRAY;
        case "STRING": return Type.STRING;
        case "INTEGER": return Type.INTEGER;
        case "NUMBER": return Type.NUMBER;
        case "BOOLEAN": return Type.BOOLEAN;
        default: return Type.STRING;
      }
    };

    const result: any = {
      type: mapType(schema.type),
      description: schema.description,
    };

    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = this.convertSchema(value);
      }
    }

    if (schema.items) {
      result.items = this.convertSchema(schema.items);
    }

    if (schema.required) {
      result.required = schema.required;
    }

    return result;
  }

  // Tries each candidate model in order, using the given API key. Throws a
  // tagged RESOURCE_EXHAUSTED_429 error immediately on quota errors (instead
  // of wasting time on remaining models under the same exhausted key), and
  // lets the caller decide whether to rotate to the next key.
  private async generateWithKey(
    apiKey: string,
    modelsToTry: string[],
    contents: any[],
    config: any,
    prompt: string,
    hasImage: boolean
  ): Promise<string> {
    const ai = this.getClient(apiKey);
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        console.info(`Attempting Gemini generation with model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents.length === 1 && !hasImage ? prompt : { parts: contents },
          config,
        });

        if (response && response.text) {
          console.info(`Successfully generated content with model: ${modelName}`);
          return response.text;
        }
      } catch (error: any) {
        console.warn(`Gemini generation with ${modelName} failed:`, error.message || error);
        lastError = error;

        if (isQuotaError(error)) {
          console.error(`[BACKEND] Detected 429 Quota Exceeded error with ${modelName}. Stopping model fallback for this key.`);
          const quotaError = new Error("RESOURCE_EXHAUSTED_429");
          (quotaError as any).status = 429;
          (quotaError as any).originalMessage = error.message || String(error);
          throw quotaError;
        }
      }
    }

    throw lastError || new Error("All Gemini models failed to generate content.");
  }

  async generateContent(options: GenerateContentOptions): Promise<string> {
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }

    // Configure ordered fallback lists of model candidates for maximum resilience
    let modelsToTry: string[] = [];

    if (options.tier === "complex" || options.imageBase64) {
      modelsToTry = [
        "gemini-2.5-flash",       // Primary free model requested by user
        "gemini-2.5-flash-lite",  // Secondary free model requested by user
        "gemini-3.6-flash",       // High performance fallback
        "gemini-3.5-flash",       // High performance standard fallback
      ];
    } else {
      modelsToTry = [
        "gemini-2.5-flash",       // Primary free model requested by user
        "gemini-2.5-flash-lite",  // Secondary free model requested by user
        "gemini-3.6-flash",       // High performance fallback
        "gemini-3.5-flash",       // High performance standard fallback
      ];
    }

    const contents: any[] = [];

    if (options.imageBase64) {
      contents.push({
        inlineData: {
          mimeType: options.imageMimeType || "image/png",
          data: options.imageBase64,
        },
      });
    }

    contents.push({
      text: options.prompt,
    });

    const config: any = {};

    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }

    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }

    if (options.responseMimeType) {
      config.responseMimeType = options.responseMimeType;
    }

    if (options.responseSchema) {
      config.responseSchema = this.convertSchema(options.responseSchema);
    }

    let lastError: any = null;

    // Start from whichever key last worked, and rotate forward through the
    // rest of the list on quota exhaustion. Only a genuine quota error moves
    // to the next key - any other error (bad prompt, network blip) fails
    // immediately instead of burning through every key pointlessly.
    for (let attempt = 0; attempt < apiKeys.length; attempt++) {
      const keyIndex = (currentKeyIndex + attempt) % apiKeys.length;
      const apiKey = apiKeys[keyIndex];

      try {
        const result = await this.generateWithKey(apiKey, modelsToTry, contents, config, options.prompt, !!options.imageBase64);
        currentKeyIndex = keyIndex;
        return result;
      } catch (error: any) {
        lastError = error;
        if (isQuotaError(error) && apiKeys.length > 1) {
          console.error(`[BACKEND] API key #${keyIndex + 1}/${apiKeys.length} exhausted, rotating to the next key.`);
          continue;
        }
        throw error;
      }
    }

    // Every key is exhausted
    throw lastError || new Error("All Gemini API keys failed to generate content.");
  }
}
