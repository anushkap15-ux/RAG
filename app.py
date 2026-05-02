"""Flask application for the Advanced RAG Workbench.

The app serves the interactive UI and exposes a small JSON API for uploading
PDFs, asking questions, searching passages, and managing indexed documents.
"""

from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from qa.document_store import DocumentStore


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

# Keep each uploaded PDF isolated so queries only run against the selected
# document and its cached TF-IDF retriever.
store = DocumentStore()


def _validate_top_k(raw_value) -> int:
    """Clamp the retrieval count into the supported range."""
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return 4
    return max(1, min(value, 10))


@app.get("/")
def index():
    """Render the main HTML interface."""
    return render_template("index.html")


@app.get("/health")
def health():
    """Return a small health payload for load balancers and monitoring."""
    return {"status": "ok"}


@app.post("/upload")
def upload_pdf():
    """Upload a PDF, save it to disk, and index it in memory."""
    uploaded = request.files.get("file")
    if not uploaded or uploaded.filename == "":
        return jsonify({"error": "Please choose a PDF file."}), 400

    if not uploaded.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported."}), 400

    document_id = uuid4().hex
    filename = secure_filename(uploaded.filename)
    saved_path = UPLOAD_DIR / f"{document_id}-{filename}"
    uploaded.save(saved_path)

    try:
        summary = store.add_pdf(document_id, saved_path, original_name=filename)
    except ValueError as exc:
        saved_path.unlink(missing_ok=True)
        return jsonify({"error": str(exc)}), 400

    return jsonify(summary)


@app.post("/ask")
def ask_question():
    """Answer a question against a previously uploaded document."""
    payload = request.get_json(silent=True) or {}
    document_id = payload.get("document_id")
    question = (payload.get("question") or "").strip()
    top_k = _validate_top_k(payload.get("top_k", 4))

    if not document_id:
        return jsonify({"error": "Upload a document before asking a question."}), 400
    if not question:
        return jsonify({"error": "Please enter a question."}), 400

    try:
        result = store.answer(document_id, question, top_k=top_k)
    except KeyError:
        return jsonify({"error": "Document not found. Please upload it again."}), 404

    return jsonify(result)


@app.get("/documents")
def documents():
    """Return all indexed documents and their metadata."""
    return jsonify({"documents": store.list_documents()})


@app.get("/documents/<document_id>")
def document_detail(document_id):
    """Return document metadata and a small chunk preview."""
    try:
        return jsonify(store.get_document(document_id))
    except KeyError:
        return jsonify({"error": "Document not found."}), 404


@app.delete("/documents/<document_id>")
def delete_document(document_id):
    """Delete a document and free its memory."""
    try:
        store.delete(document_id)
    except KeyError:
        return jsonify({"error": "Document not found."}), 404
    return jsonify({"ok": True})


@app.delete("/documents")
def clear_documents():
    """Clear all indexed documents and reset the workspace."""
    store.clear()
    return jsonify({"ok": True})


@app.post("/search")
def search_document():
    """Search for relevant passages in a document."""
    payload = request.get_json(silent=True) or {}
    document_id = payload.get("document_id")
    query = (payload.get("query") or "").strip()

    if not document_id:
        return jsonify({"error": "Choose a document before searching."}), 400
    if not query:
        return jsonify({"error": "Enter text to search for."}), 400

    try:
        results = store.search(document_id, query)
    except KeyError:
        return jsonify({"error": "Document not found."}), 404

    return jsonify({"results": results})


if __name__ == "__main__":
    app.run(debug=True)
