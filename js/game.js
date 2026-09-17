'use strict';
// ───────────────────────── 입력 ─────────────────────────
const KEYMAPS = [
  { left:'KeyA', right:'KeyD', duck:'KeyS', guard:'Space', slip:'KeyQ', skill:'KeyL', jab:'KeyJ', straight:'KeyK', lhook:'KeyU', rhook:'KeyI', uppercut:'KeyO' },
  { left:'ArrowLeft', right:'ArrowRight', duck:'ArrowDown', guard:'Numpad0', slip:'Numpad3', skill:'Numpad8', jab:'Numpad1', straight:'Numpad2', lhook:'Numpad4', rhook:'Numpad5', uppercut:'Numpad7' },
];
class Input {
  constructor(){
    this.down=new Set(); this.pressed=new Set(); this.anyPressed=false;
    window.addEventListener('keydown',e=>{
      if(e.repeat) return;
      this.down.add(e.code); this.pressed.add(e.code); this.anyPressed=true;
      if(['Space','ArrowDown','ArrowLeft','ArrowRight','ArrowUp'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup',e=>this.down.delete(e.code));
    window.addEventListener('blur',()=>this.down.clear());
  }
  build(idx){
    const m=KEYMAPS[idx], inp=emptyInput();
    inp.left=this.down.has(m.left); inp.right=this.down.has(m.right); inp.duck=this.down.has(m.duck); inp.guard=this.down.has(m.guard);
    for(const k of ['slip','skill',...PUNCH_IDS]) if(this.pressed.has(m[k])) inp.press[k]=true;
    inp.anyPress=[...PUNCH_IDS,'slip','guard'].some(k=>this.pressed.has(m[k]));
    return inp;
  }
  endFrame(){ this.pressed.clear(); this.anyPressed=false; }
  vPress(code){ if(!this.down.has(code)){ this.down.add(code); this.pressed.add(code); this.anyPressed=true; } }
  vRelease(code){ this.down.delete(code); }
  // 터치 버튼 연결. 훅 버튼은 레프트/라이트 훅을 번갈아 냄
  bindTouch(root){
    this.hookToggle=false;
    for(const b of root.querySelectorAll('.tb')){
      const code=()=> b.dataset.key==='HOOK' ? b._code : b.dataset.key;
      const down=e=>{ e.preventDefault(); if(b.dataset.key==='HOOK'){ b._code=this.hookToggle?'KeyI':'KeyU'; this.hookToggle=!this.hookToggle; } b.classList.add('active'); this.vPress(code()); try{ b.setPointerCapture(e.pointerId); }catch(_){} };
      const up=e=>{ if(e && e.cancelable) e.preventDefault(); b.classList.remove('active'); if(code()) this.vRelease(code()); };
      b.addEventListener('pointerdown',down); b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('lostpointercapture',up);
      b.addEventListener('contextmenu',e=>e.preventDefault());
    }
    root.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
    root.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  }
}

// ───────────────────────── 게임 ─────────────────────────
const POP = {
  head:['POW!','BAM!','WHACK!','SMACK!','퍽!','빡!'], body:['OOF!','UGH!','BODY!','으윽!'],
  hook:['WHAM!','KRAK!'], upper:['BOOM!','쾅!'],
};
class Game {
  constructor(){
    this.canvas=document.getElementById('game'); this.ctx=this.canvas.getContext('2d');
    this.input=new Input(); this.sfx=new SFX(); this.combat=new Combat(this);
    this.settings={ mode:'cpu', difficulty:0, rounds:3, roundTime:90, voice:true, sound:true, touch:false, easy:true, buttons:true };
    this.autoSeq=[0,0];
    this.assets={ portraits:{}, crowd:null }; this.loadAssets();
    this.selection=[0,2]; this.picker=0;
    this.screen='title'; this.popups=[]; this.particles=[]; this.shake=0; this.timeScale=1; this.slowT=0;
    this.acc=0; this.lastTs=0; this.paused=false; this.t=0; this.refX=W/2; this.fighters=null;
    this.bindUI();
    // 터치 기기 자동 감지 (설정에서 수동 전환 가능)
    let touch=false; try{ const sv=localStorage.getItem('pf_touch'); touch = sv!==null ? sv==='1' : (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window); }catch(e){}
    this.setTouch(touch);
    this.setEasy(this.settings.easy);
    this.input.bindTouch(document.getElementById('touch'));
    document.getElementById('overlay-vs').addEventListener('pointerdown',()=>{ this.skipTap=true; });
    this.cam={x:W/2,s:1}; this.flashT=0;
    this.career=new Career(this);
    this.net=new Net(this); this.netSfx=[]; this.meIdx=0;
    // 호스트일 때 효과음 호출을 기록해 게스트에게 전달
    for(const name of ['punch','bodyHit','block','whiff','slip','bell','count','down','win','getup','crowd','tone','noise']){
      const orig=this.sfx[name].bind(this.sfx); this.sfx[name]=(...args)=>{ if(this.net.role==='host' && this.screen==='fight') this.netSfx.push([name,args]); return orig(...args); };
    }
    document.getElementById('btn-pause').onclick=()=>this.setPaused(true);
    document.getElementById('btn-resume').onclick=()=>this.setPaused(false);
    document.getElementById('btn-restart').onclick=()=>{ this.setPaused(false); this.startMatch(); };
    document.getElementById('btn-exit').onclick=()=>this.exitMatch();
    this.parallax=0; window.addEventListener('pointermove',e=>{ this.parallax=(e.clientX/window.innerWidth-0.5); });
    this.startAttract();
    this.parallax=0; window.addEventListener('pointermove',e=>{ this.parallax=(e.clientX/window.innerWidth-0.5); });
    this.startAttract();
    const unlock=()=>{ this.sfx.init(); this.sfx.resume(); };
    window.addEventListener('keydown',unlock); window.addEventListener('pointerdown',unlock);
    requestAnimationFrame(ts=>this.loop(ts));
  }

  setTouch(on){
    this.settings.touch=on; document.body.classList.toggle('touch-mode',on);
    const chk=document.getElementById('chk-touch'); if(chk) chk.checked=on;
    try{ localStorage.setItem('pf_touch',on?'1':'0'); }catch(e){}
    this.updateTouchVisibility();
  }
  setEasy(on){ this.settings.easy=!!on; document.body.classList.toggle('easy-mode',this.settings.easy); const el=document.getElementById('sel-easy'); if(el) el.value=this.settings.easy?'1':'0'; }
  // 쉬운 조작: 펀치 자동 선택 + 자동 거리 조절 + 회피
  easyInput(inp, idx, me, opp, raw){
    raw=raw||this.input; const dist=Math.abs(opp.x-me.x), reach=me.punchReach('jab');
    const fwd = opp.x>me.x ? 'right':'left';
    if(raw.pressed.has('EASY_PUNCH')) inp.press.jab=true;
    const bodyHold=raw.down.has('EASY_BODY');
    // 바디 버튼 단독 탭 = 거리에 맞는 바디샷, 누른 채 펀치 = 그 펀치를 바디로
    if(raw.pressed.has('EASY_BODY') && !PUNCH_IDS.some(k=>inp.press[k])) inp.press[dist>reach*0.8?'straight':'lhook']=true;
    if(bodyHold) inp.duck=true;
    if(raw.pressed.has('EASY_EVADE')) inp.press.slip=true;
    inp.anyPress = inp.anyPress || ['EASY_PUNCH','EASY_BODY','EASY_EVADE'].some(k=>raw.pressed.has(k));
    // 자동 풋워크: 입력이 없으면 리치 안쪽으로 알아서 접근
    if(!inp.left && !inp.right && !inp.guard && !bodyHold && me.canAct()){
      const want=reach*0.78;
      if(dist>want+16) inp[fwd]=true;
    }
    me.easyGuard=true;
    return inp;
  }
  setPaused(on){
    this.paused=!!on; this.input.pressed.clear();
    document.getElementById('overlay-pause').classList.toggle('hidden',!this.paused);
    this.updateTouchVisibility();
  }
  exitMatch(){
    this.paused=false; document.getElementById('overlay-pause').classList.add('hidden');
    if(this.settings.mode==='online'){ this.net.send({t:'exit'}); this.onNetClose('경기를 나갔습니다'); return; }
    this.fighters=null; this.timeScale=1; this.slowT=0; this.popups=[]; this.particles=[];
    if(this.settings.mode==='career' && this.career.state){ this.screen='career'; this.career.render('경기를 중단했습니다 (기록 없음)'); this.show('overlay-career'); }
    else { this.screen='title'; this.show('overlay-title'); }
  }
  updateTouchVisibility(){
    const el=document.getElementById('touch'); if(!el) return;
    document.getElementById('btn-pause').classList.toggle('hidden', !(this.screen==='fight' && !this.paused && this.phase!=='over'));
    document.getElementById('btn-exit').classList.toggle('hidden', this.settings.mode==='online' && this.net.role==='guest' && false);
    const show=(this.settings.touch||this.settings.buttons) && this.screen==='fight' && this.settings.mode!=='demo' && !this.paused;
    document.getElementById('tb-skill').textContent = '스킬';
    el.classList.toggle('hidden',!show);
  }
  // 심판 행동: 선수 사이를 오가며 걷고, 카운트·재개·종료 제스처
  updateRef(){
    const r=this.ref||(this.ref={x:W/2,pose:'idle',t:0,walkT:0,dir:1,pulse:1,gesture:null,gT:0,moving:false});
    const [a,b]=this.fighters; r.t++; if(r.gT>0) r.gT--;
    let target=(a.x+b.x)/2 + Math.sin(r.t*0.008)*50, pose='idle';
    const dist=Math.abs(a.x-b.x);
    if(this.phase==='count'){
      const d=this.downed; target=d.x+d.facing*95;
      pose = (this.countT<-5 && this.count===0) || r.gesture==='check' ? 'check' : 'count';
      if(this.count===0 && this.countT<0) pose='check';
      r.pulse=Math.min(1,r.pulse+0.06);
      if(this.countT===0 && this.count>0) r.pulse=0;   // 카운트 틱마다 팔 펌핑
    } else if(this.phase==='getup' || r.gesture==='box'){ pose='box'; }
    else if(this.phase==='over'){ pose = (this.result && (this.result.method==='KO'||this.result.method==='TKO')) ? 'wave' : 'idle'; target=r.x; }
    else if(this.phase==='intro'){ pose='box'; target=W/2; }
    else if(this.phase==='roundend'||this.phase==='rest'){ pose='idle'; target=(a.x+b.x)/2; }
    else if(dist<150){ target += (r.x<W/2?-1:1)*70; }   // 선수가 붙으면 옆으로 비켜섬
    if(r.gT<=0) r.gesture=null;
    target=clamp(target,RING_L+60,RING_R-60);
    const dx=target-r.x, spd=this.phase==='count'?2.2:1.3;
    if(Math.abs(dx)>4){ r.x+=Math.sign(dx)*Math.min(spd,Math.abs(dx)); r.walkT+=0.22; r.moving=true; r.dir=Math.sign(dx)||r.dir; if(pose==='idle') pose = (Math.floor(r.walkT/1.6)%2) ? 'walk':'idle'; }
    else { r.moving=false; r.walkT=0; }
    r.pose=pose; this.refX=r.x;
  }
  loadAssets(){
    for(const d of FIGHTERS){ const im=new Image(); im.onload=()=>{ this.assets.portraits[d.id]=im; }; im.src=`assets/portraits/${d.id}.jpg`; }
    const c=new Image(); c.onload=()=>{ this.assets.crowd=c; }; c.src='assets/crowd.jpg';
    // 일러스트 스프라이트 (js/sprites.js 메타데이터 기준)
    this.assets.sprites={}; this.assets.ref={};
    for(const k of ['ref_idle','ref_count','ref_walk','ref_check','ref_box','ref_wave']){ const im=new Image(); im.onload=()=>{ this.assets.ref[k]=im; }; im.src=`assets/sprites/${k}.png`; }
    if(typeof SPRITE_META!=='undefined') for(const id in SPRITE_META){
      const set={}; this.assets.sprites[id]=set;
      for(const pose in SPRITE_META[id]){ const im=new Image(); const meta=SPRITE_META[id][pose]; im.onload=()=>{ set[pose]={img:im,meta}; }; im.src=`assets/sprites/${id}/${pose}.png`; }
    }
  }
  // 그림의 글러브 끝 위치로 펀치 리치를 맞춤 (타격 타이밍과 그림 동기화)
  applySpriteReach(f){
    const set=this.spriteSet(f); f.spriteReach=null; if(!set) return;
    const H=SPRITE_STD_H*f.def.look.height, r={};
    const tip=pose=> set[pose] ? set[pose].meta.tip*set[pose].meta.unit*H : null;
    const map={jab:'jab',straight:'straight',lhook:'hook',rhook:'hook',uppercut:'uppercut'};
    for(const id in map){ const t=tip(map[id]); if(t) r[id]=t+22; }   // +상대 머리/몸통 앞면까지
    if(Object.keys(r).length===5) f.spriteReach=r;
  }
  spriteSet(f){ const s=this.assets.sprites[f.def.id]; return s && s.idle ? s : null; }
  portraitSrc(d){ return this.assets.portraits[d.id] ? this.assets.portraits[d.id].src : ''; }
  requestFullscreen(){
    if(!this.settings.touch) return;
    const el=document.documentElement; const fn=el.requestFullscreen||el.webkitRequestFullscreen;
    try{ if(fn && !document.fullscreenElement){ const r=fn.call(el); if(r && r.catch) r.catch(()=>{}); } }catch(e){}
    try{ if(screen.orientation && screen.orientation.lock){ const r=screen.orientation.lock('landscape'); if(r && r.catch) r.catch(()=>{}); } }catch(e){}
  }
  // ── 화면 전환 ──
  show(id){
    for(const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
    if(id) document.getElementById(id).classList.remove('hidden');
    this.updateTouchVisibility();
  }
  bindUI(){
    const $=id=>document.getElementById(id);
    $('btn-2p').onclick=()=>{ this.screen='online';
      const inArtifact=/claude\.ai|claudeusercontent/.test(location.hostname);
      this.setOnlineStatus(!this.net.available()?'온라인 모듈을 불러오지 못했습니다 (인터넷 연결 확인)':(inArtifact?'이 웹 링크에서는 온라인 연결이 차단됩니다. PC의 index.html 또는 "휴대폰으로 열기.bat" 주소로 접속해 주세요.':''),!this.net.available()||inArtifact);
      this.show('overlay-online'); };
    $('btn-local2p').onclick=()=>{ this.net.close(); this.settings.mode='2p'; this.screen='select'; this.picker=0; this.buildSelect(); this.show('overlay-select'); };
    $('btn-online-back').onclick=()=>{ this.net.close(); $('on-code').classList.add('hidden'); this.screen='title'; this.show('overlay-title'); };
    $('btn-host').onclick=()=>{ this.setOnlineStatus('방을 만드는 중…'); this.net.host((err,code)=>{ if(err){ this.setOnlineStatus('방 만들기 실패: '+(err.message||err.type||err),true); return; } $('on-code-text').textContent=code; $('on-code').classList.remove('hidden'); $('on-invite').classList.remove('hidden'); this.setOnlineStatus('코드를 알려주거나 초대 링크를 보내세요. 상대가 참가하면 자동으로 시작됩니다.'); }); };
    const inviteUrl=()=> location.origin+location.pathname+'?join='+$('on-code-text').textContent;
    const inviteMsg=()=>'🥊 PUNCH FACE 권투 한 판 붙자! 링크 누르면 바로 참가돼 → '+inviteUrl();
    $('btn-invite').onclick=()=>PF.shareNative('PUNCH FACE 대전 초대',inviteMsg(),inviteUrl());
    $('btn-invite-sms').onclick=()=>PF.sms(inviteMsg());
    $('btn-invite-kakao').onclick=()=>PF.kakao(inviteMsg(),$('on-invite-hint'));
    $('btn-invite-copy').onclick=()=>{ PF.copy(inviteMsg()); this.setOnlineStatus('초대 문구와 링크를 복사했습니다. 카톡·문자에 붙여넣기 하세요.'); };
    $('btn-copy').onclick=()=>{ try{ navigator.clipboard.writeText($('on-code-text').textContent); this.setOnlineStatus('코드를 복사했습니다'); }catch(e){} };
    $('btn-join').onclick=()=>{ const code=$('on-input').value.trim().toUpperCase(); if(code.length<4){ this.setOnlineStatus('코드 4자리를 입력하세요',true); return; } this.setOnlineStatus('연결 중… ('+code+')'); this.joinRoom(code); };
    $('on-input').onkeydown=e=>{ if(e.key==='Enter') $('btn-join').click(); e.stopPropagation(); };
    $('btn-demo').onclick=()=>{ this.settings.mode='demo'; this.screen='select'; this.picker=0; this.buildSelect(); this.show('overlay-select'); };
    $('btn-cpu').onclick=()=>{ this.settings.mode='cpu'; this.screen='select'; this.picker=0; this.buildSelect(); this.show('overlay-select'); };
    $('btn-fight').onclick=()=>{ if(this.settings.mode==='online'){ if(!this.net.connected){ this.onNetClose('연결이 끊어졌습니다'); return; } this.localReady=true; this.net.send({t:'pick',idx:this.selection[this.meIdx],easy:this.settings.easy,ready:true}); this.refreshSelect(); this.tryStartOnline(); return; }
      if(this.settings.mode==='career'){ this.career.start(FIGHTERS[this.selection[0]].id); this.openCareer('새 커리어 시작! 랭킹 최하위부터 올라가세요.'); } else this.startMatch(); };
    $('btn-career').onclick=()=>{ if(this.career.state) this.openCareer(); else { this.settings.mode='career'; this.screen='select'; this.picker=0; this.buildSelect(); this.show('overlay-select'); } };
    $('btn-c-fight').onclick=()=>this.startCareerMatch();
    $('btn-c-reset').onclick=()=>{ if(confirm('커리어 기록을 지우고 새 선수로 시작할까요?')){ this.career.clear(); this.settings.mode='career'; this.screen='select'; this.picker=0; this.buildSelect(); this.show('overlay-select'); } };
    $('btn-c-title').onclick=()=>{ this.screen='title'; this.show('overlay-title'); };
    $('btn-res-career').onclick=()=>this.openCareer(this.careerMsg);
    $('btn-random').onclick=()=>{ let r; do r=randi(0,FIGHTERS.length-1); while(FIGHTERS.length>1 && r===this.selection[1-this.picker] && (this.settings.mode==='2p'||this.settings.mode==='demo')); this.selection[this.picker]=r; this.refreshSelect(); };
    $('btn-back').onclick=()=>{ if(this.settings.mode==='online'){ this.net.send({t:'exit'}); this.onNetClose('대전을 취소했습니다'); return; } this.screen='title'; this.show('overlay-title'); };
    for(const tb of document.querySelectorAll('#sel-tabs .tab')) tb.onclick=()=>{ this.picker=+tb.dataset.p; this.refreshSelect(); };
    $('btn-rematch').onclick=()=>this.startMatch();
    $('btn-reselect').onclick=()=>{ this.screen='select'; this.picker=0; this.buildSelect(); this.show('overlay-select'); };
    $('btn-title').onclick=()=>{ if(this.settings.mode==='online'){ this.net.send({t:'exit'}); this.net.close(); this.settings.mode='cpu'; } this.fighters=null; this.startAttract(); this.screen='title'; this.show('overlay-title'); };
    for(const el of document.querySelectorAll('[data-set]')){
      el.onchange=()=>{ const k=el.dataset.set; let v=el.type==='checkbox'?el.checked:el.value; if(el.type==='range'||el.tagName==='SELECT') v=isNaN(+v)?v:+v; this.settings[k]=v; if(k==='sound') this.sfx.enabled=v; if(k==='touch') this.setTouch(v); if(k==='easy') this.setEasy(v==1||v===true); if(k==='buttons') this.updateTouchVisibility(); };
    }
  }
  // 타이틀/메뉴 뒤에서 AI끼리 스파링 (관중 소리·팝업 포함, HUD 없음)
  startAttract(){
    const a=randi(0,FIGHTERS.length-1); let b; do b=randi(0,FIGHTERS.length-1); while(b===a);
    this.attract=true; this.attractT=0;
    this.fighters=[ new Fighter(FIGHTERS[a],0), new Fighter(FIGHTERS[b],1) ];
    this.ai=[ new AI(this.fighters[0],1), new AI(this.fighters[1],1) ];
    this.round=1; this.scores=[[],[]]; this.result=null; this.popups=[]; this.particles=[]; this.careerRecorded=true;
    for(const f of this.fighters) this.applySpriteReach(f);
    this.timer=999; this.phase='fight'; this.phaseT=0; this.count=0; this.countT=0;
    const [x,y]=this.fighters; x.x=RING_L+260; y.x=RING_R-260; x.facing=1; y.facing=-1;
  }
  // 타이틀/메뉴 뒤에서 AI끼리 스파링 (관중 소리·팝업 포함, HUD 없음)
  startAttract(){
    const a=randi(0,FIGHTERS.length-1); let b; do b=randi(0,FIGHTERS.length-1); while(b===a);
    this.attract=true; this.attractT=0;
    this.fighters=[ new Fighter(FIGHTERS[a],0), new Fighter(FIGHTERS[b],1) ];
    this.ai=[ new AI(this.fighters[0],1), new AI(this.fighters[1],1) ];
    this.round=1; this.scores=[[],[]]; this.result=null; this.popups=[]; this.particles=[]; this.careerRecorded=true;
    for(const f of this.fighters) this.applySpriteReach(f);
    this.timer=999; this.phase='fight'; this.phaseT=0; this.count=0; this.countT=0;
    const [x,y]=this.fighters; x.x=RING_L+260; y.x=RING_R-260; x.facing=1; y.facing=-1;
  }
  // ── 온라인 ──
  joinRoom(code){
    this.screen='online'; this.show('overlay-online'); document.getElementById('on-input').value=code;
    this.setOnlineStatus('연결 중… ('+code+')');
    this.net.join(code,err=>{ if(err) this.setOnlineStatus('연결 실패: '+(err.message||err.type||err),true); else this.setOnlineStatus('연결되었습니다!'); });
  }
  setOnlineStatus(msg,err){ const el=document.getElementById('on-status'); el.textContent=msg||''; el.classList.toggle('err',!!err); }
  onNetOpen(){
    this.settings.mode='online'; this.picker = this.net.role==='host'?0:1; this.meIdx=this.picker; this.localReady=false; this.remoteReady=false;
    this.screen='select'; this.buildSelect(); this.show('overlay-select');
    this.net.send({t:'hello',easy:this.settings.easy});
    this.net.send({t:'pick',idx:this.selection[this.picker],easy:this.settings.easy,ready:false});
  }
  onNetPick(d){ const other=1-this.meIdx; this.selection[other]=d.idx; this.remoteReady=!!d.ready; if(this.screen==='select') this.refreshSelect(); this.tryStartOnline(); }
  tryStartOnline(){
    if(this.net.role!=='host' || !this.localReady || !this.remoteReady || this.screen!=='select') return;
    this.net.send({t:'start',p1:this.selection[0],p2:this.selection[1],rounds:this.settings.rounds,roundTime:this.settings.roundTime,difficulty:this.settings.difficulty});
    this.startMatch();
  }
  onNetStart(d){ if(this.net.role!=='guest') return; this.settings.rounds=d.rounds; this.settings.roundTime=d.roundTime; this.selection=[d.p1,d.p2]; this.startMatch(); }
  onNetClose(msg){
    if(!this.net.role) return;
    this.net.close();
    this.fighters=null; this.paused=false; document.getElementById('overlay-pause').classList.add('hidden');
    this.screen='online'; this.settings.mode='cpu'; this.setOnlineStatus(msg||'연결이 종료되었습니다',true); document.getElementById('on-code').classList.add('hidden'); this.show('overlay-online');
    this.startAttract();
  }
  openCareer(msg){ this.settings.mode='career'; this.screen='career'; this.career.render(msg); this.show('overlay-career'); }
  startCareerMatch(){
    const c=this.career, nx=c.nextOpponent();
    this.settings.mode='career'; this.settings.difficulty=c.difficulty();
    this.selection=[FIGHTERS.findIndex(f=>f.id===c.state.charId), FIGHTERS.findIndex(f=>f.id===nx.id)];
    this.careerOpp=nx; this.startMatch();
  }
  buildSelect(){
    const roster=document.getElementById('roster'); roster.innerHTML=''; this.pickedOnce=false;
    FIGHTERS.forEach((d,i)=>{
      const card=document.createElement('div'); card.className='card'; card.dataset.i=i;
      const box=document.createElement('div'); box.className='cimg-box';
      const im=document.createElement('img'); im.src=`assets/portraits/${d.id}.jpg`; im.className='cimg';
      box.appendChild(im); card.appendChild(box);
      card.insertAdjacentHTML('beforeend',`<div class="cname">${d.name}</div><div class="cnick">"${d.nick}"</div><div class="cstyle">${STYLES[d.style].name}</div>`);
      card.onclick=()=>{
        if(this.settings.mode==='online'){ if(this.localReady) return; this.selection[this.meIdx]=i; this.net.send({t:'pick',idx:i,easy:this.settings.easy,ready:false}); this.refreshSelect(); return; }
        const two=this.settings.mode==='2p'||this.settings.mode==='demo';
        if(two && i===this.selection[1-this.picker]){ this.picker=1-this.picker; this.refreshSelect(); return; }   // 상대 슬롯 카드를 누르면 그 슬롯 편집
        this.selection[this.picker]=i; if(this.picker===0 && two && !this.pickedOnce){ this.picker=1; this.pickedOnce=true; } this.refreshSelect(); };

      roster.appendChild(card);
    });
    document.getElementById('sel-mode').textContent = {cpu:'CPU 대전','2p':'2인 대전 (로컬)',demo:'CPU 관전',career:'챔피언 로드',online:'온라인 대전'}[this.settings.mode];
    document.getElementById('btn-fight').textContent = this.settings.mode==='career' ? '이 선수로 커리어 시작!' : (this.settings.mode==='online' ? '준비 완료' : '경기 시작!');
    this.refreshSelect();
  }
  refreshSelect(){
    const cards=document.querySelectorAll('#roster .card');
    cards.forEach(c=>{ c.classList.remove('p1','p2'); });
    const mode=this.settings.mode, solo = mode==='career' || mode==='cpu';   // 내 선수만 고르는 모드
    const tabs=document.getElementById('sel-tabs'); tabs.classList.toggle('hidden',solo);
    for(const tb of tabs.querySelectorAll('.tab')) tb.classList.toggle('active',+tb.dataset.p===this.picker);
    cards[this.selection[0]].classList.add('p1'); if(!solo) cards[this.selection[1]].classList.add('p2');
    // 선택된 카드는 액션 포즈로, 나머지는 초상화로
    cards.forEach((c,i)=>{ const im=c.querySelector('img.cimg'); if(!im) return; const sel=i===this.selection[0]||(!solo&&i===this.selection[1]);
      const want = sel ? `assets/sprites/${FIGHTERS[i].id}/${i===this.selection[0]?'straight':'hook'}.png` : `assets/portraits/${FIGHTERS[i].id}.jpg`;
      if(!im.src.endsWith(want)) im.src=want; c.classList.toggle('pose',sel); });
    const on=this.settings.mode==='online';
    const titles={ career:'커리어 선수를 고르세요', cpu:'내 선수를 고르세요 — 상대는 CPU가 랜덤 배정', '2p': this.picker===0?'P1 선수를 고르세요':'P2 선수를 고르세요', demo: this.picker===0?'홍코너 선수를 고르세요':'청코너 선수를 고르세요',
      online: (this.net.role==='host'?'[호스트 · 홍코너] ':'[게스트 · 청코너] ') + (this.localReady ? (this.remoteReady?'시작합니다!':'상대의 준비를 기다리는 중…') : (this.remoteReady?'상대가 준비됐습니다. 선수를 고르고 준비 완료!':'내 선수를 고르고 준비 완료를 누르세요')) };
    if(on){ tabs.classList.add('hidden'); document.getElementById('btn-fight').disabled=this.localReady; }
    document.getElementById('sel-title').textContent = titles[mode]||'선수를 고르세요';
    document.getElementById('detail1').classList.toggle('hidden',solo);
    const statNames={power:'파워',speed:'스피드',stamina:'체력',chin:'맷집',reach:'리치',heart:'회복',defense:'방어'};
    [0,1].forEach(side=>{
      const d=FIGHTERS[this.selection[side]], el=document.getElementById('detail'+side);
      const S=SKILLS[d.id];
      el.innerHTML=`<img class="dpose" src="assets/sprites/${d.id}/${side?'uppercut':'hook'}.png" alt="">
        <div class="dhead"><span class="tag ${side?'blue':'red'}">${side?'P2/CPU':'P1'}</span><b>${d.name}</b> <span class="nick">"${d.nick}"</span> <span class="meta">${d.country} · ${d.age}세</span></div>
        <div class="drow"><span class="lbl">스타일</span><b>${STYLES[d.style].name}</b> — ${STYLES[d.style].desc}</div>
        <div class="drow"><span class="lbl">주무기</span><b>${PUNCHES[d.weapon].name}</b> (위력 ×1.25)</div>
        <div class="drow skillrow"><span class="lbl">스킬</span><b>${S.name}</b> — ${S.desc}</div>
        <div class="ddesc">${d.desc}</div>
        <div class="stats">${Object.keys(statNames).map(k=>`<div class="stat"><span>${statNames[k]}</span><div class="bar"><i style="width:${d.stats[k]*10}%"></i></div><em>${d.stats[k]}</em></div>`).join('')}</div>`;
    });
  }

  // ── 경기 시작/진행 ──
  startMatch(){
    this.sfx.init(); this.attract=false; this.attract=false;
    if(this.settings.mode==='cpu' || (this.settings.mode==='demo' && this.selection[1]===this.selection[0])){
      const others=FIGHTERS.map((_,i)=>i).filter(i=>i!==this.selection[0]); this.selection[1]=pick(others);
    }
    const d0 = this.settings.mode==='career' ? this.career.playerDef() : FIGHTERS[this.selection[0]];
    this.fighters=[ new Fighter(d0,0), new Fighter(FIGHTERS[this.selection[1]],1) ];
    const online=this.settings.mode==='online';
    this.ai=[ this.settings.mode==='demo' ? new AI(this.fighters[0],this.settings.difficulty) : null,
              (this.settings.mode!=='2p' && !online) ? new AI(this.fighters[1],this.settings.difficulty) : null ];
    if(!online) this.meIdx=0;
    this.resultShown=false;
    this.round=1; this.scores=[[],[]]; this.result=null; this.popups=[]; this.particles=[]; this.careerRecorded=false;
    for(const f of this.fighters) this.applySpriteReach(f);
    this.screen='fight'; this.paused=false;
    this.requestFullscreen();
    this.beginRound();
    // VS 인트로
    const [a,b]=this.fighters, $=id=>document.getElementById(id);
    $('vs-img0').src=`assets/portraits/${a.def.id}.jpg`; $('vs-img1').src=`assets/portraits/${b.def.id}.jpg`;
    $('vs-name0').textContent=`${a.def.name} "${a.def.nick}"`; $('vs-name1').textContent=`${b.def.name} "${b.def.nick}"`;
    this.show('overlay-vs'); this.phase='vs'; this.phaseT=0;
    document.getElementById('vs-sub').textContent = this.settings.mode==='career' ? (this.careerOpp && this.careerOpp.title ? '세계 타이틀 매치' : `랭킹전 · ${['쉬움','보통','어려움'][this.settings.difficulty]}`) : '';
  }
  faceDataURL(f){ return `assets/portraits/${f.def.id}.jpg`; }
  beginRound(){
    const [a,b]=this.fighters;
    a.roundReset(); b.roundReset();
    a.x=RING_L+240; b.x=RING_R-240; a.facing=1; b.facing=-1;
    if(this.ref){ this.ref.x=W/2; this.ref.gesture=null; this.ref.gT=0; }
    this.timer=this.settings.roundTime; this.phase='intro'; this.phaseT=0; this.count=0; this.countT=0;
    this.popup(`ROUND ${this.round}`,W/2,200,{size:64,color:'#fde047',life:110,burst:null});
  }
  simFrame(){
    const [a,b]=this.fighters; this.t++;
    const host=this.net.role==='host' && this.settings.mode==='online';
    const rawOf=(i)=> (host && i===1) ? this.net.remote : this.input;
    const inputs=[ this.ai[0] ? null : this.input.build(0), this.ai[1] ? null : (host ? this.net.remote.build(0) : this.input.build(1)) ];
    const idle=emptyInput();
    const easyFor=(i)=> (host && i===1) ? this.net.remoteEasy : (i===0 && this.settings.easy);
    const ctrl=(i)=> this.ai[i] ? this.ai[i].input(this.fighters[1-i],this) : (easyFor(i) ? this.easyInput(inputs[i],i,this.fighters[i],this.fighters[1-i],rawOf(i)) : inputs[i]);
    switch(this.phase){
      case 'vs':
        this.phaseT++; a.t++; b.t++;
        if(this.phaseT>=150 || this.input.pressed.has('Enter') || this.skipTap){ this.skipTap=false; this.show(null); this.phase='intro'; this.phaseT=0; }
        break;
      case 'intro':
        this.phaseT++; a.t++; b.t++;
        if(this.phaseT===100){ this.sfx.bell(1); this.popup('FIGHT!',W/2,230,{size:70,color:'#fff',life:60,burst:'#c8102e'}); this.speak('Fight!'); this.flashT=10; this.speedT=12; this.speedColor='rgba(255,255,255,0.6)'; this.say(`${this.round}라운드 시작! ${a.def.name} 대 ${b.def.name}`); }
        if(this.phaseT>=110) this.phase='fight';
        break;
      case 'fight': {
        this.timer-=1/60;
        if(this.hitStop>0){ this.hitStop--; a.t++; b.t++; break; }   // 타격 순간 정지
        const ia=ctrl(0), ib=ctrl(1);
        a.update(ia,b,this); if(this.phase!=='fight') break;
        b.update(ib,a,this); if(this.phase!=='fight') break;
        this.separate(a,b);
        if(this.timer<=0){ this.timer=0; this.endRound(); }
        break; }
      case 'count': {
        const d=this.downed, o=d===a?b:a;
        d.stateT++; o.t++; d.t++;
        // 상대는 중립 코너로 이동
        if(Math.abs(o.x-this.cornerX)>4){ o.x+=Math.sign(this.cornerX-o.x)*1.6; o.state='walk'; o.walkT+=0.25; } else o.state='idle';
        o.facing = d.x>=o.x?1:-1;
        this.countT++;
        if(this.countT>=58){ this.countT=0; this.count++; this.sfx.count(); this.speak(['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'][this.count]); this.popup(String(this.count),this.refX+40,FLOOR_Y-260,{size:44,color:'#fde047',life:50}); }
        if(this.count>=1 && d.knockdowns>=3){ this.finish(o,'TKO',`${this.round}R 3넉다운`); break; }
        // 기상
        const idx=this.fighters.indexOf(d), ai=this.ai[idx];
        const canRise = d.hp > -(28+d.st.heart*2.5);
        if(ai){ if(this.count>=this.getupTarget && canRise) this.getup(d); }
        else { const inp=inputs[idx], rw=rawOf(idx); if(inp.anyPress || rw.pressed.has('EASY_PUNCH') || rw.pressed.has('EASY_BODY')){ d.getupProgress+=5+d.st.heart*0.8; this.particle(d.x,FLOOR_Y-40,'spark'); } if(this.count>=2 && d.getupProgress>=100 && canRise) this.getup(d); }
        if(this.count>=10){ d.state='ko'; this.finish(o,'KO',`${this.round}R ${this.fmtTime(this.timer)}`); }
        break; }
      case 'getup': {
        const d=this.downed, o=d===a?b:a; d.update(idle,o,this); o.t++; this.phaseT++;
        if(this.phaseT>=70){ this.phase='fight'; this.popup('BOX!',W/2,220,{size:50,color:'#fff',life:45}); this.speak('Box!'); }
        break; }
      case 'roundend': {
        this.phaseT++; a.t++; b.t++;
        if(this.attract){ if(this.phaseT>=90) this.startAttract(); break; }
        if(this.attract){ if(this.phaseT>=90) this.startAttract(); break; }
        if(this.phaseT===50){ a.state='rest'; b.state='rest'; a.punch=b.punch=null; }
        if(this.phaseT>=120){ this.scoreRound(); if(this.round>=this.settings.rounds) this.decision(); else { this.phase='rest'; this.phaseT=0; this.restRecover(); } }
        break; }
      case 'rest': {
        this.phaseT++; a.t++; b.t++;
        if(this.phaseT>=420 || (this.phaseT>60 && (this.input.pressed.size>0 || this.net.remote.pressed.size>0))){ this.round++; this.beginRound(); }
        break; }
      case 'over': {
        this.phaseT++; a.t++; b.t++; a.squash*=0.9; b.squash*=0.9;
        if(this.attract){ if(this.phaseT>=200) this.startAttract(); break; }
        if(this.attract){ if(this.phaseT>=200) this.startAttract(); break; }
        if(this.phaseT===1){ if(this.result.winner) this.sfx.win(); }
        if(this.phaseT>=260) this.showResult();
        break; }
    }
    // 이펙트 갱신
    for(const p of this.popups) p.t++; this.popups=this.popups.filter(p=>p.t<p.life);
    for(const q of this.particles){ q.t++; q.x+=q.vx; q.y+=q.vy; q.vy+=0.35; } this.particles=this.particles.filter(q=>q.t<q.life);
    this.shake*=0.85; if(this.flashT>0) this.flashT--; if(this.speedT>0) this.speedT--; if(this.cinemaT>0) this.cinemaT--;
    if(this.caption && this.caption.t>0) this.caption.t--;
    for(const f of this.fighters){ if(f.hpGhost===undefined) f.hpGhost=f.hp; f.hpGhost += (f.hp-f.hpGhost)*0.06; if(f.hp>f.hpGhost) f.hpGhost=f.hp; }
    this.updateRef();
    this.sfx.tick();
    this.input.endFrame(); this.net.remote.endFrame();
  }
  separate(a,b){
    const min=84, dx=b.x-a.x;
    if(Math.abs(dx)<min){ const push=(min-Math.abs(dx))/2, s=dx>=0?1:-1; a.x-=push*s; b.x+=push*s; a.x=clamp(a.x,RING_L+120,RING_R-120); b.x=clamp(b.x,RING_L+120,RING_R-120); }
  }
  fmtTime(t){ t=Math.max(0,Math.ceil(t)); return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; }
  speak(text){
    if(this.net.role==='host' && this.screen==='fight' && text) this.netSfx.push(['speak',[text]]);
    if(!this.settings.voice||!window.speechSynthesis||!text||this.attract) return;
    try{ const u=new SpeechSynthesisUtterance(text); u.lang='en-US'; u.rate=1.05; u.pitch=0.9; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(e){}
  }

  // ── 이벤트 콜백 (Combat / Fighter 에서 호출) ──
  popup(text,x,y,o={}){ x=clamp(x,110,W-110); y=Math.max(y,130); this.popups.push({text,x,y,t:0,life:o.life||40,color:o.color||'#fff',size:o.size||34,rot:o.rot!==undefined?o.rot:rand(-0.2,0.2),burst:o.burst===undefined?null:o.burst}); }
  particle(x,y,type,n=1,spread=6){ for(let i=0;i<n;i++) this.particles.push({x,y,vx:rand(-spread,spread),vy:rand(-7,-2),t:0,life:randi(25,45),type}); }
  hitPoint(att,def,target){ const hx=def.x-att.facing*10; const hy = target==='body' ? FLOOR_Y-110*def.def.look.height : FLOOR_Y-186*def.def.look.height; return [hx,hy]; }
  onLand(att,def,p,dmg,counter,target){
    const [hx,hy]=this.hitPoint(att,def,target);
    const big=dmg>=12;
    if(target==='body'){ this.sfx.bodyHit(); this.popup(pick(POP.body),hx,hy-20,{size:big?40:30,color:'#fb923c',burst:big?'#fff':null}); this.particle(hx,hy,'sweat',3); }
    else {
      this.sfx.punch(dmg/3);
      const txt = p.def.arc==='hook'?pick(POP.hook):(p.def.arc==='upper'?pick(POP.upper):pick(POP.head));
      this.popup(txt,hx+att.facing*20,hy-40,{size:big?46:32,color:big?'#fde047':'#fff',burst:big?'#ef4444':null});
      this.particle(hx,hy,'sweat',big?6:3,8);
      if(big) this.particle(hx,hy,'star',3,5);
      if(dmg>=15 && Math.random()<0.5) this.particle(hx,hy,'tooth',1,4);
    }
    if(counter) this.popup('COUNTER!',hx,hy-85,{size:36,color:'#22d3ee',life:55});
    if(big){ this.particles.push({x:hx,y:hy,vx:0,vy:0,t:0,life:12,type:'burst',big:dmg>=16}); this.speedT=Math.max(this.speedT||0,dmg>=16?10:6); this.speedColor='rgba(255,255,255,0.7)'; }
    if(big && Math.random()<0.6) this.say(pick([`${att.def.name}의 묵직한 ${p.def.name}!`,`${def.def.name}, 크게 흔들립니다!`,`${att.def.name}, ${p.def.name}이(가) 제대로 들어갔어요!`,`관중석이 들썩입니다!`]));
    else if(def.hp<25 && Math.random()<0.15) this.say(`${def.def.name}, 위태롭습니다!`);
    if(big){ this.particles.push({x:hx,y:hy,vx:0,vy:0,t:0,life:12,type:'burst',big:dmg>=16}); this.speedT=Math.max(this.speedT||0,dmg>=16?10:6); this.speedColor='rgba(255,255,255,0.7)'; }
    if(big && Math.random()<0.6) this.say(pick([`${att.def.name}의 묵직한 ${p.def.name}!`,`${def.def.name}, 크게 흔들립니다!`,`${att.def.name}, ${p.def.name}이(가) 제대로 들어갔어요!`,`관중석이 들썩입니다!`]));
    else if(def.hp<25 && Math.random()<0.15) this.say(`${def.def.name}, 위태롭습니다!`);
    if(att.combo>=3) this.popup(`${att.combo} HIT COMBO`,att.x,FLOOR_Y-250,{size:22,color:'#a3e635',life:40,rot:0});
    this.shake=Math.max(this.shake,dmg*0.7*(target==='body'?0.6:1));
    this.sfx.crowd(0.5+dmg/40);
    // 타격 임팩트: 히트스톱 · 링 이펙트 · 카메라 펀치인 · 피격자 섬광
    this.hitStop=Math.max(this.hitStop||0, big?5:(dmg>=6?3:1));
    this.particles.push({x:hx,y:hy,vx:0,vy:0,t:0,life:big?16:10,type:'ring',big});
    this.camPunch=Math.max(this.camPunch||0, big?0.07:0.03);
    def.hitFlash=big?4:2; def.hitScale=big?1.1:1.05;
  }
  onBlock(att,def,p,chip){ this.sfx.block(); const [hx,hy]=this.hitPoint(att,def,p.target); this.popup('BLOCK',hx,hy-30,{size:24,color:'#94a3b8',life:28,rot:0}); this.particle(hx,hy,'spark',2,4); }
  onGuardBreak(def){ this.popup('가드 붕괴!',def.x,FLOOR_Y-240,{size:30,color:'#f87171',life:50,rot:0}); }
  onWhiff(att,def,ducked){ this.sfx.whiff(); if(ducked) this.popup('SWISH',def.x,FLOOR_Y-230,{size:22,color:'#cbd5e1',life:25}); }
  onSlipStart(f){ this.sfx.slip(); }
  onSkill(f,S){
    this.popup(S.name,f.x,FLOOR_Y-290,{size:44,color:'#fde047',life:80,burst:'#7c3aed',rot:0});
    this.speedT=28; this.speedColor='rgba(167,139,250,0.8)'; this.say(`${f.def.name}의 필살기, ${S.name}!`,180);
    this.speedT=28; this.speedColor='rgba(167,139,250,0.8)'; this.say(`${f.def.name}의 필살기, ${S.name}!`,180);
    this.flashT=14; if(this.phase==='fight'){ this.timeScale=0.35; this.slowT=380; } this.shake=8;
    this.sfx.tone(300,0.4,'sawtooth',0.25,900); this.sfx.noise(0.3,'highpass',1500,0.3); this.sfx.crowd(1.0);
    this.particle(f.x,FLOOR_Y-150,'star',6,7);
  }
  onCombo(att,def,c){
    const [hx,hy]=this.hitPoint(att,def,'head');
    this.popup(c.name,hx,hy-120,{size:40,color:'#f472b6',life:70,burst:'#fff',rot:0});
    this.sfx.tone(520,0.15,'square',0.12,780); this.sfx.tone(780,0.2,'square',0.12,1040,0.1); this.shake=Math.max(this.shake,10); this.sfx.crowd(0.9);
    this.speedT=Math.max(this.speedT||0,8); this.speedColor='rgba(244,114,182,0.7)'; this.say(`${att.def.name}, ${c.name} 완벽한 연타!`);
  }
  onParry(att,def,p){ this.say(`${def.def.name}의 완벽한 패리! ${att.def.name}이(가) 크게 흔들립니다`); const [hx,hy]=this.hitPoint(att,def,p.target); this.popup('PARRY!',hx,hy-50,{size:36,color:'#22d3ee',life:50,burst:'#0e7490'}); this.particle(hx,hy,'spark',8,7); this.sfx.block(); this.sfx.tone(1200,0.12,'triangle',0.2,1800); this.sfx.crowd(0.7); }
  onIron(att,def,p){ const [hx,hy]=this.hitPoint(att,def,p.target); this.popup('철벽!',hx,hy-40,{size:26,color:'#cbd5e1',life:30,rot:0}); this.particle(hx,hy,'spark',3,4); this.sfx.block(); }
  onGuardPierce(def){ this.popup('가드 관통!',def.x,FLOOR_Y-250,{size:30,color:'#f87171',life:50,rot:0}); }
  onSlip(def,att){ this.popup('SLIP!',def.x,FLOOR_Y-240,{size:30,color:'#22d3ee',life:40}); att.punch.recover=Math.round(att.punch.recover*1.6); att.setFace('shock',30,true); this.sfx.crowd(0.6); }
  knockdown(def,att,target){
    def.state='down'; def.stateT=0; def.punch=null; def.vx+=att.facing*5; def.knockdowns++; def.totalKD++; def.getupProgress=0;
    def.guard=def.duck=def.guardLow=false; def.setFace(def.hp<-15?'ko':'down',9999,true);
    def.x=clamp(def.x,RING_L+200,RING_R-200); def.vx=0;
    att.state='idle'; att.punch=null; att.setFace('smug',150,true); att.guard=att.duck=att.guardLow=false;
    this.cornerX = def.x<W/2 ? RING_R-120 : RING_L+120;   // 공격자는 중립 코너로
    this.downed=def; this.phase='count'; this.count=0; this.countT=-30;
    const idx=this.fighters.indexOf(def); this.getupTarget = this.ai[idx] ? this.ai[idx].getupCount() : 99;
    this.timeScale=0.25; this.slowT=900; this.shake=18;
    this.popup('DOWN!!',def.x,FLOOR_Y-260,{size:60,color:'#ef4444',life:90,burst:'#fde047'});
    this.particle(def.x,FLOOR_Y-10,'dust',6,10); this.particle(def.x,FLOOR_Y-150,'star',5,6);
    this.sfx.down(); this.sfx.crowd(1.2);
    this.speedT=16; this.speedColor='rgba(253,224,71,0.8)';
    this.say(pick([`다운! ${def.def.name}이(가) 쓰러졌습니다!`,`${att.def.name}, ${def.def.name}을(를) 캔버스에 눕혔습니다!`,`카운트가 시작됩니다!`]),200);
    for(let i=0;i<10;i++) this.particles.push({x:rand(60,W-60),y:rand(120,330),vx:0,vy:0,t:-randi(0,20),life:14,type:'spark'});
  }
  getup(d){
    d.state='getup'; d.stateT=0;
    d.hp=Math.max(d.hp,40+d.st.heart*3-d.knockdowns*5); d.stam=Math.max(d.stam,50); d.body*=0.65; d.dazed=80;
    d.setFace('dazed',120,true);
    this.phase='getup'; this.phaseT=0; this.sfx.getup(); this.sfx.crowd(0.8);
    if(this.ref){ this.ref.gesture='box'; this.ref.gT=110; }
    this.popup('일어났다!',d.x,FLOOR_Y-250,{size:30,color:'#a3e635',life:60,rot:0}); this.say(`${d.def.name}, 다시 일어섭니다! 대단한 근성!`); this.say(`${d.def.name}, 다시 일어섭니다! 대단한 근성!`);
  }
  endRound(){
    this.sfx.bell(1); this.phase='roundend'; this.phaseT=0;
    for(const f of this.fighters){ if(f.state==='punch'||f.state==='hit'||f.state==='slip') { f.state='idle'; f.punch=null; } f.guard=f.duck=f.guardLow=false; }
    this.popup('라운드 종료',W/2,200,{size:44,color:'#fde047',life:80,rot:0});
  }
  scoreRound(){
    const [a,b]=this.fighters;
    const sa=a.roundDmg+a.roundLanded*0.4, sb=b.roundDmg+b.roundLanded*0.4;
    let pa=10, pb=10;
    if(Math.abs(sa-sb)>3){ if(sa>sb) pb=9; else pa=9; }
    pa-=b.knockdowns*0; pb-=0;
    pa-=a.knockdowns; pb-=b.knockdowns;
    this.scores[0].push(pa); this.scores[1].push(pb);
    this.lastRoundScore=[pa,pb];
  }
  restRecover(){
    for(const f of this.fighters){ f.hp=Math.min(f.maxHp,f.hp+14+f.st.heart*2); f.stam=f.maxStam; f.body=Math.max(0,f.body-25); f.dazed=0; }
  }
  decision(){
    const ta=this.scores[0].reduce((s,v)=>s+v,0), tb=this.scores[1].reduce((s,v)=>s+v,0);
    const [a,b]=this.fighters;
    if(ta===tb) this.finish(null,'무승부',`${ta}-${tb} 판정`);
    else this.finish(ta>tb?a:b,'판정승',`${Math.max(ta,tb)}-${Math.min(ta,tb)}`);
  }
  finish(winner,method,detail){
    const [a,b]=this.fighters;
    this.result={winner,method,detail,round:this.round};
    this.phase='over'; this.phaseT=0; this.timeScale=1; this.slowT=0;
    if(winner){ const loser=winner===a?b:a; winner.state='win'; winner.punch=null; winner.setFace('win',9999,true);
      if(loser.state!=='down'&&loser.state!=='ko'){ loser.state='lose'; loser.setFace('lose',9999,true); } else { loser.state='ko'; loser.setFace('ko',9999,true); } }
    else { a.state='idle'; b.state='idle'; a.setFace('tired',9999,true); b.setFace('tired',9999,true); }
    this.sfx.bell(3); this.sfx.crowd(1.3);
    if(method==='KO'||method==='TKO'){ this.cinemaT=this.cinemaMax=240; this.timeScale=0.35; this.slowT=1500; this.speedT=30; this.speedColor='rgba(253,224,71,0.9)'; }
    this.say(winner ? `${winner.def.name}, ${method}로 승리합니다!` : '무승부! 팽팽했던 승부',300);
    this.popup(method==='KO'?'K.O.!!':(method==='TKO'?'T.K.O.!':method),W/2,180,{size:80,color:'#ef4444',life:250,burst:'#fde047',rot:0});
  }
  showResult(){
    const r=this.result, [a,b]=this.fighters, $=id=>document.getElementById(id);
    if(this.settings.mode==='online'){ $('btn-rematch').classList.add('hidden'); $('btn-reselect').classList.add('hidden'); }
    $('res-img').src = r.winner ? (this.portraitSrc(r.winner.def)||this.faceDataURL(r.winner)) : '';
    $('res-title').textContent = r.winner ? `${r.winner.def.name} "${r.winner.def.nick}" 승리!` : '무승부';
    $('res-sub').textContent = `${r.method} · ${r.detail}`;
    const row=(f)=>`<tr><td>${f.def.name}</td><td>${f.stats.thrown}</td><td>${f.stats.landed}</td><td>${f.stats.thrown?Math.round(f.stats.landed/f.stats.thrown*100):0}%</td><td>${Math.round(f.stats.dmgDealt)}</td><td>${f.totalKD}</td><td>${this.scores[this.fighters.indexOf(f)].join(' · ')||'-'}</td></tr>`;
    $('res-table').innerHTML=`<tr><th>선수</th><th>펀치</th><th>적중</th><th>적중률</th><th>대미지</th><th>다운</th><th>라운드 점수</th></tr>${row(a)}${row(b)}`;
    const career=this.settings.mode==='career', online=this.settings.mode==='online';
    $('btn-rematch').classList.toggle('hidden',career||online); $('btn-reselect').classList.toggle('hidden',career||online); $('btn-res-career').classList.toggle('hidden',!career);
    if(career && this.career.state && !this.careerRecorded){
      this.careerRecorded=true;
      this.careerMsg=this.career.record({ won:r.winner===a, draw:!r.winner, method:r.method, oppId:b.def.id, round:r.round });
      $('res-career-msg').textContent=this.careerMsg;
    } else if(!career) $('res-career-msg').textContent='';
    const extra=(f)=>`콤보 ${f.stats.combos} · 스킬 ${f.stats.skills} · 패리 ${f.stats.parries}`;
    $('res-extra').textContent=`${a.def.name}: ${extra(a)}   |   ${b.def.name}: ${extra(b)}`;
    this.screen='result'; this.show('overlay-result');
  }

  // ── 루프 & 렌더 ──
  loop(ts){
    const dt=Math.min(50,ts-this.lastTs||16); this.lastTs=ts;
    if(this.screen==='fight' && this.net.role==='guest' && this.settings.mode==='online'){
      // 게스트: 입력을 보내고 호스트 상태를 그대로 그림
      this.t++; this.net.sendInput(this.input); this.input.endFrame();
      if(this.net.lastState){ this.net.apply(this.net.lastState); this.net.lastState=null; }
      if(this.fighters && this.phase==='over' && this.phaseT>=260 && !this.resultShown){ this.resultShown=true; this.showResult(); }
      if(this.fighters && this.phase!=='vs' && !document.getElementById('overlay-vs').classList.contains('hidden')) this.show(null);
    } else if(this.screen==='fight'){
      if(this.input.pressed.has('Escape')||this.input.pressed.has('KeyP')) this.setPaused(!this.paused);
      if(!this.paused){
        this.acc+=dt*this.timeScale;
        let n=0; while(this.acc>=16.667 && n<4){ this.simFrame(); this.acc-=16.667; n++; }
        if(this.slowT>0){ this.slowT-=dt; if(this.slowT<=0) this.timeScale=1; }
      } else this.input.endFrame();
      if(this.net.role==='host' && this.settings.mode==='online' && this.fighters) this.net.send(this.net.snapshot());
    } else {
      this.t++;
      if(this.attract && this.fighters){ this.acc+=dt*this.timeScale; let n=0; while(this.acc>=16.667 && n<3){ this.simFrame(); this.acc-=16.667; n++; } if(this.slowT>0){ this.slowT-=dt; if(this.slowT<=0) this.timeScale=1; } }
      else this.input.endFrame();
    }
    this.render();
    requestAnimationFrame(ts2=>this.loop(ts2));
  }
  render(){
    const ctx=this.ctx; ctx.save();
    if(this.shake>0.5) ctx.translate(rand(-this.shake,this.shake),rand(-this.shake,this.shake)*0.6);
    // 다이내믹 카메라: 두 선수 사이를 중심으로 거리에 따라 줌
    if(this.fighters){
      const [a,b]=this.fighters; const dist=Math.abs(a.x-b.x);
      let ts=clamp(1.42-dist/700,1,1.3); if(this.settings.touch) ts=Math.min(1.45,ts+0.12);
      if(this.phase==='over'||this.phase==='count') ts=Math.min(1.45,ts+0.08);
      if(this.cinemaT>0) ts=Math.min(1.6,ts+0.25);
      if(this.cinemaT>0) ts=Math.min(1.6,ts+0.25);
      let tx=(a.x+b.x)/2; if(this.attract){ ts=1.12; tx+=this.parallax*60; } const half=W/(2*ts); tx=clamp(tx,half,W-half);
      this.cam.s+=(ts-this.cam.s)*0.04; this.camPunch=(this.camPunch||0)*0.85; this.cam.x+=(tx-this.cam.x)*0.06;
    } else { this.cam.s+=(1-this.cam.s)*0.05; this.cam.x+=(W/2-this.cam.x)*0.05; }
    ctx.save();
    { const S=this.cam.s+(this.camPunch||0), half=W/(2*S), cx=clamp(this.cam.x,half,W-half);
      ctx.translate(W/2,FLOOR_Y+40); ctx.scale(S,S); ctx.translate(-cx,-(FLOOR_Y+40)); }
    drawRing(ctx,this.t,this.assets.crowd,this.sfx.crowdLevel);
    if(this.fighters){
      const [a,b]=this.fighters;
      if(this.assets.ref.ref_idle && this.ref) drawRefereeSprite(ctx,this.ref,this.t,this.assets.ref,this.count);
      // 뒤에 있는(멀리) 선수 먼저: 다운된 선수는 먼저 그려서 상대가 위로
      const order = a.state==='down'||a.state==='ko' ? [a,b] : (b.state==='down'||b.state==='ko' ? [b,a] : (a.x<b.x?[b,a]:[a,b]));
      for(const f of order){ const set=this.spriteSet(f); if(set) drawFighterSprite(ctx,f,set); }
      if(this.phase==='count' && !this.ai[this.fighters.indexOf(this.downed)]) this.drawGetupBar(ctx,this.downed);
      for(const q of this.particles) drawParticle(ctx,q);
      for(const p of this.popups) drawPopup(ctx,p);
      ctx.restore();
      if(this.speedT>0){ drawSpeedLines(ctx,W/2,FLOOR_Y-120,Math.min(1,this.speedT/8),this.speedColor||'rgba(255,255,255,0.75)'); }
      if(this.attract){ ctx.fillStyle='rgba(4,6,14,0.35)'; ctx.fillRect(0,0,W,H); ctx.restore(); return; }
      this.drawHUD(ctx);
      this.drawCaption(ctx);
      this.drawCinema(ctx);
      if(this.phase==='rest') this.drawRest(ctx);
      if(this.flashT>0){ ctx.fillStyle=`rgba(255,255,255,${this.flashT/14*0.55})`; ctx.fillRect(0,0,W,H); }
    } else ctx.restore();
    ctx.restore();
  }
  drawCaption(ctx){
    const c=this.caption; if(!c || c.t<=0) return;
    const a=Math.min(1,c.t/12), y=H-44;
    ctx.save(); ctx.globalAlpha=a; ctx.font='800 15px "Malgun Gothic", "Pretendard", sans-serif'; ctx.textAlign='center';
    const w=ctx.measureText(c.text).width+36;
    rrect(ctx,W/2-w/2,y-16,w,30,8,'rgba(0,0,0,0.65)','rgba(253,224,71,0.5)',1);
    ctx.fillStyle='#fde047'; ctx.fillText('🎙 '+c.text,W/2,y+5); ctx.restore();
  }
  say(text,life=150){ this.caption={text,t:life}; }
  drawCinema(ctx){
    if(this.cinemaT>0){ const k=Math.min(1,(this.cinemaMax-this.cinemaT)/15), h=54*k;
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,h); ctx.fillRect(0,H-h,W,h); }
    // 저체력 비네트 (플레이어)
    const me=this.fighters && !this.ai[this.meIdx] ? this.fighters[this.meIdx] : null;
    if(me && me.hp<25 && me.state!=='down' && me.state!=='ko' && this.phase!=='over'){
      const p=0.25+0.2*Math.abs(Math.sin(this.t*0.12));
      const g=ctx.createRadialGradient(W/2,H/2,H*0.45,W/2,H/2,H*0.85); g.addColorStop(0,'rgba(200,16,46,0)'); g.addColorStop(1,`rgba(200,16,46,${p})`);
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }
  }
  drawCaption(ctx){
    const c=this.caption; if(!c || c.t<=0) return;
    const a=Math.min(1,c.t/12), y=H-44;
    ctx.save(); ctx.globalAlpha=a; ctx.font='800 15px "Malgun Gothic", "Pretendard", sans-serif'; ctx.textAlign='center';
    const w=ctx.measureText(c.text).width+36;
    rrect(ctx,W/2-w/2,y-16,w,30,8,'rgba(0,0,0,0.65)','rgba(253,224,71,0.5)',1);
    ctx.fillStyle='#fde047'; ctx.fillText('🎙 '+c.text,W/2,y+5); ctx.restore();
  }
  say(text,life=150){ this.caption={text,t:life}; }
  drawCinema(ctx){
    if(this.cinemaT>0){ const k=Math.min(1,(this.cinemaMax-this.cinemaT)/15), h=54*k;
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,h); ctx.fillRect(0,H-h,W,h); }
    // 저체력 비네트 (플레이어)
    const me=this.fighters && !this.ai[0] ? this.fighters[0] : null;
    if(me && me.hp<25 && me.state!=='down' && me.state!=='ko' && this.phase!=='over'){
      const p=0.25+0.2*Math.abs(Math.sin(this.t*0.12));
      const g=ctx.createRadialGradient(W/2,H/2,H*0.45,W/2,H/2,H*0.85); g.addColorStop(0,'rgba(200,16,46,0)'); g.addColorStop(1,`rgba(200,16,46,${p})`);
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }
  }
  drawGetupBar(ctx,d){
    const x=d.x-60, y=FLOOR_Y-120;
    ctx.font='900 18px "Malgun Gothic", sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=4;
    ctx.strokeText('연타로 일어나세요!',d.x,y-12); ctx.fillText('연타로 일어나세요!',d.x,y-12);
    rrect(ctx,x,y,120,14,7,'#111','#fff',2); rrect(ctx,x+2,y+2,116*clamp(d.getupProgress/100,0,1),10,5,'#a3e635');
  }
  drawHUD(ctx){
    const [a,b]=this.fighters;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,102);
    const drawSide=(f,side)=>{
      const dir=side===0?1:-1, x0=side===0?18:W-18;
      const bx = side===0 ? x0+70 : x0-70-330;
      // 초상화
      ctx.save(); ctx.beginPath(); ctx.arc(x0+dir*32,46,30,0,Math.PI*2); ctx.clip();
      ctx.fillStyle='#222'; ctx.fillRect(x0+dir*32-32,10,64,72);
      const set=this.spriteSet(f), pim=this.assets.portraits[f.def.id];
      const cx=x0+dir*32, cy=46, sh=f.state==='hit'?rand(-3,3):0;
      let drawn=false;
      if(set){ // 현재 포즈 스프라이트의 얼굴 부분 → 표정이 실시간으로 바뀜
        const pose=spritePose(f), sp=set[pose==='down'?'dazed':pose]||set.idle, m=sp&&sp.meta;
        if(m && m.hx!==undefined){ const r=m.hr*1.15; ctx.save(); ctx.translate(cx,cy); if(side===1) ctx.scale(-1,1);
          let sc=1; if(f.state==='hit'){ sc=1.12; } ctx.scale(sc,sc);
          ctx.drawImage(sp.img, m.hx-r, m.hy-r, r*2, r*2, -32+sh, -32, 64, 64); ctx.restore(); drawn=true; }
      }
      if(!drawn && pim){ ctx.drawImage(pim,cx-32+sh,14,64,64); drawn=true; }
      if(f.state==='hit'){ ctx.fillStyle=`rgba(255,40,40,${0.25+0.3*(f.hitstun/Math.max(1,f.hitstunMax))})`; ctx.fillRect(cx-32,10,64,72); }
      if(f.state==='down'||f.state==='ko'){ ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(cx-32,10,64,72); }
      if(f.skill){ ctx.fillStyle='rgba(124,58,237,0.25)'; ctx.fillRect(cx-32,10,64,72); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(x0+dir*32,46,30,0,Math.PI*2); ctx.strokeStyle=side===0?'#c8102e':'#1e40af'; ctx.lineWidth=3; ctx.stroke();
      // 이름
      ctx.font='900 18px "Malgun Gothic", sans-serif'; ctx.textAlign=side===0?'left':'right'; ctx.fillStyle='#fff';
      ctx.fillText(`${f.def.name}  "${f.def.nick}"`, side===0?bx:bx+330, 26);
      ctx.font='12px "Malgun Gothic", sans-serif'; ctx.fillStyle='#cbd5e1';
      ctx.fillText(`${f.style.name} · ${f.skillDef?f.skillDef.name:''}${f.skillLevel>1?' Lv.'+f.skillLevel:''}`, side===0?bx:bx+330, 85);
      // 스킬 게이지
      const spv=clamp(f.sp/100,0,1), ready=f.sp>=100;
      rrect(ctx,bx,65,330,6,3,'#2a2210','#000',1);
      const spw=326*spv; if(spw>0) rrect(ctx, side===0?bx+2:bx+2+(326-spw), 66, spw, 4, 2, ready?(Math.floor(this.t/6)%2?'#fff7ae':'#fde047'):'#eab308');
      if(ready){ ctx.font='900 11px "Malgun Gothic", sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fde047'; ctx.fillText(side===0?'SKILL 준비! (L)':'SKILL 준비!',bx+165,60); }
      if(f.skill){ ctx.font='900 12px "Malgun Gothic", sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#a78bfa'; ctx.fillText(f.skillDef.name+' 발동 중', bx+165, 98); }
      // HP
      const hp=clamp(f.hp/f.maxHp,0,1);
      rrect(ctx,bx,34,330,16,4,'#3a0a0a','#000',1.5);
      const ghost=clamp((f.hpGhost===undefined?f.hp:f.hpGhost)/f.maxHp,0,1), ghw=326*ghost; if(ghw>0) rrect(ctx, side===0?bx+2:bx+2+(326-ghw), 36, ghw, 12, 3, '#fde047');
      const hpw=326*hp; if(hpw>0) rrect(ctx, side===0?bx+2:bx+2+(326-hpw), 36, hpw, 12, 3, hp>0.5?'#ef4444':(hp>0.25?'#f59e0b':'#dc2626'));
      // 스태미나
      const st=clamp(f.stam/f.maxStam,0,1);
      rrect(ctx,bx,54,330,8,3,'#0a1a3a','#000',1);
      const stw=326*st; if(stw>0) rrect(ctx, side===0?bx+2:bx+2+(326-stw), 55, stw, 6, 2, st>0.25?'#38bdf8':'#f97316');
      // 바디 대미지 아이콘
      const ix = side===0 ? bx+336 : bx-30;
      rrect(ctx,ix,34,22,30,5,'#1f2937','#000',1);
      const bd=clamp(f.body/100,0,1); if(bd>0){ rrect(ctx,ix+2,36+26*(1-bd),18,26*bd,3,`rgba(239,68,68,${0.5+bd*0.5})`); }
      ctx.font='10px sans-serif'; ctx.fillStyle='#cbd5e1'; ctx.textAlign='center'; ctx.fillText('BODY',ix+11,75);
      // 넉다운 표시
      ctx.textAlign=side===0?'right':'left'; ctx.fillStyle='#fde047'; ctx.font='12px "Malgun Gothic", sans-serif';
      ctx.fillText('●'.repeat(f.knockdowns)+'○'.repeat(Math.max(0,3-f.knockdowns))+'  다운 '+f.totalKD, side===0?bx+330:bx, 85);
      // 피로/그로기 상태
      ctx.textAlign='center'; ctx.fillStyle=f.stam<25?'#f97316':'#a78bfa'; ctx.font='900 12px "Malgun Gothic", sans-serif';
      ctx.fillText(f.stam<25?'지침!':(f.dazed>0?'그로기':''), bx+165, 98);
    };
    drawSide(a,0); drawSide(b,1);
    // 중앙 라운드/타이머
    rrect(ctx,W/2-62,10,124,64,8,'rgba(0,0,0,0.6)','#fde047',2);
    ctx.textAlign='center'; ctx.fillStyle='#fde047'; ctx.font='900 14px "Malgun Gothic", sans-serif'; ctx.fillText(`ROUND ${this.round} / ${this.settings.rounds}`,W/2,30);
    ctx.fillStyle='#fff'; ctx.font='900 34px Impact, "Arial Black", sans-serif'; ctx.fillText(this.fmtTime(this.timer),W/2,64);
    // 조작 힌트
    if(this.fighters && !this.ai[this.meIdx]){ const sb=document.getElementById('tb-skill'); if(sb){ const r=this.fighters[this.meIdx].sp>=100; if(sb.classList.contains('ready')!==r) sb.classList.toggle('ready',r); } }
    if(this.settings.touch||this.settings.buttons){ ctx.restore(); return; }
    ctx.font='11px "Malgun Gothic", sans-serif'; ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.textAlign='left';
    if(this.settings.easy){ ctx.fillText('쉬운 조작  J 잽 · K 스트레이트 · U/I 훅 · O 어퍼컷 · S+펀치 바디 · Space 가드 · Q 회피 · L 스킬 (거리 자동)',14,H-10); ctx.restore(); return; }
    ctx.fillText('P1  A/D 이동 · Space 가드 · S 더킹(S+펀치=바디) · Q 슬립 · J 잽 · K 스트레이트 · U L훅 · I R훅 · O 어퍼컷',14,H-10);
    if(this.settings.mode==='2p'){ ctx.textAlign='right'; ctx.fillText('P2  ←/→ 이동 · Num0 가드 · ↓ 더킹 · Num3 슬립 · Num1 잽 · Num2 스트 · Num4 L훅 · Num5 R훅 · Num7 어퍼',W-14,H-24); }
    ctx.restore();
  }
  drawRest(ctx){
    const [a,b]=this.fighters, s=this.lastRoundScore||[10,10];
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(W/2-230,110,460,150);
    ctx.textAlign='center'; ctx.fillStyle='#fde047'; ctx.font='900 26px "Malgun Gothic", sans-serif'; ctx.fillText(`${this.round}라운드 종료`,W/2,145);
    ctx.fillStyle='#fff'; ctx.font='900 32px Impact, sans-serif'; ctx.fillText(`${s[0]}  -  ${s[1]}`,W/2,190);
    ctx.font='14px "Malgun Gothic", sans-serif'; ctx.fillStyle='#cbd5e1';
    ctx.fillText(`${a.def.name}  적중 ${a.roundLanded}  ·  ${b.def.name}  적중 ${b.roundLanded}`,W/2,218);
    ctx.fillText(`코너에서 회복 중...  ${Math.ceil((420-this.phaseT)/60)}초  (Enter로 건너뛰기)`,W/2,244);
  }
}
window.addEventListener('DOMContentLoaded',()=>{
  const g=window.game=new Game();
  // ?demo=1&skip=600&p1=0&p2=2  → CPU 관전 모드 (스크린샷/디버그용)
  const q=new URLSearchParams(location.search);
  if(q.has('select')){ g.settings.mode='cpu'; g.screen='select'; g.buildSelect(); g.show('overlay-select'); }
  if(q.has('touch')) g.setTouch(true);
  if(q.has('pro')) g.setEasy(false);
  if(q.has('play')){ g.settings.mode='cpu'; g.selection=[+(q.get('p1')||0), +(q.get('p2')||2)]; g.settings.voice=false; g.startMatch(); g.show(null); g.phase='intro'; g.phaseT=0;
    const skip=+(q.get('skip')||0); for(let i=0;i<skip && g.screen==='fight';i++) g.simFrame(); }
  if(q.has('join')){ g.sfx.init(); setTimeout(()=>g.joinRoom(q.get('join').toUpperCase()),300); history.replaceState(null,'',location.pathname); }
  if(q.has('host')){ g.screen='online'; g.show('overlay-online'); g.net.host((err,code)=>{ const $=id=>document.getElementById(id); if(err){ g.setOnlineStatus('호스트 실패: '+(err.type||err.message),true); return; } $('on-code-text').textContent=code; $('on-code').classList.remove('hidden'); g.setOnlineStatus('대기 중 '+code); }, q.get('host').toUpperCase()); }
  if(q.has('career')){ if(!g.career.state) g.career.start(q.get('career')||'kang'); g.openCareer('테스트'); }
  if(q.has('demo')){
    g.settings.mode='demo'; g.selection=[+(q.get('p1')||0), +(q.get('p2')||2)]; g.settings.voice=false;
    g.startMatch(); g.show(null); g.phase='intro'; g.phaseT=0;
    const skip=+(q.get('skip')||0); for(let i=0;i<skip && g.screen==='fight';i++) g.simFrame();
  }
});
