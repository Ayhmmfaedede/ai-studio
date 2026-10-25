import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 3001);
app.use(express.json({ limit: "12mb" }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "dist");

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(client) });
});

app.post("/api/answer", async (req, res) => {
  if (!client) {
    return res.status(503).json({
      error: "لم يتم إعداد مفتاح API بعد. انسخ .env.example إلى .env وأضف OPENAI_API_KEY."
    });
  }

  const { question, imageDataUrl, preferences = {} } = req.body ?? {};
  if ((!question || !String(question).trim()) && !imageDataUrl) {
    return res.status(400).json({ error: "اكتب سؤالًا أو أرفق صورة أولًا." });
  }
  if (typeof question === "string" && question.length > 12000) {
    return res.status(413).json({ error: "النص طويل جدًا. اختصره وحاول مجددًا." });
  }
  if (imageDataUrl && (
    typeof imageDataUrl !== "string" ||
    !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageDataUrl)
  )) {
    return res.status(400).json({ error: "نوع الصورة غير مدعوم. جرّب PNG أو JPG أو WEBP أو GIF." });
  }

  const modes = {
    answer: "Give only the direct answer. Do not add a separate explanation unless the user explicitly asks.",
    simple: "Give the direct answer first, then a short, simple explanation in Arabic.",
    steps: "Give the direct answer first, then explain the solution step by step in Arabic.",
    examples: "Give the direct answer first, then explain it in Arabic with helpful examples.",
    teach: "Teach the user with a small hint or guiding question before revealing the answer. Use Arabic for guidance, unless the user explicitly asks for the full answer."
  };
  const languages = {
    same: "Write the answer in the same language as the user's question (or the main language in the image if no question is typed).",
    en: "Write the answer in English.",
    nl: "Write the answer in Dutch.",
    ar: "Write the answer in Arabic."
  };
  const detail = {
    short: "Keep the response very short and direct.",
    medium: "Use a moderate amount of detail, clear and not overly long.",
    detailed: "Give a detailed response with useful steps and context."
  };

  const answerMode = modes[preferences.answerMode] ? preferences.answerMode : "answer";
  const answerLanguage = languages[preferences.answerLanguage] ? preferences.answerLanguage : "same";
  const detailLevel = detail[preferences.detail] ? preferences.detail : "medium";
  const followupOnly = Boolean(preferences.followupOnly);

  const prompt = [
    "You are a helpful, accurate assistant for students and the general public.",
    languages[answerLanguage],
    detail[detailLevel],
    followupOnly
      ? "The user is asking for an additional explanation of the previous answer. Explain the idea in Arabic simply and clearly. Do not repeat the original answer unless needed."
      : modes[answerMode],
    "If information is missing or an image is unclear, say so honestly. Do not invent facts.",
    "Return the response as plain text. Do not include the labels ANSWER or ARABIC_EXPLANATION."
  ].join("\n");

  const userContent = [{
    type: "input_text",
    text: `${prompt}\n\nUser's message:\n${String(question || "").trim() || "Please answer the question shown in the image."}`
  }];
  if (imageDataUrl) userContent.push({ type: "input_image", image_url: imageDataUrl });

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: userContent }],
      max_output_tokens: 1800
    });
    res.json({ answer: (response.output_text || "").trim() });
  } catch (error) {
    console.error("OpenAI request failed:", error?.message || error);
    res.status(500).json({
      error: "تعذّر الحصول على إجابة الآن. تحقّق من مفتاح API واسم النموذج وإعدادات حسابك، ثم حاول مجددًا."
    });
  }
});

// Serve the built React website from the same service on Render.
app.use(express.static(distPath));
app.get("/", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.listen(port, () => {
  console.log(`AI Studio API running at http://localhost:${port}`);
});
