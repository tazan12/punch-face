'use strict';
// ───────────────────────── 그리기 유틸 ─────────────────────────
function shade(hex, amt){
  const n=parseInt(hex.slice(1).length===3 ? hex.slice(1).split('').map(c=>c+c).join('') : hex.slice(1),16);
  const r=clamp((n>>16)+amt,0,255), g=clamp(((n>>8)&255)+amt,0,255), b=clamp((n&255)+amt,0,255);
  return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}
function circle(ctx,x,y,r,fill,stroke,lw){
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=lw||2; ctx.stroke(); }
}
function ellipse(ctx,x,y,rx,ry,fill,stroke,lw){
  ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=lw||2; ctx.stroke(); }
}
function rrect(ctx,x,y,w,h,r,fill,stroke,lw){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=lw||2; ctx.stroke(); }
}
function line(ctx,x1,y1,x2,y2,color,w){
  ctx.strokeStyle=color; ctx.lineWidth=w; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
}
function star(ctx,x,y,r,color,rot){
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot||0); ctx.beginPath();
  for(let i=0;i<10;i++){ const rr=i%2?r*0.45:r, a=i*Math.PI/5-Math.PI/2; ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr); }
  ctx.closePath(); ctx.fillStyle=color; ctx.fill(); ctx.strokeStyle='#7a4a00'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
}
// 만화풍 폭발(스타버스트) 도형
function burst(ctx,x,y,r,fill,stroke,n=12,rot=0){
  ctx.save(); ctx.translate(x,y); ctx.rotate(rot); ctx.beginPath();
  for(let i=0;i<n*2;i++){ const rr=i%2?r*0.55:r, a=i/(n*2)*Math.PI*2; ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr); }
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill(); if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=3; ctx.stroke(); } ctx.restore();
}

