import anthropic
import openai
import fitz
import logging
from dataclasses import dataclass

###############################################################################
### CONFIG
###############################################################################

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
    AssistantConfig("@ask+ ", "claude-3-haiku-20240307", use_context=True, assistant='claude'),
    AssistantConfig("@haiku+ ", "claude-3-haiku-20240307", use_context=True, assistant='claude'),
    AssistantConfig("@opus+ ", "claude-3-opus-20240229", use_context=True, assistant='claude'),
    AssistantConfig("@sonnet+ ", "claude-3-sonnet-20240229", use_context=True, assistant='claude'),
    AssistantConfig("@gpt35 ", "gpt-3.5-turbo", use_context=False, assistant='openai'),
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

def fullprompt(fulltext, selection, question):
    return f"""
You are a scientist who wrote the scientific paper. 
Using paper text in <paper></paper> tags, relevant selection from the paper in <selection></selection> tags 
and reader's question in <question></question> tags, answer that question as best as you can. 
You shall use both the paper content and your general knowledge, as reader's question might be more generic.

<paper>
{fulltext}
</paper>

<selection>
{selection}
</selection>

<question>
{question}
</question>
"""


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


###############################################################################
### OpenAI
###############################################################################
def ask_openai(config: AssistantConfig, question):
    logging.info(f'querying open ai model {config.model}')
    client = openai.Client()
    message = client.chat.completions.create(
        model=config.model,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question}
        ]
    )
    if message.choices:
        print(message.choices[0].message)
        return message.choices[0].message.content
    return None


assistants = {
    "claude": ask_claude,
    "openai": ask_openai,
}

###############################################################################
### PDF
###############################################################################
def process_pdf(path):
    doc = fitz.open(path)
    has_failures = False

    # we use this as a marker that question was answered.
    # if someone modifies the annotation later and the marker is 
    # deleted, we will consider this a valid question again and process it again
    delimiter = chr(1)
    
    changed = False

    fulltext = ""
    
    for _, page in enumerate(doc):
        fulltext += page.get_text()

    for _, page in enumerate(doc, start=1):
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
            if conf.use_context:
                question = fullprompt(fulltext, selection, question)

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

def test_add_reply(path):
    doc = fitz.open(path)
    # Iterate through each page
    for page in doc:
        # Get the list of annotations
        annotations = page.annots([fitz.PDF_ANNOT_TEXT, fitz.PDF_ANNOT_HIGHLIGHT])
        if annotations:  # If there are annotations on the page
            for annot in annotations:
                print(annot.type)
                if annot.type[0] == fitz.PDF_ANNOT_HIGHLIGHT:
                    # TODO where do we put this?
                    reply_annot = page.add_text_annot(fitz.Point(70, 120), "Automated reply")
                    reply_annot.set_irt_xref(annot.xref)
                    reply_annot.set_info(content="Automated reply", title="Some Bot")
                    reply_annot.update()
                # Accessing basic annotation properties
                info = annot.info  # Get the annotation's info dictionary
                print(annot.xref)
                print(annot.type)
                print(annot.irt_xref)
                
                #print(info)
                print(f"Annotation: {info['content']}")
                print("\n\n\n\n")
    doc.save('samples/textbooks2.pdf', incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
    doc.close()


if __name__ == "__main__":
    logging.basicConfig(format='%(asctime)s %(message)s', level=logging.INFO)