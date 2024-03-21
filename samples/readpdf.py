import fitz
import sys

doc = fitz.open(sys.argv[1])
# Iterate through each page
for page in doc:
    # Get the list of annotations
    annotations = page.annots([fitz.PDF_ANNOT_TEXT, fitz.PDF_ANNOT_HIGHLIGHT])
    if annotations:  # If there are annotations on the page
        for annot in annotations:
            print(f"Annotation content: {annot.info['content']}, type={annot.type}, xref={annot.xref}, irt_xref(is a reply to)={annot.irt_xref}")
doc.close()
