
const state = {
  lang:'ja', level:'1', mode:'survival',
  score:0, combo:0, maxCombo:0, hp:5,
  startAt:0, lastCharAt:0, totalInputs:0, correctInputs:0,
  current:null, raf:null, spawnTimer:null, speed:1,
  chars:{}, directions:{up:mkStat(),down:mkStat(),left:mkStat(),right:mkStat(),tap:mkStat()},
  sessionStart:0, ended:true
};

function mkStat(){ return {n:0, ok:0, totalMs:0}; }

const JA_LEVELS = {
  1:["あ","い","う","え","お","か","き","く","け","こ","さ","し","す","せ","そ","た","ち","つ","て","と"],
  2:["ねこ","そら","いぬ","あさ","よる","みず","くも","はな","やま","かわ","えき","みち"],
  3:["りんご","でんしゃ","スマホ","ごはん","てがみ","ホテル","コンビニ","おかえり","おはよう"],
  4:["ありがとう","おつかれさま","だいじょうぶ","しょうゆ","りょうり","ちょっと","きょうは"],
  5:["きょうもがんばろう","あしたははやおき","すこしやすみます","でんしゃにのります"]
};
const EN_LEVELS = {
  1:["a","e","i","o","u","b","c","d","f","g","h","j","k","m","n","p","r","s","t"],
  2:["cat","dog","sky","red","blue","sun","book","food","train","phone"],
  3:["hello","morning","coffee","school","travel","family","market","window"],
  4:["thankyou","goodmorning","keyboard","practice","message","quickly"],
  5:["have a nice day","see you tomorrow","typing gets faster","practice every day"]
};

const FLICK = {
  "あ":{tap:"あ",left:"い",up:"う",right:"え",down:"お"},
  "か":{tap:"か",left:"き",up:"く",right:"け",down:"こ"},
  "さ":{tap:"さ",left:"し",up:"す",right:"せ",down:"そ"},
  "た":{tap:"た",left:"ち",up:"つ",right:"て",down:"と"},
  "な":{tap:"な",left:"に",up:"ぬ",right:"ね",down:"の"},
  "は":{tap:"は",left:"ひ",up:"ふ",right:"へ",down:"ほ"},
  "ま":{tap:"ま",left:"み",up:"む",right:"め",down:"も"},
  "や":{tap:"や",left:"",up:"ゆ",right:"",down:"よ"},
  "ら":{tap:"ら",left:"り",up:"る",right:"れ",down:"ろ"},
  "わ":{tap:"わ",left:"を",up:"ん",right:"ー",down:""}
};
const DAKUTEN = {"か":"が","き":"ぎ","く":"ぐ","け":"げ","こ":"ご","さ":"ざ","し":"じ","す":"ず","せ":"ぜ","そ":"ぞ","た":"だ","ち":"ぢ","つ":"づ","て":"で","と":"ど","は":"ば","ひ":"び","ふ":"ぶ","へ":"べ","ほ":"ぼ"};
const SMALL = {"や":"ゃ","ゆ":"ゅ","よ":"ょ","つ":"っ","あ":"ぁ","い":"ぃ","う":"ぅ","え":"ぇ","お":"ぉ"};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function loadProfile(){
  const p = JSON.parse(localStorage.getItem("flickfall_profile") || "{}");
  $("#bestScore").textContent = p.bestScore || 0;
  $("#bestAcc").textContent = p.bestAcc ? p.bestAcc+"%" : "--";
  $("#weakSummary").textContent = p.weak || "--";
}

$$(".choice").forEach(b=>b.addEventListener("click",()=>{
  const group=b.dataset.group;
  $$(`.choice[data-group="${group}"]`).forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  state[group]=b.dataset.value;
}));

$("#startBtn").addEventListener("click", startGame);
$("#retryBtn").addEventListener("click", startGame);
$("#restartBtn").addEventListener("click", startGame);
$("#retireBtn").addEventListener("click", ()=>{
  clearFlick();
  if(!window.confirm("メイン画面に戻りますか？\n途中のスコア・苦手分析は保存されません。")) return;
  stopSession();
  show("startScreen");
});
$("#homeBtn").addEventListener("click", ()=>show("startScreen"));

