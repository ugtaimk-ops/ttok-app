import { AIService, GenerateContentOptions } from "./types";

export class AnthropicProvider implements AIService {
  async generateContent(options: GenerateContentOptions): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is missing.");
    }

    // Map tiers to standard Anthropic models
    let modelName = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
    if (options.tier === "complex" || options.imageBase64) {
      modelName = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";
    } else if (options.tier === "fast") {
      modelName = "claude-3-5-haiku-latest";
    }

    const messages: any[] = [];

    // User content & image handling
    if (options.imageBase64) {
      const mimeType = options.imageMimeType || "image/png";
      messages.push({
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: options.imageBase64,
            },
          },
          {
            type: "text",
            text: options.prompt + (options.responseMimeType === "application/json" ? "\n\nIMPORTANT: Your response MUST be a single raw JSON object matching the schema. Do NOT wrap in markdown code blocks like ```json." : ""),
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: options.prompt + (options.responseMimeType === "application/json" ? "\n\nIMPORTANT: Your response MUST be a single raw JSON object matching the schema. Do NOT wrap in markdown code blocks like ```json." : ""),
      });
    }

    const requestBody: any = {
      model: modelName,
      max_tokens: 4000,
      messages,
    };

    if (options.systemInstruction) {
      requestBody.system = options.systemInstruction;
    }

    if (options.temperature !== undefined) {
      requestBody.temperature = options.temperature;
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || "";
    } catch (error: any) {
      console.error("Anthropic request error:", error);
      throw error;
    }
  }
}
