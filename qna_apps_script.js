/*

SERVERLESS
  [ ] configurable folder structure
  [v] try it on ipad -- looks like there's some bug getting quotedFileContent
   [ ] report the bug
   [v] better error handling
   [v] we can still use it without context.
  [ ] estimate the limits
  [ ] openAI integration
  [ ] scope of configiration parameters - should be user rather than script?
  [v] model selection? configurable? Depends on the tag?
  [v] better prompt. Make context inclusion optional.
  [v] test on android phone
  [v] better tagging/case-insensitive.
  [?] notifications/refresh? - unclear how to achieve
  [?] mark comments as resolved rather than having separate property? -- probably not.
    [v] still need to store these 'semi-resolved' comments in a better way - there's a hard limit on property size.
    [v] Simple heuristic: if last comment was made by our bot, that's 'resolved'? How do we know if it was? Make it with prefix 'botname> ' 
  [v] handle whole conversations. Need to transfrom all replies to a conversation like https://docs.anthropic.com/claude/reference/messages_post
  [ ] provide entire file as context?
  [v] test manual comment from two devices.
  [ ] figure out permissions? 
  [ ] How to organize? Create separate google account for your bot. Share the document you want with that account from your personal account. 
      Now we should be able to distinguish comments simply by looking at account. Note that comment/reply thread is arbitrary, while assistant like 
      claude expects a more structured messages stream - user and assistant are supposed to alternate.


SERVER
  [ ] how to make sure we never timeout? Have a two-pass evaluation, where when reply 'arrives' somewhere, we can pick it up later by comment id.
  [ ] use ngrok https://ngrok.com/blog-post/introducing-ngrok-api-gateway
  [ ] local model vs remote model called by proxy

OTHER
  [ ] how to sync source to github? (use clasp?)
*/

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

// claude expects alrernating user/assistant messages. Just squash.
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

function callClaude(messages, model_name) {
  const url = "https://api.anthropic.com/v1/messages";

  const properties = PropertiesService.getScriptProperties();
  const api_key = properties.getProperty("ANTHROPIC_API_KEY");
  if (api_key === undefined || api_key === null) {
    console.error("No ANTHROPIC_API_KEY found in script properties.");
    return null;
  }

  const headers = {
    "x-api-key": api_key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };

  const payload = {
    "model": model_name,
    "max_tokens": 1024,
    "messages": messages.map(m => ({role: m.role, content: m.content}))
  };

  const options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify(payload),
    'headers': headers,
    'muteHttpExceptions': true
  };

  console.info('querying anthropic model %s', model_name);
  try {
    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());
    if (jsonResponse.type == 'error') {
      console.error(jsonResponse);
      return null;
    }
    return jsonResponse.content[0].text;
  } catch (e) {
    console.error(e);
    return null;
  }
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

function getCharIndex(char) {
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 'A'.charCodeAt(0);
  if (char >= 'a' && char <= 'z') return 26 + char.charCodeAt(0) - 'a'.charCodeAt(0);
  if (char >= '0' && char <= '9') return 52 + char.charCodeAt(0) - '0'.charCodeAt(0);
  console.error('Invalid character in input: %s', char);
}

// TODO: figure out if this is documented anywhere
function idSmaller(a, b) {
    const maxLength = Math.max(a.length, b.length);
    a = a.padStart(maxLength, 'A');
    b = b.padStart(maxLength, 'A');

    for (let i = 0; i < maxLength; i++) {
        const index1 = getCharIndex(a[i]);
        const index2 = getCharIndex(b[i]);
        if (index1 < index2) return true;
        if (index1 > index2) return false;
    }
    return false;
}

