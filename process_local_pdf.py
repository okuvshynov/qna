import anthropic
import fitz

def ask_claude(question):
    message = anthropic.Anthropic().messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question}
        ]
    )
    if message.content is not None:
        return message.content[0].text
    return None

def process_pdf(path):
    doc = fitz.open(path)
    
    changed = False
    for page_num, page in enumerate(doc, start=1):
        xrefs = [annot.xref for annot in page.annots([8, 9])]

        for xref in xrefs:
            annot = page.load_annot(xref)
            annot_info = annot.info
            content = annot_info['content'] if 'content' in annot_info else ''
                    
            context = ""
            vertices = annot.vertices

            for i in range(0, len(vertices), 4):
                text = page.get_textbox(fitz.Quad(vertices[i:i + 4]).rect)
                context += text

            print(f"Content: {content}")
            print(f"Context: {context}")

            if content.startswith("@sonnet"):
                reply = ask_claude(content[len("@sonnet"):])
                content = content + "\n" + "sonnet: " + reply
                print(content)
                annot.set_info(content=content)
                annot.update()
                changed = True

    if changed:
        doc.save(path, incremental=True, encryption=fitz.PDF_ENCRYPT_KEEP)
    doc.close()

if __name__ == "__main__":
    pdf_path = 'samples/sample.pdf'
    process_pdf(pdf_path)