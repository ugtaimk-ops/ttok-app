import type { Request, Response } from "express";
import { getAIService } from "./ai";
import { chatPrompt, CHAT_SYSTEM } from "./chatPrompt";

export async function handleStudyChat(req: Request, res: Response) {
  try {
    const reply = await getAIService("gemini").generateContent({
      prompt: chatPrompt(req.body.message.trim(), req.body.history, req.body.context, req.body.mode),
      systemInstruction: CHAT_SYSTEM,
      imageBase64: req.body.imageBase64,
      imageMimeType: req.body.mimeType,
      responseMimeType: "text/plain", tier: "fast", maxOutputTokens: 1024,
      costContext: { uid: (req as any).uid, feature: "study" },
    });
    if (!reply?.trim()) throw new Error("EMPTY_CHAT_REPLY");
    res.json({ reply });
  } catch (error: any) {
    console.error("[Chat] Generation failed", { status: error.status, code: error.code });
    const creditFailure = error.status === 403 || /CREDIT/.test(error.code || error.message || "");
    const timeout = error.status === 504 || error.code === 'AI_TIMEOUT';
    res.status(error.status === 409 ? 409 : creditFailure ? 403 : timeout ? 504 : 503).json({
      error: creditFailure ? "남은 크레딧을 확인해 주세요." : timeout ? "AI 서버 응답이 늦어졌어요. 잠시 후 다시 보내 주세요." : "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
      code: creditFailure ? "CREDITS_UNAVAILABLE" : timeout ? 'AI_TIMEOUT' : "CHAT_UNAVAILABLE",
    });
  }
}
