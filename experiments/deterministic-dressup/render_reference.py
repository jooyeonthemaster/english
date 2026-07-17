"""CPU reference renderer for the browser mesh demo (no image synthesis)."""
from __future__ import annotations

import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
W, H = 300, 450

MODELS = [
    ("A", "short-slim", "model-a-slim-short.png", dict(neckY=.236, shoulderY=.255, shoulderL=.343, shoulderR=.657, elbowL=(.205,.314), elbowR=(.795,.314), wristL=(.225,.165), wristR=(.775,.165), waist=(.382,.618,.470), hip=(.356,.644,.553), crotch=.585, kneeL=(.425,.690), kneeR=(.575,.690), ankleL=(.405,.895), ankleR=(.595,.895), arm=.030, thigh=.050, calf=.035)),
    ("B", "tall-lean", "model-b-tall-lean.png", dict(neckY=.190, shoulderY=.212, shoulderL=.354, shoulderR=.646, elbowL=(.191,.286), elbowR=(.809,.286), wristL=(.214,.132), wristR=(.786,.132), waist=(.394,.606,.445), hip=(.372,.628,.520), crotch=.548, kneeL=(.425,.676), kneeR=(.575,.676), ankleL=(.408,.895), ankleR=(.592,.895), arm=.026, thigh=.043, calf=.030)),
    ("C", "athletic", "model-c-athletic.png", dict(neckY=.215, shoulderY=.238, shoulderL=.315, shoulderR=.685, elbowL=(.188,.302), elbowR=(.812,.302), wristL=(.207,.138), wristR=(.793,.138), waist=(.358,.642,.462), hip=(.348,.652,.540), crotch=.572, kneeL=(.405,.695), kneeR=(.595,.695), ankleL=(.380,.900), ankleR=(.620,.900), arm=.042, thigh=.058, calf=.038)),
    ("D", "plus", "model-d-plus.png", dict(neckY=.195, shoulderY=.228, shoulderL=.300, shoulderR=.700, elbowL=(.170,.280), elbowR=(.830,.280), wristL=(.218,.117), wristR=(.782,.117), waist=(.300,.700,.448), hip=(.278,.722,.555), crotch=.588, kneeL=(.390,.697), kneeR=(.610,.697), ankleL=(.360,.900), ankleR=(.640,.900), arm=.052, thigh=.076, calf=.050)),
    ("E", "tall-pear", "model-e-pear.png", dict(neckY=.175, shoulderY=.205, shoulderL=.300, shoulderR=.700, elbowL=(.092,.295), elbowR=(.908,.295), wristL=(.125,.135), wristR=(.875,.135), waist=(.300,.700,.455), hip=(.255,.745,.545), crotch=.580, kneeL=(.390,.700), kneeR=(.610,.700), ankleL=(.360,.930), ankleR=(.640,.930), arm=.045, thigh=.073, calf=.045)),
]
OUTFITS = [
    ("1 navy suit", "outfit-1-navy-suit.png"), ("2 charcoal", "outfit-2-charcoal-mandarin.png"),
    ("3 hoodie", "outfit-3-burgundy-hoodie.png"), ("4 denim", "outfit-4-denim-cargo.png"),
    ("5 bomber", "outfit-5-bomber-chino.png"),
]
S = np.array([[.12,.08],[.13,.245],[.32,.18],[.43,.14],[.57,.14],[.68,.18],[.87,.245],[.88,.08],[.34,.29],[.66,.29],[.36,.48],[.64,.48],[.37,.515],[.50,.57],[.63,.515],[.36,.75],[.46,.75],[.54,.75],[.64,.75],[.35,.94],[.47,.94],[.53,.94],[.65,.94],[.21,.27],[.19,.10],[.79,.27],[.81,.10],[.50,.30],[.50,.48],[.50,.515]], dtype=float)
T = [(0,24,1),(24,23,1),(1,23,2),(23,8,2),(2,8,3),(5,9,25),(5,25,6),(25,26,6),(6,26,7),(3,8,27),(3,27,4),(4,27,9),(4,9,5),(8,10,27),(10,28,27),(27,28,9),(9,28,11),(10,12,28),(12,29,28),(28,29,14),(28,14,11),(12,13,29),(29,13,14),(12,15,13),(15,16,13),(15,19,16),(19,20,16),(13,17,14),(14,17,18),(17,21,18),(18,21,22)]

def pair(center, origin, half):
    c, o = np.array(center), np.array(origin); v = c-o; n = np.linalg.norm(v) or 1
    q = np.array([-v[1], v[0]]) / n * half
    return c-q, c+q

def xsorted(points):
    return sorted(points, key=lambda point: point[0])

