"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

const ROWS = 12;
const PAYTABLE: Record<number, number> = {
  0:16,1:9,2:4,3:2,4:1.4,5:1.1,6:0.5,7:1.1,8:1.4,9:2,10:4,11:9,12:16
};
const BIN_COLORS = ["#ff2255","#ff5500","#ff8800","#ffbb00","#ffe066","#ccff66","#66ffcc","#ccff66","#ffe066","#ffbb00","#ff8800","#ff5500","#ff2255"];

function hexToRgba(hex: string, a: number) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function easeInOut(t: number) { return t<0.5?2*t*t:-1+(4-2*t)*t; }

let audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!audioCtx && typeof window!=="undefined") audioCtx = new (window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext)();
  return audioCtx;
}
function playPegTick(muted: boolean) {
  if (muted) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.connect(g);g.connect(ctx.destination);
  o.frequency.value=800+Math.random()*400;o.type="sine";
  g.gain.setValueAtTime(0.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.06);
  o.start();o.stop(ctx.currentTime+0.06);
}
function playCelebration(muted: boolean, mult: number) {
  if (muted) return;
  const ctx = getAudioCtx(); if (!ctx) return;
  const notes=mult>=9?[523,659,784,1047]:mult>=4?[440,554,659]:[330,392];
  notes.forEach((freq,i)=>{
    const o=ctx!.createOscillator(),g=ctx!.createGain();
    o.connect(g);g.connect(ctx!.destination);o.frequency.value=freq;o.type="triangle";
    const t=ctx!.currentTime+i*0.12;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.15,t+0.04);g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
    o.start(t);o.stop(t+0.35);
  });
}

function Confetti({active,multiplier}:{active:boolean;multiplier:number}) {
  if (!active) return null;
  const count=Math.min(Math.floor(multiplier*5),50);
  return (
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",borderRadius:"16px",zIndex:10}}>
      {Array.from({length:count}).map((_,i)=>(
        <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:"-10px",width:`${5+Math.random()*8}px`,height:`${5+Math.random()*8}px`,borderRadius:Math.random()>0.5?"50%":"2px",background:BIN_COLORS[Math.floor(Math.random()*BIN_COLORS.length)],animation:`cfFall ${1+Math.random()*1.5}s ease-in ${Math.random()*0.4}s forwards`,transform:`rotate(${Math.random()*360}deg)`}} />
      ))}
      <style>{`@keyframes cfFall{from{top:-10px;opacity:1}to{top:110%;opacity:0;transform:rotate(720deg)}}`}</style>
    </div>
  );
}

interface CanvasProps {
  decisions: string[]|null; dropping: boolean; onLand:(bin:number)=>void;
  muted:boolean; isGolden:boolean; showDebug:boolean; reducedMotion:boolean; dropColumn:number;
}

