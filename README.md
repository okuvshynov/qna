# qna

In progress.

## TODO

[ ] optionally use context/selection
[x] openAI integration
[ ] local llama/mistral integration
[ ] start/restart service
[ ] instructions on how to use
[ ] monitoring remote files?
[ ] configuration
[ ] use entire document as context
[ ] better prompt
[ ] try on some old pdfs
[ ] pip install as service?


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