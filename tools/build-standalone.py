from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
def inline(match):
    src = match.group(1).split('?')[0]
    return '<script>' + (root / src).read_text() + '</script>'
html = re.sub(r'<script src="\./([^"]+)"></script>', inline, html)
(root / 'magic_fever_standalone.html').write_text(html)
print('Built magic_fever_standalone.html')
