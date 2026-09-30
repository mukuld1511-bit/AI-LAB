import os
import re

def replace_in_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Replace Dr. Devendra Prasad (if not followed by Prasad)
        # Using regex to ensure we don't end up with "Dr. Devendra Prasad Prasad"
        new_content = re.sub(r'Dr\.\s*Devendra(?!\s+Prasad)', 'Dr. Devendra Prasad', content, flags=re.IGNORECASE)
        
        if new_content != content:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {path}")
    except Exception as e:
        pass

for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or 'venv' in root:
        continue
    for file in files:
        if file.endswith(('.md', '.html', '.js', '.ts', '.tsx', '.py')):
            replace_in_file(os.path.join(root, file))

print("Search and replace complete.")
