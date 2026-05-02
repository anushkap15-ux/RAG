# 🚀 Advanced RAG Workbench

A modern Retrieval-Augmented Generation (RAG) app for PDF question answering. Upload a PDF, ask grounded questions, inspect cited sources, export conversations, and toggle a futuristic dark mode with an animated space-style background.

## Demo Video



## Highlights

- 📄 Upload and index PDFs locally
- 🔍 Semantic retrieval with TF-IDF and cosine similarity
- 💡 Extractive answers with source citations
- 🌙 Dark mode with a space-themed animated background
- 💾 Export conversation history as JSON
- 📊 Session statistics and average relevance tracking
- 📋 Copyable source snippets
- 📱 Responsive UI for desktop and mobile

## Tech Stack

- **Backend:** Flask 3.0.3
- **PDF Extraction:** PyMuPDF 1.24.10
- **Retrieval:** scikit-learn 1.5.2
- **Frontend:** Vanilla HTML, CSS, and JavaScript

## Project Layout

```text
app.py
qa/
  answerer.py
  chunker.py
  document_store.py
  pdf_loader.py
  retriever.py
static/
  app.js
  style.css
templates/
  index.html
uploads/
```

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

## API Endpoints

- `GET /` - serve the UI
- `GET /health` - health check
- `POST /upload` - upload and index a PDF
- `POST /ask` - answer a question for a document
- `POST /search` - search passages in a document
- `GET /documents` - list indexed documents
- `GET /documents/<document_id>` - inspect a document
- `DELETE /documents/<document_id>` - delete one document
- `DELETE /documents` - clear all documents

## How It Works

1. Extract selectable text from the uploaded PDF.
2. Split the text into overlapping chunks.
3. Index the chunks with TF-IDF vectors.
4. Rank chunks with cosine similarity for each question.
5. Build an extractive answer from the best matches.
6. Show the answer with sources and relevance scores.

## Optimization Notes

- Uploaded PDFs are indexed in memory once per document.
- The retriever is cached per document to avoid rebuilding vectors for every query.
- CSS animations use transforms and opacity for smoother rendering.
- Theme preference is stored in `localStorage`.
- The UI uses vanilla JavaScript to keep overhead low.

## Documentation Notes

The codebase includes route docstrings, important inline comments, and supporting docs for the UI, optimization strategy, and RAG pipeline behavior.

## Troubleshooting

- If a PDF fails to index, make sure it contains selectable text and is under the upload size limit.
- If answers look weak, try a more specific question or raise the retrieval count.
- If the browser shows stale styles, hard refresh the page or restart the Flask server.

## Future Ideas

- Add OCR for scanned PDFs
- Add persistent vector storage
- Add semantic embeddings
- Add follow-up question memory
- Add multi-language support

## License

Open for educational and practical use.
