import os
import glob
import re

# 1. Fix invokeLLM response shape (OpenAI SDK returns chat completion objects directly,
# but our wrapper returns { content, role, model } instead of { choices: [...] })
# 2. Fix notifyOwner payload shape ('content' -> 'message')

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Fix invokeLLM response parsing: result.choices[0].message.content -> result.content
    content = re.sub(r'(\w+)\.choices\[0\]\.message\.content', r'\1.content', content)
    # Fix optional chaining version
    content = re.sub(r'(\w+)\.?choices\?\.\[0\]\?\.message\?\.content', r'\1?.content', content)
    
    # Fix notifyOwner payload: { title: "...", content: "..." } -> { title: "...", message: "..." }
    # This is a bit tricky with regex, we'll do a simple string replace for the common pattern
    # Find notifyOwner calls and replace 'content:' with 'message:' inside them
    
    notify_blocks = list(re.finditer(r'notifyOwner\(\s*\{([^}]+)\}\s*\)', content, re.DOTALL))
    
    for block in reversed(notify_blocks):
        start, end = block.span(1)
        inner = content[start:end]
        # Replace 'content:' with 'message:' but only if it's a key
        inner = re.sub(r'\bcontent\s*:', 'message:', inner)
        content = content[:start] + inner + content[end:]
        
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

# Find all TS files
ts_files = glob.glob('/home/ubuntu/tourismpay/server/**/*.ts', recursive=True)
for f in ts_files:
    process_file(f)
