'use strict';
// 온라인 대전 (WebRTC / PeerJS). 호스트가 경기를 계산하고 게스트는 입력을 보내고 상태를 받아 그린다.
const NET_PREFIX='punchface-v1-';
const PEER_OPTS={ debug:0, config:{ iceServers:[
  {urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},
  {urls:'turn:openrelay.metered.ca:80', username:'openrelayproject', credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject'},
  {urls:'turns:openrelay.metered.ca:443', username:'openrelayproject', credential:'openrelayproject'} ] } };
class RemoteInput {
  constructor(){ this.down=new Set(); this.pressed=new Set(); this.anyPressed=false; }
  build(idx){
    const m=KEYMAPS[0], inp=emptyInput();
    inp.left=this.down.has(m.left); inp.right=this.down.has(m.right); inp.duck=this.down.has(m.duck); inp.guard=this.down.has(m.guard);
    for(const k of ['slip','skill',...PUNCH_IDS]) if(this.pressed.has(m[k])) inp.press[k]=true;
    inp.anyPress=[...PUNCH_IDS,'slip','guard'].some(k=>this.pressed.has(m[k]));
    return inp;
  }
  endFrame(){ this.pressed.clear(); this.anyPressed=false; }
}
class Net {
  constructor(game){ this.game=game; this.peer=null; this.conn=null; this.role=null; this.code=null; this.remote=new RemoteInput(); this.lastState=null; this.stateSeq=0; this.remoteEasy=true; this.remotePick=null; this.ready=false; }
  get connected(){ return !!(this.conn && this.conn.open); }
  available(){ return typeof Peer!=='undefined'; }
  genCode(){ const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
  host(cb,fixedCode){
    if(!this.available()) return cb(new Error('no-peerjs'));
    this.close(); this.role='host'; this.code=fixedCode||this.genCode(); this.hostCb=cb;
    this.openHostPeer();
  }
  openHostPeer(){
    const cb=this.hostCb, first=!this.hostOpened;
    this.peer=new Peer(NET_PREFIX+this.code,PEER_OPTS);
    this.peer.on('open',()=>{ this.hostOpened=true; if(first) cb(null,this.code); else this.game.setOnlineStatus('방을 다시 열었습니다 ('+this.code+'). 상대를 기다리는 중…'); });
    this.peer.on('error',e=>{ if(e.type==='unavailable-id' && first){ this.code=this.genCode(); this.openHostPeer(); } else if(first) cb(e); });
    this.peer.on('connection',c=>{ if(this.conn && this.conn.open){ c.close(); return; } this.conn=c; this.bind(c); this.game.setOnlineStatus('상대가 접속했습니다. 연결을 맺는 중…'); });
    // 백그라운드 등으로 서버 연결이 끊기면 같은 코드로 재등록 (초대 링크가 계속 유효하도록)
    this.peer.on('disconnected',()=>{ if(this.role!=='host') return; try{ this.peer.reconnect(); }catch(e){ this.rehost(); } });
    this.peer.on('close',()=>{ if(this.role==='host' && !this.connected) this.rehost(); });
  }
  rehost(){
    if(this.role!=='host' || this.connected) return;
    try{ if(this.peer) this.peer.destroy(); }catch(e){}
    setTimeout(()=>{ if(this.role==='host' && !this.connected) this.openHostPeer(); },500);
  }
  // 앱이 다시 보일 때 호스트 등록 상태 점검
  ensureHostAlive(){
    if(this.role!=='host' || this.connected || !this.peer) return;
    if(this.peer.destroyed) this.rehost();
    else if(this.peer.disconnected){ try{ this.peer.reconnect(); }catch(e){ this.rehost(); } }
  }
  join(code,cb){
    if(!this.available()) return cb(new Error('no-peerjs'));
    this.close(); this.role='guest'; this.code=code.toUpperCase().trim();
    this.peer=new Peer(PEER_OPTS); let done=false; const fin=e=>{ if(!done){ done=true; cb(e||null); } };
    const started=Date.now(), RETRY_MS=90000; let attempts=0;
    const attempt=()=>{
      if(done || this.role!=='guest' || !this.peer) return;
      attempts++;
      const left=Math.max(0,Math.round((RETRY_MS-(Date.now()-started))/1000));
      this.game.setOnlineStatus(attempts===1 ? '방을 찾는 중… ('+this.code+')' : '방을 찾는 중… 상대가 앱 화면을 열어두어야 합니다 (남은 시간 '+left+'초)');
      const c=this.peer.connect(NET_PREFIX+this.code,{serialization:'json',reliable:true}); this.conn=c; this.bind(c);
      c.on('open',()=>fin(null));
      setTimeout(()=>{ if(!done && c===this.conn && !c.open && !this.retrying){ fin(new Error('상대 기기와 직접 연결이 되지 않습니다. 양쪽 모두 Wi-Fi로 바꾸거나 잠시 후 다시 시도하세요')); } },20000);
    };
    this.peer.on('open',attempt);
    this.peer.on('error',e=>{
      if(e.type==='peer-unavailable'){
        if(Date.now()-started<RETRY_MS){ this.retrying=true; setTimeout(()=>{ this.retrying=false; attempt(); },3000); }
        else fin(new Error('그 코드의 방이 없습니다. 방을 만든 쪽이 앱을 열어둔 상태인지, 코드가 맞는지 확인하세요'));
      } else fin(new Error(e.type||e.message));
    });
  }
  bind(c){
    c.on('data',d=>this.onData(d));
    c.on('open',()=>this.game.onNetOpen());
    c.on('close',()=>{ if(c===this.conn && this.wasOpen) this.game.onNetClose('상대와의 연결이 끊어졌습니다'); });
    c.on('error',()=>{ if(c===this.conn && this.wasOpen) this.game.onNetClose('연결 오류'); });
    c.on('open',()=>{ this.wasOpen=true; });
  }
  send(d){ if(this.connected){ try{ this.conn.send(d); }catch(e){} } }
  onData(d){
    if(!d||!d.t) return;
    switch(d.t){
      case 'hello': this.remoteEasy=!!d.easy; break;
      case 'pick': this.remotePick=d.idx; this.remoteEasy=!!d.easy; this.game.onNetPick(d); break;
      case 'start': this.game.onNetStart(d); break;
      case 'in': this.remote.down=new Set(d.d); for(const k of d.p) this.remote.pressed.add(k); break;
      case 'st': if(d.seq>this.stateSeq){ this.stateSeq=d.seq; this.lastState=d; } break;
      case 'exit': this.game.onNetClose('상대가 경기를 나갔습니다'); break;
    }
  }
  sendInput(input){ this.send({t:'in',d:[...input.down],p:[...input.pressed]}); }
  // ── 호스트: 상태 스냅샷 ──
  snapshot(){
    const g=this.game, F=f=>({x:f.x,facing:f.facing,state:f.state,stateT:f.stateT,hitstun:f.hitstun,hitstunMax:f.hitstunMax,hitTarget:f.hitTarget,hitArc:f.hitArc,dazed:f.dazed,guard:f.guard,duck:f.duck,guardLow:f.guardLow,stam:f.stam,hp:f.hp,body:f.body,sp:f.sp,knockdowns:f.knockdowns,totalKD:f.totalKD,squash:f.squash,hitFlash:f.hitFlash,hitScale:f.hitScale,flash:f.flash,evadeT:f.evadeT,walkT:f.walkT,skillArmor:f.skillArmor,t:f.t,hpGhost:f.hpGhost,getupProgress:f.getupProgress,combo:f.combo,
      punch:f.punch?{id:f.punch.id,phase:f.punch.phase,t:f.punch.t,windup:f.punch.windup,recover:f.punch.recover,active:f.punch.active,target:f.punch.target,result:f.punch.result}:null,
      skill:f.skill?{type:f.skill.type}:null, stats:f.stats});
    const r=g.result;
    const st={t:'st',seq:++this.stateSeq,f:g.fighters.map(F),phase:g.phase,phaseT:g.phaseT,timer:g.timer,round:g.round,count:g.count,countT:g.countT,
      downed:g.downed?g.fighters.indexOf(g.downed):-1,ref:g.ref,shake:g.shake,flashT:g.flashT,speedT:g.speedT,speedColor:g.speedColor,cinemaT:g.cinemaT,cinemaMax:g.cinemaMax,
      hitStop:g.hitStop,timeScale:g.timeScale,caption:g.caption,paused:g.paused,scores:g.scores,lastRoundScore:g.lastRoundScore,
      popups:g.popups.map(p=>[p.text,p.x,p.y,p.t,p.life,p.color,p.size,p.rot,p.burst]),
      particles:g.particles.map(q=>[q.type,q.x,q.y,q.t,q.life,q.big?1:0]),
      result:r?{w:r.winner?g.fighters.indexOf(r.winner):-1,method:r.method,detail:r.detail,round:r.round}:null,
      sfx:g.netSfx};
    g.netSfx=[];
    return st;
  }
  // ── 게스트: 스냅샷 적용 ──
  apply(st){
    const g=this.game; if(!g.fighters) return;
    st.f.forEach((d,i)=>{ const f=g.fighters[i]; const punch=d.punch, skill=d.skill, stats=d.stats;
      Object.assign(f,d); f.punch = punch ? Object.assign(punch,{def:PUNCHES[punch.id],hit:true}) : null; f.skill = skill?{type:skill.type,t:0,dur:1}:null; f.stats=stats||f.stats; });
    for(const k of ['phase','phaseT','timer','round','count','countT','shake','flashT','speedT','speedColor','cinemaT','cinemaMax','hitStop','timeScale','caption','scores','lastRoundScore']) g[k]=st[k];
    g.downed = st.downed>=0 ? g.fighters[st.downed] : null;
    if(st.ref){ g.ref=st.ref; g.refX=st.ref.x; }
    g.popups=st.popups.map(p=>({text:p[0],x:p[1],y:p[2],t:p[3],life:p[4],color:p[5],size:p[6],rot:p[7],burst:p[8]}));
    g.particles=st.particles.map(q=>({type:q[0],x:q[1],y:q[2],t:q[3],life:q[4],big:!!q[5],vx:0,vy:0}));
    g.result = st.result ? {winner: st.result.w>=0?g.fighters[st.result.w]:null, method:st.result.method, detail:st.result.detail, round:st.result.round} : null;
    if(st.paused!==g.paused) g.setPaused(st.paused);
    for(const [name,args] of (st.sfx||[])){ if(name==='speak') g.speak(args[0]); else if(g.sfx[name]) g.sfx[name](...args); }
    g.sfx.tick();
  }
  close(){ try{ if(this.conn) this.conn.close(); }catch(e){} try{ if(this.peer) this.peer.destroy(); }catch(e){} this.conn=null; this.peer=null; this.role=null; this.lastState=null; this.stateSeq=0; this.remotePick=null; this.ready=false; this.remote=new RemoteInput(); this.hostOpened=false; this.wasOpen=false; this.retrying=false; }
}