function processComment(file, comment) {
  const commentId = comment.id;
  const fileId = file.getId();

  // First, transform comment + replies to a list of messages.
  let replies = Drive.Replies.list(fileId, commentId, {fields: 'replies(id,content)'});

  let messages = replies.replies.map(r => {
    const maybeReplyTo = isAssistantReply(r.content);
    if (maybeReplyTo === null) {
      // this is user comment.
      return {"role": "user", "content": r.content, "id": r.id};
    }
    return {"role": "assistant", "content": r.content, "id": r.id, "reply_to": maybeReplyTo};
  });

  messages = [{"role": "user", "content": comment.content, "id": comment.id}, ...messages];

  // now we need to check if any user comment requests assistance. 
  // We take latest instruction as a model we'll use.
  const config = prepareTagConfig();
  const configToUse = messages
    .filter(m => m.role == "user")
    .map(m => { // does modification in place to remove tag prefix.
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

  if (configToUse === undefined) {
    // no assistant requests in the thread
    return;
  }

  // for each assistant message we will have a context appended, 
  // that would be an id of last user message in the thread which was taken into account
  // when producing the output.
  const maxRepliedId = messages
    .filter(m => m.reply_to)
    .reduce((replied_id, m) => (idSmaller(replied_id, m.reply_to) ? m.reply_to : replied_id), '');

  const lastUserCommentId = messages
    .filter(m => m.role == "user")
    .map(m => m.id)
    .pop();

  if (!idSmaller(maxRepliedId, lastUserCommentId)) {
    // replied to everything
    return;
  }

  // check for quoted context in the file. In comments made from iPad app this is always undefined.
  const context = (comment.quotedFileContent === null || comment.quotedFileContent === undefined) ? undefined : comment.quotedFileContent.value;
  if (configToUse.use_context && context === undefined) {
    console.warn('requested prompt with context, but no context was provided');
    configToUse.use_context = false;
  }

  // TODO: better context.
  if (configToUse.use_context) {
    messages[0].content = context + "\n\nPlease answer the question using the paragraph above as extra context, if it is relevant to the question.\n" + messages[0].content;
  }

  // alternation
  const squashed = squashUserCommentsForClaude(messages);

  console.info('asking a question in file %s', file.getName());
  let response = callClaude(squashed, configToUse.model);

  if (response === null) {
    console.error('Error getting the model reply');
    return;
  }

  // adding a signature to the reply:
  response = response + "\nre:" + lastUserCommentId;

  console.info('replying to comment %s with %s', comment.content, response);
  var reply = Drive.Replies.create({
    content: response,
  }, file.getId(), comment.id, {fields: 'id'});
}

function processFiles() {
  // TODO: this must be unique name? Configurable?
  const folderName = "books";
  console.info("Looking for pdf files in folder %s", folderName);

  const folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) {
    console.error("Configured folder name %s not found.", folderName);
    return;
  }
  const folder = folders.next();
  const files = folder.getFilesByType(MimeType.PDF);

  const fields = 'comments(id,content,quotedFileContent)';
  while (files.hasNext()) {
    let file = files.next();
    let comments = Drive.Comments.list(file.getId(), {fields: fields});
    comments.comments.forEach(comment => processComment(file, comment));
  }
}


// test open ai

function callChatGPT() {
  const model_name = "gpt-3.5-turbo";

  const url = "https://api.openai.com/v1/chat/completions";

  const properties = PropertiesService.getScriptProperties();
  const api_key = properties.getProperty("OPENAI_API_KEY");
  if (api_key === undefined || api_key === null) {
    console.error("No OPENAI_API_KEY found in script properties.");
    return null;
  }

  const headers = {
    "Authorization": "Bearer " + api_key,
    "Content-Type": "application/json"
  };

  const payload = {
    "model": model_name,
    "messages": [{"role": "user", "content": "Say this is a test!"}]
  };

  const options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify(payload),
    'headers': headers,
    'muteHttpExceptions': true
  };

  console.info('querying OpenAI model %s', model_name);
  try {
    const response = UrlFetchApp.fetch(url, options);
    const jsonResponse = JSON.parse(response.getContentText());
    console.log(jsonResponse.choices[0].message.content);
    return jsonResponse.choices[0].message.content;
  } catch (e) {
    console.error(e);
    return null;
  }  
}

