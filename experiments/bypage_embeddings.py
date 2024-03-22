import fitz
import sys

from sentence_transformers import SentenceTransformer

model = SentenceTransformer('sentence-transformers/paraphrase-distilroberta-base-v1')

doc = fitz.open(sys.argv[1])
# Iterate through each page
for page in doc:
    text = page.get_text()
    embeddings = model.encode([text])

doc.close()
