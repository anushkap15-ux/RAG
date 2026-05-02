from collections.abc import Iterable


def chunk_pages(
    pages: Iterable[dict], chunk_size: int = 900, overlap: int = 180
) -> list[dict]:
    chunks = []

    for page in pages:
        text = page["text"]
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk_text = text[start:end].strip()
            if chunk_text:
                # Keep the originating page number on every chunk so answers can
                # cite where the text came from.
                chunks.append(
                    {
                        "id": len(chunks),
                        "page": page["page"],
                        "text": chunk_text,
                    }
                )
            if end == len(text):
                break
            # Overlap chunks slightly so answers do not get split across a hard boundary.
            start = max(0, end - overlap)

    return chunks
