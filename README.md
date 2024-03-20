# qna

In progress.

The goal here is to improve on a process of reading a somewhat complicated text (like modern scientific paper). 
Rather than summarization, we care about human understanding of all the details.

We look for an ability to ask some questions and get answers about specific pieces of the text.
Sometimes that might involve including some context from the paper, and sometimes it would be just clarify questions about something I'm not familiar with.

## TODO

[x] context
	[x] selection
	[x] entire document
[x] openAI integration
[ ] better prompt
[ ] pip install/start/restart service
[ ] instructions on how to use
[ ] configuration
[ ] try on some old pdfs
[ ] monitoring remote files?
[ ] local llama/mistral integration

## Refreshing the document in Preview

Add this AppleScript to Automator, assign hotkey like Cmd-Shift-R. 

```
tell application "Preview"
	set theDocument to front document
	set thePath to path of theDocument as POSIX file
	close theDocument
	open thePath
end tell
```

## usefule references

https://github.com/anthropics/anthropic-cookbook/blob/main/misc/pdf_upload_summarization.ipynb

