/*

SERVERLESS
  [ ] configurable folder structure
  [v] try it on ipad -- looks like there's some bug getting quotedFileContent
   [ ] report the bug
   [v] better error handling
   [v] we can still use it without context.
  [ ] estimate the limits
  [ ] openAI integration
  [ ] scope of configiration parameters - should be user rather than script.
  [v] model selection? configurable? Depends on the tag?
  [v] better prompt. Make context inclusion optional.
  [v] test on android phone
  [v] better tagging/case-insensitive.
  [?] notifications/refresh? - unclear how to achieve
  [?] mark comments as resolved rather than having separate property? -- probably not.
    [ ] still need to store these 'semi-resolved' comments in a better way - there's a hard limit on property size.
    [ ] Simple heuristic: if last comment was made by our bot, that's 'resolved'? How do we know if it was? Make it with prefix 'botname> ' 
  [ ] handle whole conversations. Need to transfrom all replies to a conversation like https://docs.anthropic.com/claude/reference/messages_post
  [ ] provide entire file as context?


SERVER
  [ ] how to make sure we never timeout? Have a two-pass evaluation, where when reply 'arrives' somewhere, we can pick it up later by comment id.
  [ ] use ngrok https://ngrok.com/blog-post/introducing-ngrok-api-gateway
  [ ] local model vs remote model called by proxy

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


function prepareTagConfig() {
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
      return [];
    }
  }
  return config;
}

function checkComment(file, comment, completedComments) {
  if (completedComments.has(comment.id)) {
    return;
  }

  const config = prepareTagConfig();

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

///////////////////////////////
// experiments below

function squashUserCommentsForClaude(messages) {
  let res = [];
  messages.map(m => ({role: m.role, content: m.content})).forEach(m => {
    if (res.length > 0 && res[res.length - 1].role == m.role) {
      res[res.length - 1].content += '\n' + m.content;
    } else {
      res.push(m);
    }
  });
  return res;
}

function callClaude2(messages, model_name) {
  var url = "https://api.anthropic.com/v1/messages";

  var properties = PropertiesService.getScriptProperties();
  var api_key = properties.getProperty("ANTHROPIC_API_KEY");
  if (api_key === undefined || api_key === null) {
    console.error("No ANTHROPIC_API_KEY found in script properties.");
    return null;
  }

  var headers = {
    "x-api-key": api_key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };

  var payload = {
    "model": model_name,
    "max_tokens": 1024,
    "messages": messages.map(m => ({role: m.role, content: m.content}))
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
    //console.log(response);
    var jsonResponse = JSON.parse(response.getContentText());
    //console.log(jsonResponse);
    if (jsonResponse.type == 'error') {
      console.error(jsonResponse);
      return null;
    }
    var reply = jsonResponse.content[0].text;
  } catch (e) {
    console.error(e);
    return null;
  }

  return reply;
}

// matches re:id at the end.
function isAssistantReply(str) {
  const pattern = /re:([a-zA-Z0-9]+)$/;
  const match = str.match(pattern);

  if (match) {
      return match[1]; // This returns the ID part of the match
  } else {
      return null; // Return null if no match is found
  }
}

function processComment(file, comment) {
  const commentId = comment.id;
  const fileId = file.getId();
  let replies = Drive.Replies.list(fileId, commentId, {fields: 'replies(id,content)'});
  // https://docs.anthropic.com/claude/reference/messages_post
  // we need to convert the message history here to the format API would understand.
  console.log(replies);

  //var fields = 'id,content,quotedFileContent';
  //var comment = Drive.Comments.get(fileId, commentId, {fields: fields});

  /*

  {"role": "user", "content": "Hello there."},
  {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"},
  {"role": "user", "content": "Can you explain LLMs in plain English?"},

  */

  let messages = replies.replies.map(r => {
    const maybeReplyTo = isAssistantReply(r.content);
    if (maybeReplyTo === null) {
      // this is user comment.
      return {"role": "user", "content": r.content, "id": r.id};
    }
    return {"role": "assistant", "content": r.content, "id": r.id, "reply_to": maybeReplyTo};
  });

  messages = [{"role": "user", "content": comment.content, "id": comment.id}, ...messages];

  //console.log(messages);

  // now we need to check if any user comment requests assistance. We take latest instruction as a model we'll use. 
  const config = prepareTagConfig();
  const configToUse = messages
    .filter(m => m.role == "user")
    .map(m => { // does some modification in place.
      const matchingConf = config
        .map(conf => m.content.toLowerCase().startsWith(conf.prefix.toLowerCase()) ? conf : null)
        .filter(conf => conf)
        .pop();
      if (matchingConf !== undefined) {
        m.content = m.content.substring(matchingConf.prefix.length);
      }
      return matchingConf;
    })
    .filter(conf => conf)
    .pop();

  //console.log(configToUse);
  //console.log(messages);


  if (configToUse === undefined) {
    // no assistant requests in the thread
    return;
  }

  const maxRepliedId = messages
    .filter(m => m.reply_to)
    .reduce((replied_id, m) => (m.reply_to > replied_id ? m.reply_to : replied_id), '');

  const lastUserCommentId = messages
    .filter(m => m.role == "user")
    .map(m => m.id)
    .pop();

  if (lastUserCommentId <= maxRepliedId) {
    // replied to everything
    return;
  }

  const context = (comment.quotedFileContent === null || comment.quotedFileContent === undefined) ? undefined : comment.quotedFileContent.value;
  if (configToUse.use_context && context === undefined) {
    console.warn('requested prompt with context, but no context was provided');
    configToUse.use_context = false;
  }

  if (configToUse.use_context) {
    messages[0].content = context + "\n\nPlease answer the question using the paragraph above as extra context, if it is relevant to the question.\n" + messages[0].content;
  }
  
  console.log(messages);

  const squashed = squashUserCommentsForClaude(messages);
  console.log(squashed);

  //console.info('asking a question in file %s', file.getName());
  let response = callClaude2(squashed, configToUse.model);

  if (response === null) {
    console.error('Error getting the model reply');
    return;
  }

  // adding a signature to the reply:
  response = response + "\nre:" + lastUserCommentId;

  console.log(response);

  console.info('replying to comment %s', comment.content);
  var reply = Drive.Replies.create({
    content: response,
  }, file.getId(), comment.id, {fields: 'id'});



  // we need to identify which comments were made by bot, and which by human?
  // we can expect some formatting: 
  // [re:4] bot: ....
  // 4 in this example would be index of the comment reply we saw last? Are comment ids strictly increasing? 
  // the important thing here is to handle race conditions/comment deletion. For example, bot read n comments/replies
  // called remote API and while waiting for the response more replies were created in that thread. If we just look at
  // 'who commented last', we might miss those extra comments and not reply to them. So, we need to somehow encode 
  // the last comment id/index we are replying to. If there are more non-bot comments after the one we reply to, 
  // we should get the conversation and call agent again.

  /*
    We need to be able to parse 'whose message is it.' Let's check what metadata does reply have.
    One option is to store 'how many user messages above was there before the reply?'
    Another option is to rely on id increasing.

    re[<ID>]:

    Or we can just store them in properties for a document. Something like 're[doc_id.reply_id]' => comment_id. 
    Shall we rely on ordering and check 'if there's user comment with ID > max replied to'. 
    No document properties for pdfs?
    Just write them to the reply itself. Something like re:[max_comment_id]

  */
}

function processFiles() {
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

  const fields = 'comments(id,content,quotedFileContent)';
  while (files.hasNext()) {
    var file = files.next();
    var comments = Drive.Comments.list(file.getId(), {fields: fields});
    comments.comments.forEach(comment => processComment(file, comment));
  }
}
