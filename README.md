# qna

TL;DR - AI pretends to be paper/textbook author, you can ask it questions about the paper as a whole, specific parts of it right in the PDF viewing app (e.g. Apple Preview) using annotations and see the replies there.

The goal here is to improve on a process of reading a somewhat complicated text, a scientific paper or a textbook. Rather than summarization and getting high-level conclusions from the paper, we care about reader's understanding of all the details. The idea was to allow to 'chat with paper author', who'd hopefully be able to explain both the paper itself and some relevant context. Questions and answers also live right there where the document is, so they are implemented as PDF annotations. Later you should be able to open that file in another place and see all the questions/answers.

Sometimes getting answers might involve including context from the paper, and sometimes it would be very generic questions about something reader is not familiar with and paper content would not even be that relevant - there are different bot tagging options for that.

This work was motivated by the following observation - while LLMs are still not that good at creating original and complicated content, they are pretty good at explaining something well known to humanity and not too well known to me. They are good tutors.

Currently uses Claude API, but adding OpenAI and local llamas should not be hard.

At the moment, only uses model directly, no RAG. Some experimentation on local embedding store [in progress](experiments/bypage_embeddings.py).

## Examples

Here's an example asking Anthropic sonnet model some question while reading TVM paper (4x speed up).

https://github.com/okuvshynov/qna/assets/661042/57befa86-8dec-4201-9389-5287b593ec2b

To tag the bot, use one of the tags '@opus ', '@sonnet ', '@haiku ', '@opus+ ', '@sonnet+ ', '@haiku+ ' with a space after bot name. The ones with '+' sign would include the content of the entire paper, the selected part of the text and the question. The ones without '+' would only ask the question itself. They are cheaper/faster and more suitable for generic questions (what does central limit theorem say?) rather than something about the document itself.

Using context-aware bots on large books is probably a bad idea. I plan to add a 'selection-only' context qualifier, would be something like '@opus! '.

Another example on more recent 1bit llm paper:

https://github.com/okuvshynov/qna/assets/661042/a5f28a59-badd-43a0-aa81-925a282afeb5

## Prerequisites

```
pip install PyMuPDF
pip install anthropic
```

Anthropic API key should be in environment variable ANTHROPIC_API_KEY. 
All of it is tested on MacOS with default Preview PDF viewer. 



## How it works

the current process is:
1. script continuously monitors a configured folder:

```
% python3 qna.py ~/papers/  
```

2. In Apple Preview, where user is reading the paper, user adds a note with some question and tag the bot, for example ```@opus what's the difference between DDR and GDDR?```, save the file after adding a note.

3. In the background, the service notices the update, loads the file and checks if there's a new, not answered query for the bot.

4. If there is a new query, service constructs the message to the bot. If the bot tag was of the form '@botname ', only the question itself will be a part of the message. If the tag was of the form '@botname+ ', the entire document, the selection and the question would be included in the message. Here's prompt construction: https://github.com/okuvshynov/qna/blob/main/process_pdf.py#L48

5. Once the reply arrives, if it is a success, service updates the same annotation in PDF file with the reply. Non-printable marker is inserted to the annotation as well, so that later service can identify that question was already answered. This sounds a little weird - there's a way to create a new annotation in PDF and make it an IRT = 'in reply to' the original one, but the rendering of that is pretty off in many PDF viewers (More details in [samples/annotations.md](samples/annotations.md)). As the intent here is not only to get the answer right now, but to keep the annotated version of the document and be able to read it in a potentially different environment later, keeping it in a single note is good.

6. Apple preview will notice that there's a change to the file and display the updated annotation. However, such an update still seems to mess up some internal state and after that adding new highlight/annotation manually was sometimes not working. To work around this, we can force PDF reload - similar to browser page refresh, which keeps the scroll position. Add this AppleScript to Automator, assign hotkey like Cmd-Shift-R to it in Settings->Keyboard

```
tell application "Preview"
	set theDocument to front document
	set thePath to path of theDocument as POSIX file
	close theDocument
	open thePath
end tell
```

To summarize the workflow from user's prospective:
1. Add a refresh hotkey (see above)
2. Start the script to monitor the directory for changes:

```
% python3 qna.py ~/papers/  
```
   
3. Open your PDF with Apple Preview
4. Select a part which you are curious about, highlight it and add a note with your question.
5. After the note changes, press Cmd-Shift-R.

So far this is much less disruptive than googling around or asking ChatGPT/Claude in a separate chat application.

### odd pdfs

PDFs are pretty wild, so even for ones which has actual text and not scanned images, occasionally I got some for which PyMuPDF library didn't work - either extracting annotation texts or saving new annotations failed. These annotations were still there, as more mature software like Acrobat Reader could read and display them, but fixing pdf libraries was a little bit beyond the scope. 

The workaround for that was to print those odd PDF files to new PDF files using built-in functionality in MacOS.

## TODO

```
[x] context
	[ ] selection-only
	[x] selection + entire document
[x] openAI integration
[x] better prompt
[ ] pip install ...
[ ] extract prompts out of source. Make easier to configure, etc.
[ ] Some basic embedding store for large books. Just split by page, find best N pages and include in the prompt.
[ ] instructions on how to use
[x] check other pdf viewers on desktops/iPad/phones. How do they handle annotations?
[ ] configuration
[ ] try on some old pdfs
[ ] monitoring remote files?
[ ] local llama/mistral integration
```

## useful references

https://github.com/anthropics/anthropic-cookbook/blob/main/misc/pdf_upload_summarization.ipynb

