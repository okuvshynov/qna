# qna

TL;DR - AI pretends to be paper/textbook author, you can ask it questions about the paper as a whole, specifc parts of it right in the pdf viewing app (e.g. Apple Preview) using annotations.

The goal here is to improve on a process of reading a somewhat complicated text, a scientific paper or a textbook. Rather than summarization and understanding high-level conclusions from the paper, we care about reader's understanding of all the details. The idea was to allow to 'chat with paper author', who'd probably be able to explain both the paper itself and some relevant context. From the product point of view, questions and answers should also live right there where the document is, and not in a separate chat window, so they are implemented as PDF annotations.

We look for an ability to ask some questions and get answers about specific pieces of the text. Sometimes that might involve including some context from the paper, and sometimes it would be very generic questions about something reader is not familiar with and paper content would not even be that relevant.

This work was motivated by the following observation - while LLMs are still not that good at creating original and complicated content, they are pretty good at explaining something well known to 'humanity' and not too well known for user personally. They are good tutors.

Currently uses Claude API, but adding OpenAI and local llamas should be possible.

## Examples

TBD

## How it works

Looks like in both acrobat reader and preview top-level comment is annot 'Highlight' (=8) and the replies are of Subtype 'Text' (=0). Preview is not good at showing 'in-reply-to' threads though.
Maybe have 2 different approaches for different viewers?

## limitations/workarounds

1. No 'discussions' which retain context, just pairs of question/answer for now.
2. I tested it with Apple Preview, and while typical pdf annotations are used, different pdf viewers/collaboration tools might have varying levels of support.

### odd pdfs

pdfs are pretty wild, so even for ones which has actual text and not scanned images, occasionally I got some for which the library didn't work - either extracting annotation texts or saving new annotations failed. These annotations were still there, as more mature software (Apple's Preview or Acrobat Reader) could read and display them, but fixing pdf libraries was a little bit beyond the scope. 

The workaround for that was to print those odd pdf files to new pdf files using built-in functionality in MacOS.

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

Now the typical workflow looks like this:
1. Highlight a relevant section of text
2. Add note to the highlight, for example "@sonnet+ why is "

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

