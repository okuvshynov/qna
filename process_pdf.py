import anthropic
import fitz
import logging
from dataclasses import dataclass
import os

from embeddings import EmbeddingStore

###############################################################################
### CONFIG
###############################################################################

@dataclass
class AssistantConfig:
    prefix: str
    model: str
    prompt: str
    assistant: str
    needs_embeddings: bool = False

assistant_config = [
    AssistantConfig("@ask ", "claude-3-haiku-20240307", prompt="question_v0", assistant='claude'),
    AssistantConfig("@haiku ", "claude-3-haiku-20240307", prompt="question_v0", assistant='claude'),
    AssistantConfig("@opus ", "claude-3-opus-20240229", prompt="question_v0", assistant='claude'),
    AssistantConfig("@sonnet ", "claude-3-sonnet-20240229", prompt="question_v0", assistant='claude'),
    AssistantConfig("@ask+ ", "claude-3-haiku-20240307", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@haiku+ ", "claude-3-haiku-20240307", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@opus+ ", "claude-3-opus-20240229", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@sonnet+ ", "claude-3-sonnet-20240229", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@ask* ", "claude-3-haiku-20240307", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@haiku* ", "claude-3-haiku-20240307", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@opus* ", "claude-3-opus-20240229", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@sonnet* ", "claude-3-sonnet-20240229", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@ask# ", "claude-3-haiku-20240307", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@haiku# ", "claude-3-haiku-20240307", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@opus# ", "claude-3-opus-20240229", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@sonnet# ", "claude-3-sonnet-20240229", prompt="pages_v0", assistant='claude', needs_embeddings=True),
]

# do config sanity check, prefixes should not be prefixes of each other
def conf_check():
    p = sorted([c.prefix for c in assistant_config])
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        if b.startswith(a):
            return False
    return True
assert(conf_check())

def find_conf(message):
    confs = [c for c in assistant_config if message.startswith(c.prefix)]
    return confs[0] if confs else None

###############################################################################
### Prompt construction
###############################################################################

def format_prompt(params, prompt_name):
    with open(os.path.join("prompts", prompt_name)) as f:
        prompt = f.read()
        for k, v in params:
            prompt = prompt.replace(k, v)
        return prompt

###############################################################################
### Anthropic
###############################################################################
def ask_claude(config: AssistantConfig, question):
    logging.info(f'querying anthropic model {config.model}')
    message = anthropic.Anthropic().messages.create(
        model=config.model,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question}
        ]
    )
    if message.content is not None:
        return message.content[0].text
    return None

assistants = {
    "claude": ask_claude,
}

###############################################################################
### PDF
###############################################################################

class PDFProcessor:
    def __init__(self):
        self.embeds_store = EmbeddingStore()

    def process_pdf(self, path):
        doc = fitz.open(path)
        has_failures = False

        # we use this as a marker that question was answered.
        # if someone modifies the annotation later and the marker is 
        # deleted, we will consider this a valid question and process it again
        delimiter = chr(1)
        
        changed = False

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

                chosen_pages = ""
                if conf.needs_embeddings:
                    chosen_pages = self.embeds_store.get_topk_pages(path, pages, question, idx, k=3)
                        
                question = format_prompt([
                    ("{{fulltext}}", fulltext),
                    ("{{selection}}", selection),
                    ("{{question}}", question),
                    ("{{pages}}", chosen_pages),
                ], conf.prompt)

                assistant = assistants.get(conf.assistant)

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