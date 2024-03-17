/*

SERVERLESS
  [ ] configurable folder structure
  [v] try it on ipad -- looks like there's some bug getting quotedFileContent
   [ ] report the bug
   [v] better error handling
  [ ] estimate the limits
  [ ] openAI integration
  [ ] scope of configiration parameters - should be user rather than script.
  [v] model selection? configurable? Depends on the tag?
  [v] better prompt. Make context inclusion optional.
  [v] test on android phone
  [v] better tagging/case-insensitive.
  [?] notifications/refresh? - unclear how to achieve
  [?] mark comments as resolved rather than having separate property? -- probably not
    [ ] still need to store these 'semi-resolved' comments in a better way - there's a hard limit on property size.
  [ ] handle whole conversations


SERVER
  * how to make sure we never timeout? Have a two-pass evaluation, where when reply 'arrives' somewhere, we can pick it up later by comment id.
  * use ngrok https://ngrok.com/blog-post/introducing-ngrok-api-gateway
  * how to provide entire file as context?
  * local model vs remote model called by proxy

OTHER
  * how to sync source to github? (use clasp?)
  * tests?
*/

// We have a manual way of tracking 'which comments we have already replied to'.
// Marking comments as resolved is not a perfect semantics + resolved comments
// are hidden by default in pdfs, which is not ideal.
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

// returns text of the reply or null in case of error.
function callClaude(question, context, model_name, use_context) {
  var url = "https://api.anthropic.com/v1/messages";

  var properties = PropertiesService.getScriptProperties();
  var api_key = properties.getProperty("ANTHROPIC_API_KEY");
  if (api_key === undefined || api_key === null) {
    console.error("No ANTHROPIC_API_KEY found in script properties.");
    return null;
  }

  if (use_context && context === undefined) {
    console.warn('requested prompt with context, but no context was provided');
    use_context = false;
  }

  if (use_context) {
    var prompt = context + "\n\nPlease answer the question using the paragraph above as extra context, if it is relevant to the question.\n" + question;
  } else {
    var prompt = question;
  } 

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

function checkComment(file, comment, completedComments) {
  if (completedComments.has(comment.id)) {
    return;
  }

  const config = [
    {prefix: '@ask ', model: 'claude-3-haiku-20240307', use_context: false},
    {prefix: '@haiku ', model: 'claude-3-haiku-20240307', use_context: false},
    {prefix: '@opus ', model: 'claude-3-opus-20240229', use_context: false},
    {prefix: '@sonnet ', model: 'claude-3-sonnet-20240229', use_context: false},
    {prefix: '@ask+ ', model: 'claude-3-haiku-20240307', use_context: true},
    {prefix: '@haiku+ ', model: 'claude-3-haiku-20240307', use_context: true},
    {prefix: '@opus+ ', model: 'claude-3-opus-20240229', use_context: true},
    {prefix: '@sonnet+ ', model: 'claude-3-sonnet-20240229', use_context: true},
  ];
  
  // check that no prefix is a prefix of another prefix, otherwise config is ambiguous.
  // TODO: do just once per script run
  const prefixes = config.map(c => c.prefix).sort();
  for (let i = 0; i + 1 < prefixes.length; i++) {
    if (prefixes[i + 1].startsWith(prefixes[i])) {
      console.error('tag -> model configuration is invalid. %s is a prefix of %s.', prefixes[i], prefixes[i + 1]);
      return;
    }
  }

  const lowerCasedComment = comment.content.toLowerCase();
  for (const conf of config) {
    if (lowerCasedComment.startsWith(conf.prefix.toLowerCase())) {
      const question = comment.content.substring(conf.prefix.length);
      const context = (comment.quotedFileContent === null || comment.quotedFileContent === undefined) ? undefined : comment.quotedFileContent.value;

      console.info('asking a question in file %s', file.getName());
      var response = callClaude(question, context, conf.model, conf.use_context);

      if (response === null) {
        console.error('Error getting the model reply');
        return;
      }

      var reply = Drive.Replies.create({
        content: response,
      }, file.getId(), comment.id, {fields: 'id'});
      console.info('replying to comment %s', comment.content);
      completedComments.add(comment.id);
    }
  }
}

// completedComments is in/out parameter.
function checkFile(file, completedComments) {
  var fields = 'comments(id,content,quotedFileContent)';
  var comments = Drive.Comments.list(file.getId(), {fields: fields});
  comments.comments.forEach(comment => checkComment(file, comment, completedComments));
}


function checkAll() {
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
    checkFile(file, completedComments);
  }

  saveCompletedComments(completedComments);
}
