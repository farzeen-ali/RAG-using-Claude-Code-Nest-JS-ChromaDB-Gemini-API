# Enterprise Knowledge Base — RAG Chatbot

A production-shaped Retrieval-Augmented Generation (RAG) application built with **NestJS**, **Gemini 2.5 Flash**, and **ChromaDB**. Upload PDF documents, index them into a vector store, and ask grounded questions answered strictly from your own knowledge base — no hallucinated answers.

This is the foundation for an AI Engineering course. It is intentionally structured so later lessons (Ragas evaluation, Redis conversation memory, hybrid search, streaming, auth, rate limiting, observability) can be bolted on without rewriting existing code.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Backend framework | NestJS + TypeScript |
| LLM + Embeddings | Gemini 2.5 Flash / `gemini-embedding-001` via `@google/genai` |
| Vector database | ChromaDB |
| File upload | Multer (via `@nestjs/platform-express`) |
| PDF parsing | `pdf-parse` |
| Validation | `class-validator` / `class-transformer` |
| Frontend | Plain HTML + Tailwind CSS (CDN) + vanilla JS — no framework, no build step |

No Docker, Redis, BullMQ, React, or Next.js is used anywhere in this project, by design.

---

## 2. Architecture

```
                         ┌─────────────────────────────┐
                         │      public/index.html      │
                         │  (Tailwind + vanilla JS UI)  │
                         └───────────────┬─────────────┘
                                         │ fetch()
                    ┌────────────────────┴────────────────────┐
                    │                                          │
            POST /knowledge/upload                        POST /chat
                    │                                          │
        ┌───────────▼────────────┐                 ┌───────────▼────────────┐
        │  KnowledgeController   │                 │     ChatController     │
        │  (Multer + file DTO    │                 │   (ChatRequestDto      │
        │   validation, 10MB,    │                 │    validation)         │
        │   PDF only)            │                 │                        │
        └───────────┬────────────┘                 └───────────┬────────────┘
                    │                                          │
                    └───────────────────┬──────────────────────┘
                                        │
                                ┌───────▼────────┐
                                │   RagService    │  ← single orchestrator
                                └───────┬────────┘
             ┌──────────────┬──────────┼──────────────┬─────────────────┐
             │              │          │              │                 │
      ┌──────▼─────┐ ┌──────▼─────┐ ┌──▼──────────┐ ┌─▼─────────────┐ ┌─▼───────────────┐
      │ PdfService │ │ Chunking   │ │ Embedding    │ │ PromptBuilder │ │ GeminiService    │
      │ (pdf-parse)│ │ Service    │ │ Service      │ │ Service       │ │ (generateContent)│
      └──────┬─────┘ │ (recursive │ │ (embedContent│ └───────────────┘ └────────┬─────────┘
             │        │  splitter)│ │  RETRIEVAL_*)│                            │
             │        └──────┬────┘ └──────┬───────┘                           │
             │               │             │                                    │
     text-cleaner &   chunks[]      embeddings[][]                     Gemini 2.5 Flash API
     markdown-converter                    │
     (common/utils)                        │
                                    ┌───────▼────────┐
                                    │  IVectorStore   │  ← interface (DI token VECTOR_STORE)
                                    │  (swap point    │
                                    │  for Pinecone)  │
                                    └───────┬────────┘
                                            │
                                ┌───────────▼────────────┐
                                │ ChromaVectorStoreService│
                                └───────────┬────────────┘
                                            │
                                  ┌─────────▼─────────┐
                                  │   Chroma Server    │
                                  │ (chroma run --path)│
                                  └────────────────────┘
```

**Ingestion flow** (`POST /knowledge/upload`): PDF → extract text → clean text → convert to markdown (heading detection) → recursive chunk (800 chars / 150 overlap) → embed each chunk (`RETRIEVAL_DOCUMENT`) → upsert into Chroma with metadata.

**Query flow** (`POST /chat`): question → embed (`RETRIEVAL_QUERY`) → similarity search top 5 chunks → build grounded prompt → Gemini 2.5 Flash → `{ answer, sources }`.

---

## 3. Project structure

```
src/
├── main.ts                        Bootstraps Nest, global ValidationPipe, static frontend, CORS
├── app.module.ts                  Root module: ConfigModule + global exception filter + feature modules
├── app.controller.ts / app.service.ts   GET /health — liveness probe
│
├── config/
│   ├── configuration.ts           Typed AppConfig factory, reads process.env with defaults
│   └── env.validation.ts          class-validator schema; fails fast on boot if env is invalid
│
├── common/
│   ├── constants/upload.constants.ts     Fixed 10MB upload limit (see note below)
│   ├── filters/all-exceptions.filter.ts  Global catch-all → consistent JSON errors, never crashes
│   └── utils/
│       ├── text-cleaner.util.ts          Normalizes pdf-parse output (hyphenation, whitespace)
│       └── markdown-converter.util.ts    Heuristic heading detection → markdown
│
├── rag/                            Everything the two feature modules share
│   ├── rag.module.ts               Wires all RAG providers; the ONE place to swap Chroma → Pinecone
│   ├── rag.service.ts              Orchestrator: ingestDocument() / answerQuestion()
│   ├── pdf/pdf.service.ts          Wraps pdf-parse, throws BadRequestException on bad PDFs
│   ├── chunking/chunking.service.ts     Recursive character splitter (800/150, heading-aware)
│   ├── embedding/embedding.service.ts   Gemini embeddings, batched, RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY
│   ├── llm/
│   │   ├── gemini-client.provider.ts    Shared GoogleGenAI client (DI token GEMINI_CLIENT)
│   │   └── gemini.service.ts            generateContent() wrapper for answers
│   ├── prompt/prompt-builder.service.ts Grounded system prompt + context assembly
│   └── vector-store/
│       ├── vector-store.interface.ts    IVectorStore abstraction + DI token VECTOR_STORE
│       ├── chroma-vector-store.service.ts  Chroma implementation
│       └── noop-embedding-function.ts   Satisfies Chroma's API without a second embedding provider
│
├── knowledge/                      POST /knowledge/upload
│   ├── knowledge.module.ts
│   ├── knowledge.controller.ts     Multer + ParseFilePipeBuilder (PDF-only, 10MB)
│   └── dto/upload-response.dto.ts
│
└── chat/                           POST /chat
    ├── chat.module.ts
    ├── chat.controller.ts
    └── dto/chat-request.dto.ts, chat-response.dto.ts

public/
└── index.html                      Tailwind (CDN) + vanilla JS — upload panel + chat panel
```

