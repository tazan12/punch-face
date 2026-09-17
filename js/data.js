'use strict';
// ───────────────────────── 기본 상수 ─────────────────────────
const W = 960, H = 540;
const RING_L = 70, RING_R = 890, FLOOR_Y = 468;
const BASE_REACH = 118;            // px. 리치 스탯 1당 +7px

// ───────────────────────── 펀치 정의 (60fps 프레임 단위) ─────────────────────────
const PUNCHES = {
  jab:      { id:'jab',      name:'잽',         hand:'lead', windup:5,  active:4, recover:9,  dmg:5,  stam:3, reach:1.00, guardPen:0.05, beatsDuck:false, hitstun:10, kb:3, arc:'straight', body:true },
  straight: { id:'straight', name:'스트레이트', hand:'rear', windup:9,  active:5, recover:14, dmg:10, stam:6, reach:1.08, guardPen:0.10, beatsDuck:false, hitstun:16, kb:6, arc:'straight', body:true },
  lhook:    { id:'lhook',    name:'레프트 훅',  hand:'lead', windup:11, active:5, recover:16, dmg:13, stam:7, reach:0.74, guardPen:0.35, beatsDuck:false, hitstun:20, kb:7, arc:'hook',     body:true },
  rhook:    { id:'rhook',    name:'라이트 훅',  hand:'rear', windup:13, active:6, recover:19, dmg:16, stam:8, reach:0.74, guardPen:0.35, beatsDuck:false, hitstun:24, kb:9, arc:'hook',     body:true },
  uppercut: { id:'uppercut', name:'어퍼컷',     hand:'rear', windup:14, active:5, recover:21, dmg:18, stam:9, reach:0.62, guardPen:0.50, beatsDuck:true,  hitstun:26, kb:5, arc:'upper',    body:false },
};
const PUNCH_IDS = ['jab','straight','lhook','rhook','uppercut'];

// ───────────────────────── 복싱 스타일 & AI 파라미터 ─────────────────────────
const STYLES = {
  infighter:    { name:'인파이터',   desc:'짧은 거리에서 훅과 바디샷으로 끊임없이 압박한다.',
    ai:{ prefDist:0.62, aggression:0.80, guardRate:0.40, bodyRatio:0.45, combo:[2,4], weights:{jab:2,straight:2,lhook:4,rhook:3,uppercut:2}, retreatAfterCombo:0.10, slipRate:0.35, reaction:14, counterRate:0.15 } },
  outboxer:     { name:'아웃복서',   desc:'리치 끝에서 잽과 스트레이트로 점수를 쌓고 거리를 유지한다.',
    ai:{ prefDist:1.02, aggression:0.50, guardRate:0.50, bodyRatio:0.15, combo:[1,2], weights:{jab:6,straight:4,lhook:1,rhook:1,uppercut:0.5}, retreatAfterCombo:0.70, slipRate:0.50, reaction:10, counterRate:0.25 } },
  slugger:      { name:'슬러거',     desc:'기술보다 한 방. 큰 훅과 어퍼컷으로 KO를 노린다.',
    ai:{ prefDist:0.85, aggression:0.55, guardRate:0.30, bodyRatio:0.25, combo:[1,2], weights:{jab:1,straight:3,lhook:2,rhook:5,uppercut:3}, retreatAfterCombo:0.15, slipRate:0.15, reaction:18, counterRate:0.10 } },
  counter:      { name:'카운터펀처', desc:'가드를 굳히고 상대가 주먹을 뻗는 순간을 되받아친다.',
    ai:{ prefDist:0.95, aggression:0.30, guardRate:0.75, bodyRatio:0.20, combo:[1,2], weights:{jab:2,straight:5,lhook:2,rhook:3,uppercut:2}, retreatAfterCombo:0.40, slipRate:0.60, reaction:7,  counterRate:0.80 } },
  swarmer:      { name:'스워머',     desc:'쉴 새 없는 연타로 상대를 질식시킨다. 바디를 집요하게 노린다.',
    ai:{ prefDist:0.60, aggression:0.95, guardRate:0.20, bodyRatio:0.50, combo:[3,5], weights:{jab:4,straight:2,lhook:4,rhook:2,uppercut:2}, retreatAfterCombo:0.05, slipRate:0.30, reaction:12, counterRate:0.10 } },
  boxerpuncher: { name:'복서펀처',   desc:'기술과 파워를 겸비한 만능형. 상황에 따라 스타일을 바꾼다.',
    ai:{ prefDist:0.85, aggression:0.60, guardRate:0.50, bodyRatio:0.30, combo:[2,3], weights:{jab:3,straight:3,lhook:2,rhook:3,uppercut:3}, retreatAfterCombo:0.35, slipRate:0.40, reaction:11, counterRate:0.30 } },
};

