import anthropic
import fitz
import logging
from dataclasses import dataclass

###############################################################################
### CONFIG
###############################################################################

logging.basicConfig(format='%(asctime)s %(message)s', level=logging.INFO)

@dataclass
class AssistantConfig:
    prefix: str
    model: str
    use_context: bool
    assistant: str

assistant_config = [
    AssistantConfig("@ask ", "claude-3-haiku-20240307", use_context=False, assistant='claude'),
    AssistantConfig("@haiku ", "claude-3-haiku-20240307", use_context=False, assistant='claude'),
    AssistantConfig("@opus ", "claude-3-opus-20240229", use_context=False, assistant='claude'),
    AssistantConfig("@sonnet ", "claude-3-sonnet-20240229", use_context=False, assistant='claude'),
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
### CLAUDE
###############################################################################

def ask_claude(config: AssistantConfig, question):
    logging.info(f'querying anthropic model {config.model}')
    message = anthropic.Anthropic().messages.create(
        model=config.model,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question[len(config.prefix):]}
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
def process_pdf(path):
    doc = fitz.open(path)

    # we use this as a marker that question was answered.
    # if someone modifies the annotation later and the marker is 
    # deleted, we might consider this a valid question again
    delimiter = chr(1)
    
    changed = False
    for _, page in enumerate(doc, start=1):
        xrefs = [annot.xref for annot in page.annots([8, 9])]

        for xref in xrefs:
            annot = page.load_annot(xref)

            # text in the annotation itself
            annot_info = annot.info
            content = annot_info['content'] if 'content' in annot_info else ''
            
            # what is selected in the document
            context = ""
            vertices = annot.vertices
            for i in range(0, len(vertices), 4):
                text = page.get_textbox(fitz.Quad(vertices[i:i + 4]).rect)
                context += text

            # find assistant config to use (if any)
            conf = find_conf(content)

            if conf is None or content.endswith(delimiter):
                continue

            assistant = assistants.get(conf.assistant)

            if assistant is None:
                logging.error(f'No assistant found for endpoint {conf.assistant}')
                continue

            reply = assistant(conf, content)
            if reply is None:
                logging.error('Got no reply from assistant')
                continue

            content = content + "\n\n" + reply + delimiter
            annot.set_info(content=content)
            annot.update()
            changed = True

    if changed:
        doc.save(path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
    doc.close()

if __name__ == "__main__":
    pdf_path = 'samples/sample.pdf'
    process_pdf(pdf_path)