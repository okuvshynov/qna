import anthropic
import pdfrw

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


# Function to extract annotations from a PDF file
def update_pdf(path):
    pdf = pdfrw.PdfReader(path)
    
    for page in pdf.pages:
        if not page.Annots:
            continue

        for annot in page.Annots:
            if annot is None or annot.Contents is None:
                continue

            text = pdfrw.objects.PdfString.decode(annot.Contents)

            if text.startswith("@sonnet"):
                reply = ask_claude(text[len("@sonnet"):])
                text = text + "\n" + "sonnet: " + reply
                print(text)
                annot.Contents = pdfrw.objects.PdfString.encode(text)  

    pdfrw.PdfWriter(path, trailer=pdf).write()


if __name__ == "__main__":
    pdf_path = 'samples/sample.pdf'
    update_pdf(pdf_path)