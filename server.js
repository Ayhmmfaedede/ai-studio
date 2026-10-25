
import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT || 10000);
const rootDir = path.dirname(fileURLToPath(import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "12mb" }));

// Locate the built frontend.
const candidates = [
  path.resolve(rootDir, "dist"),
  path.resolve(process.cwd(), "dist"),
];

const distPath =
  candidates.find((dir) =>
    fs.existsSync(path.join(dir, "index.html"))
  ) || candidates[0];

const indexPath = path.join(distPath, "index.html");

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(client),
    websiteBuilt: fs.existsSync(indexPath),
  });
});

app.post("/api/answer", async (req, res) => {
  if (!client) {
    return res.status(503).json({
      error: "مفتاح API غير مُعدّ. أضف OPENAI_API_KEY في Render Environment.",
    });
  }

  const {
    question,
    imageDataUrl,
    preferences = {},
  } = req.body ?? {};

  if (
    (!question || !String(question).trim()) &&
    !imageDataUrl
  ) {
    return res.status(400).json({
      error: "اكتب سؤالًا أو أرفق صورة أولًا.",
    });
  }

  if (
    typeof question === "string" &&
    question.length > 12000
  ) {
    return res.status(413).json({
      error: "النص طويل جدًا. اختصره وحاول مجددًا.",
    });
  }

  if (
    imageDataUrl &&
    (
      typeof imageDataUrl !== "string" ||
      !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageDataUrl)
    )
  ) {
    return res.status(400).json({
      error: "نوع الصورة غير مدعوم. جرّب PNG أو JPG أو WEBP أو GIF.",
    });
  }

  const modes = {
    answer:
      "Give only the direct answer. Do not add a separate explanation unless requested.",
    simple:
      "Give the direct answer first, then a short, simple explanation in Arabic.",
    steps:
      "Give the direct answer first, then explain the solution step by step in Arabic.",
    examples:
      "Give the direct answer first, then explain it in Arabic with helpful examples.",
    teach:
      "Guide the user with a small hint before revealing the answer. Use Arabic for guidance unless the user requests the full answer.",
  };

  const languages = {
    same:
      "Answer in the same language as the user's question, or the main language in the image if no question is typed.",
    en: "Answer in English.",
    nl: "Answer in Dutch.",
    ar: "Answer in Arabic.",
  };

  const details = {
    short: "Keep the response very short and direct.",
    medium: "Use moderate detail and clear explanations.",
    detailed: "Give a detailed response with useful steps and context.",
  };

  const answerMode = modes[preferences.answerMode]
    ? preferences.answerMode
    : "answer";

  const answerLanguage = languages[preferences.answerLanguage]
    ? preferences.answerLanguage
    : "same";

  const detailLevel = details[preferences.detail]
    ? preferences.detail
    : "medium";

  const prompt = [
    "You are a helpful, accurate assistant for students and the general public.",
    languages[answerLanguage],
    details[detailLevel],
    preferences.followupOnly
      ? "Explain the previous answer simply in Arabic. Do not repeat it unless needed."
      : modes[answerMode],
    "If information is missing or an image is unclear, say so honestly. Do not invent facts.",
    "Return plain text without labels such as ANSWER or ARABIC_EXPLANATION.",
  ].join("\n");

  const content = [
    {
      type: "input_text",
      text:
        `${prompt}\n\nUser's message:\n` +
        (String(question || "").trim() ||
          "Please answer the question shown in the image."),
    },
  ];

  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
    });
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content }],
      max_output_tokens: 1800,
    });

    const answer = (response.output_text || "").trim();

    if (!answer) {
      return res.status(502).json({
        error: "لم يصل رد من النموذج. جرّب مرة أخرى.",
      });
    }

    return res.json({ answer });
  } catch (error) {
    console.error("OpenAI request failed:", {
      status: error?.status,
      code: error?.code,
      message: error?.message,
    });

    return res.status(500).json({
      error: "تعذّرت الإجابة. راجع سجلات Render لمعرفة سبب الخطأ.",
    });
  }
});

// Serve frontend assets.
app.use(express.static(distPath));

app.get("/", (_req, res, next) => {
  if (!fs.existsSync(indexPath)) {
    console.error("Frontend build missing:", {
      rootDir,
      workingDirectory: process.cwd(),
      distPath,
      checkedDirectories: candidates,
    });

    return res.status(503).send(
      "Website build files are missing. Check the Render build configuration."
    );
  }

  res.sendFile(indexPath, (err) => {
    if (err) next(err);
  });
});

// Support frontend routes without swallowing API routes.
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  if (!fs.existsSync(indexPath)) {
    return res.status(503).send("Website build files are missing.");
  }

  res.sendFile(indexPath, (err) => {
    if (err) next(err);
  });
});

app.use((err, _req, res, _next) => {
  console.error("Server error:", err?.message || err);

  if (res.headersSent) return;

  res.status(500).json({
    error: "حدث خطأ في الخادم. حاول مرة أخرى.",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`AI Studio listening on port ${port}`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Frontend directory: ${distPath}`);
  console.log(`Frontend index exists: ${fs.existsSync(indexPath)}`);
});