function show(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  $("#"+id).classList.add("active");
}

function setupEnglish(){
  const p=$("#enPad"); p.innerHTML="";
  "abcdefghijklmnopqrstuvwxyz".split("").forEach(ch=>{
    const b=document.createElement("button");
    b.textContent=ch.toUpperCase(); b.dataset.char=ch;
    b.addEventListener("pointerdown",()=>inputChar(ch,"tap"));
    p.appendChild(b);
  });
}

function stopSession(){
  state.ended=true;
  cancelAnimationFrame(state.raf);
  clearTimeout(state.spawnTimer);
  state.raf=null; state.spawnTimer=null;
  clearFlick();
  state.current?.el.remove(); state.current=null;
  $("#attackFx").classList.remove("fire");
  $("#targetProgress").textContent="---";
}

function scheduleEnemy(delay){
  clearTimeout(state.spawnTimer);
  state.spawnTimer=setTimeout(()=>{state.spawnTimer=null; spawnEnemy();},delay);
}

function startGame(){
  stopSession();
  state.score=0; state.combo=0; state.maxCombo=0; state.hp=5;
  state.totalInputs=0; state.correctInputs=0; state.current=null; state.speed=1; state.ended=false;
  state.chars={}; state.directions={up:mkStat(),down:mkStat(),left:mkStat(),right:mkStat(),tap:mkStat()};
  state.sessionStart=performance.now();
  state.startAt=state.sessionStart; state.lastCharAt=0;
  $("#elapsed").textContent="0:00";
  $("#score").textContent=0; $("#combo").textContent=0; $("#hp").textContent=5; $("#speedLabel").textContent="1.0x";
  $("#arena").querySelectorAll(".enemy").forEach(e=>e.remove());
  $("#jpPad").classList.toggle("hidden", state.lang!=="ja");
  $("#enPad").classList.toggle("hidden", state.lang!=="en");
  show("gameScreen");
  spawnEnemy();
  state.raf=requestAnimationFrame(gameLoop);
}

function getPool(){
  const src=state.lang==="ja"?JA_LEVELS:EN_LEVELS;
  let lv=state.level==="auto" ? autoLevel() : Number(state.level);
  let pool=[...src[lv]];
  if(state.mode==="weakness"){
    const weak = getWeakCharsFromProfile();
    if(weak.length){
      const enriched=[];
      for(const item of pool){
        enriched.push(item);
        if([...item].some(c=>weak.includes(c))) enriched.push(item,item);
      }
      pool=enriched;
    }
  }
  return pool;
}
function autoLevel(){
  const acc = state.totalInputs ? state.correctInputs/state.totalInputs : 1;
  if(state.speed<1.2) return 1;
  if(state.speed<1.45 && acc>.92) return 2;
  if(state.speed<1.75 && acc>.92) return 3;
  if(state.speed<2.05 && acc>.9) return 4;
  return 5;
}

function spawnEnemy(){
  if(state.ended || state.current) return;
  const pool=getPool();
  const text=pool[Math.floor(Math.random()*pool.length)];
  const el=document.createElement("div");
  el.className="enemy";
  el.textContent=text;
  $("#arena").appendChild(el);
  state.current={text, typed:"", el, y:-50, born:performance.now(), charStarted:performance.now()};
  updateProgress();
}

function gameLoop(){
  if(state.ended) return;
  const c=state.current;
  if(c){
    const arenaH=$("#arena").clientHeight;
    const base = state.mode==="daily" ? 28 : 34;
    c.y += base * state.speed / 60;
    c.el.style.top=c.y+"px";
    if(c.y>arenaH-70){
      missEnemy();
    } else if(c.y>arenaH*0.72){
      c.el.classList.add("danger");
    }
  }
  if(state.ended) return;
  adaptDifficulty();
  if(!state.ended) state.raf=requestAnimationFrame(gameLoop);
}

