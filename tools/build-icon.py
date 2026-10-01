"""Rebuild the bundled Windows icon; Pillow is needed only by developers."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
image = Image.new('RGBA', (1024, 1024))
d = ImageDraw.Draw(image)
scale = 4
box = lambda coords: tuple(value * scale for value in coords)
d.rounded_rectangle(box((0, 0, 256, 256)), radius=56*scale, fill='#5145bc')
for points in [[(128,77),(128,102)],[(128,151),(128,171)],[(82,127),(61,127),(61,185),(91,185)],[(171,127),(195,127),(195,185),(165,185)]]:
    d.line([tuple(v*scale for v in point) for point in points], fill='white', width=12*scale, joint='curve')
    for point in points:
        x,y=point;d.ellipse(box((x-6,y-6,x+6,y+6)),fill='white')
d.rounded_rectangle(box((89,38,167,78)),radius=12*scale,fill='white')
d.polygon([tuple(v*scale for v in point) for point in [(128,91),(171,127),(128,163),(85,127)]],fill='#c9c4ff')
for bounds in [(49,170,118,209),(138,170,207,209)]:d.rounded_rectangle(box(bounds),radius=10*scale,fill='white')
image.resize((256,256),Image.Resampling.LANCZOS).save(root/'assets/flow-maker.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
