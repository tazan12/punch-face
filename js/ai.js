'use strict';
// 스타일별 CPU. difficulty: 0 쉬움, 1 보통, 2 어려움
class AI {
  constructor(fighter, difficulty){
    this.f=fighter; this.diff=difficulty; this.p=fighter.style.ai;
    this.mul=[0.55,1,1.4][difficulty];
    fighter.aiDmgMul=[0.85,1,1.1][difficulty];
    this.think=0; this.queued=null; this.comboLeft=0; this.retreatT=0; this.holdGuard=0; this.holdLow=false;
    this.lastSeen=null; this.wander=0; this.wanderDir=0; this.attackCd=0;
  }
  pickPunch(dist, opp){
    const f=this.f, w=this.p.weights, cand=[];
    for(const id of PUNCH_IDS){
      const d=PUNCHES[id];
      if(dist > f.punchReach(id)+30) continue;               // 닿지 않는 펀치는 제외
      let wt=w[id]||0.1;
      if(id===f.def.weapon) wt*=1.6;
      if(opp.duck && d.beatsDuck) wt*=5;
      if(opp.guard && !opp.guardLow && d.guardPen>=0.3) wt*=1.8;
      if(f.stam<d.stam*1.5) wt*=0.3;
      cand.push([id,wt]);
    }
    if(!cand.length) return null;
    let sum=cand.reduce((s,c)=>s+c[1],0), r=Math.random()*sum;
    for(const [id,wt] of cand){ r-=wt; if(r<=0) return id; }
    return cand[cand.length-1][0];
  }
  chooseTarget(id, opp){
    if(!PUNCHES[id].body) return 'head';
    let br=this.p.bodyRatio;
    if(opp.guard && !opp.guardLow) br+=0.35;       // 하이가드면 바디
    if(opp.guardLow) br-=0.3;
    if(opp.body>70) br+=0.2;                       // 바디가 무너져가면 집요하게
    return Math.random()<br ? 'body':'head';
  }
  input(opp, game){
    const inp=emptyInput(), f=this.f, p=this.p;
    const dist=Math.abs(opp.x-f.x), reach=f.punchReach('jab');
    const fwd = opp.x>f.x ? 'right':'left', back = fwd==='right'?'left':'right';
    this.think++;
    if(this.attackCd>0) this.attackCd--;

    // 콤보 이어가기 (회복 후반 캔슬)
    if(f.state==='punch'){
      if(this.comboLeft>0 && f.punch.phase==='recover' && f.punch.t>=f.punch.recover*0.5 && f.punch.result!=='whiff' && dist<=reach*1.1 && f.stam>12){
        const id=this.pickPunch(dist,opp);
        if(id){ inp.press[id]=true; inp.duck=this.chooseTarget(id,opp)==='body'; this.comboLeft--; }
      }
      return inp;
    }
    if(!f.canAct()) return inp;

    // ── 스킬: 게이지가 차면 사거리 안에서 사용 (철벽/카운터는 위기일 때) ──
    if(f.sp>=100 && !f.skill && f.skillDef){
      const t=f.skillDef.type;
      const want = (t==='iron'||t==='counter') ? (f.hp<55 || (opp.state==='punch' && dist<=reach*1.2)) : dist<=reach*1.1;
      if(want && Math.random()<0.05*this.mul){ inp.press.skill=true; return inp; }
    }
    // ── 상대 예비동작 반응 ──
    if(opp.state==='punch' && opp.punch && opp.punch.phase==='windup' && opp.punch!==this.lastSeen && dist<=reach*1.3){
      this.lastSeen=opp.punch;
      const r=Math.random();
      const reactChance=0.42*this.mul + p.counterRate*0.35 + f.st.defense*0.025;
      if(r<reactChance){
        const delay=Math.max(1, Math.round(p.reaction*(1.4-this.mul*0.4)));
        const rr=Math.random();
        if(rr<p.counterRate*0.55 && f.stam>25 && dist<=reach*1.0) this.queued={type:'counter',at:this.think+Math.max(1,delay-4),target:opp.punch.target};
        else if(rr<p.counterRate*0.55+p.slipRate*0.5) this.queued={type:'slip',at:this.think+delay};
        else this.queued={type:'guard',at:this.think+delay,low:opp.punch.target==='body',dur:18+randi(0,14)};
      }
    }
    if(this.queued && this.think>=this.queued.at){
      const q=this.queued; this.queued=null;
      if(q.type==='counter'){ const id=Math.random()<0.6?'straight':(dist<reach*0.7?'lhook':'jab'); inp.press[id]=true; this.comboLeft=1; return inp; }
      if(q.type==='slip'){ inp.press.slip=true; return inp; }
      this.holdGuard=q.dur; this.holdLow=q.low;
    }
    if(this.holdGuard>0){ inp.guard=true; inp.duck=this.holdLow; this.holdGuard--; }

    // ── 지치거나 그로기: 가드 올리고 물러남 ──
    if(f.stam<18 || f.dazed>40){
      inp.guard=Math.random()<0.8; if(f.dazed>40 && Math.random()<0.3) inp.duck=true;
      if(dist<reach*0.9 && Math.random()<0.6) inp[back]=true;
      return inp;
    }

    // ── 위치 잡기 ──
    const want=reach*p.prefDist;
    const nearRope = f.x<RING_L+150 || f.x>RING_R-150;
    if(this.retreatT>0){
      this.retreatT--; inp[back]=true;
      if(nearRope){ this.retreatT=0; }
      if(Math.random()<0.03 && dist<=reach*1.05){ inp.press.jab=true; }   // 물러나며 잽
    } else if(dist>want+14){ inp[fwd]=true; }
    else if(dist<want-16 && !nearRope){ inp[back]=true; }
    else if(this.wander>0){ this.wander--; if(this.wanderDir) inp[this.wanderDir]=true; }
    else if(Math.random()<0.02){ this.wander=randi(8,25); this.wanderDir=Math.random()<0.5?fwd:back; if(nearRope) this.wanderDir=fwd; }

    // 로프에 몰리면 슬립·반격 확률 증가
    if(nearRope && dist<reach*0.8 && Math.random()<0.02*this.mul){ inp.press.slip=true; return inp; }

    // ── 공격 결정 ──
    if(this.attackCd<=0 && dist<=reach*1.08 && f.stam>14 && !inp.guard){
      let chance=p.aggression*0.045*this.mul;
      if(opp.state==='hit'||opp.dazed>20) chance*=1.8;               // 흔들리면 몰아치기
      if(opp.state==='punch' && opp.punch.phase==='recover') chance*=1.5;  // 회복 구간 응징
      if(Math.random()<chance){
        const id=this.pickPunch(dist,opp);
        if(id){
          inp.press[id]=true; inp.duck=this.chooseTarget(id,opp)==='body';
          this.comboLeft=randi(p.combo[0],p.combo[1])-1;
          if(opp.dazed>20) this.comboLeft+=2;
          this.attackCd=randi(20,50);
          if(Math.random()<p.retreatAfterCombo) this.retreatT=randi(25,55);
          return inp;
        }
      }
    }
    // ── 평상시 가드 ──
    if(!inp.guard && this.holdGuard<=0 && dist<reach*1.25 && Math.random()<p.guardRate*0.06){ this.holdGuard=randi(15,40); this.holdLow=Math.random()<0.25; }
    return inp;
  }
  // 넉다운 기상 판단: 몇 카운트에 일어날지
  getupCount(){
    const f=this.f;
    let c=3+f.knockdowns*2+(f.hp<0?2:0)+(f.hp<-15?2:0)+randi(0,2)-Math.floor(f.st.heart/4);
    return clamp(c,2,9);
  }
}
