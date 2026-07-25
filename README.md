# Enterprise Knowledge Base — RAG Chatbot

A production-shaped Retrieval-Augmented Generation (RAG) application built with **NestJS**, **Gemini 2.5 Flash**, and **ChromaDB**. Upload PDF documents, index them into a vector store, and ask grounded questions answered strictly from your own knowledge base — no hallucinated answers.

Retrieval is **hybrid**: semantic vector search and BM25 keyword search run together and are merged, then a re-ranking layer picks the best 5 chunks before they ever reach Gemini.

This is the foundation for an AI Engineering course. It is intentionally structured so later lessons (Ragas evaluation, Redis conversation memory, a hosted reranker, streaming, auth, rate limiting, observability) can be bolted on without rewriting existing code.

---

## 1. Tech stack

| Layer | Choice |
|---|---|
| Backend framework | NestJS + TypeScript |
| LLM + Embeddings | Gemini 2.5 Flash / `gemini-embedding-001` via `@google/genai` |
| Vector database | ChromaDB |
| Keyword search | In-process BM25 (no extra service) |
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
                    ▼                                          ▼
          ┌──────────────────┐                    ┌─────────────────────────┐
          │     RagService     │                    │      RagService          │
          │  .ingestDocument()  │                    │  .answerQuestion() ──┐  │
          └─────────┬─────────┘                    └───────────────────────┼──┘
                    │                                                       │
       ┌────────────┼─────────────┐                                        ▼
       │            │             │                          ┌──────────────────────────┐
┌──────▼─────┐┌─────▼──────┐┌─────▼──────┐                   │ RetrievalPipelineService  │
│ PdfService ││ Chunking   ││ Embedding   │                   │  (sanitize → embed →      │
│(pdf-parse) ││ Service    ││ Service     │                   │   hybrid search → rerank  │
└──────┬─────┘│(recursive  ││(Gemini      │                   │   → prompt → generate)    │
       │      │ splitter)  ││ embedContent│                   └─────────┬─────────────────┘
 text-cleaner └─────┬──────┘│ + in-memory │                             │
 markdown-converter │       │ cache)      │      ┌──────────────────────┼───────────────────────┐
 (common/utils)  chunks[]  └─────┬───────┘      │                      │                       │
       │                         │ embeddings[][] ▼                      ▼                       ▼
       │                         │           ┌─────────────────┐  ┌───────────────┐   ┌────────────────────┐
       │                         │           │ HybridSearchService│  │  RerankService │   │ PromptBuilderService│
       │                         │           │ (vector + BM25,    │  │ (IRerankProvider│   │ (System + Context  │
       │                         │           │  merge + dedupe)   │  │  — swap point   │   │  + Question +      │
       │                         │           └────────┬───────────┘  │  for Cohere)    │   │  Instructions,     │
       │                         │                    │              └───────┬────────┘   │  injection-safe)   │
       │                         │        ┌───────────┴───────────┐          │            └──────────┬─────────┘
       │                         │        ▼                       ▼          │                       │
       │                         │ ┌──────────────┐      ┌────────────────┐  │                       ▼
       │                         │ │VectorSearch  │      │  BM25Service    │  │             ┌──────────────────┐
       │                         │ │Service       │      │ (in-memory      │◄─┘             │  GeminiService    │
       │                         │ │(top 10)      │      │  inverted index,│                │ (generateContent, │
       │                         │ └──────┬───────┘      │  top 10)        │                │  Gemini 2.5 Flash)│
       │                         │        │              └────────▲────────┘                └──────────────────┘
       ▼                         ▼        ▼                       │ addChunks() on upload /
┌─────────────────────────────────────┐   │                       │ getAllChunks() on boot
│            IVectorStore              │───┘───────────────────────┘
│ (DI token VECTOR_STORE — swap point  │
│  for Pinecone)                       │
└──────────────────┬────────────────────┘
                    ▼
        ┌───────────────────────────┐
        │ ChromaVectorStoreService   │
        └─────────────┬─────────────┘
                       ▼
             ┌───────────────────┐
             │   Chroma Server    │
             │ (chroma run --path)│
             └────────────────────┘
