# qna

TL;DR - AI pretends to be paper/textbook author, you can ask it questions about the paper as a whole, specifc parts of it right in the pdf viewing app (e.g. Apple Preview) using annotations/comments.

The goal here is to improve on a process of reading a somewhat complicated text, like a scientific paper or a textbook. Rather than summarization, we care about reader's understanding of all the details. The vision was to allow to 'chat with paper author', who'd probably be able to explain both the paper itself and some relevant context. From the product point of view, questions and answers should also live right there where the document is, and not in a separate chat window, so they are implemented as PDF annotations.

We look for an ability to ask some questions and get answers about specific pieces of the text. Sometimes that might involve including some context from the paper, and sometimes it would be very generic questions about something reader is not familiar with and paper content would not even be that relevant.

This work was motivated by the following observation - while LLMs are still not that good at creating original and complicated content, they are very good at summarizing and explaining something known well to 'humanity' and not too well for user personally. They are good tutors.

Currently uses Claude API, but adding OpenAI and local llamas should be possible.

## Examples

TBD

## limitations

### old pdfs

pdfs are pretty wild, so even for ones which has actual text, occasionally I got some for which the library didn't work - either extracting annotation texts or saving new annotations. These annotations were still there, as more mature software (Apple's Preview or Acrobat Reader) could read and display them, but fixing pdf libraries was a little bit beyond the scope. 

The workaround for that was to print those old pdf files to new pdf files using built-in functionality in MacOS.

### Refreshing the document in Preview

While Preview can handle external updates of the file, updating annotaion still supposedly messes up Preview's internal state and I could not add new annotation sometimes. The workaround here was to refresh the document. Preview didn't have a hotkey for that, so we can do the following: 

Add this AppleScript to Automator, assign hotkey like Cmd-Shift-R to it in Settings->Keyboard

```
tell application "Preview"
	set theDocument to front document
	set thePath to path of theDocument as POSIX file
	close theDocument
	open thePath
end tell
```

## TODO

[x] context
	[x] selection
	[x] entire document
[x] openAI integration
[x] better prompt
[ ] pip install/start/restart service
[ ] instructions on how to use
[ ] configuration
[ ] try on some old pdfs
[ ] monitoring remote files?
[ ] local llama/mistral integration

## useful references

https://github.com/anthropics/anthropic-cookbook/blob/main/misc/pdf_upload_summarization.ipynb

