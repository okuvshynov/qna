There are countless applications to read and annotate pdf documents, however, the presentation and support of different features varies.

Here's a brief illustration. Let's say we added a highlight and a annotation in Apple Preview to a simple test document [samples/test_annot_0.pdf](samples/test_annot_0.pdf).

It would look like

![samples/img/annot0_preview.png](samples/img/annot0_preview.png)

If we open the same file in Adobe Acrobat, we'll see a nice comment thread we can reply to:

![samples/img/annot0_acrobat.png](samples/img/annot0_acrobat.png)

Now if we open the same file in preview again, we'll see something much less clear:

![samples/img/annot0_reply_preview.png](samples/img/annot0_reply_preview.png)

What happens under the hood?

Original note is an annotation of subtype 'highlight'. If you open that pdf in plaintext, you can see something like ```/Subtype /Highlight /Type /Annot ... ```.

The 'reply' Acrobat Reader added is another annotation, this time of subttype 'text'. In the pdf itself, it will look like ```/Subtype/Text/Type/Annot```.

How does it know it is a reply to the original annotation - it has IRT (= In Reply To) attribute set to the xref (= cross-reference) of the original annotation. It is represented as ```/IRT 14```, where '14' is xref of the first annotation (```14 0 obj``` in the pdf itself).

This all can be reconstructed programmatically using, for example, https://github.com/pymupdf/PyMuPDF. 

Try it out:

```
% python3 samples/readpdf.py samples/test_annot_0.pdf         
Annotation content: This annotation was added in Apple preview, type=(8, 'Highlight'), xref=14, irt_xref(is a reply to)=0
Annotation content: Here's a reply made from Adobe Acrobat Reader, type=(0, 'Text'), xref=28, irt_xref(is a reply to)=14

```

So internally it all make sense, discussions created this way are not very easy to read in many widespread readers. 

Try open it in Google Chrome: 

![samples/img/annot0_reply_chrome.png](samples/img/annot0_reply_chrome.png).

We can see both, but the content is visible only on mouse hover and the 'in-reply-to' nature of the discussion is not obvious. There's no way as far as I can see to reply to it.

Let's see how would pdf viewers in some popular doc sharing platforms handle it.

Dropbox seem to have its own system for comment which is probably completely external to the pdf structure:
![samples/img/annot0_reply_pdf.png](samples/img/annot0_reply_pdf.png).

Google drive seem to import the thread to its own comment system:
![samples/img/annot0_reply_google_drive.png](samples/img/annot0_reply_google_drive.png).

