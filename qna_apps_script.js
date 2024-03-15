/*
  TODO: 
  * how to make sure we never timeout? Have a two pass evaluation, where when reply 'arrives' somewhere, we can pick it up later by comment id. Needs local server.
  * making http requests: https://stackoverflow.com/questions/14742350/google-apps-script-make-http-post
    https://developers.google.com/apps-script/reference/url-fetch
  * correct folder structure
  * using properties to setup the API
  * ngrok https://ngrok.com/blog-post/introducing-ngrok-api-gateway
  * local server
  * how to store source on github? 
  * how to provide entire file as context?
  * how to get faster response time?
  * in a way, we can have two versions:
  - serverless - we just call API (say, claude or open ai).

*/

function callClaude(question, context) {
  var url = "https://api.anthropic.com/v1/messages";
  var model_name = "claude-3-haiku-20240307";
  var properties = PropertiesService.getScriptProperties();
  var api_key = properties.getProperty("ANTHROPIC_API_KEY");

  var prompt = context + "\n\nPlease answer this question using above paragraph as context:\n" + question;

  var headers = {
    "x-api-key": api_key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };

  var payload = {
    "model": model_name,
    "max_tokens": 1024,
    "messages": [
        {"role": "user", "content": prompt}
    ]
  };

  var options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify(payload),
    'headers': headers,
    'muteHttpExceptions': true
  };

  Logger.log('querying anthropic API');
  var response = UrlFetchApp.fetch(url, options);
  var jsonResponse = JSON.parse(response.getContentText());
  Logger.log(jsonResponse);

  return jsonResponse.content[0].text
}

function checkDoc(doc_id, completedComments) {
  var fields = 'comments(id,content,quotedFileContent)';
  var prefix = "@QNA";

  var comments = Drive.Comments.list(doc_id, {fields: fields});
  comments.comments.forEach(function(comment) {
    if (completedComments.has(comment.id)) {
      Logger.log('skipping comment ' + comment.id);
      return;
    }
    if (comment.content.startsWith(prefix)) {
      var question = comment.content.substring(prefix.length);
      var context = comment.quotedFileContent.value;
      var response = callClaude(question, context);

      var reply = Drive.Replies.create({
        content: response,
      }, doc_id, comment.id, {fields: 'id'});
      Logger.log('replying to comment ' + comment.content);
      completedComments.add(comment.id);
    }
  });
  Logger.log(completedComments);
}

function getCompletedComments() {
  var properties = PropertiesService.getScriptProperties();
  var completedComments = properties.getProperty("COMPLETED_COMMENTS");
  if (completedComments === null) {
    completedComments = "";
  }
  Logger.log('Completed comment ids: ' + completedComments);
  var results = completedComments.split(" ");

  return new Set(results);
}

function saveCompletedComments(comment_ids) {
  var properties = PropertiesService.getScriptProperties();
  var id_string = Array.from(comment_ids).join(' ');
  Logger.log('Updating completed comment ids: ' + id_string);
  properties.setProperty("COMPLETED_COMMENTS", id_string);
}

function listDocuments() {
  var folderName = "books";
  var folder = DriveApp.getFoldersByName(folderName).next();
  var files = folder.getFilesByType(MimeType.PDF);

  var completedComments = getCompletedComments();

  while (files.hasNext()) {
    var file = files.next();
    Logger.log({
      id: file.getId(),
      name: file.getName()
    });
    checkDoc(file.getId(), completedComments);
  }

  saveCompletedComments(completedComments);
}
