from pathlib import Path

import fitz


def extract_pages(pdf_path: Path) -> list[dict]:
    pages = []
    with fitz.open(pdf_path) as document:
        for index, page in enumerate(document, start=1):
            # PyMuPDF gives us raw text with inconsistent spacing, so normalize
            # it before the chunker and retriever see it.
            text = _normalize_text(page.get_text("text"))
            if text:
                pages.append({"page": index, "text": text})

    if not pages:
        raise ValueError(
            "No selectable text was found in this PDF. Scanned PDFs need OCR first."
        )

    return pages


def _normalize_text(text: str) -> str:
    lines = [" ".join(line.split()) for line in text.splitlines()]
    lines = [line for line in lines if line]
    return "\n".join(lines)
