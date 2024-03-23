import fitz
import numpy as np
from sentence_transformers import SentenceTransformer
import logging
import hashlib
import threading
import queue

class EmbeddingStore:
    def __init__(self):
        self.model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
        self.q = queue.Queue()
        self.lock = threading.Lock()
        self.embeddings = {}
        self.enqueued = {}
        threading.Thread(target=self.embedding_computation_loop, daemon=True).start()

    def checksum(s):
        hash_object = hashlib.md5(s.encode())
        return hash_object.digest()

    # ABA problem here because of debounce? 
    def embedding_computation_loop(self):
        while True:
            (path, pages) = self.q.get()
            new_checksum = EmbeddingStore.checksum("".join(pages))

            changed = True

            with self.lock:
                if path in self.embeddings.keys():
                    old_checksum, _ = self.embeddings[path]
                    # it is possible to get multiple entries in the queue.
                    if old_checksum == new_checksum:
                        changed = False

            if changed:
                # this is long-running and needs to be outside the lock
                embeddings = np.array(self.model.encode(pages))
                logging.info(f'computed page-level embeddings for {path}')

                with self.lock:
                    self.embeddings[path] = (new_checksum, embeddings)

            self.q.task_done()

    def get_topk_pages(self, path, pages, question, current_page_index, k):
        new_checksum = EmbeddingStore.checksum("".join(pages))
        embeds = None

        with self.lock:
            if path in self.embeddings.keys():
                (old_checksum, embeddings) = self.embeddings[path]
                if old_checksum == new_checksum:
                    embeds = embeddings


        if embeds is not None:
            # we got valid embeddings.
            query_embedding = self.model.encode(question)
            query_embedding = query_embedding / np.linalg.norm(query_embedding)
            similarities = np.dot(embeddings, query_embedding)
            top_k_indices = set(np.argsort(similarities)[::-1][:k])
            top_k_indices.add(current_page_index)
            logging.info(f'using pages {top_k_indices} from {path} as context')
            return "".join(pages[i] for i in sorted(list(top_k_indices)))

        logging.warn(f'embeddings are requested but missing for {path}')
        with self.lock:
            enqueued_checksum = self.enqueued.get(path)
            # we never really remove values from self.enqueued
            # it's more like 'computed or enqueued ever' rather than 'in queue now'
            if enqueued_checksum is None or enqueued_checksum != new_checksum:
                self.enqueued[path] = new_checksum

        self.q.put((path, pages))
        return ""