```

**Ingestion flow** (`POST /knowledge/upload`, unchanged): PDF → extract text → clean text → convert to markdown (heading detection) → recursive chunk (800 chars / 150 overlap) → embed each chunk (`RETRIEVAL_DOCUMENT`) → upsert into Chroma with metadata → **incrementally index the same chunks into BM25**.

**Query flow** (`POST /chat`, now hybrid): sanitize question → embed (`RETRIEVAL_QUERY`) → **vector search (top 10) + BM25 search (top 10) in parallel** → merge + deduplicate → **rerank** (semantic + keyword + metadata-quality score) → keep top 5 → build a 4-part grounded prompt → Gemini 2.5 Flash → `{ answer, sources, confidence }`.

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
│       ├── markdown-converter.util.ts    Heuristic heading detection → markdown
│       └── prompt-sanitizer.util.ts      NEW — strips hidden/control chars from questions; strips
│                                          forged delimiters from retrieved chunks (prompt-injection defense)
│
├── rag/                            Everything the two feature modules share
│   ├── rag.module.ts               Wires all RAG providers; two DI swap points (Chroma→Pinecone, RerankService→Cohere)
│   ├── rag.service.ts              Thin facade: ingestDocument() + BM25 indexing; answerQuestion() delegates to pipeline
│   ├── pdf/pdf.service.ts          Wraps pdf-parse, throws BadRequestException on bad PDFs
│   ├── chunking/chunking.service.ts     Recursive character splitter (800/150, heading-aware)
│   ├── embedding/embedding.service.ts   Gemini embeddings, batched + NEW in-memory cache (avoids re-embedding identical text)
│   ├── llm/
│   │   ├── gemini-client.provider.ts    Shared GoogleGenAI client (DI token GEMINI_CLIENT)
│   │   └── gemini.service.ts            generateContent() wrapper for answers
│   ├── prompt/prompt-builder.service.ts REWRITTEN — System Prompt / Retrieved Context / Question / Instructions,
│   │                                     with delimiter-based injection defense and a context size budget
│   ├── retrieval/                  NEW — the hybrid search + orchestration package
│   │   ├── retrieval.types.ts           ScoredChunk (vectorScore/bm25Score/rerankScore), ConfidenceLevel
│   │   ├── vector-search.service.ts     Adapts IVectorStore into a 0..1 similarity score for merging
│   │   ├── bm25.service.ts              In-memory Okapi BM25 keyword index (warms up from Chroma, updated on upload)
│   │   ├── hybrid-search.service.ts     Runs vector + BM25, merges & deduplicates by chunk id
│   │   └── retrieval-pipeline.service.ts  Orchestrates embed → hybrid search → rerank → prompt → generate, with
│   │                                       the staged console logging
│   ├── rerank/                     NEW — re-ranking, behind dependency inversion
│   │   ├── rerank-provider.interface.ts  IRerankProvider + RERANK_PROVIDER DI token
│   │   ├── rerank.service.ts             Default heuristic reranker (semantic + keyword + metadata quality)
│   │   └── cohere-rerank.provider.ts     Documented placeholder for a future Cohere Rerank integration
│   └── vector-store/
│       ├── vector-store.interface.ts    IVectorStore abstraction + DI token VECTOR_STORE; NEW getAllChunks()
│       ├── chroma-vector-store.service.ts  Chroma implementation
│       └── noop-embedding-function.ts   Satisfies Chroma's API without a second embedding provider
│
├── knowledge/                      POST /knowledge/upload (unchanged contract)
│   ├── knowledge.module.ts
│   ├── knowledge.controller.ts     Multer + ParseFilePipeBuilder (PDF-only, 10MB)
│   └── dto/upload-response.dto.ts
│
└── chat/                           POST /chat
    ├── chat.module.ts
    ├── chat.controller.ts
    └── dto/chat-request.dto.ts, chat-response.dto.ts   response now also carries `confidence`

public/
└── index.html                      Tailwind (CDN) + vanilla JS — upload panel + chat panel + confidence badge
```

**Note on the 10 MB limit**: it's a plain constant (`common/constants/upload.constants.ts`), not an env var. Nest evaluates `FileInterceptor`'s options when the class is defined (at import time), before `ConfigModule` has parsed `.env` — so a "configurable" env var there would silently not apply. This keeps the one hard requirement from the spec actually enforced everywhere it's checked.

---

## 4. What changed in this pass (Hybrid Search upgrade)

Nothing about the existing HTTP contracts broke:
- `POST /knowledge/upload` — same request, same response shape, unchanged behavior. It now *also* feeds the same chunks into the BM25 index, invisibly.
- `POST /chat` — same request. The response gained one **additive** field, `confidence: "high" | "medium" | "low"` — existing consumers reading `answer`/`sources` are unaffected.

### Feature-by-feature