// ───────────────────────── 관중 · 링 ─────────────────────────
const FLASHES=[]; for(let i=0;i<40;i++) FLASHES.push({x:Math.random(),y:Math.random()*0.6,ph:Math.random()*100,sp:0.6+Math.random()*1.5});
function drawCrowdPhoto(ctx,img,t,level){
  const excite=clamp((level-0.3)/1,0,1);
  const sway=Math.sin(t*0.05)*(1.5+excite*3), bob=Math.sin(t*0.09)*(1+excite*2.5);
  const sc=1.02+excite*0.02;
  const dw=W*sc, dh=dw*img.height/img.width;
  const dy=(FLOOR_Y-128)-dh*0.78+bob, dx=(W-dw)/2+sway;
  ctx.drawImage(img,dx,dy,dw,dh);
  for(const f of FLASHES){
    const k=(t*0.02*f.sp+f.ph)%1, rate=0.12+excite*0.5;
    if(k>rate) continue;
    const a=(1-k/rate), x=dx+f.x*dw, y=dy+f.y*dh*0.7;
    const r=ctx.createRadialGradient(x,y,0,x,y,8+a*14); r.addColorStop(0,`rgba(255,255,255,${0.9*a})`); r.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=r; ctx.fillRect(x-24,y-24,48,48);
  }
  const v=ctx.createLinearGradient(0,0,0,FLOOR_Y-120); v.addColorStop(0,'rgba(5,6,15,0.55)'); v.addColorStop(0.5,'rgba(5,6,15,0.05)'); v.addColorStop(1,'rgba(5,6,15,0.35)');
  ctx.fillStyle=v; ctx.fillRect(0,0,W,FLOOR_Y-120);
}
function drawRing(ctx, t, crowdImg, crowdLevel){
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0b0d1a'); g.addColorStop(1,'#1b1f33');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  if(crowdImg) drawCrowdPhoto(ctx,crowdImg,t,crowdLevel||0.3);
  else { ctx.save(); ctx.globalAlpha=0.12; for(const lx of [200,480,760]){ const lg=ctx.createRadialGradient(lx,-40,10,lx,-40,520); lg.addColorStop(0,'#fff7d6'); lg.addColorStop(1,'rgba(255,247,214,0)'); ctx.fillStyle=lg; ctx.fillRect(0,0,W,H); } ctx.restore(); }
  drawRingFloor(ctx);
}
function drawRingFloor(ctx){
  // 캔버스 바닥: 선수 발 아래로도 넓게 이어져 '무대 위에 서 있는' 깊이감
  ctx.fillStyle='#2b3350'; ctx.fillRect(0,FLOOR_Y-140,W,H-FLOOR_Y+140);
  const fg=ctx.createLinearGradient(0,FLOOR_Y-140,0,H); fg.addColorStop(0,'#c3c6cf'); fg.addColorStop(0.55,'#e6e8ee'); fg.addColorStop(1,'#f4f5f8');
  ctx.fillStyle=fg; ctx.fillRect(RING_L-50,FLOOR_Y-140,RING_R-RING_L+100,H-FLOOR_Y+140);
  const sp=ctx.createRadialGradient(W/2,FLOOR_Y,40,W/2,FLOOR_Y,560); sp.addColorStop(0,'rgba(255,255,255,0.35)'); sp.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=sp; ctx.fillRect(RING_L-50,FLOOR_Y-140,RING_R-RING_L+100,H-FLOOR_Y+140);
  // 바닥 원근선 (아주 옅게)
  ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.lineWidth=1;
  for(let i=0;i<6;i++){ const y=FLOOR_Y-130+i*(H-FLOOR_Y+130)/6*1.0; ctx.beginPath(); ctx.moveTo(RING_L-50,y); ctx.lineTo(RING_R+50,y); ctx.stroke(); }
  ctx.fillStyle='rgba(200,16,46,0.12)'; ctx.fillRect(RING_L-50,H-16,RING_R-RING_L+100,6);
  ctx.save(); ctx.globalAlpha=0.18; ctx.font='900 60px Impact, "Arial Black", sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#c8102e';
  ctx.fillText('PUNCH FACE', W/2, FLOOR_Y-30); ctx.restore();
  const postL=RING_L-40, postR=RING_R+40;
  for(const [x,c] of [[postL,'#c8102e'],[postR,'#1e40af']]){ ctx.fillStyle='#d1d5db'; ctx.fillRect(x-6,FLOOR_Y-330,12,340); rrect(ctx,x-14,FLOOR_Y-300,28,120,8,c); }
  for(let i=0;i<3;i++){
    const y=FLOOR_Y-290+i*55; ctx.strokeStyle=i===1?'#f3f4f6':'#c8102e'; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(postL,y); ctx.quadraticCurveTo(W/2,y+10,postR,y); ctx.stroke();
  }
  ctx.strokeStyle='rgba(30,64,175,0.5)'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(postL,H-8); ctx.quadraticCurveTo(W/2,H-2,postR,H-8); ctx.stroke();
}
// 레퍼리 (링 뒤쪽, 카운트 시 팔 든 포즈)
function drawRefereeSprite(ctx,ref,t,imgs,count){
  const im=imgs['ref_'+ref.pose]||imgs.ref_idle; if(!im) return;
  const h=192, w=im.width*h/im.height, x=ref.x;
  const walking=ref.pose==='walk'||ref.pose==='idle'&&ref.moving;
  const bob=walking?Math.abs(Math.sin(ref.walkT))*4:Math.sin(t*0.06)*1.5, y=FLOOR_Y-64;
  let sc=1; if(ref.pose==='count'){ sc=1+0.05*Math.max(0,Math.sin(ref.pulse*Math.PI)); }
  ctx.save(); ctx.globalAlpha=0.95;
  ellipse(ctx,x,y+2,w*0.35,5,'rgba(0,0,0,0.25)');
  ctx.translate(x,y+bob); if(ref.dir<0) ctx.scale(-1,1); ctx.scale(sc,sc); ctx.rotate(ref.pose==='check'?0.03*Math.sin(t*0.2):0);
  ctx.drawImage(im,-w/2,-h,w,h);
  ctx.restore();
  if(ref.pose==='count' && count>0){
    ctx.font='900 64px Impact, "Arial Black", sans-serif'; ctx.textAlign='center'; ctx.lineWidth=8; ctx.strokeStyle='#000'; ctx.fillStyle='#fde047';
    const ps=1+0.35*Math.max(0,1-ref.pulse);
    ctx.save(); ctx.translate(x+48,y-h-8+bob); ctx.scale(ps,ps); ctx.strokeText(count,0,0); ctx.fillText(count,0,0); ctx.restore();
  }
}

