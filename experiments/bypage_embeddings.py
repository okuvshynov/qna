import fitz
import sys
import numpy as np
from sentence_transformers import SentenceTransformer
import time

model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')

doc = fitz.open(sys.argv[1])

texts = [page.get_text() for page in doc]

total_len = sum(len(page) for page in texts)

print(f"total length in characters: {total_len}")

times = []

def time_and_embed(text):
    global times
    start = time.time()
    res = model.encode(text)
    times.append(time.time() - start)
    return res

embeddings = np.array([time_and_embed(text) for text in texts])

print(f"total {sum(times)} seconds for {len(times)} pages")

doc.close()

query = " ".join(sys.argv[2:])

query_embedding = model.encode(query)
query_embedding = query_embedding / np.linalg.norm(query_embedding)

similarities = np.dot(embeddings, query_embedding)

k = 3
top_k_indices = np.argsort(similarities)[::-1][:k]

for i in top_k_indices:
    print(texts[i][:256])