**Note on the 10 MB limit**: it's a plain constant (`common/constants/upload.constants.ts`), not an env var. Nest evaluates `FileInterceptor`'s options when the class is defined (at import time), before `ConfigModule` has parsed `.env` — so a "configurable" env var there would silently not apply. This keeps the one hard requirement from the spec actually enforced everywhere it's checked.

---

## 4. Future extensibility (already designed for)

- **Vector store swap (Pinecone, hybrid search, metadata filtering)** — implement `IVectorStore` and change one line in `rag.module.ts` (`{ provide: VECTOR_STORE, useClass: ... }`). Nothing else changes.
- **Ragas evaluation** — `RagService.answerQuestion()` already returns `{ answer, sources }`; an eval script can call the same endpoint or service directly.
- **Redis conversation memory** — `ChatController` / `RagService.answerQuestion(question)` take a single question today; adding an optional `conversationId` parameter is additive, not a rewrite.
- **Streaming responses** — isolated to `GeminiService.generateAnswer()`; swap in `generateContentStream` and expose SSE from `ChatController` without touching retrieval code.
- **Auth, rate limiting, caching, observability** — these are typically Nest guards/interceptors/middleware layered around existing controllers, not internal RAG logic changes.

---

## 5. Setup

### 5.1 Install dependencies

```bash
npm install
```

### 5.2 Configure environment

Copy the example file and fill in your Gemini API key:

```bash
cp .env.example .env
```

`.env.example`:

```bash
# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
PORT=3000
NODE_ENV=development

# ---------------------------------------------------------------------------
# Gemini (Google GenAI)
# Get a key from https://aistudio.google.com/apikey
# ---------------------------------------------------------------------------
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSIONS=768

# ---------------------------------------------------------------------------
# ChromaDB
# ---------------------------------------------------------------------------
CHROMA_HOST=localhost
CHROMA_PORT=8000
CHROMA_SSL=false
CHROMA_COLLECTION_NAME=knowledge_base

# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
CHUNK_SIZE=800
CHUNK_OVERLAP=150

# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
RETRIEVAL_TOP_K=5
```

Get a Gemini API key at **https://aistudio.google.com/apikey**. The app fails fast on boot with a clear error if `GEMINI_API_KEY` is missing.

### 5.3 Install & start ChromaDB

Chroma ships both a Python package and an npm package that can run the same local server.

**Recommended on Windows x64 — Python:**
```bash
pip install chromadb
chroma run --path ./chroma-data
```

**Alternative — npm** (macOS / Linux / Windows ARM64 only — the npm CLI's native binary does not currently support Windows x64, it will throw `Unsupported Windows architecture: x64`):
```bash
npx chroma run --path ./chroma-data
```

Either way, this starts a local Chroma server at `http://localhost:8000` and persists data under `./chroma-data`. Leave this running in its own terminal.

### 5.4 Run the NestJS app

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

You should see:
```
Enterprise RAG API running on http://localhost:3000
```

### 5.5 Open the app

Open your browser at:

**http://localhost:3000**

The frontend is served directly by Nest (no separate frontend server). `GET /health` is available for a liveness check.

---

## 6. Testing the app

### 6.1 Test PDF upload

**Via the browser**: drag a PDF onto the left panel (or click to browse), then click **Upload & Index Document**. You'll see it move through Uploading → Parsing PDF → Cleaning → Chunking → Generating Embeddings → Saving to ChromaDB → Knowledge Base Ready.

**Via curl**:
```bash
curl -X POST http://localhost:3000/knowledge/upload \
  -F "file=@/path/to/your-document.pdf"
```

Expected response:
```json
{
  "success": true,
  "filename": "your-document.pdf",
  "pageCount": 12,
  "chunksIndexed": 47,
  "message": "Knowledge Base Ready"
}
```

Try an unsupported file or an oversized file to see graceful `400` errors instead of a crash.

### 6.2 Test chat

**Via the browser**: type a question in the right panel and press Enter (Shift+Enter for a newline).

**Via curl**:
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"What is Artificial Intelligence?"}'
```

Expected response:
```json
{
  "answer": "…grounded answer from your uploaded documents…",
  "sources": ["your-document.pdf"]
}
```

If the answer isn't in your knowledge base, or nothing has been uploaded yet, you'll get:
```json
{
  "answer": "I couldn't find this information in the uploaded knowledge base.",
  "sources": []
}
```

---

## 7. Notes on the frontend progress stages

The staged messages ("Uploading…", "Parsing PDF…", "Searching Knowledge Base…", etc.) are driven client-side while a single HTTP request is in flight — the current API returns one response per request, not incremental progress events. Real step-by-step server progress would need Server-Sent Events or WebSockets, which is intentionally left for a future "Streaming Responses" lesson.