**1. Hybrid Search** — `HybridSearchService` runs `VectorSearchService` (semantic, top 10) and `BM25Service` (keyword, top 10), then merges results by chunk id, combining scores for chunks found by both and deduplicating. BM25 needed corpus-wide term statistics a vector DB doesn't expose, so it's a small in-memory Okapi BM25 index (`k1=1.5`, `b=0.75`) that warms itself up from Chroma on boot (`IVectorStore.getAllChunks()`) and updates incrementally on every upload — a restart doesn't lose keyword search, and new uploads are searchable immediately.

**2. Re-ranking** — `RerankService` scores every merged candidate on three factors (semantic similarity, keyword match, a light metadata-quality heuristic based on chunk completeness) and returns only the top 5. It's a zero-dependency heuristic today — no added latency or API cost.

**3. Future Cohere integration** — `IRerankProvider` is the dependency-inversion boundary; `RetrievalPipelineService` only depends on the `RERANK_PROVIDER` token, never on `RerankService` directly. `CohereRerankProvider` implements the same interface as a documented, inert stub (throws `NotImplementedException`, requires no API key, isn't registered as the active provider). Activating it later is a `npm install cohere-ai` + one line changed in `rag.module.ts` — see the comment block at the top of that file for the exact steps.

**4. Prompt Builder** — now explicitly assembles System Prompt (grounding rules) + `<retrieved-context>` block + Question + Instructions. The refusal sentence and "never invent facts" rule are unchanged from before; what's new is the injection-hardening (see Security below) and a hard `MAX_CONTEXT_CHARS` budget so prompt size can't blow up regardless of chunk count.

**5. Retrieval logging** — `RetrievalPipelineService` and `HybridSearchService` log each stage (`Question received`, `Generating embedding...`, `Running vector search...`, `Running BM25 search...`, `Merging results...`, `Removing duplicates...`, `Re-ranking...`, `Selecting top N...`, `Sending context to Gemini...`, `Generating final response...`, `Completed.`) via Nest's built-in `Logger`, visible in the server console.

**6. Frontend** — the chat "typing" indicator now cycles through `Searching… → Vector Search… → BM25 Search… → Re-ranking… → Generating Answer…`, and each assistant message shows a colored confidence badge (green/amber/red for high/medium/low) next to the existing "Retrieved Sources" chips.

**7. Performance** — `EmbeddingService` now keeps an in-memory `Map` cache keyed by `taskType:text`, so re-embedding the exact same question or re-uploading the same document skips the Gemini call entirely (bounded at 500 entries, oldest evicted first). BM25 search itself is in-process and effectively free next to the one real network hop (the Gemini calls).

**8. Security** — layered on top of the existing DTO validation (`@IsNotEmpty`, `@MaxLength(2000)`) and the global exception filter (which already hid internal errors):
   - `sanitizeQuestion()` strips control/zero-width/bidi-override characters before the question is ever embedded or put in a prompt (defense-in-depth against obfuscated injection attempts).
   - `sanitizeContextChunk()` strips any literal `<retrieved-context>`/`</retrieved-context>` sequence found *inside* a document chunk, so a malicious PDF can't forge a fake closing tag and smuggle its own instructions after it. The system prompt also explicitly tells the model the context block is untrusted data, never instructions.
   - `PromptBuilderService` caps total assembled context at `MAX_CONTEXT_CHARS` (~12,000 chars), so a pathological upload can't balloon prompt size or cost.
   - No new error paths expose stack traces — everything still funnels through `AllExceptionsFilter`.

**9. Architecture** — every new responsibility got its own single-purpose service (`HybridSearchService`, `BM25Service`, `VectorSearchService`, `RerankService`, `RetrievalPipelineService`), all injected via constructor DI and registered in `rag.module.ts`. `RagService` is now a thin facade — ingestion logic stayed, but question-answering is fully delegated to `RetrievalPipelineService`.

---

## 5. Future extensibility (already designed for)

- **Vector store swap (Pinecone, metadata filtering)** — implement `IVectorStore` and change one line in `rag.module.ts` (`{ provide: VECTOR_STORE, useClass: ... }`).
- **Hosted reranker (Cohere)** — implement `IRerankProvider` (or finish `CohereRerankProvider`) and change one line (`{ provide: RERANK_PROVIDER, useClass: ... }`). See the integration guide in `rerank/cohere-rerank.provider.ts`.
- **Ragas evaluation** — `RagService.answerQuestion()` already returns `{ answer, sources, confidence }`; an eval script can call the same endpoint or service directly, and `confidence` gives it a cheap baseline signal to correlate against.
- **Redis conversation memory** — `RetrievalPipelineService.run(question)` takes a single question today; adding an optional `conversationId`/history parameter is additive, not a rewrite.
- **Streaming responses** — isolated to `GeminiService.generateAnswer()`; swap in `generateContentStream` and expose SSE from `ChatController` without touching retrieval code.
- **Auth, rate limiting, caching, observability** — these are typically Nest guards/interceptors/middleware layered around existing controllers, not internal RAG logic changes.

---

## 6. Setup

### 6.1 Install dependencies

No new npm packages were needed for this upgrade (BM25 and reranking are hand-rolled, and the Cohere stub doesn't import an SDK yet):

```bash
npm install
```

### 6.2 Configure environment

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
# Retrieval (hybrid search: semantic vector search + BM25 keyword search)
# CANDIDATE_K = how many results each of vector/BM25 search fetch before
#               merging; TOP_K = how many reranked chunks go to Gemini.
# ---------------------------------------------------------------------------
RETRIEVAL_CANDIDATE_K=10
RETRIEVAL_TOP_K=5
```

Get a Gemini API key at **https://aistudio.google.com/apikey**. The app fails fast on boot with a clear error if `GEMINI_API_KEY` is missing.

### 6.3 Install & start ChromaDB

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

Either way, this starts a local Chroma server at `http://localhost:8000` and persists data under `./chroma-data`. Leave this running in its own terminal. If it isn't running when the Nest app boots, the app still starts (BM25 logs a warning and populates once you upload something; vector search will error gracefully per-request instead of crashing the server).

### 6.4 Run the NestJS app

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

You should see (among other startup logs):
```
[BM25Service] BM25 index warmed up with N chunk(s) from the vector store.
[ChromaVectorStoreService] Connected to ChromaDB collection "knowledge_base" at localhost:8000
Enterprise RAG API running on http://localhost:3000
```

### 6.5 Open the app

Open your browser at:

**http://localhost:3000**

The frontend is served directly by Nest (no separate frontend server). `GET /health` is available for a liveness check.

---

## 7. Testing the app

### 7.1 Test PDF upload

**Via the browser**: drag a PDF onto the left panel (or click to browse), then click **Upload & Index Document**. You'll see it move through Uploading → Parsing PDF → Cleaning → Chunking → Generating Embeddings → Saving to ChromaDB → Knowledge Base Ready.

**Via curl**:
```bash
curl -X POST http://localhost:3000/knowledge/upload \
  -F "file=@/path/to/your-document.pdf"
```

Expected response (unchanged shape):
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

### 7.2 Test chat (now hybrid + reranked)

**Via the browser**: type a question in the right panel and press Enter (Shift+Enter for a newline). Watch the stage label cycle through Searching → Vector Search → BM25 Search → Re-ranking → Generating Answer, then check the confidence badge and source chips under the answer.

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
  "sources": ["your-document.pdf"],
  "confidence": "high"
}
```

If the answer isn't in your knowledge base, or nothing has been uploaded yet:
```json
{
  "answer": "I couldn't find this information in the uploaded knowledge base.",
  "sources": [],
  "confidence": "low"
}
```

**Watch the retrieval pipeline in the server console** while the request runs — you'll see, in order:
```
[RetrievalPipelineService] Question received: "..."
[RetrievalPipelineService] Generating embedding...
[HybridSearchService] Running vector search...
[HybridSearchService] Running BM25 search...
[HybridSearchService] Merging results...
[HybridSearchService] Removing duplicates...
[HybridSearchService] Merged into N unique candidate(s) (10 vector + 10 keyword).
[RetrievalPipelineService] Re-ranking...
[RerankService] Reranked N candidate(s), selected top 5.
[RetrievalPipelineService] Selecting top 5...
[RetrievalPipelineService] Sending context to Gemini...
[RetrievalPipelineService] Generating final response...
[RetrievalPipelineService] Completed.
```

### 7.3 Try a keyword-heavy query

Hybrid search is easiest to feel with a query that's mostly an exact term/code/name a paraphrase-only embedding search might underrate (e.g. a product SKU, an acronym, a specific figure from a table). BM25 picks up exact term matches vector search alone can miss; a paraphrased question exercises the vector side instead.

---

## 8. Notes on the frontend progress stages

The staged messages ("Uploading…", "Searching…", "Vector Search…", etc.) are driven client-side while a single HTTP request is in flight — the current API returns one response per request, not incremental progress events. Real step-by-step server progress would need Server-Sent Events or WebSockets, which is intentionally left for a future "Streaming Responses" lesson.
