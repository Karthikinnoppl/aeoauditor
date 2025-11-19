import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check
app.get("/", (_req, res) => {
  res.send("AEO FAQ API is running");
});

app.post("/api/generate-faqs", async (req, res) => {
  try {
    const { url, title, h1, description, headings, bodyPreview } = req.body || {};

    const pageTitle = h1 || title || "(no title)";
    const headingList = Array.isArray(headings) ? headings.slice(0, 20) : [];

    const prompt = `
You are an AEO (Answer Engine Optimization) specialist for eCommerce.

Given this page, generate 5–8 highly relevant FAQs that a human would actually ask.
Focus on:
- Product-level questions (features, use, compatibility, materials, sizing, care, safety, etc.)
- Brand-level questions (warranty, returns, shipping, support, trust)
- Category-level or use-case questions (who is it for, how to choose, when to use, etc.)

Avoid:
- Pure UI labels like "Support", "Recently viewed", "You may also like", "Customer Reviews"
- Questions about generic site navigation or account login.

Return JSON ONLY in this shape:

{
  "faqs": [
    { "question": "...", "answer": "..." }
  ]
}

Be concise, factual, and avoid marketing fluff. Each answer should be 2–3 sentences.

Page URL: ${url || "N/A"}
Page title: ${pageTitle}
Meta description: ${description || "N/A"}

Headings on the page:
${headingList.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Body preview (trimmed):
${bodyPreview || "(no body text provided)"}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini", // or gpt-4.1, gpt-4.1-mini, gpt-4o-mini, etc.
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You generate high-quality FAQs for eCommerce pages in strict JSON.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse JSON from OpenAI:", e, "\ncontent:", content);
      parsed = { faqs: [] };
    }

    const faqs = Array.isArray(parsed.faqs) ? parsed.faqs : [];

    res.json({
      faqs: faqs.map((f) => ({
        question: String(f.question || "").trim(),
        answer: String(f.answer || "").trim(),
      })),
    });
  } catch (err) {
    console.error("FAQ API error:", err?.response?.data || err);
    res.status(500).json({
      error: "Failed to generate FAQs",
      details: err?.message || String(err),
    });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`AEO FAQ server listening on http://localhost:${port}`);
});