def targets(p):
    sl=np.array([p['shoulderL'],p['shoulderY']]); sr=np.array([p['shoulderR'],p['shoulderY']])
    nl=np.array([.46,p['neckY']]); nr=np.array([.54,p['neckY']])
    lw0,lw1=xsorted(pair(p['wristL'],p['elbowL'],p['arm']*.72)); le0,le1=xsorted(pair(p['elbowL'],sl,p['arm']))
    rw1,rw0=xsorted(pair(p['wristR'],p['elbowR'],p['arm']*.72)); re1,re0=xsorted(pair(p['elbowR'],sr,p['arm']))
    al=np.array([sl[0]+.025,p['shoulderY']+.085]); ar=np.array([sr[0]-.025,p['shoulderY']+.085])
    wl=np.array([p['waist'][0],p['waist'][2]]); wr=np.array([p['waist'][1],p['waist'][2]])
    hl=np.array([p['hip'][0],p['hip'][2]]); hr=np.array([p['hip'][1],p['hip'][2]]); c=np.array([.5,p['crotch']])
    lk0,lk1=xsorted(pair(p['kneeL'],c,p['thigh'])); la0,la1=xsorted(pair(p['ankleL'],p['kneeL'],p['calf']))
    rk1,rk0=xsorted(pair(p['kneeR'],c,p['thigh'])); ra1,ra0=xsorted(pair(p['ankleR'],p['kneeR'],p['calf']))
    return np.array([lw0,le0,sl,nl,nr,sr,re0,rw0,al,ar,wl,wr,hl,c,hr,lk0,lk1,rk1,rk0,la0,la1,ra1,ra0,le1,lw1,re1,rw1,[.5,(p['shoulderY']+p['waist'][2])*.5],[.5,p['waist'][2]],[.5,p['hip'][2]]])

def contain(img):
    k=min(W/img.width,H/img.height); size=(round(img.width*k),round(img.height*k)); x=(W-size[0])//2; y=(H-size[1])//2
    layer=Image.new('RGBA',(W,H),(218,221,225,255)); layer.alpha_composite(img.convert('RGBA').resize(size,Image.Resampling.LANCZOS),(x,y))
    return layer,(x,y,k)

def warp_triangle(src, canvas, s, d):
    # PIL expects an inverse map: output destination -> source texture.
    M=np.column_stack([d,np.ones(3)]); cx=np.linalg.solve(M, s[:,0]); cy=np.linalg.solve(M, s[:,1])
    warped=src.transform((W,H),Image.Transform.AFFINE,(*cx,*cy),Image.Resampling.BICUBIC)
    mask=Image.new('L',(W,H)); ImageDraw.Draw(mask).polygon([tuple(x) for x in d],fill=255)
    alpha=np.minimum(np.asarray(warped.getchannel('A')),np.asarray(mask)).astype('uint8')
    warped.putalpha(Image.fromarray(alpha)); canvas.alpha_composite(warped)

def render(model, outfit, mode='mesh'):
    person=Image.open(ROOT/'assets/models'/model[2]); garment=Image.open(ROOT/'assets/outfits'/outfit[1]).convert('RGBA')
    canvas,(x,y,k)=contain(person); d=targets(model[3]); d[:,0]=x+d[:,0]*person.width*k; d[:,1]=y+d[:,1]*person.height*k
    if mode=='rigid':
        box=(int(d[:,0].min()-10),int(d[:,1].min()-8),int(d[:,0].max()+10),int(d[:,1].max()+8))
        g=garment.resize((box[2]-box[0],box[3]-box[1]),Image.Resampling.LANCZOS); canvas.alpha_composite(g,(box[0],box[1])); return canvas, {'flips':0,'stretch':None}
    s=S*np.array([garment.width,garment.height]); ratios=[]; flips=0
    for tri in T:
        st=s[list(tri)]; dt=d[list(tri)]
        sa=np.linalg.det(np.array([st[1]-st[0],st[2]-st[0]]))/2
        da=np.linalg.det(np.array([dt[1]-dt[0],dt[2]-dt[0]]))/2
        flips += int(sa*da<=0); ratios.append(abs(da/sa)); warp_triangle(garment,canvas,st,dt)
    med=float(np.median(ratios)); stretch=max(max(r/med,med/r) for r in ratios)
    return canvas, {'flips':int(flips),'stretch':float(round(stretch,3))}

def sheet(mode):
    cw,ch=W+16,H+54; board=Image.new('RGB',(cw*5,ch*5),(8,11,18)); draw=ImageDraw.Draw(board)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13); small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',11); results=[]
    for row,model in enumerate(MODELS):
        for col,outfit in enumerate(OUTFITS):
            image,m=render(model,outfit,mode); ox=col*cw+8; oy=row*ch+8; board.paste(image.convert('RGB'),(ox,oy))
            draw.text((ox,oy+H+8),f"{model[0]} {model[1]} x {outfit[0]}",fill=(241,245,250),font=font)
            line='single bounding box | unscored baseline' if mode=='rigid' else f"stretch {m['stretch']:.2f}x | flips {m['flips']}"
            color=(154,168,189) if mode=='rigid' else ((111,224,193) if m['flips']==0 and m['stretch']<=2.5 else (255,130,130))
            draw.text((ox,oy+H+27),line,fill=color,font=small); results.append(dict(model=model[0],outfit=outfit[0],**m))
    board.save(OUT/f'contact-sheet-{mode}.jpg',quality=92)
    return results

if __name__ == '__main__':
    report={'mesh':sheet('mesh'),'rigid':sheet('rigid')}
    (OUT/'metrics.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'mesh_failures':int(sum(x['flips']>0 or x['stretch']>2.5 for x in report['mesh'])), 'outputs':[str(OUT/'contact-sheet-mesh.jpg'),str(OUT/'contact-sheet-rigid.jpg')]},indent=2))
