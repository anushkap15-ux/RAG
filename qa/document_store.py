from pathlib import Path

from qa.answerer import answer_from_results
from qa.chunker import chunk_pages
from qa.pdf_loader import extract_pages
from qa.retriever import TfidfRetriever


class DocumentStore:
    def __init__(self):
        self.documents = {}

    def add_pdf(self, document_id: str, pdf_path: Path, original_name: str) -> dict:
        # Load the PDF, break it into chunks, and build a retriever for just this file.
        pages = extract_pages(pdf_path)
        chunks = chunk_pages(pages)

        if not chunks:
            raise ValueError("The PDF did not contain enough text to index.")

        self.documents[document_id] = {
            "id": document_id,
            "name": original_name,
            "pages": pages,
            "chunks": chunks,
            # TF-IDF keeps the search lightweight and fully local.
            "retriever": TfidfRetriever(chunks),
        }

        return {
            "document_id": document_id,
            "filename": original_name,
            "page_count": len(pages),
            "chunk_count": len(chunks),
        }

    def answer(self, document_id: str, question: str, top_k: int = 4) -> dict:
        document = self.documents[document_id]
        # Ask the document-specific retriever for the most relevant chunks.
        results = document["retriever"].search(question, top_k=top_k)
        answer = answer_from_results(question, results)
        answer["document"] = document["name"]
        answer["retrieved_count"] = len(results)
        return answer

    def list_documents(self) -> list[dict]:
        return [self._summary(document) for document in self.documents.values()]

    def get_document(self, document_id: str) -> dict:
        document = self.documents[document_id]
        summary = self._summary(document)
        summary["preview"] = [
            {
                "page": page["page"],
                "snippet": self._trim(page["text"], 280),
            }
            for page in document["pages"][:5]
        ]
        return summary

    def search(self, document_id: str, query: str, top_k: int = 6) -> list[dict]:
        document = self.documents[document_id]
        results = document["retriever"].search(query, top_k=top_k)
        return [
            {
                "page": result.chunk["page"],
                "score": round(result.score, 3),
                "snippet": self._trim(result.chunk["text"], 420),
            }
            for result in results
        ]

    def delete(self, document_id: str) -> None:
        del self.documents[document_id]

    def clear(self) -> None:
        self.documents.clear()

    def _summary(self, document: dict) -> dict:
        return {
            "document_id": document["id"],
            "filename": document["name"],
            "page_count": len(document["pages"]),
            "chunk_count": len(document["chunks"]),
        }

    def _trim(self, text: str, length: int) -> str:
        text = " ".join(text.split())
        if len(text) <= length:
            return text
        return text[: length - 3].rsplit(" ", 1)[0] + "..."
