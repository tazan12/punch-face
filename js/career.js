'use strict';
// 챔피언 로드: 랭킹 도전 · 타이틀 방어 · 능력치/스킬 강화 · 전적 히스토리 (localStorage 저장)
const CAREER_KEY='pf_career_v1';
const UPG_NAMES={ power:'파워', speed:'스피드', stamina:'체력', chin:'맷집', heart:'회복', defense:'방어' };
class Career {
  constructor(game){ this.game=game; this.state=this.load(); }
  load(){ try{ const s=JSON.parse(localStorage.getItem(CAREER_KEY)); if(s && s.charId) return s; }catch(e){} return null; }
  save(){ try{ localStorage.setItem(CAREER_KEY,JSON.stringify(this.state)); }catch(e){} }
  start(charId){
    const ranking=RANKING_ORDER.filter(id=>id!==charId);
    this.state={ charId, ranking, rank:ranking.length+1, wins:0, losses:0, kos:0, points:2, defenses:0, champion:false, belts:0,
      upgrades:{power:0,speed:0,stamina:0,chin:0,heart:0,defense:0}, skillLevel:1, history:[], streak:0 };
    this.save();
  }
  clear(){ this.state=null; try{ localStorage.removeItem(CAREER_KEY); }catch(e){} }
  base(){ return FIGHTERS.find(f=>f.id===this.state.charId); }
  // 강화가 반영된 선수 정의
  playerDef(){
    const b=this.base(), stats={...b.stats};
    for(const k in this.state.upgrades) stats[k]=Math.min(10, stats[k]+this.state.upgrades[k]);
    return {...b, stats, skillLevel:this.state.skillLevel};
  }
  // 랭킹 표 (1위부터). 플레이어는 rank 위치에 삽입
  table(){
    const s=this.state, out=[]; let j=0;
    for(let r=1;r<=s.ranking.length+1;r++){ if(r===s.rank) out.push({id:s.charId,player:true,rank:r}); else out.push({id:s.ranking[j++],player:false,rank:r}); }
    return out;
  }
  nextOpponent(){
    const s=this.state;
    if(s.champion){ const top=s.ranking.slice(0,3); return { id: top[Math.floor(Math.random()*top.length)], title:true }; }
    return { id: s.ranking[s.rank-2], title: s.rank===2 };
  }
  difficulty(){ const r=this.state.rank; if(this.state.champion) return 2; return r>=7 ? 0 : (r>=4 ? 1 : 2); }
  // 경기 결과 반영. 반환: 요약 문구
  record({won, draw, method, oppId, round}){
    const s=this.state, before=s.rank, wasChamp=s.champion; let msg='';
    const ko=method==='KO'||method==='TKO';
    if(won){
      s.wins++; s.streak++; if(ko) s.kos++;
      s.points += 3 + (ko?1:0) + (s.champion?1:0);
      if(s.champion){ s.defenses++; msg=`타이틀 방어 성공! (${s.defenses}차 방어)`; }
      else { s.rank--; if(s.rank===1){ s.champion=true; s.belts++; msg='🏆 세계 챔피언 등극!'; } else msg=`랭킹 ${before}위 → ${s.rank}위`; }
    } else if(draw){ s.points+=1; msg='무승부 — 랭킹 유지'; s.streak=0; }
    else {
      s.losses++; s.streak=0; s.points+=1;
      if(s.champion){ s.champion=false; s.rank=2; msg='타이틀 상실… 2위로'; }
      else msg=`패배 — 랭킹 ${s.rank}위 유지`;
    }
    const opp=FIGHTERS.find(f=>f.id===oppId);
    s.history.unshift({ date:new Date().toISOString().slice(0,10), opp:opp?opp.name:oppId, won, draw:!!draw, method, round, rank:s.rank, champ:s.champion, title:wasChamp||before===2 });
    if(s.history.length>40) s.history.length=40;
    this.save(); return msg;
  }
  canUpgrade(k){ const s=this.state; if(k==='skill') return s.points>=2 && s.skillLevel<3; return s.points>=1 && this.base().stats[k]+s.upgrades[k]<10; }
  upgrade(k){
    const s=this.state; if(!this.canUpgrade(k)) return false;
    if(k==='skill'){ s.points-=2; s.skillLevel++; } else { s.points-=1; s.upgrades[k]++; }
    this.save(); return true;
  }

