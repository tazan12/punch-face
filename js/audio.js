'use strict';
// Web Audio 합성 사운드 — 외부 파일 없음
class SFX {
  constructor(){ this.ctx=null; this.enabled=true; this.crowdLevel=0.3; }
  init(){
    if(this.ctx) return;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain(); this.master.gain.value=0.7; this.master.connect(this.ctx.destination);
    const len=this.ctx.sampleRate*2, b=this.ctx.createBuffer(1,len,this.ctx.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    this.noiseBuf=b;
    this.startCrowd();
  }
  resume(){ if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume(); }
  noise(dur,type,freq,gain,q=1,delay=0){
    if(!this.ctx||!this.enabled) return;
    const t=this.ctx.currentTime+delay, s=this.ctx.createBufferSource(); s.buffer=this.noiseBuf;
    const f=this.ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g=this.ctx.createGain(); g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t+dur+0.05);
  }
  tone(freq,dur,type,gain,endFreq,delay=0){
    if(!this.ctx||!this.enabled) return;
    const t=this.ctx.currentTime+delay, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); if(endFreq) o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);
    g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t+dur+0.05);
  }
  punch(power){ this.noise(0.12,'lowpass',320+power*30,0.6+power*0.04); this.tone(110,0.13,'sine',0.5,45); }
  bodyHit(){ this.noise(0.2,'lowpass',180,0.7); this.tone(65,0.22,'sine',0.6,30); }
  block(){ this.noise(0.08,'bandpass',900,0.35,2); this.tone(220,0.06,'triangle',0.15,150); }
  whiff(){ this.noise(0.12,'highpass',2200,0.18); }
  slip(){ this.noise(0.1,'bandpass',3000,0.12,3); }
  bell(n=1){ for(let i=0;i<n;i++){ this.tone(1180,0.9,'sine',0.5,1150,i*0.45); this.tone(2360,0.5,'sine',0.15,2300,i*0.45); this.tone(880,0.7,'triangle',0.2,860,i*0.45); } }
  count(){ this.tone(620,0.09,'square',0.12,600); }
  down(){ this.noise(0.5,'lowpass',120,0.9); this.tone(80,0.6,'sine',0.7,25); }
  win(){ [523,659,784,1046].forEach((f,i)=>this.tone(f,0.35,'triangle',0.25,f,i*0.13)); }
  getup(){ this.tone(400,0.1,'square',0.1,600); }
  startCrowd(){
    const s=this.ctx.createBufferSource(); s.buffer=this.noiseBuf; s.loop=true;
    const f=this.ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=420; f.Q.value=0.6;
    const f2=this.ctx.createBiquadFilter(); f2.type='lowpass'; f2.frequency.value=900;
    this.crowdGain=this.ctx.createGain(); this.crowdGain.gain.value=0.06;
    s.connect(f); f.connect(f2); f2.connect(this.crowdGain); this.crowdGain.connect(this.master); s.start();
  }
  crowd(level){ this.crowdLevel=Math.max(this.crowdLevel,level); }
  tick(){ // 매 프레임: 관중 소리 서서히 감쇠
    if(!this.crowdGain) return;
    this.crowdLevel += (0.3-this.crowdLevel)*0.01;
    this.crowdGain.gain.value = this.enabled ? 0.03+this.crowdLevel*0.16 : 0;
  }
}
