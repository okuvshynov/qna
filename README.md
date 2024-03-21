# qna

TL;DR - AI pretends to be paper/textbook author, you can ask it questions about the paper as a whole, specifc parts of it right in the pdf viewing app (e.g. Apple Preview) using annotations.

The goal here is to improve on a process of reading a somewhat complicated text, a scientific paper or a textbook. Rather than summarization and understanding high-level conclusions from the paper, we care about reader's understanding of all the details. The idea was to allow to 'chat with paper author', who'd probably be able to explain both the paper itself and some relevant context. From the product point of view, questions and answers should also live right there where the document is, and not in a separate chat window, so they are implemented as PDF annotations.

We look for an ability to ask some questions and get answers about specific pieces of the text. Sometimes that might involve including some context from the paper (or entire paper), and sometimes it would be very generic questions about something reader is not familiar with and paper content would not even be that relevant.

This work was motivated by the following observation - while LLMs are still not that good at creating original and complicated content, they are pretty good at explaining something well known to humanity and not too well known for user personally. They are good tutors.

Currently uses Claude API, but adding OpenAI and local llamas should be possible.

## Examples

Here's an example asking Anthropic sonnet model some silly question while reading old paper about TVM.

https://github.com/okuvshynov/qna/assets/661042/57befa86-8dec-4201-9389-5287b593ec2b



## How and why it works

Roughly the current process is:
1. Have a script continuously monitoring a configured folder:

```
% python3 qna.py ~/papers/
```

2. In Apple Preview, where I'm reading the paper, add a note with some question and tag the bot, for example ```@opus what's the difference between DDR and GDDR?```, save the file after adding a note.

3. In the background, the service will notice the update, load the file and check if there's a new, not answered query for the bot.

4. Construct the message to the bot. If the bot tag was of the form '@botname ', only the question itself will be a part of the message. If the tag was of the form '@botname+ ', the entire document, the selection and the question would be included in the message. Here's prompt construction: 

5. Once the reply arrives, if it is a success, update the same annotation in pdf file with the reply. It sounds a little weird - there's a way to create a new annotation in pdf and make it a 'reply to' the oroginal one, but the rendering of that is pretty off in many pdf viewers (More details in [samples/annotations.md](samples/annotations.md)). The intent here is not only to get the answer right now, but to keep the annotated version of the document and be able to read it in a potentially different environment later.

6. Apple preview will notice that there's a change to the file and display the updated annotation. However, such an update seem to still mess up some internal state and after that adding new highlight was not working occasionally. To work around this, we can force reload the pdf - similar to browser page refresh, which keeps the scroll position. Add this AppleScript to Automator, assign hotkey like Cmd-Shift-R to it in Settings->Keyboard

```
tell application "Preview"
	set theDocument to front document
	set thePath to path of theDocument as POSIX file
	close theDocument
	open thePath
end tell
```

To summarize, once the script is running, what you have to do is something like this:
1. Open your pdf
2. Select a part which you are not very sure about, highlight it and add a note with your question.
3. After the note changes, press Cmd-Shift-R. Save your file.

### odd pdfs

pdfs are pretty wild, so even for ones which has actual text and not scanned images, occasionally I got some for which the library didn't work - either extracting annotation texts or saving new annotations failed. These annotations were still there, as more mature software (Apple's Preview or Acrobat Reader) could read and display them, but fixing pdf libraries was a little bit beyond the scope. 

The workaround for that was to print those odd pdf files to new pdf files using built-in functionality in MacOS.

## TODO

[x] context
	[x] selection
	[x] entire document
[x] openAI integration
[x] better prompt
[ ] pip install
[ ] instructions on how to use
[ ] check other pdf viewers on desktops/iPad/phones. How do they handle annotations?
[ ] configuration
[ ] try on some old pdfs
[ ] monitoring remote files?
[ ] local llama/mistral integration

## useful references

https://github.com/anthropics/anthropic-cookbook/blob/main/misc/pdf_upload_summarization.ipynb

