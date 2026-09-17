'use strict';
// 타격 판정 · 대미지 · 넉다운 · 패리 · 콤보 · 스킬 상호작용
class Combat {
  constructor(game){ this.game=game; }

  tryHit(att, def, p){
    const dist=Math.abs(def.x-att.x);
    const reach=att.punchReach(p.id) + (att.spriteReach ? 6 : 22);   // 글러브 반경 보정
    if(dist>reach) return;
    p.hit=true;
    if(!def.isVulnerable()){ p.result='whiff'; return; }
    if(def.state==='slip' && def.stateT<SLIP_INVULN){ p.result='miss'; this.game.onSlip(def,att); return; }
    const target=p.target;
    // 미러 카운터 자세: 흘리고 즉시 2배 스트레이트
    if(def.inCounterStance() && def.canAct() && !p.unblockable){
      p.result='miss'; def.evadeT=12; def.setFace('smug',30,true); this.game.onSlip(def,att);
      def.startPunch('straight','head',this.game,{mul:2.0*def.skillDmgMul(),skill:true,fast:0.8});
      return;
    }
    // 더킹은 머리 펀치를 흘린다 (어퍼컷 제외)
    if(target==='head' && def.duck && !def.guard && !p.def.beatsDuck && def.state!=='hit' && !p.unblockable){
      p.result='miss'; this.game.onWhiff(att,def,true); return;
    }
    // 패시브 헤드 무브먼트: 방어 스탯이 높을수록 머리 펀치를 흘린다 (여유 있을 때만)
    if(target==='head' && def.canAct() && !def.guard && def.dazed<=0 && def.stam>20 && !p.unblockable && Math.random()<def.st.defense*0.035){
      p.result='miss'; def.vx-=att.facing*1.5; def.evadeT=12; def.setFace('focused',20,true); this.game.onWhiff(att,def,true); return;
    }
    let blocked=false, easyBlock=false;
    if(target==='head' && def.guard && !def.guardLow) blocked=true;
    if(target==='body' && def.guardLow) blocked=true;
    if(target==='body' && def.guard && !def.guardLow && def.easyGuard){ blocked=true; easyBlock=true; }
    if(def.inIron()) blocked=true;
    if(p.unblockable && !def.inIron()){ if(blocked) this.game.onGuardPierce(def); blocked=false; }

    // 대미지 계산
    let dmg=p.def.dmg*0.42*(0.7+att.st.power*0.06);
    if(att.def.weapon===p.id) dmg*=1.25;                 // 주무기
    if(att.stam<25) dmg*=0.65; else if(att.stam<50) dmg*=0.85;
    if(att.dazed>0) dmg*=0.8;
    if(att.aiDmgMul) dmg*=att.aiDmgMul;
    dmg*=p.dmgMul||1;
    let counter=false;
    if(def.state==='punch' && def.punch && def.punch.phase==='windup'){ counter=true; dmg*=1.5; }
    if(target==='head' && def.duck && p.def.beatsDuck){ counter=true; dmg*=1.3; }   // 더킹에 어퍼컷
    dmg*=(1-def.st.defense*0.015);
    if(att.combo>=4) dmg*=0.7; else if(att.combo>=2) dmg*=0.85;   // 콤보 대미지 감쇠

    if(blocked){
      // 철벽: 완전 방어
      if(def.inIron()){ def.vx+=att.facing*p.def.kb*0.3; def.setFace('smug',15,true); p.result='blocked'; att.stats.blocked++; this.game.onIron(att,def,p); return; }
      // 패리: 가드를 올린 직후 맞으면 상대를 크게 흔든다
      if(def.t-def.guardStart<=PARRY_WINDOW && !easyBlock && !p.skill){
        p.result='parry'; def.stats.parries++; def.addSp(15);
        att.punch.recover=Math.round(att.punch.recover*2.2); att.cantPunch=12; att.setFace('shock',30,true);
        att.vx-=att.facing*3; def.blockStun=0; this.game.onParry(att,def,p); return;
      }
      const chip=dmg*p.def.guardPen*(easyBlock?3:1);   // 쉬운 조작의 바디 가드는 칩 대미지가 큼
      def.stam=Math.max(0,def.stam-dmg*0.5);
      if(target==='head') def.hp-=chip; else def.body=Math.min(100,def.body+chip);
      def.vx+=att.facing*p.def.kb*0.5; def.blockStun=6; def.setFace('block',15,true);
      att.stats.blocked++; att.addSp(2); def.addSp(3);
      p.result='blocked'; this.game.onBlock(att,def,p,chip);
      // 스태미나 고갈 → 가드 붕괴, 감소된 대미지로 적중
      if(def.stam<=0){ def.guard=def.guardLow=false; this.game.onGuardBreak(def); this.land(att,def,p,dmg*0.6,false); }
      return;
    }
    this.land(att,def,p,dmg,counter);
  }

