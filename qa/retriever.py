from __future__ import annotations

from dataclasses import dataclass

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class RetrievalResult:
    chunk: dict
    score: float


class TfidfRetriever:
    def __init__(self, chunks: list[dict]):
        self.chunks = chunks
        # Build a simple lexical index over the chunk text.
        self.vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        self.matrix = self.vectorizer.fit_transform([chunk["text"] for chunk in chunks])

    def search(self, question: str, top_k: int = 4) -> list[RetrievalResult]:
        # Score the question against every chunk and return the best matches.
        top_k = max(1, min(top_k, len(self.chunks)))
        query_vector = self.vectorizer.transform([question])
        scores = cosine_similarity(query_vector, self.matrix).flatten()
        ranked = scores.argsort()[::-1][:top_k]

        return [
            RetrievalResult(chunk=self.chunks[index], score=float(scores[index]))
            for index in ranked
            if scores[index] > 0
        ]