function PlinkoCanvas({decisions,dropping,onLand,muted,isGolden,showDebug,reducedMotion,dropColumn}:CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const hasLanded = useRef(false);

  const W=520,H=580,PAD_X=36,PAD_TOP=40,PAD_BOT=62;
  const boardW=W-PAD_X*2,boardH=H-PAD_TOP-PAD_BOT;
  const rowSpacing=boardH/(ROWS+1),colSpacing=boardW/12;
  const PEG_R=5,BALL_R=10;

  function getPegPos(row:number,peg:number) {
    const numPegs=row+2,totalWidth=(numPegs-1)*colSpacing,startX=PAD_X+(boardW-totalWidth)/2;
    return {x:startX+peg*colSpacing,y:PAD_TOP+(row+1)*rowSpacing};
  }
  function getBinX(bin:number){return PAD_X+bin*colSpacing;}

  const drawBoard = useCallback((ctx:CanvasRenderingContext2D, bx?:number,by?:number,trail?:{x:number;y:number;a:number}[],activeBin?:number|null)=>{
    ctx.clearRect(0,0,W,H);
    // bg glow
    const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.7);
    bg.addColorStop(0,"rgba(157,78,221,0.07)");bg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

    // drop column guide
    const gx=getBinX(dropColumn);
    ctx.beginPath();ctx.moveTo(gx,PAD_TOP);ctx.lineTo(gx,H-PAD_BOT);
    ctx.strokeStyle="rgba(245,197,24,0.18)";ctx.lineWidth=1.5;ctx.setLineDash([4,6]);ctx.stroke();ctx.setLineDash([]);

    // pegs
    for(let r=0;r<ROWS;r++){
      for(let p=0;p<=r+1;p++){
        const {x,y}=getPegPos(r,p);
        const glow=ctx.createRadialGradient(x,y,0,x,y,PEG_R*2.5);
        glow.addColorStop(0,"rgba(200,220,255,0.85)");glow.addColorStop(1,"rgba(100,150,255,0)");
        ctx.beginPath();ctx.arc(x,y,PEG_R*2.5,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
        ctx.beginPath();ctx.arc(x,y,PEG_R,0,Math.PI*2);
        ctx.fillStyle="rgba(220,235,255,0.95)";ctx.shadowColor="rgba(150,200,255,0.8)";ctx.shadowBlur=8;ctx.fill();ctx.shadowBlur=0;
        if(showDebug){ctx.fillStyle="rgba(0,255,136,0.8)";ctx.font="7px monospace";ctx.fillText(`${r}.${p}`,x-8,y-8);}
      }
    }

    // bins
    for(let b=0;b<13;b++){
      const bxb=getBinX(b),byw=H-PAD_BOT+4,bw=colSpacing*0.82,bh=PAD_BOT-14;
      const col=BIN_COLORS[b],isAct=activeBin===b;
      ctx.beginPath();ctx.roundRect(bxb-bw/2,byw,bw,bh,4);
      const bg2=ctx.createLinearGradient(bxb,byw,bxb,byw+bh);
      bg2.addColorStop(0,hexToRgba(col,isAct?0.55:0.22));bg2.addColorStop(1,hexToRgba(col,isAct?0.3:0.1));
      ctx.fillStyle=bg2;ctx.fill();
      ctx.strokeStyle=hexToRgba(col,isAct?0.9:0.4);ctx.lineWidth=isAct?2:1;
      if(isAct){ctx.shadowColor=col;ctx.shadowBlur=18;}ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle=isAct?"#fff":hexToRgba(col,0.9);ctx.font=`bold ${isAct?11:9}px monospace`;
      ctx.textAlign="center";ctx.fillText(`${PAYTABLE[b]}x`,bxb,byw+bh-6);
    }
    ctx.textAlign="left";

    // trail
    if(trail&&!reducedMotion){
      for(const pt of trail){
        ctx.beginPath();ctx.arc(pt.x,pt.y,BALL_R*0.5,0,Math.PI*2);
        ctx.fillStyle=isGolden?`rgba(255,215,0,${pt.a*0.5})`:`rgba(0,212,255,${pt.a*0.4})`;ctx.fill();
      }
    }

    // ball
    if(bx!==undefined&&by!==undefined){
      const bg3=ctx.createRadialGradient(bx-BALL_R*0.3,by-BALL_R*0.3,1,bx,by,BALL_R);
      if(isGolden){bg3.addColorStop(0,"#fff8aa");bg3.addColorStop(0.4,"#ffd700");bg3.addColorStop(1,"#b8860b");ctx.shadowColor="#ffd700";}
      else{bg3.addColorStop(0,"#ffffff");bg3.addColorStop(0.4,"#00d4ff");bg3.addColorStop(1,"#0066cc");ctx.shadowColor="#00d4ff";}
      ctx.beginPath();ctx.arc(bx,by,BALL_R,0,Math.PI*2);ctx.fillStyle=bg3;ctx.shadowBlur=22;ctx.fill();ctx.shadowBlur=0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dropColumn,isGolden,reducedMotion,showDebug]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    drawBoard(ctx,undefined,undefined,undefined,null);
  },[drawBoard]);

  useEffect(()=>{
    if(!dropping||!decisions)return;
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    hasLanded.current=false;
    cancelAnimationFrame(animRef.current);

    // Build path
    const path:{x:number;y:number}[]=[];
    let pos=0;
    for(let r=0;r<ROWS;r++){
      const numPegs=r+2,totalWidth=(numPegs-1)*colSpacing,startX=PAD_X+(boardW-totalWidth)/2;
      path.push({x:startX+pos*colSpacing,y:PAD_TOP+(r+1)*rowSpacing});
      if(decisions[r]==="R")pos++;
    }
    const finalX=getBinX(pos),finalY=H-PAD_BOT+4;
    path.push({x:finalX,y:finalY});

    if(reducedMotion){
      drawBoard(ctx,finalX,finalY-20,[],pos);
      onLand(pos);return;
    }

    let pathIdx=0,progress=0;
    const trail:{x:number;y:number;a:number}[]=[];
    const SPEED=0.048;

    function animate(){
      if(!ctx)return;
      if(pathIdx>=path.length-1){
        if(!hasLanded.current){hasLanded.current=true;drawBoard(ctx,finalX,finalY-20,trail,pos);onLand(pos);}
        return;
      }
      progress+=SPEED;
      if(progress>=1){progress=0;pathIdx++;if(pathIdx<path.length-1)playPegTick(muted);}
      const from=path[pathIdx],to=path[Math.min(pathIdx+1,path.length-1)];
      const t=easeInOut(progress);
      const ballX=from.x+(to.x-from.x)*t,ballY=from.y+(to.y-from.y)*t;
      trail.push({x:ballX,y:ballY,a:0.7});
      if(trail.length>14)trail.shift();
      trail.forEach((pt,i)=>{pt.a=(i/trail.length)*0.7;});
      drawBoard(ctx,ballX,ballY,trail,pathIdx===path.length-2?pos:null);
      animRef.current=requestAnimationFrame(animate);
    }
    animRef.current=requestAnimationFrame(animate);
    return()=>cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[dropping,decisions]);

  return <canvas ref={canvasRef} width={W} height={H} style={{maxWidth:"100%",borderRadius:"12px"}} />;
}

interface RoundState { roundId:string; commitHex:string; nonce:string; decisions?:string[]; binIndex?:number; payoutMultiplier?:number; serverSeed?:string; pegMapHash?:string; }
interface HistoryEntry { id:string; binIndex:number; payoutMultiplier:number; betCents:number; dropColumn:number; }

export default function PlinkoPage() {
  const [dropColumn,setDropColumn]=useState(6);
  const [bet,setBet]=useState(100);
  const [clientSeed,setClientSeed]=useState("my-lucky-seed");
  const [balance,setBalance]=useState(10000);
  const [muted,setMuted]=useState(false);
  const [dropping,setDropping]=useState(false);
  const [round,setRound]=useState<RoundState|null>(null);
  const [lastResult,setLastResult]=useState<{bin:number;multiplier:number;payout:number}|null>(null);
  const [confettiActive,setConfettiActive]=useState(false);
  const [history,setHistory]=useState<HistoryEntry[]>([]);
  const [centerCount,setCenterCount]=useState(0);
  const [isGolden,setIsGolden]=useState(false);
  const [tiltMode,setTiltMode]=useState(0);
  const [dungeonMode,setDungeonMode]=useState(false);
  const [showDebug,setShowDebug]=useState(false);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [decisions,setDecisions]=useState<string[]|null>(null);
  const secretRef=useRef("");

  useEffect(()=>{
    const mq=window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    mq.addEventListener("change",(e)=>setReducedMotion(e.matches));
  },[]);

  const handleDrop=useCallback(async()=>{
    if(dropping)return;
    if(bet>balance)return;
    setDropping(true);setLastResult(null);setConfettiActive(false);setDecisions(null);
    try {
      const cr=await fetch("/api/rounds/commit",{method:"POST"});
      const cd=await cr.json();
      if(!cd.roundId)throw new Error("commit fail");
      setRound({roundId:cd.roundId,commitHex:cd.commitHex,nonce:cd.nonce});
      const sr=await fetch(`/api/rounds/${cd.roundId}/start`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientSeed,betCents:bet,dropColumn})});
      const sd=await sr.json();
      if(!sd.decisions)throw new Error("start fail");
      setDecisions(sd.decisions);
      setRound(r=>r?{...r,decisions:sd.decisions,binIndex:sd.binIndex,payoutMultiplier:sd.payoutMultiplier,pegMapHash:sd.pegMapHash}:null);
    } catch(err){console.error(err);setDropping(false);}
  },[dropping,bet,balance,clientSeed,dropColumn]);

  const handleLand=useCallback(async(bin:number)=>{
    if(!round?.roundId){setDropping(false);return;}
    const multiplier=PAYTABLE[bin]||1;
    const payout=Math.floor(bet*multiplier);
    const rr=await fetch(`/api/rounds/${round.roundId}/reveal`,{method:"POST"});
    const rd=await rr.json();
    setRound(r=>r?{...r,serverSeed:rd.serverSeed}:null);
    setBalance(b=>b-bet+payout);
    setLastResult({bin,multiplier,payout});
    setDropping(false);
    if(multiplier>=2){setConfettiActive(true);setTimeout(()=>setConfettiActive(false),2500);}
    playCelebration(muted,multiplier);
    if(bin===6){setCenterCount(c=>{const n=c+1;if(n>=3){setIsGolden(true);return 0;}return n;});}
    else{setCenterCount(0);if(isGolden)setIsGolden(false);}
    setHistory(h=>[{id:round.roundId,binIndex:bin,payoutMultiplier:multiplier,betCents:bet,dropColumn},...h].slice(0,15));
  },[round,bet,muted,dropColumn,isGolden]);

  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if(e.target instanceof HTMLInputElement)return;
      if(e.key==="ArrowLeft")setDropColumn(c=>Math.max(0,c-1));
      if(e.key==="ArrowRight")setDropColumn(c=>Math.min(12,c+1));
      if(e.key===" "){e.preventDefault();handleDrop();}
      if(e.key==="t"||e.key==="T")setTiltMode(m=>(m+1)%3);
      if(e.key==="g"||e.key==="G")setShowDebug(d=>!d);
      secretRef.current=(secretRef.current+e.key).slice(-11).toLowerCase();
      if(secretRef.current.includes("opensesame")||secretRef.current.includes("open sesa"))setDungeonMode(d=>!d);
    }
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[handleDrop]);

  const tiltClass=tiltMode===1?"tilt-mode":tiltMode===2?"tilt-mode-neg":"";

  return (
    <main className={`relative min-h-screen ${dungeonMode?"dungeon-theme":""}`}
      style={{paddingTop:"1.5rem",paddingBottom:"3rem",paddingLeft:"1rem",paddingRight:"1rem",zIndex:1}}>
      {/* Header */}
      <header style={{maxWidth:"1100px",margin:"0 auto 1.5rem auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"0.75rem"}}>
          <div>
            <h1 style={{fontFamily:"var(--font-display)",fontSize:"clamp(1.3rem,3vw,1.9rem)",color:"var(--accent-gold)",lineHeight:1.1}} className="text-glow-gold">⬡ PLINKO LAB</h1>
            <p style={{fontFamily:"var(--font-body)",color:"rgba(255,255,255,0.45)",fontSize:"0.72rem",letterSpacing:"0.12em",marginTop:"2px"}}>PROVABLY FAIR · DETERMINISTIC · VERIFIABLE</p>
          </div>
          <div style={{display:"flex",gap:"0.6rem",alignItems:"center",flexWrap:"wrap"}}>
            <div className="glass-card" style={{padding:"0.45rem 1rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
              <span style={{color:"rgba(255,255,255,0.45)",fontSize:"0.75rem",fontFamily:"var(--font-body)"}}>BAL</span>
              <span style={{color:"var(--accent-gold)",fontFamily:"var(--font-mono)",fontWeight:700,fontSize:"1.05rem"}}>{balance.toLocaleString()}</span>
            </div>
            <button className="glass-btn" style={{padding:"0.45rem 0.7rem",fontSize:"1.1rem"}} onClick={()=>setMuted(m=>!m)} aria-label={muted?"Unmute":"Mute"}>{muted?"🔇":"🔊"}</button>
            <Link href="/verify" className="glass-btn" style={{padding:"0.45rem 0.9rem",fontSize:"0.82rem",textDecoration:"none"}}>🔍 Verify</Link>
          </div>
        </div>
        {dungeonMode&&<div style={{marginTop:"0.5rem",padding:"0.35rem 0.9rem",background:"rgba(139,90,43,0.2)",border:"1px solid rgba(139,90,43,0.4)",borderRadius:"8px",fontSize:"0.75rem",color:"#cd853f",fontFamily:"var(--font-mono)"}}>🕯️ DUNGEON MODE ACTIVE — press again to dismiss</div>}
      </header>

      {/* Main grid */}
      <div style={{maxWidth:"1100px",margin:"0 auto",display:"grid",gridTemplateColumns:"280px auto 280px",gap:"1.25rem",alignItems:"start"}}>

        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div className="glass-card" style={{padding:"1.2rem"}}>
            <label style={{fontFamily:"var(--font-body)",fontSize:"0.72rem",color:"rgba(255,255,255,0.45)",letterSpacing:"0.1em",display:"block",marginBottom:"0.6rem"}}>DROP COLUMN  ·  ← →</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"3px",marginBottom:"3px"}}>
              {Array.from({length:7}).map((_,i)=>(
                <button key={i} className="glass-btn" onClick={()=>setDropColumn(i)} style={{padding:"0.35rem 0",fontSize:"0.68rem",fontFamily:"var(--font-mono)",background:dropColumn===i?"rgba(245,197,24,0.25)":undefined,borderColor:dropColumn===i?"rgba(245,197,24,0.6)":undefined,color:dropColumn===i?"var(--accent-gold)":undefined}}>{i}</button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"3px"}}>
              {Array.from({length:6}).map((_,i)=>(
                <button key={i+7} className="glass-btn" onClick={()=>setDropColumn(i+7)} style={{padding:"0.35rem 0",fontSize:"0.68rem",fontFamily:"var(--font-mono)",background:dropColumn===i+7?"rgba(245,197,24,0.25)":undefined,borderColor:dropColumn===i+7?"rgba(245,197,24,0.6)":undefined,color:dropColumn===i+7?"var(--accent-gold)":undefined}}>{i+7}</button>
              ))}
            </div>
          </div>

          <div className="glass-card" style={{padding:"1.2rem"}}>
            <label style={{fontFamily:"var(--font-body)",fontSize:"0.72rem",color:"rgba(255,255,255,0.45)",letterSpacing:"0.1em",display:"block",marginBottom:"0.5rem"}}>BET AMOUNT</label>
            <input type="number" className="glass-input" value={bet} onChange={e=>setBet(Math.max(1,parseInt(e.target.value)||1))} min={1} max={balance} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"4px",marginTop:"0.45rem"}}>
              {[10,50,100,500].map(v=><button key={v} className="glass-btn" style={{padding:"0.28rem",fontSize:"0.72rem"}} onClick={()=>setBet(v)}>{v}</button>)}
            </div>
          </div>

          <div className="glass-card" style={{padding:"1.2rem"}}>
            <label style={{fontFamily:"var(--font-body)",fontSize:"0.72rem",color:"rgba(255,255,255,0.45)",letterSpacing:"0.1em",display:"block",marginBottom:"0.5rem"}}>CLIENT SEED</label>
            <input type="text" className="glass-input" value={clientSeed} onChange={e=>setClientSeed(e.target.value)} placeholder="your-seed" />
            <button className="glass-btn" style={{marginTop:"0.4rem",width:"100%",padding:"0.3rem",fontSize:"0.72rem"}} onClick={()=>setClientSeed(Math.random().toString(36).slice(2))}>🎲 Randomize</button>
          </div>

          {round&&(
            <div className="glass-card" style={{padding:"1.2rem",fontSize:"0.65rem",fontFamily:"var(--font-mono)",lineHeight:1.7}}>
              <p style={{color:"rgba(255,255,255,0.4)",marginBottom:"0.4rem",fontFamily:"var(--font-body)",fontSize:"0.68rem",letterSpacing:"0.08em"}}>ROUND PROOF</p>
              <p style={{color:"rgba(255,255,255,0.45)"}}>COMMIT</p>
              <p style={{color:"var(--accent-cyan)",wordBreak:"break-all",fontSize:"0.6rem"}}>{round.commitHex.slice(0,32)}…</p>
              {round.serverSeed&&<><p style={{color:"rgba(255,255,255,0.45)",marginTop:"0.35rem"}}>SERVER SEED ✓</p><p style={{color:"var(--accent-green)",wordBreak:"break-all",fontSize:"0.6rem"}}>{round.serverSeed.slice(0,32)}…</p></>}
              {round.pegMapHash&&<><p style={{color:"rgba(255,255,255,0.45)",marginTop:"0.35rem"}}>PEG MAP HASH</p><p style={{color:"var(--accent-purple)",wordBreak:"break-all",fontSize:"0.6rem"}}>{round.pegMapHash.slice(0,32)}…</p></>}
              <Link href={`/verify?roundId=${round.roundId}`} style={{marginTop:"0.6rem",display:"block",color:"var(--accent-gold)",textDecoration:"none",fontSize:"0.68rem"}}>🔍 Verify this round →</Link>
            </div>
          )}
        </div>

        {/* CENTER */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"1rem"}}>
          <div className={`glass-card ${tiltClass}`} style={{padding:"0.75rem",position:"relative",transition:"transform 0.6s cubic-bezier(0.34,1.56,0.64,1),filter 0.6s ease"}}>
            <Confetti active={confettiActive} multiplier={lastResult?.multiplier||1} />
            <PlinkoCanvas decisions={decisions} dropping={dropping} onLand={handleLand} muted={muted} isGolden={isGolden} showDebug={showDebug} reducedMotion={reducedMotion} dropColumn={dropColumn} />
            {isGolden&&<div style={{position:"absolute",top:"10px",right:"12px",background:"rgba(255,215,0,0.15)",border:"1px solid rgba(255,215,0,0.4)",borderRadius:"6px",padding:"2px 8px",fontSize:"0.65rem",color:"#ffd700",fontFamily:"var(--font-mono)",backdropFilter:"blur(8px)"}}>✨ GOLDEN BALL</div>}
            {showDebug&&<div style={{position:"absolute",bottom:"12px",left:"12px",background:"rgba(0,255,136,0.1)",border:"1px solid rgba(0,255,136,0.3)",borderRadius:"6px",padding:"4px 8px",fontSize:"0.6rem",color:"var(--accent-green)",fontFamily:"var(--font-mono)",backdropFilter:"blur(8px)"}}>🐛 DEBUG col:{dropColumn} adj:{((dropColumn-6)*0.01).toFixed(2)}</div>}
          </div>

          <button className="glass-btn glass-btn-primary no-select" style={{width:"100%",maxWidth:"360px",padding:"1rem 2rem",fontSize:"1.05rem",letterSpacing:"0.1em"}} onClick={handleDrop} disabled={dropping||bet>balance} aria-label="Drop ball">
            {dropping?"⏳  DROPPING...":isGolden?"✨  DROP GOLDEN BALL":"▼  DROP  [SPACE]"}
          </button>

          {lastResult&&!dropping&&(
            <div className="glass-card" style={{padding:"1rem 1.5rem",textAlign:"center",width:"100%",maxWidth:"360px",borderColor:lastResult.multiplier>=4?"rgba(245,197,24,0.5)":undefined,background:lastResult.multiplier>=4?"rgba(245,197,24,0.07)":undefined,transition:"all 0.3s ease"}}>
              <div style={{fontFamily:"var(--font-display)",fontSize:"2rem",color:BIN_COLORS[lastResult.bin],textShadow:`0 0 20px ${BIN_COLORS[lastResult.bin]}80`}}>{lastResult.multiplier}×</div>
              <div style={{fontFamily:"var(--font-mono)",fontSize:"0.8rem",color:"rgba(255,255,255,0.65)",marginTop:"2px"}}>BIN {lastResult.bin} → +{lastResult.payout.toLocaleString()}</div>
              {lastResult.multiplier>=9&&<div style={{marginTop:"4px",fontSize:"0.75rem",color:"var(--accent-gold)"}}>🎉 JACKPOT!</div>}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
          <div className="glass-card" style={{padding:"1.2rem"}}>
            <p style={{fontFamily:"var(--font-body)",fontSize:"0.72rem",color:"rgba(255,255,255,0.45)",letterSpacing:"0.1em",marginBottom:"0.7rem"}}>PAYTABLE</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"3px",marginBottom:"3px"}}>
              {Array.from({length:7}).map((_,i)=>(
                <div key={i} style={{textAlign:"center",padding:"0.3rem 0.1rem",background:hexToRgba(BIN_COLORS[i],0.15),border:`1px solid ${hexToRgba(BIN_COLORS[i],0.4)}`,borderRadius:"6px",fontFamily:"var(--font-mono)",fontSize:"0.58rem",color:BIN_COLORS[i]}}>{PAYTABLE[i]}×</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"3px"}}>
              {Array.from({length:6}).map((_,i)=>(
                <div key={i+7} style={{textAlign:"center",padding:"0.3rem 0.1rem",background:hexToRgba(BIN_COLORS[i+7],0.15),border:`1px solid ${hexToRgba(BIN_COLORS[i+7],0.4)}`,borderRadius:"6px",fontFamily:"var(--font-mono)",fontSize:"0.58rem",color:BIN_COLORS[i+7]}}>{PAYTABLE[i+7]}×</div>
              ))}
            </div>
            <p style={{marginTop:"0.5rem",fontSize:"0.62rem",color:"rgba(255,255,255,0.28)",fontFamily:"var(--font-body)"}}>Symmetric · Edges 16× · Center 0.5×</p>
          </div>

          <div className="glass-card" style={{padding:"1.2rem"}}>
            <p style={{fontFamily:"var(--font-body)",fontSize:"0.72rem",color:"rgba(255,255,255,0.45)",letterSpacing:"0.1em",marginBottom:"0.7rem"}}>SESSION LOG</p>
            {history.length===0?(
              <p style={{color:"rgba(255,255,255,0.22)",fontSize:"0.78rem",textAlign:"center",padding:"1.2rem 0"}}>No rounds yet</p>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:"4px",maxHeight:"300px",overflowY:"auto"}}>
                {history.map((h,i)=>(
                  <div key={h.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0.38rem 0.6rem",background:i===0?"rgba(255,255,255,0.07)":"rgba(255,255,255,0.02)",borderRadius:"7px",border:`1px solid ${i===0?"rgba(255,255,255,0.1)":"transparent"}`}}>
                    <span style={{fontFamily:"var(--font-mono)",fontSize:"0.62rem",color:BIN_COLORS[h.binIndex]}}>BIN {h.binIndex}</span>
                    <span style={{fontFamily:"var(--font-mono)",fontSize:"0.68rem",color:h.payoutMultiplier>=2?"var(--accent-gold)":"rgba(255,255,255,0.45)"}}>{h.payoutMultiplier}×</span>
                    <Link href={`/verify?roundId=${h.id}`} style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.3)",textDecoration:"none"}}>🔍</Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="glass-card" style={{padding:"1rem"}}>
            <p style={{fontFamily:"var(--font-body)",fontSize:"0.68rem",color:"rgba(255,255,255,0.3)",letterSpacing:"0.08em",marginBottom:"0.5rem"}}>SHORTCUTS</p>
            <div style={{fontFamily:"var(--font-mono)",fontSize:"0.62rem",color:"rgba(255,255,255,0.38)",lineHeight:2.1}}>
              <span style={{color:"rgba(255,255,255,0.6)"}}>← →</span> column&nbsp;&nbsp;<span style={{color:"rgba(255,255,255,0.6)"}}>Space</span> drop<br/>
              <span style={{color:"rgba(255,255,255,0.6)"}}>T</span> tilt mode&nbsp;&nbsp;<span style={{color:"rgba(255,255,255,0.6)"}}>G</span> debug<br/>
              <span style={{color:"rgba(255,255,255,0.6)"}}>???</span> secret theme 🕯️
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky drop */}
      <div className="mobile-drop-btn" style={{display:"none",position:"fixed",bottom:"1rem",left:"1rem",right:"1rem",zIndex:20}}>
        <button className="glass-btn glass-btn-primary" style={{width:"100%",padding:"1rem",fontSize:"1.05rem"}} onClick={handleDrop} disabled={dropping||bet>balance}>
          {dropping?"⏳ DROPPING...":"▼ DROP"}
        </button>
      </div>

      <style>{`
        @media(max-width:900px){
          main>div[style*="grid-template-columns"]{grid-template-columns:1fr!important;}
          .mobile-drop-btn{display:block!important;}
        }
      `}</style>
    </main>
  );
}