// ───────────────────────── 선수 로스터 ─────────────────────────
// stats: power 파워, speed 스피드, stamina 체력, chin 맷집, reach 리치, heart 회복(기상력), defense 방어
// look: skin, hair(색), hairStyle, beard, trunks, trim, gloves, shoes, height(배율), bulk(몸통 폭), mood(평소 표정)
const FIGHTERS = [
  { id:'kang', name:'강태산', nick:'불도저', country:'KOR', age:27, style:'infighter', weapon:'lhook',
    stats:{ power:8, speed:6, stamina:7, chin:8, reach:4, heart:8, defense:5 },
    look:{ skin:'#e8b58a', hair:'#1b1b1b', hairStyle:'buzz', beard:'stubble', trunks:'#c8102e', trim:'#ffd700', gloves:'#c8102e', shoes:'#222', height:0.97, bulk:1.18, mood:'angry' },
    desc:'전직 씨름 선수 출신. 짧은 팔을 파고드는 스텝으로 메우고 레프트 훅으로 끝낸다.' },
  { id:'ryan', name:'라이언 캐시', nick:'메트로놈', country:'USA', age:25, style:'outboxer', weapon:'jab',
    stats:{ power:5, speed:9, stamina:8, chin:5, reach:8, heart:5, defense:7 },
    look:{ skin:'#f1c9a5', hair:'#c98a3c', hairStyle:'short', beard:'none', trunks:'#1e3a8a', trim:'#ffffff', gloves:'#1e40af', shoes:'#fff', height:1.10, bulk:0.88, mood:'smug' },
    desc:'박자에 맞춰 툭툭 찌르는 잽이 트레이드마크. 절대 먼저 붙지 않는다.' },
  { id:'ivan', name:'이반 볼코프', nick:'망치', country:'RUS', age:31, style:'slugger', weapon:'straight',
    stats:{ power:10, speed:4, stamina:5, chin:7, reach:7, heart:6, defense:3 },
    look:{ skin:'#f3d3b8', hair:'#e5c07b', hairStyle:'bald', beard:'full', trunks:'#111', trim:'#e11d48', gloves:'#111', shoes:'#111', height:1.14, bulk:1.30, mood:'neutral' },
    desc:'라이트 스트레이트 한 방이면 누구든 눕는다. 대신 맞으면서 들어간다.' },
  { id:'sato', name:'사토 렌', nick:'거울', country:'JPN', age:28, style:'counter', weapon:'straight',
    stats:{ power:7, speed:7, stamina:7, chin:6, reach:6, heart:6, defense:9 },
    look:{ skin:'#f0cfae', hair:'#2b2b2b', hairStyle:'long', beard:'none', trunks:'#ffffff', trim:'#e11d48', gloves:'#f8fafc', shoes:'#fff', height:1.02, bulk:0.95, mood:'focused' },
    desc:'상대의 주먹이 나오는 찰나에 스트레이트가 먼저 꽂힌다. 인내심이 무기.' },
  { id:'diego', name:'디에고 로페즈', nick:'벌떼', country:'MEX', age:24, style:'swarmer', weapon:'lhook',
    stats:{ power:6, speed:8, stamina:9, chin:6, reach:4, heart:7, defense:4 },
    look:{ skin:'#c98d5a', hair:'#0f0f0f', hairStyle:'mohawk', beard:'none', trunks:'#16a34a', trim:'#ffffff', gloves:'#16a34a', shoes:'#fff', height:0.94, bulk:1.02, mood:'happy' },
    desc:'12라운드 내내 같은 페이스. 바디 훅으로 상대의 다리를 먼저 뺏는다.' },
  { id:'james', name:'제임스 오코너', nick:'천둥', country:'GBR', age:29, style:'boxerpuncher', weapon:'uppercut',
    stats:{ power:8, speed:7, stamina:6, chin:6, reach:6, heart:6, defense:6 },
    look:{ skin:'#8d5a3c', hair:'#111', hairStyle:'afro', beard:'stubble', trunks:'#7c3aed', trim:'#fbbf24', gloves:'#7c3aed', shoes:'#fbbf24', height:1.05, bulk:1.06, mood:'neutral' },
    desc:'가드 사이로 솟구치는 어퍼컷. 아웃복싱과 인파이팅을 자유롭게 오간다.' },
  { id:'park', name:'박만수', nick:'노장', country:'KOR', age:52, style:'counter', weapon:'rhook',
    stats:{ power:7, speed:4, stamina:3, chin:10, reach:5, heart:9, defense:7 },
    look:{ skin:'#e6b98f', hair:'#bdbdbd', hairStyle:'gray', beard:'mustache', trunks:'#374151', trim:'#f59e0b', gloves:'#7f1d1d', shoes:'#222', height:0.96, bulk:1.12, mood:'tired' },
    desc:'52세 현역. 3라운드면 숨이 차지만 턱은 절대 안 흔들린다. 라이트 훅은 아직 살아있다.' },
  { id:'eunha', name:'은하', nick:'번개', country:'KOR', age:22, style:'swarmer', weapon:'jab',
    stats:{ power:4, speed:10, stamina:9, chin:4, reach:5, heart:7, defense:6 },
    look:{ skin:'#f5d6bd', hair:'#3b1f5e', hairStyle:'ponytail', beard:'none', trunks:'#ec4899', trim:'#000', gloves:'#f472b6', shoes:'#fff', height:0.92, bulk:0.82, mood:'smug' },
    desc:'눈으로 따라가기 힘든 손. 맷집은 약하니 맞기 전에 세 대 때린다.' },
];

