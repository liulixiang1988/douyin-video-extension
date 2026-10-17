"""Generate bundled PNG icons with the standard library; no runtime dependency."""
from pathlib import Path
import struct
import zlib

OUTPUT = Path(__file__).resolve().parents[1] / 'extension' / 'icons'
ARROW = [(58, 27), (70, 27), (70, 63), (82, 51), (90, 59), (64, 85), (38, 59), (46, 51), (58, 63)]

def polygon(x, y):
    inside = False
    previous = ARROW[-1]
    for current in ARROW:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1:
            inside = not inside
        previous = current
    return inside

def pixel(x, y):
    if not (4 <= x <= 124 and 4 <= y <= 124): return (0, 0, 0, 0)
    dx = max(30-x, 0, x-98)
    dy = max(30-y, 0, y-98)
    if dx*dx + dy*dy > 26*26: return (0, 0, 0, 0)
    tray = 34 <= x <= 94 and 96 <= y <= 106 or 34 <= x <= 44 and 85 <= y <= 106 or 84 <= x <= 94 and 85 <= y <= 106
    return (184, 242, 215, 255) if tray or polygon(x,y) else (24, 62, 57, 255)

def chunk(kind, data):
    return struct.pack('>I',len(data)) + kind + data + struct.pack('>I',zlib.crc32(kind+data))

OUTPUT.mkdir(parents=True, exist_ok=True)
for size in (16,32,48,128):
    rows=[]
    for y in range(size):
        row=bytearray([0])
        for x in range(size):
            samples=[pixel((x+(sx+.5)/4)*128/size, (y+(sy+.5)/4)*128/size) for sy in range(4) for sx in range(4)]
            alpha=sum(p[3] for p in samples)
            rgb=[round(sum(p[c]*p[3] for p in samples)/alpha) if alpha else 0 for c in range(3)]
            row.extend([*rgb,round(alpha/16)])
        rows.append(row)
    data=b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,6,0,0,0))
    data+=chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
    (OUTPUT/f'icon{size}.png').write_bytes(data)
print('Generated 16, 32, 48, 128 px icons')
