import numpy as np
from sentence_transformers import SentenceTransformer
import logging
import hashlib
import threading
import queue
import os
import json

# huggingface tokenizers complain about threading i use
os.environ["TOKENIZERS_PARALLELISM"] = "false"

class EmbeddingStore:
    def __init__(self):
        self.model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
        self.q = queue.Queue()
        self.lock = threading.Lock()
        self.embeddings = {}
        self.enqueued = {}
        self.cache_path = os.path.expanduser("~/.cache/qna")
        
        self.loadall()
        threading.Thread(target=self.embedding_computation_loop, daemon=True).start()

    def save(self, path, checksum, embeddings):
        

        os.makedirs(self.cache_path, exist_ok=True)

        base_name = hashlib.sha256(path.encode()).hexdigest()
        base_path = os.path.join(self.cache_path, base_name)
        with open(f'{base_path}.json', 'w') as json_file:
            json.dump({"path": path, "checksum": checksum}, json_file)
        np.save(f'{base_path}.npy', embeddings)

    def loadall(self):
        for file in os.listdir(self.cache_path):
            try:
                base_name, extension = os.path.splitext(file)
                base_path = os.path.join(self.cache_path, base_name)
                if extension == '.json':
                    embeddings = np.load(f'{base_path}.npy')
                    with open(f'{base_path}.json', 'r') as f:
                        d = json.load(f)
                        self.embeddings[d['path']] = (d['checksum'], embeddings)
                        logging.info(f'loaded embeddings from cache for {d["path"]}')
            except:
                logging.error(f'error processing {file} from embedding cache')

    def checksum(s):
        hash_object = hashlib.md5(s.encode())
        return hash_object.hexdigest()

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
                    # this is the only place we update embeddings, let's write them to cache here as well
                    self.save(path, new_checksum, embeddings)

            self.q.task_done()

    def get_topk_pages(self, path, pages, question, selection, current_page_index, k):
        new_checksum = EmbeddingStore.checksum("".join(pages))
        embeds = None

        with self.lock:
            if path in self.embeddings.keys():
                (old_checksum, embeddings) = self.embeddings[path]
                if old_checksum == new_checksum:
                    embeds = embeddings

        if embeds is not None:
            # we got valid embeddings.
            # TODO: better combination
            query_embedding = self.model.encode(question + "\n" + selection)
            query_embedding = query_embedding / np.linalg.norm(query_embedding)
            similarities = np.dot(embeddings, query_embedding)
            top_k_indices = set(np.argsort(similarities)[::-1][:k])
            top_k_indices.add(current_page_index)
            logging.info(f'using pages {top_k_indices} from {path} as context')
            max_index = max(top_k_indices)
            if max_index >= len(pages):
                logging.error(f'attempting to get page content for index {max_index} for document {path} with {len(pages)} pages.')
            return "".join(pages[i] for i in sorted(list(top_k_indices)) if i < len(pages))

        logging.warn(f'embeddings are requested but missing for {path}')
        with self.lock:
            enqueued_checksum = self.enqueued.get(path)
            # we never remove values from self.enqueued
            # it is 'computed or enqueued ever' rather than 'in queue now'
            if enqueued_checksum is None or enqueued_checksum != new_checksum:
                self.enqueued[path] = new_checksum

        self.q.put((path, pages))
        return ""