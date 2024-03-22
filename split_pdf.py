# some experimentation on pdf textbooks/papers splitting to put them in the embedding store later
import fitz
import sys

doc = fitz.open(sys.argv[1])

## first - try bookmarks/outline
if doc.outline:
    for bookmark in doc.get_toc(simple=False):
        level, title, page_number, _ = bookmark
        print(f"Level: {level}, Title: {title}, Page Number: {page_number}")
else:
    print("No bookmarks found.")


# some books have it, and that could be a natural way to break them down into managable chunks of content
# some books don't have outline. Just do by page? 