// ───────────────────────── 스프라이트 렌더링 ─────────────────────────
const SPRITE_STD_H = 215;   // 표준 키(px). look.height 배율 적용
// 틴트용 오프스크린 캔버스 (source-atop을 배경 위에서 쓰면 사각형이 생기므로 여기서 처리)
const TINT = { c: (typeof document!=='undefined') ? document.createElement('canvas') : null };
const REFL = { c: (typeof document!=='undefined') ? document.createElement('canvas') : null };
// 바닥 반사용: 스프라이트 아래쪽을 뒤집어 짧게 늘이고 아래로 갈수록 투명하게
function reflectionImage(img){
  const c=REFL.c; if(!c) return null;
  const rh=Math.max(1,Math.round(img.height*0.34));
  if(c.width!==img.width||c.height!==rh){ c.width=img.width; c.height=rh; }
  const g=c.getContext('2d'); g.clearRect(0,0,c.width,c.height);
  g.save(); g.globalCompositeOperation='source-over'; g.translate(0,rh); g.scale(1,-rh/img.height*1.0); g.drawImage(img,0,0); g.restore();
  g.globalCompositeOperation='destination-in';
  const grd=g.createLinearGradient(0,0,0,rh); grd.addColorStop(0,'rgba(0,0,0,0.55)'); grd.addColorStop(0.6,'rgba(0,0,0,0.12)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,c.width,rh); g.globalCompositeOperation='source-over';
  return c;
}
function tintedImage(img, color, y0=0, y1=1){
  const c=TINT.c; if(!c) return img;
  if(c.width!==img.width||c.height!==img.height){ c.width=img.width; c.height=img.height; }
  const g=c.getContext('2d'); g.clearRect(0,0,c.width,c.height);
  g.globalCompositeOperation='source-over'; g.drawImage(img,0,0);
  g.globalCompositeOperation='source-atop'; g.fillStyle=color; g.fillRect(0,c.height*y0,c.width,c.height*(y1-y0));
  g.globalCompositeOperation='source-over';
  return c;
}
function spritePose(f){
  switch(f.state){
    case 'punch': { const p=f.punch, id=p.id;
      const key = id==='jab'?'jab':id==='straight'?'straight':id==='uppercut'?'uppercut':'hook';
      if(p.phase==='windup') return 'idle';
      if(p.phase==='recover' && p.t>p.recover*0.55) return 'idle';
      return key; }
    case 'hit': return f.hitTarget==='body'?'hit_body':'hit_head';
    case 'down': case 'ko': return 'down';
    case 'getup': return f.stateT<GETUP_FRAMES*0.45?'down':'dazed';
    case 'win': return 'win';
    case 'lose': return 'tired';
    case 'rest': return 'tired';
    case 'slip': return 'idle';
  }
  if(f.dazed>0) return 'dazed';
  if(f.guard) return 'guard';
  if(f.stam<25) return 'tired';
  return 'idle';
}
// 잔상 여부: 스킬 러시 중이거나 강한 펀치가 나가는 순간
function wantTrail(f){
  if(f.skill && f.skill.type==='rush') return 'skill';
  if(f.state==='punch' && f.punch.phase!=='windup' && f.punch.def.dmg>=13) return 'punch';
  if(f.state==='slip') return 'slip';
  return null;
}
function drawFighterSprite(ctx,f,set){
  const L=f.def.look, pose=spritePose(f), sp=set[pose]||set.idle; if(!sp||!sp.img) return false;
  const t=f.t, s=f.state;
  const sc=SPRITE_STD_H*L.height*sp.meta.unit;
  const w=sp.meta.w*sc, h=sp.meta.h*sc, ax=(sp.meta.ax!==undefined?sp.meta.ax:sp.meta.w/2)*sc;
  // 접지: 부드러운 큰 그림자 + 발 밑 진한 접촉 그림자 + 바닥 반사
  const GY=FLOOR_Y+8;
  ctx.save(); ctx.translate(f.x,GY);
  { const sw=pose==='down'?w*0.5:Math.max(46,w*0.3), cx=pose==='down'?(w/2-ax)*f.facing:0;
    const sg=ctx.createRadialGradient(cx,0,2,cx,0,sw); sg.addColorStop(0,'rgba(0,0,0,0.30)'); sg.addColorStop(0.6,'rgba(0,0,0,0.12)'); sg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save(); ctx.scale(1,0.2); ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(cx,0,sw,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  if(pose!=='down' && sp.meta.fl!==undefined){
    for(const fx of [sp.meta.fl,sp.meta.fr]){ const lx=(fx-sp.meta.ax)*sc*f.facing; ellipse(ctx,lx,1,20,5,'rgba(0,0,0,0.38)'); }
  }
  ctx.restore();
  if(pose!=='down'){ const rf=reflectionImage(sp.img); if(rf){ ctx.save(); ctx.translate(f.x,GY); ctx.scale(f.facing,1); ctx.globalAlpha=0.28; ctx.globalCompositeOperation='multiply'; ctx.drawImage(rf,-ax,2,w,h*0.34); ctx.restore(); } }

  // 상태별 변형
  let rot=0, sx=1, sy=1+Math.sin(t*0.08)*0.006, dx=0, dy=0;
  if(f.squash>0.01){ sx*=1-f.squash*0.18; sy*=1+f.squash*0.08; dx-=f.squash*10; }
  if(s==='punch'){
    const p=f.punch;
    if(p.phase==='windup'){ const k=p.t/p.windup; rot=-0.12*k; dx-=8*k; }
    else if(pose!=='idle'){ dx+=6; if(p.target==='body'){ rot=0.26; dy+=6; } if(p.id==='uppercut') dy-=4; }
  }
  if(f.duck && s!=='punch'){ sy*=0.84; sx*=1.05; }
  if(f.guardLow && s!=='punch'){ sy*=0.9; }
  if(s==='slip'){ const k=Math.min(1,f.stateT/8)*(1-Math.max(0,(f.stateT-16)/10)); rot=-0.28*k; dx-=18*k; }
  if(pose==='dazed'){ rot+=Math.sin(t*0.22)*0.07; dx+=Math.sin(t*0.13)*4; }
  if(pose==='tired'){ sy*=1+Math.sin(t*0.25)*0.015; }
  if(f.evadeT>0){ const k=Math.sin(f.evadeT/12*Math.PI); rot-=0.22*k; dx-=14*k; }
  if(s==='hit'){ const k=f.hitstun/Math.max(1,f.hitstunMax); if(f.hitTarget==='head'){ rot=-0.18*k*(f.hitArc==='upper'?-0.6:1); dx-=6*k; }
    const age=f.hitstunMax-f.hitstun; if(age<4){ const hs=(f.hitScale||1.05); sx*=hs; sy*=hs; rot+=rand(-0.03,0.03); } }
  if(f.hitFlash>0) f.hitFlash--;
  if(s==='win'){ dy-=Math.abs(Math.sin(t*0.2))*22; rot=Math.sin(t*0.2)*0.05; }
  if(s==='walk'){ rot+=Math.sin(f.walkT*2)*0.02; sy*=1+Math.abs(Math.sin(f.walkT*2))*0.012; }

  // 잔상(애프터이미지)
  const trailKind=wantTrail(f);
  if(!f.trail) f.trail=[];
  if(trailKind){ f.trail.push({img:sp.img,x:f.x,facing:f.facing,w,h,ax,rot,dx,dy,sx,sy,kind:trailKind,life:trailKind==='skill'?14:8,t:0}); if(f.trail.length>7) f.trail.shift(); }
  for(let i=f.trail.length-1;i>=0;i--){ const tr=f.trail[i]; tr.t++; if(tr.t>=tr.life){ f.trail.splice(i,1); continue; }
    const a=(1-tr.t/tr.life)*(tr.kind==='skill'?0.45:0.3);
    ctx.save(); ctx.translate(tr.x,GY); ctx.scale(tr.facing,1); ctx.rotate(tr.rot); ctx.translate(tr.dx,tr.dy); ctx.scale(tr.sx,tr.sy); ctx.globalAlpha=a;
    const img = tr.kind==='skill' ? tintedImage(tr.img,'rgba(167,139,250,0.7)') : (tr.kind==='slip' ? tintedImage(tr.img,'rgba(34,211,238,0.6)') : tr.img);
    ctx.drawImage(img,-tr.ax,-tr.h,tr.w,tr.h); ctx.restore(); }

  // 본체
  ctx.save(); ctx.translate(f.x,GY); ctx.scale(f.facing,1);
  if(f.flash>0 && f.skillArmor){ ctx.globalAlpha=0.55+0.45*Math.abs(Math.sin(t*1.2)); }
  if(f.skill && f.skill.type==='counter'){ ctx.shadowColor='#22d3ee'; ctx.shadowBlur=18; }
  if(f.skill && f.skill.type==='iron'){ ctx.shadowColor='#cbd5e1'; ctx.shadowBlur=22; }
  if(f.skill && f.skill.type==='rush'){ ctx.shadowColor='#a78bfa'; ctx.shadowBlur=14; }
  ctx.rotate(rot); ctx.translate(dx,dy); ctx.scale(sx,sy);
  let img=sp.img;
  if(f.hitFlash>0) img=tintedImage(sp.img,`rgba(255,255,255,${0.45+0.15*f.hitFlash})`);
  else if(f.body>30 && pose!=='down') img=tintedImage(sp.img,`rgba(255,40,40,${Math.min(0.3,(f.body-30)/250)})`,0.36,0.66);
  ctx.drawImage(img,-ax,-h,w,h);
  ctx.restore();

  // 오버레이: 별 · 땀
  const hx=f.x+f.facing*10, hy=FLOOR_Y-h*0.85;
  if((s==='idle'||s==='walk'||s==='guard') && f.dazed>0){ for(let i=0;i<3;i++){ const a=t*0.09+i*Math.PI*2/3; star(ctx,hx+Math.cos(a)*30,hy-30+Math.sin(a)*9,7,'#fde047',a); } }
  if(f.stam<25 && s!=='down' && s!=='ko'){ const ph=(t*0.12)%3; ellipse(ctx,hx+f.facing*-26,hy-20+ph*14,3,5,'#7dd3fc','#0ea5e9',1); }
  return true;
}

// ───────────────────────── 만화 연출: 집중선 · 팝업 · 파티클 ─────────────────────────
function drawSpeedLines(ctx,cx,cy,k,color='rgba(255,255,255,0.75)'){
  ctx.save(); ctx.strokeStyle=color; ctx.lineCap='round';
  const n=36; for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+Math.sin(i*7.3)*0.1, r0=140+Math.sin(i*3.1)*40, r1=720;
    ctx.lineWidth=(1+(i%3))*k; ctx.globalAlpha=0.5*k;
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0); ctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1); ctx.stroke();
  }
  ctx.restore();
}
function drawPopup(ctx,p){
  const k=p.t/p.life;
  const sc = p.t<6 ? 0.4+ (p.t/6)*0.9 : 1.3 - k*0.25;
  ctx.save(); ctx.translate(p.x,p.y-k*30); ctx.rotate(p.rot); ctx.scale(sc,sc);
  ctx.globalAlpha = k>0.75 ? (1-k)/0.25 : 1;
  ctx.font=`900 ${p.size}px Impact, "Arial Black", "Malgun Gothic", sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
  if(p.burst){ burst(ctx,0,0,p.size*(p.text.length*0.22+0.6),p.burst,'#000',14,p.t*0.02); }
  ctx.lineWidth=p.size*0.18; ctx.strokeStyle='#000'; ctx.strokeText(p.text,0,0);
  ctx.fillStyle=p.color; ctx.fillText(p.text,0,0);
  ctx.restore();
}
function drawParticle(ctx,q){
  const k=q.t/q.life; ctx.save(); ctx.globalAlpha=1-k;
  if(q.type==='sweat') ellipse(ctx,q.x,q.y,3,5,'#7dd3fc');
  else if(q.type==='star') star(ctx,q.x,q.y,7,'#fde047',q.t*0.2);
  else if(q.type==='tooth') { ctx.translate(q.x,q.y); ctx.rotate(q.t*0.3); rrect(ctx,-3,-4,6,8,2,'#fff','#999',1); }
  else if(q.type==='spark') circle(ctx,q.x,q.y,4*(1-k)+1,'#fff');
  else if(q.type==='dust') circle(ctx,q.x,q.y,6+k*10,'rgba(200,200,210,0.5)');
  else if(q.type==='ring'){ ctx.strokeStyle=q.big?'rgba(253,224,71,'+(1-k)+')':'rgba(255,255,255,'+(1-k)+')'; ctx.lineWidth=(q.big?6:3)*(1-k)+1; ctx.beginPath(); ctx.arc(q.x,q.y,(q.big?18:10)+k*(q.big?70:40),0,Math.PI*2); ctx.stroke(); }
  else if(q.type==='burst'){ const r=(q.big?40:24)*(0.6+k*0.8); burst(ctx,q.x,q.y,r,q.big?'#fde047':'#fff','#000',q.big?12:8,q.t*0.15); }
  else if(q.type==='heart'){ ctx.fillStyle='#f472b6'; ctx.font='900 16px sans-serif'; ctx.textAlign='center'; ctx.fillText('♥',q.x,q.y); }
  else if(q.type==='zzz'){ ctx.fillStyle='#cbd5e1'; ctx.font='900 18px Impact, sans-serif'; ctx.textAlign='center'; ctx.fillText('z',q.x,q.y); }
  ctx.restore();
}
