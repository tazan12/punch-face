'use strict';
const SLIP_INVULN = 14, SLIP_TOTAL = 26, GETUP_FRAMES = 45, PARRY_WINDOW = 8;
// 표정 우선순위: 높은 것이 낮은 것을 덮어씀
const FACE_PRI = { neutral:0, focused:1, attack:1, angry:1, smug:1, tired:1, hurt:1, happy:1, block:2, shock:2, dazed:2, hit_body:3, hit_head:3, down:4, ko:5, win:5, lose:4 };

function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function lerp(a,b,t){ return a+(b-a)*t; }
function easeOut(t){ t=clamp(t,0,1); return 1-Math.pow(1-t,3); }
function rand(a,b){ return a+Math.random()*(b-a); }
function randi(a,b){ return Math.floor(rand(a,b+1)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function emptyInput(){ return { left:false, right:false, duck:false, guard:false, press:{}, anyPress:false }; }

class Fighter {
  constructor(def, side){
    this.def=def; this.side=side; this.style=STYLES[def.style]; this.st=def.stats;
    this.skillDef=SKILLS[def.id]||null; this.skillLevel=def.skillLevel||1;
    this.maxHp=100; this.maxStam=100;
    this.reachPx = BASE_REACH + this.st.reach*7;
    this.face={expr:'neutral',t:0};
    this.reset();
  }
  reset(){
    this.hp=this.maxHp; this.stam=this.maxStam; this.body=0; this.totalKD=0; this.sp=0;
    this.stats={ thrown:0, landed:0, dmgDealt:0, blocked:0, combos:0, skills:0, parries:0 };
    this.roundReset();
  }
  roundReset(){
    this.state='idle'; this.stateT=0; this.punch=null; this.vx=0; this.hitstun=0; this.hitstunMax=1;
    this.dazed=0; this.guard=false; this.guardLow=false; this.duck=false; this.knockdowns=0;
    this.face={expr:'neutral',t:0}; this.squash=0; this.combo=0; this.lastPunchEnd=-999;
    this.getupProgress=0; this.walkT=0; this.t=0; this.roundDmg=0; this.roundLanded=0;
    this.cantPunch=0; this.blockStun=0; this.evadeT=0; this.hitTarget='head'; this.hitArc='straight';
    this.skill=null; this.skillArmor=false; this.recent=[]; this.guardStart=-999; this.flash=0;
  }
  setFace(expr,dur,force){
    if(force || this.face.t<=0 || (FACE_PRI[expr]||0) >= (FACE_PRI[this.face.expr]||0)) this.face={expr,t:dur};
  }
  // 상태에 따른 기본 표정
  currentExpr(){
    if(this.face.t>0) return this.face.expr;
    switch(this.state){
      case 'punch': return 'attack';
      case 'down': return this.hp<-15?'ko':'down';
      case 'ko': return 'ko';
      case 'win': return 'win';
      case 'lose': return 'lose';
      case 'getup': return 'dazed';
      case 'hit': return this.hitTarget==='body'?'hit_body':'hit_head';
    }
    if(this.dazed>0) return 'dazed';
    if(this.guard) return 'block';
    if(this.stam<25) return 'tired';
    if(this.hp<30) return 'hurt';
    return this.def.look.mood||'neutral';
  }
  frameMul(){ let m=1.15-this.st.speed*0.03; if(this.stam<25)m*=1.3; else if(this.stam<50)m*=1.1; if(this.dazed>0)m*=1.15; return m; }
  moveSpeed(){ let v=2.0*(0.7+this.st.speed*0.06); if(this.stam<25)v*=0.7; if(this.dazed>0)v*=0.6; return v*(1-this.body/250); }
  // 펀치별 유효 리치(px). 일러스트 모드에서는 스프라이트의 글러브 길이 기준
  punchReach(id){
    const d=PUNCHES[id];
    if(this.spriteReach && this.spriteReach[id]) return this.spriteReach[id];
    return this.reachPx*d.reach;
  }
  canAct(){ return this.state==='idle'||this.state==='walk'||this.state==='guard'||this.state==='duck'; }
  isVulnerable(){ return this.state!=='down'&&this.state!=='ko'&&this.state!=='getup'&&this.state!=='win'&&this.state!=='lose'&&this.state!=='rest'; }
  addSp(v){ this.sp=clamp(this.sp+v*(1+(this.skillLevel-1)*0.25),0,100); }
  skillDmgMul(){ return 1+(this.skillLevel-1)*0.15; }
  inCounterStance(){ return !!(this.skill && this.skill.type==='counter'); }
  inIron(){ return !!(this.skill && this.skill.type==='iron'); }

  update(inp, opp, game){
    this.t++;
    if(this.face.t>0) this.face.t--;
    this.squash*=0.86;
    if(this.dazed>0) this.dazed--;
    if(this.cantPunch>0) this.cantPunch--;
    if(this.blockStun>0) this.blockStun--;
    if(this.evadeT>0) this.evadeT--;
    if(this.flash>0) this.flash--;
    this.facing = opp.x>=this.x ? 1 : -1;
    // 스태미나 회복
    const regen = this.state==='punch'?0.02 : (this.guard?0.16 : (this.state==='walk'?0.07:0.12));
    this.stam=Math.min(this.maxStam, this.stam + regen*(0.6+this.st.stamina*0.06)*(1-this.body/160));
    // 스킬 발동 입력
    if(inp.press.skill) this.activateSkill(game, opp);
    this.updateSkill(game, opp);

    switch(this.state){
      case 'punch': this.updatePunch(inp,opp,game); break;
      case 'hit': this.hitstun--; if(this.hitstun<=0) this.state='idle'; break;
      case 'slip': this.stateT++; if(this.stateT>=SLIP_TOTAL) this.state='idle'; break;
      case 'getup': this.stateT++; if(this.stateT>=GETUP_FRAMES) this.state='idle'; break;
      case 'down': case 'ko': case 'win': case 'lose': case 'rest': this.stateT++; break;
      default: this.updateActive(inp,opp,game);
    }
    this.x+=this.vx; this.vx*=0.82;
    this.x=clamp(this.x, RING_L+120, RING_R-120);
    if(this.state!=='walk') this.walkT=0;
  }
  punchInput(inp){ for(const id of PUNCH_IDS) if(inp.press[id]) return id; return null; }
  updateActive(inp,opp,game){
    if(this.skill && this.skill.type==='rush') return;                 // 러시 중엔 스킬이 조종
    if(inp.guard && !this.guard) this.guardStart=this.t;               // 패리 타이밍용
    this.guard=!!inp.guard; this.duck=!!inp.duck; this.guardLow=this.guard&&this.duck;
    if(this.inIron()){ this.guard=true; this.guardLow=false; }
    const pid=this.punchInput(inp);
    if(pid && this.blockStun<=0 && this.cantPunch<=0 && this.stam>=PUNCHES[pid].stam*0.5 && !this.inIron()){
      this.startPunch(pid, (inp.duck&&PUNCHES[pid].body)?'body':'head', game); return;
    }
    if(inp.press.slip && this.stam>=6 && this.blockStun<=0){
      this.state='slip'; this.stateT=0; this.stam-=6; this.vx-=this.facing*2.5;
      this.guard=this.duck=this.guardLow=false; this.setFace('focused',26); game.onSlipStart(this); return;
    }
    const dx=(inp.right?1:0)-(inp.left?1:0);
    if(dx!==0){
      const fwd = dx===this.facing;
      const sp=this.moveSpeed()*(fwd?1:0.75)*(this.guard?0.6:1)*(this.duck?0.5:1);
      this.x+=dx*sp; this.walkT+=0.25; this.state='walk';
    } else this.state=this.guard?'guard':(this.duck?'duck':'idle');
  }
  startPunch(id,target,game,opt={}){
    const d=PUNCHES[id], f=this.frameMul()*(opt.fast||1);
    this.combo = (this.t-this.lastPunchEnd<20) ? this.combo+1 : 1;
    this.punch={ id, def:d, target, phase:'windup', t:0, hit:false, result:null,
      windup:Math.round(d.windup*f), active:d.active, recover:Math.round(d.recover*f),
      dmgMul:opt.mul||1, unblockable:!!opt.unblockable, kd:!!opt.kd, skill:!!opt.skill };
    this.state='punch'; this.stam=Math.max(0,this.stam-(opt.skill?0:d.stam)); this.stats.thrown++;
    this.guard=this.duck=this.guardLow=false;
    this.setFace('attack',12);
  }
  updatePunch(inp,opp,game){
    const p=this.punch; p.t++;
    if(p.phase==='windup'){
      const dist=Math.abs(opp.x-this.x);
      // 스텝인: 사거리 밖이면 더 크게 파고든다 (조작 난이도 완화)
      const need=this.punchReach(p.id);
      if(dist>68) this.x+=this.facing*(dist>need ? Math.min(4.5,(dist-need)/p.windup+1.5) : (p.def.arc==='straight'?1.2:0.7));
      if(p.t>=p.windup){ p.phase='active'; p.t=0; }
    } else if(p.phase==='active'){
      if(!p.hit) game.combat.tryHit(this,opp,p);
      if(p.t>=p.active){
        if(!p.hit){ p.result='whiff'; game.onWhiff(this,opp,false); }
        p.phase='recover'; p.t=0;
      }
    } else {
      if(this.skill && this.skill.type==='rush') { if(p.t>=p.recover){ this.punch=null; this.state='idle'; this.lastPunchEnd=this.t; } return; }
      const pid=this.punchInput(inp);
      // 콤보 캔슬: 맞거나 막힌 펀치만 후반 회복 구간에서 다음 펀치로 이어짐 (헛스윙은 불가)
      if(pid && p.t>=p.recover*0.5 && p.result!=='whiff' && p.result!=='miss' && this.stam>=PUNCHES[pid].stam*0.5){
        this.lastPunchEnd=this.t; this.startPunch(pid,(inp.duck&&PUNCHES[pid].body)?'body':'head',game); return;
      }
      if(p.t>=p.recover){ this.punch=null; this.state='idle'; this.lastPunchEnd=this.t; }
    }
  }

  // ── 캐릭터 스킬 ──
  activateSkill(game, opp){
    const S=this.skillDef; if(!S || this.sp<100 || this.skill || !this.canAct()) return;
    this.sp=0; this.stats.skills++;
    const mul=this.skillDmgMul();
    switch(S.type){
      case 'rush': this.skill={type:'rush',seq:S.seq,idx:0,t:0}; this.skillArmor=true; this.guard=this.duck=this.guardLow=false;
        if(S.dash){ const dist=Math.abs(opp.x-this.x); if(dist>110) this.x+=this.facing*(dist-100); } break;
      case 'power': this.startPunch(S.punch,'head',game,{mul:S.mul*mul,unblockable:true,kd:!!S.kd,skill:true,fast:0.85}); break;
      case 'counter': this.skill={type:'counter',dur:S.dur,t:0}; break;
      case 'iron': this.skill={type:'iron',dur:S.dur,t:0}; break;
    }
    game.onSkill(this,S);
  }
  updateSkill(game, opp){
    const k=this.skill; if(!k) return;
    k.t++;
    if(k.type==='rush'){
      if(this.state==='hit'||this.state==='down'||this.state==='ko'){ this.endSkill(); return; }
      const ready = this.canAct() || (this.state==='punch' && this.punch.phase==='recover' && this.punch.t>=this.punch.recover*0.3);
      if(k.idx>=k.seq.length){ if(this.state!=='punch') this.endSkill(); return; }
      if(ready){
        const [id,target]=k.seq[k.idx++];
        this.lastPunchEnd=this.t;
        this.startPunch(id,target,game,{mul:1.25*this.skillDmgMul(),skill:true,fast:0.7});
      }
    } else if(k.type==='counter'){
      this.setFace('focused',2);
      if(k.dur-- <= 0) this.endSkill();
    } else if(k.type==='iron'){
      this.hp=Math.min(this.maxHp,this.hp+0.1*this.skillDmgMul()); this.stam=Math.min(this.maxStam,this.stam+0.35);
      if(k.dur-- <= 0) this.endSkill();
    }
  }
  endSkill(){ this.skill=null; this.skillArmor=false; }
}
