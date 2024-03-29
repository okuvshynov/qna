from dataclasses import dataclass
import os

import logging
import openai

@dataclass
class AssistantConfig:
    prefix: str
    model: str
    prompt: str
    assistant: str
    needs_embeddings: bool = False

assistant_config = [
    AssistantConfig("@ask ", "claude-3-haiku-20240307", prompt="question_v0", assistant='claude'),
    AssistantConfig("@haiku ", "claude-3-haiku-20240307", prompt="question_v0", assistant='claude'),
    AssistantConfig("@opus ", "claude-3-opus-20240229", prompt="question_v0", assistant='claude'),
    AssistantConfig("@sonnet ", "claude-3-sonnet-20240229", prompt="question_v0", assistant='claude'),
    AssistantConfig("@ask+ ", "claude-3-haiku-20240307", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@haiku+ ", "claude-3-haiku-20240307", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@opus+ ", "claude-3-opus-20240229", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@sonnet+ ", "claude-3-sonnet-20240229", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@ask* ", "claude-3-haiku-20240307", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@haiku* ", "claude-3-haiku-20240307", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@opus* ", "claude-3-opus-20240229", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@sonnet* ", "claude-3-sonnet-20240229", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@ask# ", "claude-3-haiku-20240307", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@haiku# ", "claude-3-haiku-20240307", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@opus# ", "claude-3-opus-20240229", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@sonnet# ", "claude-3-sonnet-20240229", prompt="pages_v0", assistant='claude', needs_embeddings=True),
    AssistantConfig("@gpt35 ", "gpt-3.5-turbo", prompt="question_v0", assistant='openai'),
    AssistantConfig("@gpt35+ ", "gpt-3.5-turbo", prompt="fulltext_v0", assistant='openai'),
    AssistantConfig("@gpt35* ", "gpt-3.5-turbo", prompt="selection_v0", assistant='openai'),
    AssistantConfig("@gpt35# ", "gpt-3.5-turbo", prompt="pages_v0", assistant='openai', needs_embeddings=True),
]

# do config sanity check, prefixes should not be prefixes of each other
def conf_check():
    p = sorted([c.prefix for c in assistant_config])
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        if b.startswith(a):
            return False
    return True
assert(conf_check())

def find_conf(message):
    confs = [c for c in assistant_config if message.startswith(c.prefix)]
    return confs[0] if confs else None

###############################################################################
### Prompt construction
###############################################################################
def format_prompt(params, prompt_name):
    with open(os.path.join("prompts", prompt_name)) as f:
        prompt = f.read()
        for k, v in params:
            prompt = prompt.replace(k, v)
        return prompt

###############################################################################
### Anthropic
###############################################################################
def ask_claude(config: AssistantConfig, question):
    logging.info(f'querying anthropic model {config.model}')
    # TODO do we want to add some sanity check here on message size?
    message = anthropic.Anthropic().messages.create(
        model=config.model,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question}
        ]
    )
    # TODO: log error here
    if message.content is not None:
        logging.info(f'{config.model} query completed. in={message.usage.input_tokens} tokens, out={message.usage.output_tokens} tokens') 
        return message.content[0].text
    return None

###############################################################################
### OpenAI
###############################################################################
def ask_openai(config: AssistantConfig, question):
    logging.info(f'querying open ai model {config.model}')
    client = openai.Client()
    message = client.chat.completions.create(
        model=config.model,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question}
        ]
    )
    if message.choices:
        return message.choices[0].message.content
    return None

endpoints = {}

try:
    import anthropic
    endpoints["claude"] = ask_claude
except ImportError:
    logging.warn(f'claude endpoints require anthropic module. Consider "pip install anthropic"')

try:
    import openai
    endpoints["openai"] = ask_openai
except ImportError:
    logging.warn(f'openai endpoints require openai module. Consider "pip install openai"')