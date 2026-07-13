from PIL import Image, ImageDraw, ImageFont
import sys

files = [
    ('普通文本', 'test/qa/task1-mode-plain.png'),
    ('正则模式', 'test/qa/task1-mode-regex.png'),
    ('大小写敏感', 'test/qa/task1-mode-case.png'),
    ('全字匹配', 'test/qa/task1-mode-whole.png'),
]

images = []
max_w = max_h = 0
for label, path in files:
    img = Image.open(path)
    images.append((label, img))
    max_w = max(max_w, img.width)
    max_h = max(max_h, img.height)

margin = 10
label_h = 36
cell_w = max_w + margin * 2
cell_h = max_h + label_h + margin * 2

out = Image.new('RGB', (cell_w * 2, cell_h * 2), (24, 24, 37))
draw = ImageDraw.Draw(out)

try:
    font = ImageFont.truetype('arial.ttf', 20)
except Exception:
    font = ImageFont.load_default()

for idx, (label, img) in enumerate(images):
    col = idx % 2
    row = idx // 2
    x = col * cell_w + margin
    y = row * cell_h + margin
    draw.rectangle([x, y + label_h, x + max_w, y + label_h + max_h], outline=(70, 70, 90), width=2)
    out.paste(img, (x, y + label_h))
    draw.text((x, y), label, fill=(205, 214, 244), font=font)

out.save('test/qa/task1-search.png')
print('saved test/qa/task1-search.png')
