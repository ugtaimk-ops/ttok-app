import { AIService, GenerateContentOptions } from "./types";

export class OpenAIProvider implements AIService {
  async generateContent(options: GenerateContentOptions): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is missing.");
    }

    // Map tiers to standard OpenAI models
    let modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";
    if (options.tier === "complex" || options.imageBase64) {
      modelName = process.env.OPENAI_MODEL || "gpt-4o";
    } else if (options.tier === "fast") {
      modelName = "gpt-4o-mini";
    }

    const messages: any[] = [];

    // System instruction
    if (options.systemInstruction) {
      messages.push({
        role: "system",
        content: options.systemInstruction,
      });
    }

    // User prompt & image handling
    if (options.imageBase64) {
      const mimeType = options.imageMimeType || "image/png";
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: options.prompt + (options.responseMimeType === "application/json" ? "\n\nIMPORTANT: Your output MUST be a valid JSON object matching the requested schema." : ""),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${options.imageBase64}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: options.prompt + (options.responseMimeType === "application/json" ? "\n\nIMPORTANT: Your output MUST be a valid JSON object matching the requested schema." : ""),
      });
    }

    const requestBody: any = {
      model: modelName,
      messages,
    };

    if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    // Configure JSON structured outputs or response format
    if (options.responseMimeType === "application/json") {
      if (options.responseSchema) {
        requestBody.response_format = {
          type: "json_schema",
          json_schema: {
            name: "ai_response",
            strict: false,
            schema: options.responseSchema,
          },
        };
      } else {
        requestBody.response_format = { type: "json_object" };
      }
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (error: any) {
      console.error("OpenAI request error:", error);
      throw error;
    }
  }
}
