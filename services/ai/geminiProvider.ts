import { GoogleGenAI, Type } from "@google/genai";
import { AIService, GenerateContentOptions } from "./types";

export class GeminiProvider implements AIService {
  private aiInstance: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.aiInstance) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is missing.");
      }
      this.aiInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return this.aiInstance;
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

  async generateContent(options: GenerateContentOptions): Promise<string> {
    const ai = this.getClient();

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

    for (const modelName of modelsToTry) {
      try {
        console.info(`Attempting Gemini generation with model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents.length === 1 && !options.imageBase64 ? options.prompt : { parts: contents },
          config,
        });

        if (response && response.text) {
          console.info(`Successfully generated content with model: ${modelName}`);
          return response.text;
        }
      } catch (error: any) {
        console.warn(`Gemini generation with ${modelName} failed:`, error.message || error);
        lastError = error;

        // Immediately throw 429 RESOURCE_EXHAUSTED / Quota exceeded errors without retrying other models
        const errorMsg = String(error.message || error);
        const is429 = errorMsg.includes("429") || 
                      errorMsg.includes("RESOURCE_EXHAUSTED") || 
                      errorMsg.includes("Quota exceeded") || 
                      error.status === 429 || 
                      error.statusCode === 429;

        if (is429) {
          console.error(`[BACKEND] Detected 429 Quota Exceeded error with ${modelName}. Stopping automatic retries.`);
          const quotaError = new Error("RESOURCE_EXHAUSTED_429");
          (quotaError as any).status = 429;
          (quotaError as any).originalMessage = error.message || errorMsg;
          throw quotaError;
        }
      }
    }

    // Throw the final caught error if every fallback fails
    throw lastError || new Error("All Gemini models failed to generate content.");
  }
}