// ───────────────────────── 캐릭터 고유 스킬 ─────────────────────────
// type: rush(연타, 발동 중 피격에 밀리지 않음) / power(방어 불가 강타) / counter(자동 카운터 자세) / iron(완전 방어+회복)
const SKILLS = {
  kang:  { name:'불도저 러시',   desc:'훅·훅·바디훅·어퍼컷 4연타. 발동 중엔 맞아도 멈추지 않는다.', type:'rush', seq:[['lhook','head'],['rhook','head'],['lhook','body'],['uppercut','head']] },
  ryan:  { name:'메트로놈 잽',   desc:'초고속 잽 4연타 후 스트레이트로 마무리.', type:'rush', seq:[['jab','head'],['jab','head'],['jab','body'],['jab','head'],['straight','head']] },
  ivan:  { name:'해머 스트레이트', desc:'가드를 부수는 초강력 스트레이트. 방어 불가, 위력 2.6배.', type:'power', punch:'straight', mul:2.6 },
  sato:  { name:'미러 카운터',   desc:'2.5초간 모든 공격을 흘리고 자동으로 2배 카운터.', type:'counter', dur:150 },
  diego: { name:'벌떼 바디',     desc:'바디 4연타로 스태미나를 뺏고 어퍼컷으로 마무리.', type:'rush', seq:[['lhook','body'],['rhook','body'],['lhook','body'],['rhook','body'],['uppercut','head']] },
  james: { name:'썬더 어퍼컷',   desc:'천둥 같은 어퍼컷. 방어 불가, 넉다운 확률 대폭 증가.', type:'power', punch:'uppercut', mul:2.3, kd:true },
  park:  { name:'노장의 철벽',   desc:'3초간 완전 방어(바디 포함) + 체력·스태미나 회복.', type:'iron', dur:180 },
  eunha: { name:'번개 스텝',     desc:'순간 접근 후 잽·스트레이트 6연타.', type:'rush', dash:true, seq:[['jab','head'],['straight','head'],['jab','body'],['jab','head'],['straight','head'],['lhook','head']] },
};

// ───────────────────────── 연속 콤보 (최근 적중 순서) ─────────────────────────
// '*body' = 바디 아무 펀치. 마지막 타격에 배율 적용
const COMBOS = [
  { seq:['*body','*body','uppercut'], name:'바디 어퍼!',  mul:1.9, daze:90 },
  { seq:['jab','straight','lhook'],   name:'1-2-3 콤보!', mul:1.7 },
  { seq:['jab','jab','straight'],     name:'원투 콤보!',  mul:1.5 },
  { seq:['straight','uppercut'],      name:'크로스 어퍼!', mul:1.5 },
  { seq:['lhook','rhook'],            name:'더블 훅!',    mul:1.4 },
];

// 커리어 초기 랭킹 (#1 = 세계 챔피언)
const RANKING_ORDER = ['ivan','sato','james','ryan','kang','diego','eunha','park'];
