import glob
import re

# 1. The previous script accidentally changed `content:` to `message:` in `createUserNotification` calls
# (because they look similar to `notifyOwner`). We need to revert that.
# 2. Fix the remaining invokeLLM issues.

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # Revert createUserNotification({ ... message: ... }) back to content:
    # We'll look for createUserNotification calls specifically
    notif_blocks = list(re.finditer(r'createUserNotification\(\s*\{([^}]+)\}\s*\)', content, re.DOTALL))
    for block in reversed(notif_blocks):
        start, end = block.span(1)
        inner = content[start:end]
        inner = re.sub(r'\bmessage\s*:', 'content:', inner)
        content = content[:start] + inner + content[end:]
        
    # Fix tripPlanner.ts message vs content issue
    content = re.sub(r'm\.content', r'm.message', content)
    
    # Fix the remaining choices issues
    content = re.sub(r'(\w+)\.choices\[0\]\.message\.content', r'\1.content', content)
    content = re.sub(r'(\w+)\.?choices\?\.\[0\]\?\.message\?\.content', r'\1?.content', content)
    
    # Also fix some places where it was already partially replaced but left a `.content` instead of `.message.content`
    # Or places where it says `result.content` but the type says `InvokeResult` doesn't have it (wait, InvokeResult DOES have content now)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

ts_files = glob.glob('/home/ubuntu/tourismpay/server/**/*.ts', recursive=True)
for f in ts_files:
    process_file(f)