  // ── UI ──
  render(msg){
    const s=this.state, $=id=>document.getElementById(id), b=this.base(), d=this.playerDef(), g=this.game;
    $('c-img').src='assets/portraits/'+b.id+'.jpg';
    $('c-name').innerHTML=`${b.name} <span class="nick">"${b.nick}"</span> ${s.champion?'<span class="belt">🏆 세계 챔피언</span>':`<span class="tag">세계 랭킹 ${s.rank}위</span>`}`;
    $('c-rec').textContent=`${s.wins}승 ${s.losses}패 (${s.kos} KO) · 연승 ${s.streak} · 타이틀 획득 ${s.belts}회 · 방어 ${s.defenses}회`;
    $('c-msg').textContent=msg||'';
    const nx=this.nextOpponent(), od=FIGHTERS.find(f=>f.id===nx.id);
    $('btn-c-fight').textContent = s.champion ? `타이틀 방어전: vs ${od.name}` : (nx.title ? `타이틀 매치: vs 챔피언 ${od.name}` : `${s.rank-1}위 도전: vs ${od.name}`);
    $('c-diff').textContent=['난이도 쉬움','난이도 보통','난이도 어려움'][this.difficulty()];
    // 랭킹
    $('c-rank').innerHTML=this.table().map(row=>{ const f=FIGHTERS.find(x=>x.id===row.id); const next=!s.champion && row.rank===s.rank-1;
      return `<li class="${row.player?'me':''} ${next?'next':''}"><span class="rk">${row.rank===1?'🏆':row.rank+'위'}</span><img src="assets/portraits/${f.id}.jpg" alt=""><span class="nm">${f.name} <small>"${f.nick}"</small></span><span class="st">${STYLES[f.style].name}</span>${next?'<span class="tag red">다음 상대</span>':''}${row.player?'<span class="tag">나</span>':''}</li>`; }).join('');
    // 강화
    $('c-pts').textContent=`포인트 ${s.points}`;
    $('c-upg').innerHTML=Object.keys(UPG_NAMES).map(k=>`<div class="upg"><span>${UPG_NAMES[k]}</span><div class="bar"><i style="width:${d.stats[k]*10}%"></i></div><em>${d.stats[k]}</em><button data-upg="${k}" ${this.canUpgrade(k)?'':'disabled'}>+1</button></div>`).join('');
    const S=SKILLS[b.id];
    $('c-skill').innerHTML=`<div class="skl"><b>${S.name}</b> <span class="lv">Lv.${s.skillLevel}</span><button data-upg="skill" ${this.canUpgrade('skill')?'':'disabled'}>강화 (2pt)</button><div class="sd">${S.desc}</div><div class="sd dim">레벨당 위력 +15%, 게이지 충전 +25%</div></div>`;
    for(const btn of document.querySelectorAll('#overlay-career [data-upg]')) btn.onclick=()=>{ if(this.upgrade(btn.dataset.upg)) this.render(); };
    // 히스토리
    $('c-hist').innerHTML = s.history.length ? s.history.map(h=>`<li class="${h.won?'w':(h.draw?'d':'l')}"><span class="res">${h.won?'승':(h.draw?'무':'패')}</span> vs ${h.opp} <small>${h.method} ${h.round}R · ${h.date}${h.title?' · 타이틀전':''}</small></li>`).join('') : '<li class="dim">아직 경기가 없습니다. 첫 경기를 시작하세요!</li>';
  }
}
