// expects API key to be exported in ~/.llms
// possible content would look like 
//   export ANTHROPIC_API_KEY="ABCDEFG"
var MODEL_NAME = "claude-3-sonnet-20240229";
var MAX_TOKENS = 1000;
var TEMPERATURE = 0.0;

var app = Application.currentApplication();
app.includeStandardAdditions = true;

// Get clipboard content
var clipboardContent = app.theClipboard();

// Prompt for input
var inputText = app.displayDialog("Please enter your question:", { defaultAnswer: "" }).textReturned;


// Prepare data for the POST request
var prompt = clipboardContent + "\n\n Please explain/answer the following about the above paragraph from paper/book: " + inputText;
var jsonData = JSON.stringify({
    model: MODEL_NAME,
	max_tokens: MAX_TOKENS,
	temperature: TEMPERATURE,
	messages: [
		{
			role: "user",
			content: prompt
		}
	]
});

// Execute curl command to send POST request
var command = `source ~/.llms; curl -s -X POST "https://api.anthropic.com/v1/messages" -H "Content-Type: application/json" -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -d '${jsonData}'`;
var response = app.doShellScript(command);

// Parse the JSON response
try {
    var jsonResponse = JSON.parse(response);
    var extractedValue = JSON.stringify(jsonResponse.content[0].text);
	
    // Display the extracted value in a dialog
    app.displayDialog(`Q: ${inputText}, A: ${extractedValue}`, { withTitle: "Explanation" });
} catch (error) {
    // Handle JSON parsing error or other errors
    app.displayDialog(`Error parsing JSON response: ${error}`, { withTitle: "Error" });
}
