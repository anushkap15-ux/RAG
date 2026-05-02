from __future__ import annotations

import re

from qa.retriever import RetrievalResult


def answer_from_results(question: str, results: list[RetrievalResult]) -> dict:
    if not results:
        return {
            "answer": "I could not find information about that in the uploaded document.",
            "sources": [],
            "confidence": 0,
        }

    question_terms = _important_terms(question)
    # Prefer section-style matches first when the question looks like it targets
    # a heading such as requirements, objective, or constraints.
    selected = _select_sections(question_terms, results)
    if not selected:
        # Fall back to the most relevant sentences if there is no clear section match.
        selected = _select_sentences(question_terms, results)

    if not selected:
        # As a last resort, return a trimmed excerpt from the best chunk.
        selected = [_trim(results[0].chunk["text"], 420)]

    sources = [
        {
            "page": result.chunk["page"],
            "score": round(result.score, 3),
            "snippet": _trim(result.chunk["text"], 320),
        }
        for result in results[:3]
    ]

    return {
        "answer": " ".join(selected),
        "sources": sources,
        "confidence": _confidence(results),
    }


def _confidence(results: list[RetrievalResult]) -> int:
    if not results:
        return 0
    best_score = max(result.score for result in results)
    # TF-IDF cosine scores are usually modest, so map useful lexical matches into
    # a human-friendly confidence range without implying model certainty.
    return max(5, min(98, round(best_score * 220)))


def _important_terms(question: str) -> set[str]:
    words = re.findall(r"[A-Za-z0-9]+", question.lower())
    stop_words = {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "how",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "should",
        "the",
        "to",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "with",
    }
    return {word for word in words if word not in stop_words and len(word) > 2}


def _select_sentences(
    question_terms: set[str], results: list[RetrievalResult], limit: int = 3
) -> list[str]:
    candidates = []
    for result in results:
        for sentence in _split_sentences(result.chunk["text"]):
            sentence_terms = set(re.findall(r"[A-Za-z0-9]+", sentence.lower()))
            overlap = len(question_terms & sentence_terms)
            if overlap:
                candidates.append((overlap, result.score, sentence.strip()))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    chosen = []
    seen = set()
    for _, _, sentence in candidates:
        normalized = sentence.lower()
        if normalized in seen:
            continue
        chosen.append(_trim(sentence, 260))
        seen.add(normalized)
        if len(chosen) == limit:
            break
    return chosen


def _select_sections(
    question_terms: set[str], results: list[RetrievalResult], limit: int = 2
) -> list[str]:
    headings = [
        "objective",
        "requirements",
        "constraints",
        "deliverables",
        "evaluation criteria",
        "note",
    ]
    wanted = [heading for heading in headings if set(heading.split()) & question_terms]
    if not wanted:
        return []

    sections = []
    heading_pattern = "|".join(re.escape(heading) for heading in headings)
    for result in results:
        text = _clean_text(result.chunk["text"])
        for heading in wanted:
            pattern = (
                rf"\b{re.escape(heading)}\b\s*(.*?)"
                rf"(?=\b(?:{heading_pattern})\b|$)"
            )
            match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            if match:
                body = _format_bullets(match.group(1))
                if body:
                    sections.append(_trim(body, 520))
        if len(sections) >= limit:
            break
    return sections[:limit]


def _split_sentences(text: str) -> list[str]:
    text = _clean_text(text)
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]


def _trim(text: str, length: int) -> str:
    text = _clean_text(text)
    text = re.sub(r"[ \t]+", " ", text)
    if len(text) <= length:
        return text
    return text[: length - 3].rsplit(" ", 1)[0] + "..."


def _clean_text(text: str) -> str:
    return text.replace("\u200b", "").replace("\ufeff", "")


def _format_bullets(text: str) -> str:
    text = _clean_text(text)
    text = re.sub(r"\s*●\s*", "\n- ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(" :\n")
