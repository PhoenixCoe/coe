import sys, statistics
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
T=0.1902

def run(src, dst, family, full, shift=None, verbose=True, blend=0.0):
    f=TTFont(src); g=f['glyf']; h=f['hmtx']; cm=f.getBestCmap()
    if shift is None:
        ss=[]
        for ch in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789|[]{}':
            n=cm.get(ord(ch))
            if not n: continue
            gl=g[n]
            if not gl.numberOfContours: continue
            gl.recalcBounds(g); adv=h[n][0]
            ss.append(adv/2-(gl.xMin+gl.xMax)/2+T*(gl.yMin+gl.yMax)/2)
        shift=statistics.median(ss)
    if verbose: print(src,'shift',round(shift,1))
    for n in f.getGlyphOrder():
        gl=g[n]
        if gl.isComposite():
            for c in gl.components:
                if c.flags & 0x0008 or c.flags & 0x0040 or c.flags & 0x0080: print('scaled component',n)
                c.x = round(c.x - T*c.y)
            continue
        if not gl.numberOfContours: continue
        co=gl.coordinates
        gl.recalcBounds(g)
        adv=h[n][0]; per=adv/2-(gl.xMin+gl.xMax)/2+T*(gl.yMin+gl.yMax)/2
        sh=shift*(1-blend)+per*blend
        gl.coordinates=GlyphCoordinates([(round(x-T*y+sh), y) for x,y in co])
    for n in f.getGlyphOrder():
        gl=g[n]
        if gl.numberOfContours or gl.isComposite():
            gl.recalcBounds(g)
            h.metrics[n]=(h[n][0], gl.xMin if gl.numberOfContours else h[n][1])
    f['head'].macStyle=0
    f['post'].italicAngle=0
    f['OS/2'].fsSelection &= ~1
    f['head'].flags |= 2
    nm=f['name']
    for r in list(nm.names):
        if r.nameID in (1,16): r.string=family
        elif r.nameID==4: r.string=full
        elif r.nameID==6: r.string=full.replace(' ','')
        elif r.nameID==3: r.string=full.replace(' ','')+';upright'
        elif r.nameID in (2,17): r.string='Regular'
    f.flavor='woff2'
    f.save(dst)
    print('saved',dst)

if __name__=='__main__':
    b=float(sys.argv[1]) if len(sys.argv)>1 else 0.6
    run('/home/claude/coe/public/fonts/CaracteresL4.woff2','/tmp/w/font/CaracteresL4Upright.woff2','Caracteres L4 Upright','Caracteres L4 Upright',blend=b)
    run('/home/claude/coe/public/fonts/PMCSymbolsL4.woff2','/tmp/w/font/PMCSymbolsL4Upright.woff2','PMC Symbols L4 Upright','PMC Symbols L4 Upright',blend=b)
