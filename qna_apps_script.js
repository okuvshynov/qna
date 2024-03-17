/*

SERVERLESS
  [ ] correct folder structure
  [ ] notifications/refresh?
  [+] try it on ipad -- looks like there's some bug getting quotedFileContent
   [ ] report the bug
   [ ] better error handling
  [ ] estimate the limits
  [ ] openAI integration
  [ ] better tagging/case-insensitive.
  [ ] mark comments as resolved rather than having separate property?
  [ ] model selection? configurable? Depends on the tag?
  [ ] better prompt
  [ ] test on android phone


SERVER
  * how to make sure we never timeout? Have a two-pass evaluation, where when reply 'arrives' somewhere, we can pick it up later by comment id.
  * use ngrok https://ngrok.com/blog-post/introducing-ngrok-api-gateway
  * how to provide entire file as context?
  * local model vs remote model called by proxy

OTHER
  * how to sync source to github?
  * tests?
*/

// returns text of the reply or null in case of error.
function callClaude(question, context) {
  var url = "https://api.anthropic.com/v1/messages";
  
  // TODO: make this depend on tag
  var model_name = "claude-3-haiku-20240307";
  // var model_name = "claude-3-opus-20240229";


  var properties = PropertiesService.getScriptProperties();
  var api_key = properties.getProperty("ANTHROPIC_API_KEY");
  if (api_key === undefined || api_key === null) {
    console.error("No ANTHROPIC_API_KEY found in script properties.");
    return null;
  }

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

  console.info('querying anthropic model %s', model_name);
  try {
    var response = UrlFetchApp.fetch(url, options);
    var jsonResponse = JSON.parse(response.getContentText());
    var reply = jsonResponse.content[0].text;
  } catch (e) {
    console.error(e);
    return null;
  }

  return reply;
}

// completedComments is in/out parameter.
function checkDoc(doc_id, completedComments) {
  var fields = 'comments(id,content,quotedFileContent)';
  var prefix = "@QNA";

  var comments = Drive.Comments.list(doc_id, {fields: fields});
  comments.comments.forEach(function(comment) {
    if (completedComments.has(comment.id)) {
      return;
    }
    if (comment.content.startsWith(prefix)) {
      try {
        var question = comment.content.substring(prefix.length);
        // TODO: doesn't seem to work on iPad, quotedFileContent is not set.
        var context = comment.quotedFileContent.value;
      } catch (e) {
        console.error("Unable to extract question and context from the comment");
        return;
      }

      var response = callClaude(question, context);

      if (response === null) {
        console.error('Error getting the model reply');
        return;
      }

      var reply = Drive.Replies.create({
        content: response,
      }, doc_id, comment.id, {fields: 'id'});
      console.info('replying to comment %s', comment.content);
      completedComments.add(comment.id);
    }
  });
}

function getCompletedComments() {
  var properties = PropertiesService.getScriptProperties();
  var completedComments = properties.getProperty("COMPLETED_COMMENTS");
  if (completedComments === null) {
    console.info("Found 0 completed comments");
    return new Set();
  }
  
  var results = completedComments.split(" ");
  console.info('Found %s completed comments', results.length);

  return new Set(results);
}

function saveCompletedComments(comment_ids) {
  var properties = PropertiesService.getScriptProperties();
  var id_string = Array.from(comment_ids).join(' ');
  console.info('Updating completed comment ids');
  properties.setProperty("COMPLETED_COMMENTS", id_string);
}

function checkAllPdfs() {
  // TODO: this must be unique name? Configurable?
  var folderName = "books";
  console.info("Looking for pdf files in folder %s", folderName);

  var folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) {
    console.error("Configured folder name %s not found.", folderName);
    return;
  }
  var folder = folders.next();
  var files = folder.getFilesByType(MimeType.PDF);

  var completedComments = getCompletedComments();

  while (files.hasNext()) {
    var file = files.next();
    checkDoc(file.getId(), completedComments);
  }

  saveCompletedComments(completedComments);
}