function adaptDifficulty(){
  const t=(performance.now()-state.sessionStart)/1000;
  $("#elapsed").textContent=`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}`;
  const target=1+Math.min(1.8,t/45);
  if(state.level==="auto") state.speed += (target-state.speed)*0.002;
  else state.speed = 1 + (Number(state.level)-1)*0.17 + Math.min(.8,t/80);
  $("#speedLabel").textContent=state.speed.toFixed(1)+"x";
  if(state.mode==="daily" && t>=180) endGame();
}

function missEnemy(){
  if(!state.current) return;
  state.current.el.remove(); state.current=null;
  state.hp--; state.combo=0;
  $("#hp").textContent=state.hp; $("#combo").textContent=0;
  if(state.hp<=0) return endGame();
  scheduleEnemy(180);
}

function flashAttack(){
  const fx=$("#attackFx"); fx.classList.remove("fire"); void fx.offsetWidth; fx.classList.add("fire");
}

function inputChar(ch,dir="tap"){
  const c=state.current; if(state.ended || !c) return;
  const now=performance.now(), expected=[...c.text][[...c.typed].length];
  const ms=now-c.charStarted; c.charStarted=now;
  state.totalInputs++;
  state.directions[dir] ||= mkStat();
  state.directions[dir].n++;
  state.directions[dir].totalMs+=ms;
  state.chars[expected] ||= {n:0,ok:0,totalMs:0};
  state.chars[expected].n++; state.chars[expected].totalMs+=ms;

  if(ch===expected){
    state.correctInputs++; state.directions[dir].ok++; state.chars[expected].ok++;
    c.typed += ch; state.combo++; state.maxCombo=Math.max(state.maxCombo,state.combo);
    state.score += 10 + Math.min(40,state.combo);
    $("#score").textContent=state.score; $("#combo").textContent=state.combo;
    flashAttack();
    updateProgress();
    if(c.typed===c.text){
      state.score += Math.round(100*state.speed);
      $("#score").textContent=state.score;
      c.el.remove(); state.current=null;
      scheduleEnemy(110);
    }
  } else {
    state.combo=0; $("#combo").textContent=0;
  }
}

function updateProgress(){
  const c=state.current;
  if(!c){$("#targetProgress").textContent="---"; return;}
  $("#targetProgress").textContent=`${c.typed}${c.text.slice(c.typed.length)}`;
}

function endGame(){
  if(state.ended) return;
  stopSession();
  const acc=state.totalInputs ? Math.round(state.correctInputs/state.totalInputs*1000)/10 : 0;
  let totalMs=0,n=0;
  Object.values(state.chars).forEach(s=>{totalMs+=s.totalMs;n+=s.n});
  const avg=n?Math.round(totalMs/n):0;
  const weak=computeWeakSummary();
  $("#rScore").textContent=state.score;
  $("#rAccuracy").textContent=acc+"%";
  $("#rAvg").textContent=avg+" ms";
  $("#rCombo").textContent=state.maxCombo;
  $("#rWeak").textContent=weak.text;
  saveProfile(acc,weak);
  show("resultScreen");
}

function computeWeakSummary(){
  const chars=Object.entries(state.chars).map(([ch,s])=>{
    const acc=s.n?s.ok/s.n:1, avg=s.n?s.totalMs/s.n:0;
    const weakness=(1-acc)*1000+avg;
    return {ch,acc,avg,weakness};
  }).filter(x=>x.ch).sort((a,b)=>b.weakness-a.weakness).slice(0,3);

  const dirs=Object.entries(state.directions).map(([d,s])=>{
    const acc=s.n?s.ok/s.n:1, avg=s.n?s.totalMs/s.n:0;
    return {d,acc,avg,weakness:(1-acc)*1000+avg};
  }).filter(x=>x.avg>0).sort((a,b)=>b.weakness-a.weakness);

  const dirName={up:"上",down:"下",left:"左",right:"右",tap:"タップ"};
  const charText=chars.length?chars.map(x=>x.ch).join("・"):"なし";
  const dirText=dirs.length?dirName[dirs[0].d]:"なし";
  return {weakChars:chars.map(x=>x.ch), weakDir:dirs[0]?.d||"", text:`苦手文字：${charText} / 苦手方向：${dirText}`};
}

