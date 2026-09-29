import os

def replace_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    content = content.replace('Richa Mam', 'Dr. Richa Choudhary')
    content = content.replace('Richa mam', 'Dr. Richa Choudhary')
    content = content.replace('richa mam', 'Dr. Richa Choudhary')
    
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Replaced in {path}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            replace_in_file(os.path.join(root, file))

print("React app updated")
