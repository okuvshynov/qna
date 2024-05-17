import fitz
import logging
from embeddings import EmbeddingStore
from assistants import find_conf, format_prompt, endpoints

class PDFProcessor:
    def __init__(self):
        self.embeds_store = EmbeddingStore()
        self.page_context_size = 3

    def process_pdf(self, path):
        logging.info(f"processing {path}")
        doc = fitz.open(path)
        
        has_failures = False
        changed = False

        # we use this as a marker that question was answered.
        # if someone modifies the annotation later and the marker is 
        # deleted, we will consider this a valid question and process it again
        delimiter = chr(1)
        
        pages = [page.get_text() for page in doc]
        fulltext = "".join(pages)

        for idx, page in enumerate(doc):
            xrefs = [annot.xref for annot in page.annots([8, 9])]

            for xref in xrefs:
                annot = page.load_annot(xref)

                # text in the annotation itself
                annot_info = annot.info
                content = annot_info['content'] if 'content' in annot_info else ''

                # find assistant config to use (if any)
                conf = find_conf(content)
                if conf is None or content.endswith(delimiter):
                    continue

                # what is selected in the document
                selection = ""
                vertices = annot.vertices
                for i in range(0, len(vertices), 4):
                    text = page.get_textbox(fitz.Quad(vertices[i:i + 4]).rect)
                    selection += text
                question = content[len(conf.prefix):]

                context_pages = ""
                if conf.needs_embeddings:
                    context_pages = self.embeds_store.get_topk_pages(path, pages, question, selection, idx, k=self.page_context_size)
                    # let's fail and retry. It would make more sense to wait
                    if context_pages is None:
                        logging.error(f'embeddings were requested but not computed yet. Will retry.')
                        has_failures = True
                        continue
                        
                question = format_prompt([
                    ("{{fulltext}}", fulltext),
                    ("{{selection}}", selection),
                    ("{{question}}", question),
                    ("{{pages}}", context_pages),
                ], conf.prompt)

                assistant = endpoints.get(conf.assistant)

                if assistant is None:
                    logging.error(f'No assistant found for endpoint {conf.assistant}')
                    has_failures = True
                    continue

                reply = assistant(conf, question)
                if reply is None:
                    logging.error('Got no reply from assistant')
                    has_failures = True
                    continue

                content = content + "\n\n" + reply + delimiter
                annot.set_info(content=content)
                annot.update()
                changed = True

        # save file only if we added a reply
        if changed:
            doc.save(path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
        doc.close()

        return not has_failures

if __name__ == "__main__":
    logging.basicConfig(format='%(asctime)s %(message)s', level=logging.INFO)
