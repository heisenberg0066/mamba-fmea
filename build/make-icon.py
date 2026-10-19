# Generates build/icon.png (512) and build/icon.ico (16..256) — Mamba FMEA mark: risk grid + flow drop.
from PIL import Image, ImageDraw, ImageFont
S = 1024
im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle([40, 40, S - 40, S - 40], radius=200, fill=(20, 33, 50, 255))
# 3x3 risk matrix (green/amber/red diagonal)
cols = [[(46,160,90),(46,160,90),(230,160,40)],[(46,160,90),(230,160,40),(220,70,50)],[(230,160,40),(220,70,50),(220,70,50)]]
x0, y0, c = 170, 300, 150
for r in range(3):
    for k in range(3):
        d.rounded_rectangle([x0 + k*(c+18), y0 + (2-r)*(c+18), x0 + k*(c+18) + c, y0 + (2-r)*(c+18) + c], radius=26, fill=cols[r][k] + (255,))
# orange "M" band on top
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 230)
d.text((S/2, 175), 'M', font=f, fill=(255, 122, 0, 255), anchor='mm')
# blue droplet (hydraulics)
cx, cy, rr = 790, 760, 120
d.ellipse([cx - rr, cy - rr + 40, cx + rr, cy + rr + 40], fill=(52, 152, 219, 255), outline=(20,33,50,255), width=18)
d.polygon([(cx - rr + 12, cy + 10), (cx, cy - 190), (cx + rr - 12, cy + 10)], fill=(52, 152, 219, 255))
im.resize((512, 512), Image.LANCZOS).save('build/icon.png')
im.save('build/icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
