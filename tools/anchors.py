# 각 스프라이트의 발 앵커(ax: 발 중심 x, 이미지 px)와 글러브 끝(tip)을 계산해 js/sprites.js 에 추가
import os, re, json
import numpy as np
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p=os.path.join(ROOT,'js','sprites.js'); s=open(p,encoding='utf-8').read()
meta=json.loads(re.search(r'SPRITE_META=(\{.*?\});',s).group(1))
ref=json.loads(re.search(r'REF_META=(\{.*?\});',s).group(1)) if 'REF_META' in s else {}
if not ref:
    for k in ['ref_idle','ref_count']:
        rp=os.path.join(ROOT,'assets','sprites',f'{k}.png')
        if os.path.exists(rp): im=Image.open(rp); ref[k]={'w':im.width,'h':im.height}
# 머리 위치 추정용 밴드(이미지 높이 비율): 머리 위에 글러브/팔이 오는 포즈는 아래에서 시작
HEAD_BAND={'hit_body':0.04,'win':0.15}
# 머리 탐색 열 범위 (발 앵커 기준, 높이 비율): 팔이 머리 위/옆에 있는 포즈용
HEAD_COLS={'uppercut':(-0.5,0.1),'win':(0.04,0.3),'tired':(0.15,0.8),'hook':(-0.5,0.12)}
for fid,poses in meta.items():
    for pose,m in poses.items():
        a=np.array(Image.open(os.path.join(ROOT,'assets','sprites',fid,f'{pose}.png')).convert('RGBA'))[:,:,3]
        h,w=a.shape
        if pose=='down':
            ys,xs=np.where(a>8); m['ax']=round(float(xs.mean()),1)
        else:
            # 발: 아래쪽 8% 영역의 알파 픽셀 평균 x
            band=a[int(h*0.92):,:]; ys,xs=np.where(band>8)
            m['ax']=round(float(xs.mean()),1) if len(xs) else w/2
            # 발 접지점: 아래 5% 밴드의 알파 열 범위를 두 덩어리로 나눠 각 중심 (한 덩어리면 양끝)
            fb=a[int(h*0.95):,:]; cols=np.where(fb.max(axis=0)>8)[0]
            if len(cols):
                gaps=np.where(np.diff(cols)>6)[0]
                if len(gaps): m['fl']=round(float(cols[:gaps[0]+1].mean()),1); m['fr']=round(float(cols[gaps[-1]+1:].mean()),1)
                else: m['fl']=round(float(cols[0]+ (cols[-1]-cols[0])*0.2),1); m['fr']=round(float(cols[0]+(cols[-1]-cols[0])*0.8),1)
        m['tip']=round(w-m['ax'],1)     # 앞쪽(오른쪽) 끝까지 거리 = 글러브 끝
        # 머리 중심(hx,hy)·반지름(hr): 밴드 안에서 가장 위 알파 행을 정수리로 보고 그 아래를 머리로 간주
        if pose!='down':
            y0=int(h*HEAD_BAND.get(pose,0.0))
            c0,c1=HEAD_COLS.get(pose,(-9,9)); x0=max(0,int(m['ax']+c0*h)); x1=min(w,int(m['ax']+c1*h))
            band=a[y0:,x0:x1]; rows=np.where(band.max(axis=1)>8)[0]
            top=y0+int(rows[0]) if len(rows) else 0
            crown=a[top:top+int(h*0.07),x0:x1]; ys,xs=np.where(crown>8)
            m['hx']=round(x0+float(xs.mean()),1) if len(xs) else round(w/2,1); m['hy']=round(top+h*({'win':0.05}.get(pose,0.12)),1); m['hr']=round(h*0.135,1)
open(p,'w',encoding='utf-8').write('// 자동 생성: tools/slice_sheets.py + tools/anchors.py\nconst SPRITE_META='+json.dumps(meta,separators=(',',':'))+';\nconst REF_META='+json.dumps(ref,separators=(',',':'))+';\n')
for fid in meta: print(fid, {k:(v['w'],round(v['ax']),round(v['tip']*v['unit']*215)) for k,v in meta[fid].items() if k in('idle','jab','straight','hook','uppercut')})
