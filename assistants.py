from dataclasses import dataclass
import os
import logging
import time

import fewlines.metrics as fm

@dataclass
class AssistantConfig:
    prefix: str
    model: str
    prompt: str
    assistant: str
    needs_embeddings: bool = False

# TODO generate this
assistant_config = [
    AssistantConfig("@sonnet ", "claude-3-sonnet-20240229", prompt="question_v0", assistant='claude'),
    AssistantConfig("@sonnet+ ", "claude-3-sonnet-20240229", prompt="fulltext_v0", assistant='claude'),
    AssistantConfig("@sonnet* ", "claude-3-sonnet-20240229", prompt="selection_v0", assistant='claude'),
    AssistantConfig("@sonnet# ", "claude-3-sonnet-20240229", prompt="pages_v0", assistant='claude', needs_embeddings=True),
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

    # this will mix up both 'success latency' and ''
    start = time.monotonic_ns()
    message = anthropic.Anthropic().messages.create(
        model=config.model,
        max_tokens=1024,
        messages=[
            {"role": "user", "content": question}
        ]
    )
    latency = time.monotonic_ns() - start

    # TODO: log error here
    if message.content is not None:
        logging.info(f'{config.model} query completed. in={message.usage.input_tokens} tokens, out={message.usage.output_tokens} tokens') 
        
        fm.add(f'{config.model}_latency_ms', latency / 1000000.0)
        fm.add(f'{config.model}_in_tokens', message.usage.input_tokens)
        fm.add(f'{config.model}_out_tokens', message.usage.output_tokens)
        
        return message.content[0].text
    return None

endpoints = {}

try:
    import anthropic
    endpoints["claude"] = ask_claude
except ImportError:
    logging.warn(f'claude endpoints require anthropic module. Consider "pip install anthropic"')