  // 최근 적중 순서로 명명 콤보 판정
  checkCombo(att,p){
    const now=att.t;
    att.recent=att.recent.filter(r=>now-r.t<70);
    att.recent.push({id:p.id,target:p.target,t:now});
    for(const c of COMBOS){
      const n=c.seq.length; if(att.recent.length<n) continue;
      const tail=att.recent.slice(-n);
      const ok=tail.every((r,i)=>{ const tok=c.seq[i]; return tok==='*body' ? r.target==='body' : (r.id===tok && r.target==='head'); });
      if(ok){ att.recent=[]; return c; }
    }
    return null;
  }

  land(att,def,p,dmg,counter){
    const target=p.target;
    p.result='hit';
    att.stats.landed++; att.roundLanded++;
    const combo=this.checkCombo(att,p);
    if(combo){ dmg*=combo.mul; att.stats.combos++; if(combo.daze) def.dazed=Math.max(def.dazed,combo.daze); }
    const armor=def.skillArmor;
    if(!armor){
      def.state='hit'; def.punch=null; def.guard=def.duck=def.guardLow=false;
      def.hitstun=Math.round(p.def.hitstun*(counter?1.3:1)*Math.max(0.5,1-att.combo*0.12)); def.hitstunMax=def.hitstun;
      def.hitTarget=target; def.hitArc=p.def.arc;
      def.vx+=att.facing*p.def.kb*(target==='body'?0.6:1);
    } else { dmg*=0.5; def.flash=8; }
    def.squash=target==='body'?0.2:0.4;
    let kd=false;
    if(target==='head'){
      dmg*=(1-def.st.chin*0.03);
      def.hp-=dmg;
      if(!armor){ def.dazed=Math.max(def.dazed, Math.round(dmg*3)); def.setFace('hit_head', 22+dmg*1.2, true); }
      if(def.hp<=0) kd=true;
      else if(!armor){
        let prob=Math.max(0,(dmg-8)/55)*(1-def.st.chin*0.06)*(1.6-def.hp/def.maxHp);
        if(def.hp>65 && dmg<14) prob=0;                  // 체력이 충분하면 강타에만 플래시 다운
        if(def.dazed>60) prob*=1.5;
        if(counter) prob*=1.4;
        if(def.hp<20) prob+=0.08;
        if(p.kd) prob+=0.35;
        if(Math.random()<prob) kd=true;
      }
    } else {
      def.body=Math.min(100,def.body+dmg*1.6);
      def.hp-=dmg*0.45;
      def.stam=Math.max(0,def.stam-dmg*1.8);
      if(!armor) def.setFace('hit_body', 28+dmg, true);
      if(def.body>=100||def.hp<=0) kd=true;
      else if(!armor && def.body>=70 && Math.random()<((def.body-65)/160)*(1-def.st.chin*0.04)) kd=true;
    }
    att.stats.dmgDealt+=dmg; att.roundDmg+=dmg;
    att.addSp(target==='head'?7:6); def.addSp(4);
    this.game.onLand(att,def,p,dmg,counter,target);
    if(combo) this.game.onCombo(att,def,combo);
    if(kd) this.game.knockdown(def,att,target);
  }
}