function saveProfile(acc,weak){
  const old=JSON.parse(localStorage.getItem("flickfall_profile") || "{}");
  const p={
    bestScore:Math.max(old.bestScore||0,state.score),
    bestAcc:Math.max(old.bestAcc||0,acc),
    weak:weak.weakChars.join("") || old.weak || "--",
    weakChars:weak.weakChars,
    weakDir:weak.weakDir,
    lastPlayed:new Date().toISOString()
  };
  localStorage.setItem("flickfall_profile",JSON.stringify(p));
  loadProfile();
}
function getWeakCharsFromProfile(){
  const p=JSON.parse(localStorage.getItem("flickfall_profile") || "{}");
  return p.weakChars || [];
}

let swipeStart=null;
function flickDirection(e){
  const dx=e.clientX-swipeStart.x, dy=e.clientY-swipeStart.y;
  if(Math.hypot(dx,dy)<=18) return "tap";
  return Math.abs(dx)>Math.abs(dy) ? (dx>0?"right":"left") : (dy>0?"down":"up");
}
function clearFlick(){
  const previous=swipeStart; swipeStart=null;
  $("#flickCandidates").classList.add("hidden");
  if(previous){
    previous.btn.classList.remove("pressed");
    if(previous.btn.hasPointerCapture?.(previous.pointerId)) previous.btn.releasePointerCapture(previous.pointerId);
  }
}
function highlightFlick(dir){
  $$("#flickCandidates [data-direction]").forEach(el=>el.classList.toggle("selected",el.dataset.direction===dir && !!el.textContent));
}
$$("#jpPad button[data-base]").forEach(btn=>{
  btn.addEventListener("pointerdown",e=>{
    if(state.ended || swipeStart || e.button!==0) return;
    e.preventDefault();
    swipeStart={x:e.clientX,y:e.clientY,base:btn.dataset.base,btn,pointerId:e.pointerId};
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add("pressed");
    const popup=$("#flickCandidates"), rect=btn.getBoundingClientRect();
    $$("#flickCandidates [data-direction]").forEach(el=>{
      el.textContent=FLICK[btn.dataset.base][el.dataset.direction];
      el.classList.toggle("empty",!el.textContent);
    });
    popup.style.left=Math.max(80,Math.min(window.innerWidth-80,rect.left+rect.width/2))+"px";
    popup.style.top=Math.max(80,Math.min(window.innerHeight-80,rect.top-82))+"px";
    popup.classList.remove("hidden");
    highlightFlick("tap");
  });
  btn.addEventListener("pointermove",e=>{
    if(swipeStart?.pointerId===e.pointerId) highlightFlick(flickDirection(e));
  });
  btn.addEventListener("pointerup",e=>{
    if(swipeStart?.pointerId!==e.pointerId) return;
    const dir=flickDirection(e), ch=FLICK[swipeStart.base]?.[dir];
    clearFlick();
    if(ch) inputChar(ch,dir);
  });
  ["pointercancel","lostpointercapture"].forEach(type=>btn.addEventListener(type,e=>{
    if(swipeStart?.pointerId===e.pointerId) clearFlick();
  }));
});
window.addEventListener("blur",clearFlick);
window.addEventListener("resize",clearFlick);
document.addEventListener("visibilitychange",()=>{if(document.hidden) clearFlick();});

let lastKana="";
$("#dakutenBtn").addEventListener("click",()=>{
  const c=state.current; if(!c) return;
  const expected=[...c.text][[...c.typed].length];
  // If expected is voiced kana, allow user to tap base then dakuten is not needed in current simple pad.
  // Direct assistance: emit expected voiced kana when applicable to keep V1 playable.
  if(Object.values(DAKUTEN).includes(expected)) inputChar(expected,"tap");
});
$("#smallBtn").addEventListener("click",()=>{
  const c=state.current; if(!c) return;
  const expected=[...c.text][[...c.typed].length];
  if(Object.values(SMALL).includes(expected)) inputChar(expected,"tap");
});

document.addEventListener("keydown",e=>{
  if(!$("#gameScreen").classList.contains("active")) return;
  if(e.key.length===1) inputChar(e.key.toLowerCase(),"tap");
});

setupEnglish();
loadProfile();

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
