import express from "express";
import { ChatEngine } from "./engine/chat";
import { KnowledgeBase } from "./knowledge/base";
import { LanguageDetector } from "./language/detector";

const app = express();
app.use(express.json());

const knowledgeBase = new KnowledgeBase();
const languageDetector = new LanguageDetector();
const chatEngine = new ChatEngine(knowledgeBase, languageDetector);

app.post("/api/v1/chat", async (req, res) => {
  const { message, session_id, language } = req.body;
  const response = await chatEngine.respond(session_id || "default", message, language);
  res.json(response);
});

app.get("/api/v1/chat/languages", (_req, res) => {
  res.json({ languages: languageDetector.getSupportedLanguages() });
});

app.get("/api/v1/chat/faq", (_req, res) => {
  res.json({ faq: knowledgeBase.getFAQ() });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "ai-chatbot" });
});

const port = process.env.PORT || 8100;
app.listen(port, () => {
  console.log(`AI Chatbot listening on port ${port}`);
});
