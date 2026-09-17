# 스프라이트 시트(2x2, 투명 배경)를 포즈별 PNG로 자르고 js/sprites.js 메타데이터를 생성
# 사용: python tools/slice_sheets.py   (assets/sheets/<id>_a.png, <id>_b.png 필요)
import os, json, sys
import numpy as np
from PIL import Image
from collections import deque

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEETS=os.path.join(ROOT,'assets','sheets'); OUT=os.path.join(ROOT,'assets','sprites')
POSES={'a':['idle','jab','straight','hook'],'b':['uppercut','hit_head','hit_body','down'],'c':['guard','dazed','tired','win']}
IDS=['kang','ryan','ivan','sato','diego','james','park','eunha']

def components(mask):
    """8-연결 컴포넌트 라벨링 (다운스케일된 마스크용 BFS)"""
    h,w=mask.shape; lab=np.zeros((h,w),np.int32); n=0
    for y in range(h):
        for x in range(w):
            if mask[y,x] and not lab[y,x]:
                n+=1; q=deque([(y,x)]); lab[y,x]=n
                while q:
                    cy,cx=q.popleft()
                    for dy in (-1,0,1):
                        for dx in (-1,0,1):
                            ny,nx=cy+dy,cx+dx
                            if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not lab[ny,nx]:
                                lab[ny,nx]=n; q.append((ny,nx))
    return lab,n

def slice_sheet(path, names):
    im=Image.open(path).convert('RGBA'); a=np.array(im)[:,:,3]
    H,W=a.shape; S=4
    small=(a[::S,::S]>20)
    # 약간 팽창시켜 끊긴 조각(땀방울 등)을 본체에 붙임
    d=small.copy()
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            d|=np.roll(np.roll(small,dy,0),dx,1)
    lab,n=components(d)
    if n==0: return {}
    comps=[]
    for i in range(1,n+1):
        ys,xs=np.where(lab==i); area=len(ys)
        comps.append((area, ys.min()*S, ys.max()*S+S, xs.min()*S, xs.max()*S+S, ys.mean()*S, xs.mean()*S))
    comps.sort(reverse=True)
    # 큰 컴포넌트를 사분면에 배정 (중심 기준), 사분면당 가장 큰 것 + 같은 사분면의 작은 조각 병합
    cells={}
    for area,y0,y1,x0,x1,cy,cx in comps:
        if area < comps[0][0]*0.02: continue
        q=(0 if cy<H/2 else 2)+(0 if cx<W/2 else 1)
        if q in cells:
            c=cells[q]; cells[q]=(min(c[0],y0),max(c[1],y1),min(c[2],x0),max(c[3],x1))
        else: cells[q]=(y0,y1,x0,x1)
    out={}
    for q,name in enumerate(names):
        if q not in cells: print('  !! missing cell',q,name,'in',os.path.basename(path)); continue
        y0,y1,x0,x1=cells[q]
        # 정밀 bbox
        sub=a[y0:y1,x0:x1]; ys,xs=np.where(sub>8)
        if len(ys)==0: continue
        y0b,y1b,x0b,x1b=y0+ys.min(),y0+ys.max()+1,x0+xs.min(),x0+xs.max()+1
        crop=im.crop((x0b,y0b,x1b,y1b))
        out[name]={'w':crop.width,'h':crop.height,'img':crop}
    return out

def main():
    os.makedirs(OUT,exist_ok=True)
    meta={}
    for fid in IDS:
        sheets={k:os.path.join(SHEETS,f'{fid}_{k}.png') for k in 'abc'}
        if not all(os.path.exists(sheets[k]) for k in 'ab'):
            print('skip',fid,'(no sheets)'); continue
        poses={}
        for k,names in POSES.items():
            if os.path.exists(sheets[k]): poses.update(slice_sheet(sheets[k],names))
        if 'idle' not in poses: print('!! no idle for',fid); continue
        d=os.path.join(OUT,fid); os.makedirs(d,exist_ok=True)
        # 기준 높이: idle 포즈 높이. 시트 b는 hit_head 높이로 정규화 (같은 캐릭터라 가정)
        refA=poses['idle']['h']; refB=poses.get('hit_head',poses['idle'])['h']; refC=poses.get('guard',poses['idle'])['h']
        m={}
        for name,p in poses.items():
            ref = refA if name in POSES['a'] else (refB if name in POSES['b'] else refC)
            # 최대 420px 높이로 저장 (용량 절약)
            sc=min(1.0, 420/max(p['h'],1))
            img=p['img'] if sc>=1 else p['img'].resize((max(1,int(p['w']*sc)),max(1,int(p['h']*sc))),Image.LANCZOS)
            img.quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(os.path.join(d,f'{name}.png'),optimize=True)   # 256색 양자화로 용량 절감
            # unit: 이 포즈 이미지의 1px가 캐릭터 표준 키(1.0)의 몇 배인지
            m[name]={'w':img.width,'h':img.height,'unit':1.0/(ref*sc)}
        meta[fid]=m
        print('ok',fid,{k:(v['w'],v['h']) for k,v in m.items()})
    js='// 자동 생성: tools/slice_sheets.py\nconst SPRITE_META='+json.dumps(meta,separators=(',',':'))+';\n'
    open(os.path.join(ROOT,'js','sprites.js'),'w',encoding='utf-8').write(js)
    print('wrote js/sprites.js for',list(meta))

if __name__=='__main__': main()
