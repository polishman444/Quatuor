// =====================================================================
// Quatuor : le jeu (interface, parties, navigation, rappels, compte). Chargé par index.html après js/grilles.js.
// =====================================================================
// Chaque grille : 4 groupes du plus facile (niveau 0) au plus dur (niveau 3), avec une anecdote
const G = (name, words, fact) => ({name, words, fact});
// Difficulté d'une grille : facile, moyen, difficile ou goat
const D = (diff, groups) => Object.assign(groups, {diff});
// ---- Appli iOS (Capacitor) ou PWA ? Le même code sert aux deux ----
const IS_NATIVE=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
// Plugin natif Capacitor (null dans la PWA)
const plugin=n=>IS_NATIVE&&window.Capacitor.Plugins&&window.Capacitor.Plugins[n]||null;
// Les grilles sont chargées depuis grilles.json (voir loadGrids)
// URL des grilles : relative pour la PWA ; dans l'appli iOS, version en ligne (adresse principale, puis adresse de secours).
// Secours : le fichier brut du dépôt GitHub (branche main), indépendant du domaine : l'adresse github.io,
// elle, redirige vers playquatuor.fr dès que le domaine personnalisé est configuré.
const GRIDS_REMOTE=["https://playquatuor.fr/grilles.json","https://raw.githubusercontent.com/polishman444/Quatuor/main/grilles.json"];
const GRIDS_LOCAL="grilles.json";   // copie de secours embarquée (mise en cache par le service worker ; incluse dans l'appli)
let GRIDS=[];
let attempt=1, hasard=null;
let hints=0, hintCat=-1, hintWords=[];   // indices utilisés, catégorie de l'indice et mots mis en évidence
const MAX_HINTS=6;          // indices par grille (dans l'appli, chacun se débloque avec une pub récompensée)
const MAX_MOTS_INDICE=3;    // mots mis en évidence au plus par groupe (le 4e donnerait la réponse)
// Grille d'entraînement du premier lancement (hors GRIDS : aucun impact sur stats, résultats ou favoris)
// Grille d'entraînement du tutoriel, très facile (hors GRIDS : aucun impact sur stats, série, résultats, favoris ni anti-répétition)
const TUTO = D("facile",[G("Fruits",["Pomme","Banane","Fraise","Cerise"],"Pour un botaniste, la banane est une baie… mais pas la fraise !"),
  G("Animaux de la ferme",["Vache","Cochon","Mouton","Poule"],"Le cochon ne transpire presque pas : il se roule dans la boue pour se rafraîchir."),
  G("Couleurs",["Rouge","Bleu","Vert","Jaune"],"Dans la Rome antique, le bleu était mal aimé : c'était la couleur des barbares."),
  G("Pays",["France","Italie","Japon","Brésil"],"Le Japon compte plus de 14 000 îles !")]);
// Typographie française : espaces insécables avant : ; ! ? » et après « (pas de ponctuation seule en début de ligne)
const fr=t=>t.replace(/ ([:;!?»])/g,"\u00A0$1").replace(/« /g,"«\u00A0");
TUTO.forEach(g=>{ g.fact=fr(g.fact); g.name=fr(g.name); });
const LEVELS=["Facile","Réflexion","Coriace","Casse-tête"];
const ICON=["🌱","⚡","🔥","🧠"];
const $=id=>document.getElementById(id);
// ---- Stockage des données du joueur (résultats, stats, série, favoris, parties en cours, réglages) ----
// PWA : localStorage, comme toujours. Appli iOS : @capacitor/preferences (iOS peut vider le localStorage d'une WebView),
// avec une copie en mémoire chargée au lancement (initStockage) pour garder une lecture synchrone.
// Mêmes clés et même format partout ; dans l'appli, le localStorage reste tenu à jour en double.
let Prefs=plugin("Preferences");
const memo=new Map();
const ls={
  get:k=>{ if(Prefs) return memo.has(k)?memo.get(k):null; try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set:(k,v)=>{ if(Prefs){ v=String(v); memo.set(k,v); Prefs.set({key:k,value:v}).catch(e=>console.warn("Quatuor : écriture impossible ("+k+")",e)); }
    try{ localStorage.setItem(k,v); }catch(e){} },
  del:k=>{ if(Prefs){ memo.delete(k); Prefs.remove({key:k}).catch(()=>{}); } try{ localStorage.removeItem(k); }catch(e){} }
};
// Appli iOS : charge les préférences en mémoire. Au premier lancement de l'appli avec ce stockage,
// toutes les données « quatuor… » déjà présentes dans le localStorage sont recopiées (rien n'est perdu).
async function initStockage(){
  if(!Prefs) return;
  try{
    const {keys}=await Prefs.keys(), vals=await Promise.all(keys.map(key=>Prefs.get({key})));
    keys.forEach((k,i)=>{ if(vals[i]&&vals[i].value!=null) memo.set(k,vals[i].value); });
    if(!memo.has("quatuor-stockage-natif")){
      const anciennes=[]; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith("quatuor")) anciennes.push(k); } }catch(e){}
      anciennes.forEach(k=>{ if(!memo.has(k)){ const v=localStorage.getItem(k); if(v!=null) ls.set(k,v); } });
      ls.set("quatuor-stockage-natif","1");
    }
  }catch(e){ console.warn("Quatuor : préférences natives indisponibles, utilisation du localStorage",e); Prefs=null; memo.clear(); }
}
const start=new Date(2026,9,1), today=new Date(); today.setHours(0,0,0,0);
const isoDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayStr=isoDay(today);   // date locale du joueur, ex. 2026-10-01
const dayNum=Math.round((today-start)/864e5)+1;   // arrondi : pas de décalage au passage à l'heure d'été
// Vibrations : PWA -> navigator.vibrate(p) ; appli iOS -> retour haptique (impact léger, ou « SUCCESS » / « ERROR »)
const Haptics=plugin("Haptics");
// ---- Réglages du joueur (quatuor-reglages) : lus au lancement (lireReglages), modifiables dans les Paramètres ----
const REG_DEF={theme:"auto",texte:"normal",daltonien:false,sons:true,vibrations:true,stats:true};   // stats : statistiques anonymes
let REG={...REG_DEF};
function lireReglages(){
  try{ const r=JSON.parse(ls.get("quatuor-reglages")||"null"); REG=Object.assign({},REG_DEF,r&&typeof r==="object"?r:{}); }catch(e){ REG={...REG_DEF}; }
}
const ecrireReglages=()=>ls.set("quatuor-reglages",JSON.stringify(REG));
// Vibrations prises en charge ? (appli iOS : toujours ; web : seulement si navigator.vibrate existe)
const VIBRE=!!Haptics||typeof navigator.vibrate==="function";
// Plusieurs retours légers en moins de 60 ms (doigts posés ensemble) : un seul
// type : "SUCCESS" (groupe trouvé), "ERROR" (erreur), "FETE" (grille réussie), sinon impact très léger
let dernierBuzz=0;
const buzz=(p,type)=>{ try{
  if(!REG.vibrations) return;
  if(!type){ const t=performance.now(); if(t-dernierBuzz<60) return; dernierBuzz=t; }
  if(Haptics){
    if(type==="FETE") [["LIGHT",0],["MEDIUM",110],["HEAVY",220]].forEach(([style,d])=>setTimeout(()=>Haptics.impact({style}).catch(()=>{}),d));
    else (type?Haptics.notification({type}):Haptics.impact({style:"LIGHT"})).catch(()=>{});
    return; }
  navigator.vibrate&&navigator.vibrate(p); }catch(e){} };

// ---- Sons (Web Audio, générés : aucun fichier) ----
// Courts et doux. Session audio « ambient » : respecte le mode silencieux de l'iPhone et ne coupe jamais
// la musique du joueur (navigator.audioSession sur Safari récent ; dans l'appli, AppDelegate.swift).
// sel : sélection (aigu) / désélection ; groupe n (0 à 3) : une note de plus à chaque groupe ; erreur ; victoire.
const SON=(()=>{
  let ctx=null, sortie=null, dernier=0;
  const NOTES=[523.25,659.25,783.99,1046.5,1318.5];   // do, mi, sol, do, mi
  function audio(){
    if(ctx) return ctx;
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null;
    try{ if(navigator.audioSession) navigator.audioSession.type="ambient"; }catch(e){}
    ctx=new AC();
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-18; comp.ratio.value=6;
    sortie=ctx.createGain(); sortie.gain.value=.55; sortie.connect(comp); comp.connect(ctx.destination);
    return ctx;
  }
  // l'audio se débloque au premier geste (exigence iOS)
  const debloquer=()=>{ const c=audio(); if(c&&c.state==="suspended") c.resume().catch(()=>{}); };
  addEventListener("pointerdown",debloquer,{capture:true,passive:true});
  // une note : oscillateur + enveloppe (attaque courte, décroissance douce)
  function note(f,{t=0,dur=.35,vol=.18,type="sine",glisse=0}={}){
    const c=ctx, t0=c.currentTime+.005+t, o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.setValueAtTime(f,t0); if(glisse) o.frequency.exponentialRampToValueAtTime(f*glisse,t0+dur);
    g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol,t0+.008); g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    o.connect(g); g.connect(sortie); o.start(t0); o.stop(t0+dur+.05);
  }
  const cloche=(f,t=0,vol=.16)=>{ note(f,{t,dur:.5,vol}); note(f*2,{t,dur:.25,vol:vol*.25,type:"triangle"}); };
  return {
    jouer(quoi,n){
      if(!REG.sons) return;
      const c=audio(); if(!c) return;
      if(c.state==="suspended") c.resume().catch(()=>{});
      try{
        if(quoi==="sel"||quoi==="desel"){   // plusieurs mots touchés ensemble : un seul son
          const t=performance.now(); if(t-dernier<60) return; dernier=t;
          note(quoi==="sel"?880:660,{dur:.07,vol:.07,type:"triangle"});
        }
        else if(quoi==="groupe"){ const k=Math.max(0,Math.min(3,n|0)); note(NOTES[k]/2,{dur:.12,vol:.05,type:"triangle"}); cloche(NOTES[k],.05); }
        else if(quoi==="erreur") note(220,{dur:.18,vol:.12,type:"sine",glisse:.72});
        else if(quoi==="victoire") NOTES.forEach((f,i)=>cloche(f,i*.09,.13));
      }catch(e){}
    }
  };
})();
const esc=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// Difficulté des grilles : nombre d'erreurs autorisées et couleur
const DIFFS={facile:{name:"Facile",err:4,c:0},moyen:{name:"Moyen",err:4,c:1},difficile:{name:"Difficile",err:3,c:2},goat:{name:"GOAT",err:2,c:3,icon:"🐐"}};
const DKEYS=Object.keys(DIFFS);
// Une grille datée dans le futur reste cachée (pas de spoiler), sauf si elle est « toujours_visible »
// (les grilles de thème n'apparaissent jamais dans le tiroir, le mode hasard ni « Grille suivante »)
const visible=i=>GRIDS[i].theme==="quotidien"&&(GRIDS[i].always||!GRIDS[i].jour||GRIDS[i].jour<=todayStr);
const idsOf=k=>GRIDS.map((_,i)=>i).filter(i=>GRIDS[i].diff===k&&visible(i));
const dname=k=>DIFFS[k].name+(DIFFS[k].icon?" "+DIFFS[k].icon:"");
// ---- Grille du jour : celle du calendrier (jamais facile ni GOAT) ; sinon une « Grille bonus », la même pour tous ----
// Règles communes au jeu et au vérificateur : js/grilles.js (QG.choisirGrilleDuJour)
let dailyIdx=-1, dailyBonus=false;   // dailyBonus : aucune grille planifiée aujourd'hui -> « Grille bonus »
function pickDaily(){
  const c=QG.choisirGrilleDuJour(GRIDS,todayStr);
  dailyBonus=c.bonus; return c.index;
}

// ---- Lecture et validation de grilles.json ----
// Difficulté en texte (« moyen ») ou en chiffre (1 = facile … 4 = goat)
const diffKey=v=>typeof v==="number"?DKEYS[v-1]:v;
function checkGrid(x,ids){
  if(!x||typeof x.id!=="string"||!x.id) return "id manquant";
  if(ids.has(x.id)) return "id en double";
  if(!Number.isInteger(x.num)) return "num invalide";
  if(!DIFFS[diffKey(x.difficulte)]) return "difficulté inconnue";
  if(x.theme!=null&&(typeof x.theme!=="string"||!x.theme)) return "thème invalide";
  if(x.jour!=null&&!/^\d{4}-\d{2}-\d{2}$/.test(x.jour)) return "jour invalide";
  if(x.toujours_visible!=null&&typeof x.toujours_visible!=="boolean") return "toujours_visible doit valoir true ou false";
  if(!Array.isArray(x.groupes)||x.groupes.length!==4) return "il faut 4 groupes";
  for(const g of x.groupes)
    if(!g||typeof g.nom!=="string"||typeof g.anecdote!=="string"||!Array.isArray(g.mots)||g.mots.length!==4||g.mots.some(m=>typeof m!=="string"||!m.trim())) return "groupe invalide";
  if(new Set(x.groupes.flatMap(g=>g.mots)).size!==16) return "les 16 mots ne sont pas tous différents";
  return "";
}
function parseGrids(data){
  if(!data||!Array.isArray(data.grilles)) throw new Error("format inattendu");
  const out=[], ids=new Set();
  data.grilles.forEach((x,n)=>{
    const why=checkGrid(x,ids);
    if(why){ console.warn(`Quatuor : grille ${(x&&x.id)||"n°"+(n+1)} ignorée (${why})`); return; }
    ids.add(x.id);
    out.push(Object.assign(x.groupes.map(g=>G(fr(g.nom),g.mots.slice(),fr(g.anecdote))),
      {id:x.id,num:x.num,diff:diffKey(x.difficulte),jour:x.jour||null,always:x.toujours_visible===true,theme:x.theme||"quotidien",
       titre:typeof x.titre==="string"&&x.titre.trim()?x.titre.trim():null}));
  });
  // Liste des thèmes (mode « Thèmes ») ; un thème inconnu ou mal formé est ignoré
  out.themes=(Array.isArray(data.themes)?data.themes:[]).filter(t=>t&&typeof t.id==="string"&&t.id!=="quotidien"&&typeof t.nom==="string")
    .map(t=>({id:t.id,nom:t.nom,icone:t.icone||"🗂️",ordre:Number.isFinite(t.ordre)?t.ordre:99,publie:t.publie===true}));
  return out;
}
function readGrids(text,src){
  try{ const g=parseGrids(JSON.parse(text)); if(g.length) return g; console.warn(`Quatuor : aucune grille valide (${src})`); }
  catch(e){ console.warn(`Quatuor : grilles illisibles (${src})`,e); }
  return null;
}
// Réseau d'abord (≈3 s max), puis copie locale, puis copie embarquée
async function loadGrids(){
  // Même arrivée après le délai, une réponse valide est gardée pour le prochain lancement
  // (appli iOS : adresse principale, puis adresse de secours si la première échoue)
  const urls=IS_NATIVE?GRIDS_REMOTE:[GRIDS_LOCAL];
  const net=(async()=>{
    for(let n=0;n<urls.length;n++){
      try{
        const ctl=IS_NATIVE&&window.AbortController?new AbortController():null, tm=ctl&&setTimeout(()=>ctl.abort(),8000);
        const t=await fetch(urls[n],ctl?{cache:"no-cache",signal:ctl.signal}:{cache:"no-cache"}).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }).finally(()=>clearTimeout(tm));
        const g=readGrids(t,"réseau"); if(g) ls.set("quatuor-grilles",t);
        if(g||n===urls.length-1) return g;
      }catch(e){ if(n===urls.length-1) throw e; console.warn(`Quatuor : ${urls[n]} indisponible (${e.message}), essai de l'adresse de secours`); }
    }
  })();
  net.catch(()=>{});
  try{
    const g=await Promise.race([net,new Promise((_,ko)=>setTimeout(()=>ko(new Error("délai dépassé")),3000))]);
    if(g) return g;
  }catch(e){ console.warn("Quatuor : réseau indisponible ("+e.message+"), utilisation de la copie"); }
  const copy=ls.get("quatuor-grilles");
  if(copy){ const g=readGrids(copy,"copie locale"); if(g) return g; }
  try{
    let r=(!IS_NATIVE&&"caches" in window)?await caches.match(GRIDS_LOCAL,{ignoreSearch:true}):null;
    if(!r) r=await fetch(GRIDS_LOCAL);
    const g=readGrids(await r.text(),"copie embarquée"); if(g) return g;
  }catch(e){ console.warn("Quatuor : copie embarquée introuvable",e); }
  return null;
}

// ---- Migration unique : résultats et favoris passent de la position de la grille à son id ----
// Avant grilles.json, la grille en position i est devenue la grille d'id g001, g002… (même ordre).
function migrateData(){
  if(ls.get("quatuor-migr")==="1") return;
  const gid=i=>"g"+String(+i+1).padStart(3,"0");
  try{ const r=JSON.parse(ls.get("quatuor-res")||"{}"), n={};
    Object.keys(r).forEach(k=>{ n[/^\d+$/.test(k)?gid(k):k]=r[k]; });
    ls.set("quatuor-res",JSON.stringify(n)); }catch(e){ console.warn("Quatuor : migration des résultats impossible",e); }
  try{ const f=JSON.parse(ls.get("quatuor-favs")||"[]");
    if(Array.isArray(f)){ f.forEach(x=>{ if(typeof x.grid==="number"){ x.num=x.grid+1; x.grid=gid(x.grid); x.id=`${x.grid}:${x.name}`; } });
      ls.set("quatuor-favs",JSON.stringify(f)); } }catch(e){ console.warn("Quatuor : migration des favoris impossible",e); }
  ls.set("quatuor-migr","1");
}
// ---- Mode en ligne : les stats actuelles deviennent la « base » de calcul (une seule fois) ----
// Les anciens résultats n'ont pas de date : la série est ensuite recalculée à partir de cette base
// et des résultats datés (js/calculs.js), à l'identique sur tous les appareils.
const QC=window.QC||null;
function migrerVersEnLigne(){
  if(!QC||ls.get("quatuor-base")) return;
  ls.set("quatuor-base",JSON.stringify(QC.baseDepuisStats(load())));
}
function lireBase(){ try{ return JSON.parse(ls.get("quatuor-base"))||null; }catch(e){ return null; } }
// Statistiques des grilles du jour recalculées (série, record, parties, % de réussite)
function recalculerStats(){
  if(!QC) return;
  const b=lireBase(); if(!b) return;
  try{ save(QC.statsLocales(QC.calculerStats(b,loadRes(),todayStr))); }catch(e){ console.warn("Quatuor : calcul des stats impossible",e); }
}
function loadRes(){ try{ return JSON.parse(ls.get("quatuor-res"))||{}; }catch(e){ return {}; } }
function saveRes(r){ try{ ls.set("quatuor-res",JSON.stringify(r)); }catch(e){} }
// duree : temps de jeu (en s) de la partie terminée affichée (résultats, partage) ; null si inconnu
let grid,gridIdx,practice,words,selected,found,mistakes,maxErr,history,tried,done,busy,duree=null,gameId=0,menuTab=null,tuto=false,lastWin=false;   // menuTab : niveau déplié dans « Bonus »

// ---- Animations (transform + opacity uniquement) ----
const RM=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
const baseT=e=>e.classList.contains("tile")&&e.classList.contains("on")?"translateY(3px)":"";
// FLIP : mémorise les positions, applique le changement, puis fait glisser chaque élément depuis son ancienne place
function flipLayout(fn,o={}){
  if(RM()){ fn(); return; }
  const els=[...document.querySelectorAll("#tuto, #solved .solved, #grid .tile, #lives")];
  const before=new Map(els.map(e=>[e,e.getBoundingClientRect()]));
  fn();
  els.forEach(e=>{ if(e._fa){ e._fa.cancel(); e._fa=null; } });
  let k=0;
  before.forEach((r,e)=>{
    if(!e.isConnected) return;
    const n=e.getBoundingClientRect(), dx=r.left-n.left, dy=r.top-n.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1) return;
    const b=baseT(e), from=`translate(${dx}px,${dy}px) ${b}`, to=b||"none";
    const kf=o.lift?[{transform:from},{transform:`translate(${dx/2}px,${dy/2}px) ${b} scale(.97)`},{transform:to}]:[{transform:from},{transform:to}];
    e._fa=e.animate(kf,{duration:o.dur||450,delay:(o.stagger||0)*k++,easing:"cubic-bezier(.25,.8,.3,1)",fill:"backwards"});
    e._fa.onfinish=()=>{ e._fa=null; };
  });
}
function spring(t){
  if(RM()) return;
  t.classList.remove("spring"); void t.offsetWidth; t.classList.add("spring");
}
function burst(r,gi){
  if(RM()) return;
  for(let i=0;i<10;i++){
    const p=document.createElement("i"); p.className="spark"; p.style.background=`var(--l${gi})`;
    p.style.left=(r.left+r.width*(.1+.8*Math.random()))+"px"; p.style.top=(r.top+r.height/2)+"px";
    document.body.appendChild(p);
    const a=Math.random()*Math.PI*2, d=25+Math.random()*30, dx=Math.cos(a)*d, dy=Math.sin(a)*d*.7-12;
    p.animate([{transform:"scale(.9)",opacity:.9},{transform:`translate(${dx}px,${dy}px) scale(.3)`,opacity:0}],
      {duration:800+Math.random()*300,easing:"cubic-bezier(.2,.7,.3,1)"}).onfinish=()=>p.remove();
  }
}
function confetti(){
  if(RM()) return;
  const H=innerHeight+40;
  for(let i=0;i<50;i++){
    const c=document.createElement("i"); c.className="confetti"; c.style.background=`var(--l${i%4})`;
    c.style.left=(Math.random()*100)+"vw"; c.style.width=(7+Math.random()*5)+"px"; c.style.height=(10+Math.random()*7)+"px";
    document.body.appendChild(c);
    const dx=(Math.random()-.5)*120, rot=(Math.random()-.5)*540;
    c.animate([{transform:"translate(0,0) rotate(0)",opacity:1},{transform:`translate(${dx}px,${H}px) rotate(${rot}deg)`,opacity:1,offset:.85},{transform:`translate(${dx}px,${H}px) rotate(${rot}deg)`,opacity:0}],
      {duration:1700+Math.random()*500,delay:Math.random()*400,easing:"cubic-bezier(.35,.25,.6,1)",fill:"backwards"}).onfinish=()=>c.remove();
  }
}
function loseDot(d){
  if(RM()) return;
  d.classList.remove("lose"); void d.offsetWidth; d.classList.add("lose");
  const r=d.getBoundingClientRect(), f=document.createElement("i"); f.className="fall";
  Object.assign(f.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});
  document.body.appendChild(f);
  f.animate([{transform:"none",opacity:.7},{transform:"translate(3px,26px) rotate(30deg) scale(.7)",opacity:0}],
    {duration:800,easing:"cubic-bezier(.45,0,.55,1)"}).onfinish=()=>f.remove();
}
const shuffleArr=a=>{ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const groupOf=w=>grid.findIndex(g=>g.words.includes(w));

function newGame(idx,opts={}){
  tuto=idx===-1; gridIdx=idx; grid=tuto?TUTO:GRIDS[idx]; practice=tuto||idx!==dailyIdx; gameId++;
  hasard=opts.hasard||null;
  hints=0; hintCat=-1; hintWords=[]; $("hintBar").hidden=true;
  const prev=tuto?null:loadRes()[grid.id];
  // Partie en cours sauvegardée (reprise exacte) ; une nouvelle tentative déjà autorisée se reprend sans redemander
  const sv=tuto?null:repriseValide(grid,prev);
  // Grille perdue : pas de nouvelle partie sans passer par retenter() (et donc autoriserNouvelEssai)
  const lostView=!!(prev&&!prev.win&&opts.essai!==JETON_ESSAI&&!sv);
  attempt=sv?sv.attempt:opts.essai===JETON_ESSAI&&prev?(prev.tries||1)+1:1;
  words=shuffleArr(grid.flatMap(g=>g.words)); selected=new Set(); found=[]; mistakes=0; history=[]; tried=new Set(); done=false; busy=false; duree=null;
  maxErr=tuto?4:DIFFS[grid.diff].err;   // tutoriel : 4 erreurs affichées, mais impossible de perdre
  $("lives").querySelector(".dots").innerHTML="<i></i>".repeat(maxErr);
  const d=today.toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
  const arch=!tuto&&practice&&isArchive(idx);   // grille du calendrier d'un jour passé
  const badge=`<span class="dbadge l${DIFFS[grid.diff].c}">${dname(grid.diff)}</span>`;
  $("sub").classList.toggle("tsub",tuto);
  $("sub").innerHTML = tuto ? `<span>Grille d'<b>entraînement</b></span>`
    : (isTheme() ? `${themeOf(grid.theme).icone} ${esc(themeOf(grid.theme).nom)} · <b>${esc(themeLabel(idx))}</b>`
      : arch ? `Grille du <b>${dateLongue(grid.jour)}</b>`
      : practice ? `Grille <b>n°${grid.num}</b>` : `${dailyBonus?"Grille bonus":"Grille du jour"} · <b>${d}</b>`)+badge;
  $("solved").innerHTML=""; $("lives").style.display="flex";
  const dk=document.querySelector(".dock"); dk.style.display="block"; dk.classList.remove("over","lost","pending","home"); document.body.classList.remove("home");
  if(!tuto&&tutoEtape){ tutoEtape=0; BULLE.fermer(); }
  clearTimeout(minuteurIndice);
  document.body.classList.toggle("notabs",tuto);
  setView("jeu");
  chrono.depart(sv&&Number.isFinite(sv.ms)?sv.ms:0);
  if(sv){ restaurerPartie(sv); hasard=opts.hasard||sv.hasard||null; }
  // Lancement avec la grille du jour déjà terminée : plateau terminé + encart (pas l'écran de résultats)
  else if(opts.accueil&&prev&&prev.win){ showWonBoard(prev); showHome(); return; }
  if(lostView){ if(prev.vu===false) showPendingBoard(prev); else { showLostBoard(prev); if(opts.accueil) showHome(); } return; }
  draw();
  if(sv&&hintCat>=0) renderHint();
  if(!sv&&!tuto) stat("Grille.commencee",{grille:grid.id,typeGrille:typeGrille(),essai:attempt});
  updateNextLabels();
  lancerMinuteurIndice();
}
// Plateau d'une grille réussie : les 4 bandeaux (catégories, mots, anecdotes)
function showWonBoard(prev){
  duree=Number.isFinite(prev.s)?prev.s:null; hints=prev.hints||0; done=true; lastWin=true; words=[]; found=[0,1,2,3]; mistakes=prev.mistakes||0; history=prev.hist||[]; attempt=prev.tries||1;
  $("grid").innerHTML=""; [0,1,2,3].forEach(gi=>addSolved(gi,false));
  $("lives").style.display="none";
  document.querySelector(".dock").classList.add("over");
  updateNextLabels();
}
// Plateau révélé d'une grille perdue : les 4 bandeaux, « Voir mes résultats » et « Retenter »
function showLostBoard(prev){
  duree=Number.isFinite(prev.s)?prev.s:null; hints=prev.hints||0; done=true; lastWin=false; words=[]; mistakes=prev.mistakes||maxErr; history=prev.hist||[]; attempt=prev.tries||1;
  $("grid").innerHTML=""; [0,1,2,3].forEach(gi=>addSolved(gi,false));
  $("lives").style.display="none";
  document.querySelector(".dock").classList.add("over","lost");
  updateNextLabels();
}
// =====================================================================
// PUBS RÉCOMPENSÉES (js/pubs.js) : appli iOS uniquement. Le joueur choisit de regarder une courte pub
// pour obtenir un indice ou voir la solution d'une grille perdue. Sur le site et dans le tutoriel : gratuit, sans pub.
// =====================================================================
const PUBS=(()=>{ try{
  if(!window.QuatuorPubs) return null;
  const p=QuatuorPubs.creer({admob:plugin("AdMob"),config:(window.QUATUOR_CONFIG||{}).admob,journal:(m,e)=>console.warn("Quatuor : "+m,e)});
  return p.actif?p:null; }catch(e){ return null; } })();
// Première pub : on explique d'abord le principe (une seule fois). Renvoie true si le joueur accepte.
function expliquerPub(usage){
  return new Promise(ok=>{
    let rep=false;
    openSheet(`<div class="fini"><div class="big">📺</div><h2>Une courte pub ?</h2>
      <p>Dans l'appli, ${usage==="indice"?"chaque indice se débloque":"la solution d'une grille perdue se débloque"} en regardant une courte vidéo publicitaire, jusqu'au bout.</p>
      <p>C'est ce qui permet à Quatuor de rester gratuit. Jamais de pub pendant ta partie si tu ne la demandes pas.</p>
      <button class="pill main full" id="pubOui">Regarder la pub</button><button class="pill soft full" id="pubNon">Non merci</button></div>`,()=>ok(rep));
    $("pubOui").onclick=()=>{ rep=true; closeSheet(); };
    $("pubNon").onclick=closeSheet;
  });
}
// Une pub récompensée pour « usage » ("indice" | "solution"). true : récompense gagnée.
// Pub fermée avant la fin : refusé. Aucune pub à montrer (réseau, stock vide) : on ne bloque pas le joueur.
async function avecPub(usage){
  if(!PUBS) return true;
  if(!ls.get("quatuor-pub-explique")){
    if(!(await expliquerPub(usage))) return false;
    ls.set("quatuor-pub-explique","1");
    await new Promise(r=>setTimeout(r,350));   // le temps que le panneau se ferme
  }
  const r=await PUBS.regarder();
  stat("Pub",{usage,issue:r});
  if(r==="annule"){ toast(usage==="indice"?"Pub interrompue : pas d'indice cette fois":"Pub interrompue : la solution reste cachée"); return false; }
  return true;
}

// =====================================================================
// INDICES 💡 (6 au maximum par grille) : le nom d'un groupe, puis ses mots un par un (3 au plus),
// puis le groupe suivant. Le groupe le plus facile pas encore trouvé passe en premier.
// ⚠️ autoriserIndice() est le SEUL point d'entrée pour obtenir un indice : dans l'appli, une pub récompensée
// (idGrille vaut "tuto" pour la grille d'entraînement : jamais de pub).
// donnerIndice() refuse d'agir sans JETON_INDICE, que seul demanderIndice() transmet.
// =====================================================================
async function autoriserIndice(idGrille){
  if(idGrille==="tuto") return true;
  return avecPub("indice");
}
const JETON_INDICE=Symbol("indice autorisé");
let indiceEnCours=false;
// Encore un indice possible ? (avec 3 groupes trouvés, le dernier se devine tout seul)
const indicePossible=()=>!!grid&&!done&&hints<MAX_HINTS&&found.length<3;
async function demanderIndice(){
  if((tuto&&tutoEtape!==4)||busy||!indicePossible()||indiceEnCours||(!tuto&&gridIdx<0)) return;
  indiceEnCours=true; const id=gameId;
  try{
    const ok=await autoriserIndice(tuto?"tuto":grid.id);
    if(!ok) return;
    if(id===gameId&&!done) donnerIndice(JETON_INDICE);
  }finally{ indiceEnCours=false; updateHintUi(); }
}
function donnerIndice(jeton){
  if(jeton!==JETON_INDICE||!indicePossible()) return;
  const restants=[0,1,2,3].filter(gi=>!found.includes(gi));
  const libres=gi=>grid[gi].words.filter(w=>words.includes(w)&&!hintWords.includes(w));
  if(hintCat<0||found.includes(hintCat)){ hintCat=restants[0]; hintWords=[]; }        // 1er indice, ou groupe trouvé entre-temps : le nom du suivant
  else if(hintWords.length<MAX_MOTS_INDICE&&libres(hintCat).length){                   // un mot de plus de ce groupe (sans le sélectionner)
    const c=libres(hintCat); hintWords.push(c.find(w=>!selected.has(w))||c[0]); }
  else { const autre=restants.find(gi=>gi!==hintCat); if(autre===undefined) return; hintCat=autre; hintWords=[]; }
  hints++; buzz(12);
  sauverPartie();
  flipLayout(renderHint);
  tutoEvent("indice");
  if(!RM()) $("hintBar").animate([{opacity:0,transform:"translateY(-6px)"},{opacity:1,transform:"none"}],{duration:380,easing:"cubic-bezier(.2,.8,.3,1)"});
}
function renderHint(){
  const bar=$("hintBar"), actif=hintCat>=0&&!found.includes(hintCat);
  bar.hidden=!actif;
  if(actif) bar.innerHTML=`💡 Indice : un groupe = <b>${esc(grid[hintCat].name)}</b>`;
  else hintWords=[];
  $("grid").querySelectorAll(".tile").forEach(t=>t.classList.toggle("hintw",hintWords.includes(t.dataset.w)));
  updateHintUi();
}
function updateHintUi(){
  const b=$("hintBtn"); if(!b) return;
  const left=MAX_HINTS-hints, pub=!!PUBS&&!tuto;
  b.querySelector(".hcount").textContent=left;
  b.style.display="";
  b.classList.toggle("pub",pub);
  b.disabled=(tuto&&tutoEtape!==4)||busy||!indicePossible();
  b.setAttribute("aria-label",`Indice${pub?" contre une pub":""} (${left} ${pl(left,"restant","restants")})`);
}

// Grille perdue dont la solution n'a pas été vue : groupes trouvés + tuiles restantes, solution cachée
function showPendingBoard(prev){
  duree=Number.isFinite(prev.s)?prev.s:null; hints=prev.hints||0; done=true; lastWin=false; mistakes=prev.mistakes||maxErr; history=prev.hist||[]; attempt=prev.tries||1;
  found=Array.isArray(prev.found)?prev.found.slice()
    :[...new Set(history.filter(r=>r.every(x=>x===r[0])).map(r=>r[0]))];   // anciennes données : déduit de l'historique
  words=shuffleArr(grid.filter((_,gi)=>!found.includes(gi)).flatMap(g=>g.words));
  found.forEach(gi=>addSolved(gi,false));
  $("lives").querySelectorAll("i").forEach(d=>d.classList.add("off"));   // déjà perdus : pas d'animation
  draw();
  showPending(450);
}
// Barre du bas « Réessayer / Voir la solution » et panneau correspondant
function showPending(delay){
  const dk=document.querySelector(".dock"); dk.classList.remove("lost"); dk.classList.add("over","pending");
  if(!RM()) dk.animate([{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"none"}],{duration:420,easing:"cubic-bezier(.2,.8,.3,1)"});
  const id=gameId; setTimeout(()=>{ if(id===gameId) whenSheetFree(openPending); },delay);
}
// Si un autre panneau est ouvert (bienvenue…), on attend qu'il soit fermé
function whenSheetFree(fn){
  if(!$("sheet").classList.contains("open")){ fn(); return; }
  const before=onSheetClose, id=gameId;
  onSheetClose=()=>{ if(before) before(); setTimeout(()=>{ if(id===gameId) fn(); },380); };
}
function openPending(){
  if(!done||lastWin||!document.querySelector(".dock.pending")) return;
  const n=found.length;
  // Seules les anecdotes des groupes déjà trouvés apparaissent ; rien sur les groupes manquants
  const facts=found.filter(gi=>grid[gi].fact).map(gi=>`<div class="b${gi}"><b>${esc(grid[gi].name)}</b>${esc(grid[gi].fact)}${starHtml(gridIdx,gi)}</div>`).join("");
  openSheet(`<h2>Plus d'erreurs disponibles 😬</h2>
    <p>${n?`Tu as trouvé ${n} ${pl(n,"groupe","groupes")} sur 4.`:"Aucun groupe trouvé cette fois."} Retente ta chance avant de découvrir la solution !</p>
    <button class="pill main full" id="pRetry">Réessayer 🔄</button>
    <div class="row" style="margin-bottom:10px"><button class="pill soft" id="pReveal">${libelleSolution()}</button><button class="pill soft" id="pShare">Partager</button></div>
    ${facts?`<h3>${pl(n,"Groupe trouvé","Groupes trouvés")}</h3><div class="learned">${facts}</div>`:""}`);
  $("pRetry").onclick=()=>retenter(gridIdx);
  $("pReveal").onclick=demanderSolution;
  $("pShare").onclick=share;
}
// « Voir la solution » d'une grille perdue : dans l'appli, avec une pub récompensée (sur le site : gratuit).
// ⚠️ autoriserSolution() est le SEUL point d'entrée ; revealSolution() refuse d'agir sans JETON_SOLUTION.
const libelleSolution=()=>PUBS?"Voir la solution 📺":"Voir la solution";
async function autoriserSolution(idGrille){ return avecPub("solution"); }
const JETON_SOLUTION=Symbol("solution autorisée");
let solutionEnCours=false;
const solutionCachee=()=>done&&!lastWin&&!tuto&&document.querySelector(".dock").classList.contains("pending");
async function demanderSolution(){
  if(!solutionCachee()||solutionEnCours) return;
  solutionEnCours=true; const id=gameId;
  try{ if(await autoriserSolution(grid.id)&&id===gameId) revealSolution(JETON_SOLUTION); }
  finally{ solutionEnCours=false; }
}
// On révèle les groupes manquants avec l'animation habituelle, puis les résultats
function revealSolution(jeton){
  const dk=document.querySelector(".dock");
  if(jeton!==JETON_SOLUTION||!solutionCachee()) return;
  const res=loadRes(), x=res[grid.id]; if(x){ x.vu=true; saveRes(res); }
  closeSheet(); dk.classList.remove("pending");
  const id=gameId, rest=[0,1,2,3].filter(gi=>!found.includes(gi)); let delay=300;
  rest.forEach(gi=>{ setTimeout(()=>{ if(id!==gameId) return;
    flipLayout(()=>{ addSolved(gi,false,"pop"); words=words.filter(w=>groupOf(w)!==gi);
      $("grid").querySelectorAll(".tile").forEach(t=>{ if(groupOf(t.dataset.w)===gi) t.remove(); }); }); },delay); delay+=380; });
  setTimeout(()=>{ if(id!==gameId) return;
    flipLayout(()=>{ $("lives").style.display="none"; dk.classList.add("over","lost"); });
    if(!RM()) dk.animate([{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"none"}],{duration:420,easing:"cubic-bezier(.2,.8,.3,1)"});
  },delay);
  setTimeout(()=>{ if(id===gameId) openResults(false); },delay+600);
}

// =====================================================================
// PARTIES EN COURS : sauvegarde automatique après chaque action, par identifiant de grille
// quatuor-encours = { idGrille: { words (ordre), found, mistakes, hints, hintCat, hintWords, history, tried, attempt, hasard, at } }
// Supprimée quand la grille est terminée (finish).
// =====================================================================
function loadEncours(){ try{ const e=JSON.parse(ls.get("quatuor-encours")||"{}"); return e&&typeof e==="object"?e:{}; }catch(e){ return {}; } }
function saveEncours(e){ ls.set("quatuor-encours",JSON.stringify(e)); }
function sauverPartie(){
  if(tuto||done||!grid||gridIdx<0) return;
  const e=loadEncours();
  if(!history.length&&!hints) delete e[grid.id];   // rien de fait : pas de partie « en cours »
  else e[grid.id]={words:words.slice(),found:found.slice(),mistakes,hints,hintCat,hintWords:hintWords.slice(),history:history.map(r=>r.slice()),tried:[...tried],attempt,hasard,at:Date.now(),ms:chrono.ms()};
  // on garde les 20 plus récentes
  Object.keys(e).sort((a,b)=>e[b].at-e[a].at).slice(20).forEach(k=>delete e[k]);
  saveEncours(e);
}
// Temps de jeu de la partie en cours (en pause quand l'appli passe en arrière-plan), repris avec la partie
const chrono=(()=>{ let cumul=0, debut=null;
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden"){ if(debut!=null){ cumul+=Date.now()-debut; debut=null; } }
    else if(debut===null&&!done) debut=Date.now(); });
  return { depart(ms){ cumul=ms||0; debut=Date.now(); }, ms:()=>cumul+(debut!=null?Date.now()-debut:0), stop(){ cumul=this.ms(); debut=null; } };
})();
function oublierPartie(id){ const e=loadEncours(); if(e[id]){ delete e[id]; saveEncours(e); } }
// Sauvegarde utilisable pour cette grille ? (grille modifiée depuis, essai différent… : on l'oublie)
function repriseValide(g,prev){
  const sv=loadEncours()[g.id]; if(!sv) return null;
  const ok=(()=>{ try{
    const essai=prev?(prev.win?1:(prev.tries||1)+1):1;
    if(sv.attempt!==essai) return false;
    if(!Array.isArray(sv.found)||new Set(sv.found).size!==sv.found.length||sv.found.some(gi=>![0,1,2,3].includes(gi))) return false;
    const reste=g.filter((_,gi)=>!sv.found.includes(gi)).flatMap(x=>x.words);
    if(!Array.isArray(sv.words)||sv.words.length!==reste.length||!reste.every(w=>sv.words.includes(w))) return false;
    if(!Number.isInteger(sv.mistakes)||sv.mistakes<0||sv.mistakes>=DIFFS[g.diff].err) return false;
    if(!Number.isInteger(sv.hints)||sv.hints<0||sv.hints>MAX_HINTS||!Array.isArray(sv.history)||!Array.isArray(sv.tried)) return false;
    return sv.found.length<4;
  }catch(e){ return false; } })();
  if(!ok){ oublierPartie(g.id); return null; }
  return sv;
}
function restaurerPartie(sv){
  words=sv.words.slice(); found=sv.found.slice(); mistakes=sv.mistakes; hints=sv.hints;
  hintCat=Number.isInteger(sv.hintCat)&&sv.hintCat>=0&&sv.hintCat<4?sv.hintCat:-1;
  // (anciennes sauvegardes : un seul mot, « hintWord »)
  const mh=Array.isArray(sv.hintWords)?sv.hintWords:typeof sv.hintWord==="string"?[sv.hintWord]:[];
  hintWords=mh.filter(w=>typeof w==="string"&&words.includes(w)).slice(0,MAX_MOTS_INDICE);
  history=sv.history.map(r=>r.slice()); tried=new Set(sv.tried);
  found.forEach(gi=>addSolved(gi,false));
  // vies déjà perdues : pas d'animation
  $("lives").querySelectorAll("i").forEach((d,i)=>d.classList.toggle("off",i>=maxErr-mistakes));
}
// Dernière partie quittée en cours (hors grille du jour), encore jouable
function partieAReprendre(){
  const e=loadEncours();
  const id=Object.keys(e).sort((a,b)=>e[b].at-e[a].at)[0]; if(!id) return null;
  const i=GRIDS.findIndex(g=>g.id===id);
  if(i<0||i===dailyIdx) return null;
  const g=GRIDS[i];
  if(g.theme==="quotidien"?!visible(i):!themesVisibles().some(t=>t.id===g.theme)) return null;
  return repriseValide(g,loadRes()[id])?i:null;
}

// =====================================================================
// GRILLES DES JOURS PRÉCÉDENTS (grilles du calendrier des 7 derniers jours)
// Elles se jouent normalement (résultat enregistré), mais ne comptent ni pour la série
// ni pour le % de réussite : ce ne sont pas des grilles du jour (practice = true).
// =====================================================================
// ⚠️ peutJouerArchive() est le SEUL point d'entrée pour ouvrir une grille des jours précédents
// (section « Grilles des jours précédents » du tiroir, bouton « Grille d'hier » / « Grilles manquées »).
// Pour l'instant tout est gratuit : elle renvoie toujours true.
// Plus tard, l'accès aux grilles de plus de 1 jour (avant-hier et avant) pourra être réservé au premium :
// renvoyer false dans ce cas si le joueur n'est pas premium. (Ces grilles restent aussi visibles
// dans les listes par difficulté du tiroir : il faudra alors les y masquer également.)
function peutJouerArchive(idGrille){
  return true;
}
const ARCHIVE_JOURS=7;
const dayStr=n=>{ const d=new Date(today); d.setDate(d.getDate()-n); return isoDay(d); };   // il y a n jours
const jourDate=s=>{ const [a,m,j]=s.split("-").map(Number); return new Date(a,m-1,j); };
const dateLongue=s=>jourDate(s).toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
function dateCourte(s){
  if(s===dayStr(1)) return "Hier";
  const t=jourDate(s).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"short"});
  return t.charAt(0).toUpperCase()+t.slice(1);
}
const estCalendrier=i=>QG.estCalendrier(GRIDS[i])&&QG.difficulteDuJour(GRIDS[i]);
const isArchive=i=>i>=0&&estCalendrier(i)&&GRIDS[i].jour<todayStr;
// Grilles du calendrier des 7 derniers jours, de la plus récente à la plus ancienne
function archiveGrids(){
  const out=[];
  for(let n=1;n<=ARCHIVE_JOURS;n++){ const j=dayStr(n), i=GRIDS.findIndex((g,k)=>estCalendrier(k)&&g.jour===j); if(i>=0) out.push(i); }
  return out;
}
function ouvrirArchive(i,opts={}){
  if(!peutJouerArchive(GRIDS[i].id)){ toast("Grille non disponible"); return; }
  if(opts.essai) retenter(i,{hasard:null}); else ouvrirGrille(i);
}

// =====================================================================
// ACCUEIL : grille du jour déjà terminée au lancement (ou au retour après minuit)
// Plateau terminé + encart « Grille du jour terminée ✓ » à la place du dock
// =====================================================================
function showHome(){
  const dk=document.querySelector(".dock"), r=loadRes();
  const manq=archiveGrids().filter(i=>!r[GRIDS[i].id]), hier=manq.length===1&&GRIDS[manq[0]].jour===dayStr(1);
  const rep=partieAReprendre(), repLbl=rep==null?"":repLabel(rep);
  const nM=manq.length;
  const lab=(lg,sm,xs)=>`<span class="lg">${lg}</span><span class="sm">${sm}</span><span class="xs">${xs}</span>`;
  const archBtn=!nM?"":`<button class="pill soft" id="hbArch">${hier?lab("📅 Grille d'hier","📅 Grille d'hier","📅 Hier")
    :lab(`📅 ${pl(nM,"Grille manquée","Grilles manquées")} (${nM})`,`📅 ${pl(nM,"Manquée","Manquées")} (${nM})`,`📅 ${pl(nM,"Manquée","Manquées")} (${nM})`)}</button>`;
  $("homeBox").innerHTML=`<p class="hbt">${dailyBonus?"Grille bonus":"Grille du jour"} terminée <span>✓</span></p>${cdHtml()}
    ${rep!=null?`<button class="pill main" id="hbRep">▶️ Reprendre ${repLbl}</button>`:""}
    <div class="hbrow">${archBtn}<button class="pill ${rep!=null||nM?"soft":"main"}" id="hbRand">${lab("🎲 Grille au hasard","🎲 Au hasard","🎲 Hasard")}</button></div>
    <button class="hbres" id="hbRes">Voir mes résultats</button>`;
  dk.classList.remove("over","lost","pending"); dk.classList.add("home"); document.body.classList.add("home");
  document.body.style.setProperty("--homeH",(dk.offsetHeight+$("tabs").offsetHeight+24)+"px");
  if(rep!=null) $("hbRep").onclick=()=>reprendre(rep);
  if(nM) $("hbArch").onclick=()=>{ buzz(10); if(hier) ouvrirArchive(manq[0]); else showPage("bonus",{scroll:"archSec"}); };
  $("hbRand").onclick=()=>launchRandom(randChoice);
  $("hbRes").onclick=()=>{ if(done&&!tuto) openResults(lastWin); };
}
const repLabel=i=>GRIDS[i].theme!=="quotidien"?`« ${esc(themeLabel(i))} »`:`la grille n°${GRIDS[i].num}`;
function reprendre(i){ buzz(10); const sv=loadEncours()[GRIDS[i].id]; switchGame(i,{hasard:sv&&sv.hasard||null}); }
// Retour dans l'appli après minuit : on recharge pour la nouvelle grille du jour (la partie en cours est sauvegardée)
function verifierNouveauJour(){ if(document.visibilityState!=="hidden"&&isoDay(new Date())!==todayStr) location.reload(); else if(document.visibilityState==="visible") planifierRappels(); }
document.addEventListener("visibilitychange",verifierNouveauJour);
addEventListener("pageshow",e=>{ if(e.persisted) verifierNouveauJour(); });

// =====================================================================
// PRISE EN MAIN
// A. Tutoriel guidé (premier lancement, ou « Revoir le tuto ») sur la grille d'entraînement TUTO :
//    projecteur (fond assombri, cible mise en valeur, bulle avec flèche) ; l'étape suivante n'arrive
//    qu'après l'action demandée. 1 trouver un groupe, 2 faire une erreur (3 « Pas grave… »),
//    4 utiliser un indice, 5 finir la grille, 6 « C'est parti pour la grille du jour ! ».
// B. Bulles contextuelles : chacune une seule fois (clé quatuor-bulle-<nom>), jamais deux en même temps,
//    jamais pendant le tutoriel ni par-dessus une pop-up.
// =====================================================================
const BULLE=(()=>{
  const box=$("spot"), trou=box.querySelector(".spot-trou"), bl=[...box.querySelectorAll(".spot-b")];
  const bu=box.querySelector(".bulle"), txt=bu.querySelector("p"), act=bu.querySelector(".bulle-act"), fl=bu.querySelector(".fl");
  let cfg=null, raf=0, dernier="";
  const poser=(e,l,t,w,h)=>Object.assign(e.style,{left:l+"px",top:t+"px",width:Math.max(0,w)+"px",height:Math.max(0,h)+"px"});
  function placer(){
    const W=innerWidth, H=innerHeight, tabs=$("tabs");
    const haut=(parseFloat(getComputedStyle(document.documentElement).paddingTop)||0)+8;
    const bas=getComputedStyle(tabs).display!=="none"?tabs.getBoundingClientRect().top:H;
    const rs=(cfg.cibles||[]).map(q=>document.querySelector(q)).filter(e=>e&&e.getClientRects().length).map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);
    const pad=6, u=rs.length?{l:Math.min(...rs.map(r=>r.left))-pad,t:Math.min(...rs.map(r=>r.top))-pad,r:Math.max(...rs.map(r=>r.right))+pad,b:Math.max(...rs.map(r=>r.bottom))+pad}:null;
    const bw=bu.offsetWidth, bh=bu.offsetHeight, cle=JSON.stringify([u,W,H,bw,bh]);
    if(cle===dernier) return; dernier=cle;
    if(cfg.mode==="spot"){   // trou dans le voile + 4 zones qui bloquent les appuis hors de la cible
      const z=u||{l:W/2,t:H/2,r:W/2,b:H/2};
      poser(trou,z.l,z.t,z.r-z.l,z.b-z.t);
      poser(bl[0],0,0,W,z.t); poser(bl[1],0,z.b,W,H-z.b); poser(bl[2],0,z.t,z.l,z.b-z.t); poser(bl[3],z.r,z.t,W-z.r,z.b-z.t);
    }
    let x=(W-bw)/2, y=Math.max(haut,(Math.min(H,bas)-bh)/2);
    fl.hidden=!u;
    if(u){
      const cx=(u.l+u.r)/2; x=Math.min(Math.max(cx-bw/2,12),W-bw-12);
      let dessous=false;
      if(u.t-bh-12>=haut) y=u.t-bh-12;                              // au-dessus de la cible
      else if(u.b+12+bh<=bas-8){ y=u.b+12; dessous=true; }          // en dessous (jamais sous la barre d'onglets)
      else { y=haut; fl.hidden=true; }                               // pas de place : en haut de l'écran
      fl.style.left=Math.min(Math.max(cx-x-7,16),bw-30)+"px";
      fl.style.top=dessous?"-6px":"auto"; fl.style.bottom=dessous?"auto":"-6px";
    }
    bu.style.left=x+"px"; bu.style.top=y+"px";
  }
  function boucle(){ if(!cfg) return; placer(); raf=requestAnimationFrame(boucle); }
  return {
    // c = { mode:"spot"|"ctx", txt, cibles:[sélecteurs], bouton, ok, passer, onClose }
    ouvrir(c){
      if(cfg) this.fermer(true);
      cfg=c; dernier=""; box.className=c.mode; box.hidden=false; txt.textContent=c.txt;
      act.innerHTML=(c.passer?'<button class="skipb">Passer</button>':"")+(c.bouton?`<button class="okb">${c.bouton}</button>`:"");
      act.hidden=!act.innerHTML;
      const sk=act.querySelector(".skipb"), ok=act.querySelector(".okb");
      if(sk) sk.onclick=()=>{ buzz(8); c.passer(); };
      if(ok) ok.onclick=()=>{ buzz(8); c.ok(); };
      if(c.mode==="ctx") (c.cibles||[]).forEach(q=>{ const e=document.querySelector(q); if(e) e.classList.add("cible"); });
      cancelAnimationFrame(raf); boucle();
      if(!RM()) bu.animate([{opacity:0,transform:"translateY(6px) scale(.97)"},{opacity:1,transform:"none"}],{duration:320,easing:"cubic-bezier(.2,.8,.3,1)"});
    },
    fermer(silence){
      if(!cfg) return; const c=cfg; cfg=null; cancelAnimationFrame(raf); box.hidden=true;
      document.querySelectorAll(".cible").forEach(e=>e.classList.remove("cible"));
      if(!silence&&c.onClose) c.onClose();
    },
    get ouverte(){ return cfg; }
  };
})();
// Bulle contextuelle : un appui ailleurs la ferme (l'appui agit normalement)
addEventListener("pointerdown",e=>{ const c=BULLE.ouverte; if(c&&c.mode==="ctx"&&!(e.target.closest&&e.target.closest(".bulle"))) BULLE.fermer(); },true);

// ---- A. Tutoriel guidé ----
let tutoEtape=0;
const TUTO_ETAPES={
  1:{txt:"Trouve 4 mots qui vont ensemble, puis touche Valider.",cibles:["#grid","#submit"]},
  2:{txt:"Maintenant, fais exprès une erreur avec 4 mots qui ne vont pas ensemble.",cibles:["#grid","#submit"]},
  3:{txt:"Pas grave, tu as droit à 4 erreurs.",cibles:["#lives"],bouton:"Suite ›"},
  4:{txt:"Bloqué ? Touche 💡 pour obtenir un indice.",cibles:["#hintBtn"]},
  5:{txt:"Bien vu ! Termine la grille.",cibles:["#grid","#submit"]},
  6:{txt:"C'est parti pour la grille du jour !",cibles:[],bouton:"Jouer la grille du jour"}
};
function tutoAller(n){
  if(!tuto) return;
  tutoEtape=n; const E=TUTO_ETAPES[n]; updateHintUi();
  BULLE.ouvrir({mode:"spot",txt:fr(E.txt),cibles:E.cibles,bouton:E.bouton,
    ok:n===3?()=>tutoAller(hints<MAX_HINTS&&!done?4:5):n===6?endTuto:null,
    passer:n<6?endTuto:null});
}
// Actions du joueur pendant le tutoriel
function tutoEvent(ev){
  if(!tuto||!tutoEtape) return;
  const id=gameId, plusTard=(f,d)=>setTimeout(()=>{ if(id===gameId&&tuto) f(); },d);
  if(ev==="fin"){ BULLE.fermer(); tutoEtape=6; plusTard(()=>tutoAller(6),1400); }
  else if(ev==="groupe"&&tutoEtape===1){ BULLE.fermer(); plusTard(()=>{ if(!done) tutoAller(2); },1500); }   // le temps de lire l'anecdote
  else if(ev==="erreur"&&tutoEtape===2) plusTard(()=>{ if(!done) tutoAller(3); },450);
  else if(ev==="indice"&&tutoEtape===4){ BULLE.fermer(); tutoEtape=5; plusTard(()=>{ if(!done) tutoAller(5); },700); }
}
function lancerTuto(){ stat("Tuto.vu"); newGame(-1); scrollTo(0,0); const id=gameId; setTimeout(()=>{ if(id===gameId&&tuto) tutoAller(1); },450); }
function endTuto(){
  stat(tutoEtape===6?"Tuto.termine":"Tuto.passe",{etape:tutoEtape});
  BULLE.fermer(); tutoEtape=0; ls.set("quatuor-tuto-done","1");
  gridsReady.then(ok=>{ if(ok) switchGame(dailyIdx); else { tuto=false; showLoadError(); } });
  if(PUBS) setTimeout(()=>PUBS.demarrer(),1500);   // consentement publicitaire : après le tutoriel, jamais pendant
}

// ---- B. Bulles contextuelles ----
const BULLES={
  bonus:{cible:'#modes [data-m="bonus"]',txt:"D'autres grilles t'attendent ici, rangées par niveau !",ok:()=>ongletDe(view)==="jouer"},
  indice:{cible:"#hintBtn",txt:"Bloqué ? Touche 💡 pour obtenir un indice.",ok:()=>view==="jeu"&&!done&&!$("hintBtn").disabled},
  themes:{cible:'.tabs [data-tab="themes"]',txt:"Envie d'un sujet précis ? Essaie les Thèmes !",ok:()=>view!=="themes"},
  serie:{cible:'.tabs [data-tab="progres"]',txt:"Ta série 🔥 et le compte à rebours sont dans Progrès.",ok:()=>view!=="progres"},
  moi:{cible:".mcards",txt:"Duels et classement arrivent bientôt !",ok:()=>view==="moi"&&!document.querySelector(".mcode")}
};
let fileBulles=[], bulleCtx=null, minuteurIndice=0;
const bulleVue=id=>!!ls.get("quatuor-bulle-"+id);
function proposerBulle(id){
  if(bulleVue(id)||bulleCtx===id||fileBulles.includes(id)) return;
  fileBulles.push(id); setTimeout(essayerBulle,400);
}
function essayerBulle(){
  if(bulleCtx||tuto||tutoEtape||BULLE.ouverte||!fileBulles.length||document.hidden) return;
  if($("sheet").classList.contains("open")||(busy&&!done)) return;
  for(const id of [...fileBulles]){
    const B=BULLES[id];
    if(!B.ok()){ if(id==="indice") fileBulles=fileBulles.filter(x=>x!==id); continue; }   // l'indice n'a de sens que pendant la partie
    const el=document.querySelector(B.cible), r=el&&el.getBoundingClientRect();
    if(!r||!r.width||r.bottom<0||r.top>innerHeight) continue;
    fileBulles=fileBulles.filter(x=>x!==id); bulleCtx=id; ls.set("quatuor-bulle-"+id,"1");
    BULLE.ouvrir({mode:"ctx",txt:fr(B.txt),cibles:[B.cible],bouton:"OK",ok:()=>BULLE.fermer(),onClose:()=>{ bulleCtx=null; setTimeout(essayerBulle,800); }});
    return;
  }
}
setInterval(essayerBulle,1000);
// Une pop-up s'ouvre : la bulle contextuelle se retire et reviendra quand la pop-up sera fermée
function suspendreBulle(){
  if(!bulleCtx) return; const id=bulleCtx;
  ls.del("quatuor-bulle-"+id); fileBulles.unshift(id); BULLE.fermer();
}
// Bulles déclenchées par les grilles terminées (et au lancement, pour les joueurs qui ne les ont jamais vues)
function bullesProgression(gagneeDuJour){
  if(tuto) return;
  const n=Object.keys(loadRes()).length;
  if(n>=1) proposerBulle("bonus");
  if(n>=2) proposerBulle("themes");
  if(gagneeDuJour||(load().wins||0)>=1) proposerBulle("serie");
}
// Indice : 60 s sans trouver de groupe
function lancerMinuteurIndice(){
  clearTimeout(minuteurIndice);
  if(tuto||done||bulleVue("indice")) return;
  const id=gameId; minuteurIndice=setTimeout(()=>{ if(id===gameId&&!done&&!tuto) proposerBulle("indice"); },60000);
}

// Passage à une autre grille : l'ancienne glisse vers la gauche, la nouvelle arrive par la droite
function switchGame(idx,opts){
  const parts=[$("sub"),document.querySelector(".area")];
  if(RM()){ scrollTo(0,0); newGame(idx,opts); return; }
  const entrer=outs=>{
    newGame(idx,opts);
    parts.forEach((e,i)=>e.animate([{transform:"translateX(28px)",opacity:0},{transform:"none",opacity:1}],{duration:420,delay:i*40,easing:"cubic-bezier(.2,.8,.3,1)",fill:"backwards"}));
    if(outs) outs.forEach(a=>a.cancel());
    [...$("grid").children].forEach((t,i)=>t.animate([{transform:"translateY(10px) scale(.96)",opacity:0},{transform:"none",opacity:1}],
      {duration:420,delay:80+i*22,easing:"cubic-bezier(.2,.8,.3,1)",fill:"backwards"}));
    const dk=document.querySelector(".dock"); dk.animate([{opacity:0},{opacity:1}],{duration:400,easing:"ease-out"});
  };
  // Depuis une autre page (Bonus, Thèmes…) : la grille arrive directement
  if(view!=="jeu"){ scrollTo(0,0); entrer(); return; }
  busy=true; scrollTo({top:0,behavior:"smooth"});
  const outs=parts.map(e=>e.animate([{transform:"none",opacity:1},{transform:"translateX(-28px)",opacity:0}],{duration:260,easing:"cubic-bezier(.4,0,1,1)",fill:"forwards"}));
  outs[1].onfinish=()=>entrer(outs);
}
// En attendant les grilles : tuiles en squelette (jamais d'écran vide)
function showSkeleton(){
  busy=true; done=false; selected=new Set(); tuto=false; document.body.classList.remove("notabs");
  $("sub").classList.remove("tsub"); $("sub").textContent="Chargement des grilles…";
  $("solved").innerHTML=""; $("lives").style.display="none";
  const dk=document.querySelector(".dock"); dk.style.display="block"; dk.classList.remove("over","home"); document.body.classList.remove("home");
  $("submit").disabled=$("clear").disabled=$("hintBtn").disabled=true; $("hintBar").hidden=true;
  $("grid").innerHTML=Array.from({length:16},(_,i)=>`<div class="tile sk" style="--i:${i}" aria-hidden="true"></div>`).join("");
}
function showLoadError(){
  showSkeleton(); $("sub").textContent="Grilles indisponibles";
  $("grid").innerHTML=`<div class="loaderr"><p>Impossible de charger les grilles.<br>Vérifie ta connexion puis réessaie.</p><button class="pill main" id="retry">Réessayer</button></div>`;
  $("retry").onclick=()=>{ showSkeleton(); boot(); };
}
function fit(tile){
  const span=tile.firstChild; if(!span) return;
  const over=()=>span.scrollWidth>tile.clientWidth-6||span.scrollHeight>tile.clientHeight-6;
  const grand=document.documentElement.classList.contains("grand");
  let s=grand?19:17; span.classList.remove("hy"); tile.style.fontSize=s+"px";
  while(s>9.5&&over()){ s-=.5; tile.style.fontSize=s+"px"; }
  // Mot très long sur petit écran : on le coupe en deux lignes plutôt que de le rendre illisible
  if(over()){ span.classList.add("hy"); s=grand?15.5:14; tile.style.fontSize=s+"px"; while(s>8&&over()){ s-=.5; tile.style.fontSize=s+"px"; } }
}
function draw(){
  const g=$("grid"); g.innerHTML="";
  words.forEach(w=>{
    const b=document.createElement("button");
    b.className="tile"+(selected.has(w)?" on":""); b.innerHTML="<span></span>"; b.firstChild.textContent=w;
    b.setAttribute("aria-pressed",selected.has(w)); b.dataset.w=w;
    // Clavier (Entrée, Espace) uniquement : le doigt et la souris passent par pointerdown
    b.onclick=e=>{ if(e.pointerType!==undefined?e.pointerType==="":performance.now()-dernierContact>1000) toggle(w,b); };
    if(hintWords.includes(w)) b.classList.add("hintw");
    b.addEventListener("animationend",e=>{ if(e.animationName.startsWith("spr")) b.classList.remove("spring"); else if(e.animationName==="shake") b.classList.remove("shake"); });
    g.appendChild(b);
  });
  requestAnimationFrame(()=>g.querySelectorAll(".tile").forEach(fit));
  updateUi();
}
function updateUi(){
  [...$("lives").querySelectorAll("i")].forEach((d,i)=>{
    const off=i>=maxErr-mistakes;
    if(off&&!d.classList.contains("off")) loseDot(d);
    if(!off) d.classList.remove("lose");
    d.classList.toggle("off",off);
  });
  $("submit").disabled=selected.size!==4||done||busy;
  updateHintUi();
  $("clear").disabled=selected.size===0||done||busy;
}
function toggle(w,b,multi){
  if(done||busy) return;
  if(selected.has(w)) selected.delete(w); else { if(selected.size>=4){ if(!multi) buzz(15); return; } selected.add(w); }   // 5e contact : ignoré
  buzz(8); SON.jouer(selected.has(w)?"sel":"desel"); b.classList.toggle("on",selected.has(w)); b.setAttribute("aria-pressed",selected.has(w)); spring(b); updateUi();
}

// ---- Favoris (« Mon carnet ») ----
function loadFavs(){ try{ const f=JSON.parse(ls.get("quatuor-favs")); return Array.isArray(f)?f:[]; }catch(e){ return []; } }
function saveFavs(f){ try{ ls.set("quatuor-favs",JSON.stringify(f)); }catch(e){} }
// Mode en ligne : favoris retirés { id: horodatage }, pour que le retrait se propage aux autres appareils
function noterSuppressionFav(id,retire){
  let t={}; try{ t=JSON.parse(ls.get("quatuor-favs-suppr"))||{}; }catch(e){}
  if(retire) t[id]=Date.now(); else delete t[id];
  ls.set("quatuor-favs-suppr",JSON.stringify(t));
}
const favId=(gIdx,gi)=>`${GRIDS[gIdx].id}:${GRIDS[gIdx][gi].name}`;
const isFav=id=>loadFavs().some(f=>f.id===id);
function starHtml(gIdx,gi){
  if(gIdx<0) return `<span class="star" role="button" tabindex="0" data-tuto="1" data-id="tuto:${gi}" aria-pressed="false" aria-label="Ajouter aux favoris">☆</span>`;
  const id=favId(gIdx,gi), on=isFav(id);
  return `<span class="star${on?" on":""}" role="button" tabindex="0" data-id="${esc(id)}" data-g="${gIdx}" data-gi="${gi}" aria-pressed="${on}" aria-label="${on?"Retirer des favoris":"Ajouter aux favoris"}">${on?"★":"☆"}</span>`;
}
// ---- Sélection multi-touch ----
// Chaque contact (pointerId) est traité indépendamment, dès l'appui : 2 ou 3 doigts posés ensemble
// sélectionnent chacun leur case, comme des appuis successifs. Aucun verrou global ; 4 mots au maximum.
const contacts=new Map();
let dernierContact=-1e9;   // le « click » qui suit un appui ne doit pas re-basculer la case
$("grid").addEventListener("pointerdown",e=>{
  if(e.pointerType==="mouse"&&e.button!==0) return;
  const b=e.target.closest(".tile"); if(!b||!b.dataset.w) return;
  if(e.pointerType!=="mouse") e.preventDefault();
  const t=performance.now(); contacts.forEach((t0,id)=>{ if(t-t0>5000) contacts.delete(id); });   // contact perdu : oublié
  contacts.set(e.pointerId,t); dernierContact=t;
  // plusieurs doigts en même temps : pas de retour « grille pleine » pour les contacts en trop
  toggle(b.dataset.w,b,contacts.size>1);
});
const finContact=e=>contacts.delete(e.pointerId);
["pointerup","pointercancel"].forEach(t=>addEventListener(t,finContact,true));
// Safari iOS : pas de zoom à deux doigts sur la grille
document.addEventListener("gesturestart",e=>{ if(e.target.closest&&e.target.closest("#grid")) e.preventDefault(); },{passive:false});
function toggleFav(st){
  if(st.dataset.tuto){ // tutoriel : démonstration, rien n'est enregistré
    const on=!st.classList.contains("on"); st.classList.toggle("on",on); st.textContent=on?"★":"☆"; st.setAttribute("aria-pressed",on); buzz(10);
    if(!RM()){ st.classList.remove("bounce"); void st.offsetWidth; st.classList.add("bounce"); }
    if(on) toast("En vraie partie, elle irait dans Mon carnet ⭐"); return; }
  const id=st.dataset.id; let f=loadFavs(); const on=!f.some(x=>x.id===id);
  if(on){ const gr=GRIDS[+st.dataset.g], gi=+st.dataset.gi, g=gr&&gr[gi]; if(!g) return;
    f.push({id,grid:gr.id,num:gr.num,name:g.name,words:g.words.slice(),fact:g.fact,lvl:gi,at:Date.now()}); }
  else f=f.filter(x=>x.id!==id);
  saveFavs(f); noterSuppressionFav(id,!on); buzz(10);
  if(EN_LIGNE) EN_LIGNE.signaler();
  document.querySelectorAll(".star").forEach(s=>{ if(s.dataset.id!==id) return;
    s.classList.toggle("on",on); s.textContent=on?"★":"☆"; s.setAttribute("aria-pressed",on); s.setAttribute("aria-label",on?"Retirer des favoris":"Ajouter aux favoris");
    if(!RM()){ s.classList.remove("bounce"); void s.offsetWidth; s.classList.add("bounce"); } });
  const cnt=document.querySelector("#favSec .cnt"); if(cnt) cnt.textContent=f.length;
  // Retrait depuis le carnet : la carte s'efface puis la liste se met à jour
  const card=st.closest(".fcard");
  if(card&&!on){ const done_=()=>{ if(view==="progres") renderPage(); };
    if(RM()) done_(); else card.animate([{opacity:1,transform:"none"},{opacity:0,transform:"scale(.96)"}],{duration:220,easing:"ease-in",fill:"forwards"}).onfinish=done_; }
}
// Capture : le clic sur l'étoile ne remonte pas jusqu'au bandeau (qui se replierait)
document.addEventListener("click",e=>{ const st=e.target.closest&&e.target.closest(".star"); if(!st) return; e.stopPropagation(); e.preventDefault(); toggleFav(st); },true);
document.addEventListener("keydown",e=>{ const st=e.target.closest&&e.target.closest(".star"); if(!st||(e.key!=="Enter"&&e.key!==" ")) return; e.stopPropagation(); e.preventDefault(); toggleFav(st); },true);
document.addEventListener("animationend",e=>{ if(e.animationName==="starPop") e.target.classList.remove("bounce"); });

// ---- Image d'une anecdote (canvas 1080×1080) ----
const SITE=IS_NATIVE?"playquatuor.fr":(location.origin+location.pathname).replace(/index\.html$/,"").replace(/^https?:\/\//,"").replace(/\/$/,"");
function wrapText(x,text,maxW){
  const lines=[]; let line="";
  fr(text).split(/ +/).forEach(w=>{ const t=line?line+" "+w:w; if(line&&x.measureText(t).width>maxW){ lines.push(line); line=w; } else line=t; });
  if(line) lines.push(line); return lines;
}
async function factImage(f){
  try{ await Promise.all(["500","650","800"].map(w=>document.fonts.load(`${w} 40px "Bricolage Grotesque"`))); await document.fonts.ready; }catch(e){}
  const S=1080, c=document.createElement("canvas"); c.width=c.height=S; const x=c.getContext("2d");
  const FONT='"Bricolage Grotesque","Avenir Next","Segoe UI",system-ui,sans-serif';
  const COL=["#45D0B0","#FFA552","#EF5B7C","#2E3A87"], TXT=["#082A22","#3A1E02","#FFFFFF","#FFFFFF"], INK="#1B2040", MUTED="#6B7190";
  const rr=(X,Y,W,H,R)=>{ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); };
  x.fillStyle="#EEF0F7"; x.fillRect(0,0,S,S); x.textBaseline="top";
  // Logo : les 4 carrés + « Quatuor »
  COL.forEach((col,i)=>{ x.fillStyle=col; rr(84+(i%2)*52,78+Math.floor(i/2)*52,44,44,12); x.fill(); });
  x.fillStyle=INK; x.font=`800 82px ${FONT}`; x.fillText("Quatuor",210,82);
  // Carte en relief avec la couleur du niveau à gauche
  const cx=80,cy=240,cw=920,ch=680, px=cx+74, maxW=cw-140;
  x.fillStyle="#CDD2E3"; rr(cx,cy+14,cw,ch,44); x.fill();
  x.fillStyle="#FFFFFF"; rr(cx,cy,cw,ch,44); x.fill();
  x.save(); rr(cx,cy,cw,ch,44); x.clip(); x.fillStyle=COL[f.lvl]; x.fillRect(cx,cy,24,ch); x.restore();
  // Pastille du niveau
  x.font=`650 34px ${FONT}`; const lbl=LEVELS[f.lvl], lw=x.measureText(lbl).width+56;
  x.fillStyle=COL[f.lvl]; rr(px,cy+58,lw,60,30); x.fill(); x.fillStyle=TXT[f.lvl]; x.fillText(lbl,px+28,cy+70);
  // Nom du groupe + mots
  let y=cy+150; x.fillStyle=INK; x.font=`800 58px ${FONT}`;
  wrapText(x,f.name,maxW).slice(0,2).forEach(l=>{ x.fillText(l,px,y); y+=66; });
  x.fillStyle=MUTED; x.font=`500 34px ${FONT}`;
  wrapText(x,f.words.join(" · "),maxW).slice(0,2).forEach(l=>{ x.fillText(l,px,y+6); y+=44; });
  y+=40;
  // Anecdote : la plus grande taille qui tient dans la carte
  const avail=cy+ch-56-y; let size=58, lines;
  for(;size>=30;size-=2){ x.font=`500 ${size}px ${FONT}`; lines=wrapText(x,f.fact,maxW); if(lines.length*size*1.28<=avail) break; }
  x.fillStyle=INK; lines.forEach(l=>{ x.fillText(l,px,y); y+=size*1.28; });
  // Adresse du site
  x.fillStyle=MUTED; x.font=`650 36px ${FONT}`; x.textAlign="center"; x.fillText(SITE,S/2,982);
  return c;
}
// Partage natif (appli iOS) ; la PWA garde navigator.share
const Share=plugin("Share"), Fs=plugin("Filesystem");
const partageAnnule=e=>/cancel|annul/i.test(String(e&&(e.message||e.errorMessage||e)));
async function shareFav(f,btn){
  if(btn) btn.disabled=true;
  try{
    const c=await factImage(f);
    // Appli iOS : image écrite dans le cache (@capacitor/filesystem), puis feuille de partage (@capacitor/share)
    if(Share&&Fs){
      const {uri}=await Fs.writeFile({path:"quatuor-anecdote.png",data:c.toDataURL("image/png").split(",")[1],directory:"CACHE"});
      try{ await Share.share({files:[uri]}); }catch(e){ if(!partageAnnule(e)) throw e; }
      return;
    }
    const blob=await new Promise(r=>c.toBlob(r,"image/png"));
    const file=new File([blob],"quatuor-anecdote.png",{type:"image/png"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file]}); return; }catch(e){ if(e.name==="AbortError") return; }
    }
    // Sinon : téléchargement de l'image
    const a=document.createElement("a"), url=URL.createObjectURL(blob);
    a.href=url; a.download="quatuor-anecdote.png"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000); toast("Image enregistrée");
  }catch(e){ toast("Partage impossible"); }
  finally{ if(btn) btn.disabled=false; }
}

function setOpen(d,o){
  if(o) $("solved").querySelectorAll(".solved.open").forEach(x=>{ if(x!==d){ x.classList.remove("open"); x.setAttribute("aria-expanded",false); } });
  d.classList.toggle("open",o); d.setAttribute("aria-expanded",o);
}
function addSolved(gi,open,cls){
  const g=grid[gi], d=document.createElement("button");
  d.className="solved l"+gi+(cls?" "+cls:""); d.setAttribute("aria-expanded",false);
  d.innerHTML=`<span class="lvl">${ICON[gi]} ${LEVELS[gi]}</span><strong>${esc(g.name)}</strong><span class="w">${esc(g.words.join(", "))}</span>
    ${g.fact?`<span class="more">💡 Voir l'anecdote</span><div class="fact"><div><p>💡 ${esc(g.fact)}${starHtml(gridIdx,gi)}</p></div></div>`:""}`;
  if(!g.fact) d.classList.add("nofact");   // groupe sans anecdote (possible dans les thèmes)
  d.onclick=()=>{ if(g.fact) flipLayout(()=>setOpen(d,!d.classList.contains("open"))); };
  d.addEventListener("animationend",e=>{ if(e.animationName==="land") d.classList.remove("pop"); });
  $("solved").appendChild(d);
  if(open) setOpen(d,true);
  return d;
}

// Groupe trouvé : les tuiles sautent, volent vers le bandeau et fusionnent
function foundGroup(gi,tiles){
  const id=gameId, rm=RM();
  busy=true; updateUi(); buzz(30,"SUCCESS"); SON.jouer("groupe",found.length);
  tiles.forEach((t,i)=>{ if(t._fa){ t._fa.cancel(); t._fa=null; } t.classList.remove("spring","shake"); t.style.setProperty("--i",i); t.classList.add("jump"); });
  setTimeout(()=>{
    if(id!==gameId) return;
    const ghosts=rm?[]:tiles.map(t=>{
      const r=t.getBoundingClientRect(), g=t.cloneNode(true);
      g.className="tile ghost l"+gi; g.removeAttribute("id");
      Object.assign(g.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});
      document.body.appendChild(g); return {g,r};
    });
    let band;
    flipLayout(()=>{
      tiles.forEach(t=>t.remove());
      found.push(gi); words=words.filter(w=>!selected.has(w)); selected.clear();
      if(hintCat>=0) renderHint();   // l'indice portait peut-être sur ce groupe
      band=addSolved(gi,false,rm?"":"pre");
      busy=false; updateUi();
      if(found.length===4) finish(true); else { sauverPartie(); lancerMinuteurIndice(); tutoEvent("groupe"); }
    });
    const openFact=()=>{ if(id===gameId&&band.isConnected&&grid[gi].fact) flipLayout(()=>setOpen(band,true)); };
    if(rm){ openFact(); return; }
    const br=band.getBoundingClientRect();
    ghosts.forEach(({g,r},i)=>{
      const tx=br.left+i*br.width/4-r.left, ty=br.top-r.top, sx=br.width/4/r.width, sy=br.height/r.height;
      const end=`translate(${tx}px,${ty}px) scale(${sx},${sy})`;
      g.animate([{transform:"none",easing:"cubic-bezier(.45,0,.25,1)"},{transform:end,opacity:1,offset:.8},{transform:end,opacity:0}],
        {duration:560,delay:i*40,fill:"both"}).onfinish=()=>g.remove();
    });
    setTimeout(()=>{
      if(id!==gameId) return;
      band.classList.remove("pre");
      band.animate([{opacity:0,transform:"scale(.98)"},{opacity:1,transform:"scale(1.01)",offset:.55},{opacity:1,transform:"none"}],
        {duration:500,easing:"ease-out"});
      burst(band.getBoundingClientRect(),gi);
      setTimeout(openFact,400);
    },500);
  },rm?0:620);
}

function submit(){
  if(selected.size!==4||done||busy) return;
  const sel=[...selected], key=[...sel].sort().join("|");
  if(tried.has(key)){ toast("Déjà essayé"); return; }
  tried.add(key); history.push(sel.map(groupOf));
  const gi=groupOf(sel[0]), tiles=[...document.querySelectorAll(".tile.on")];
  if(sel.every(w=>groupOf(w)===gi)){
    foundGroup(gi,tiles);
  } else {
    mistakes++; buzz([40,40,40],"ERROR"); SON.jouer("erreur");
    if(tuto&&mistakes>=maxErr) mistakes=maxErr-1;   // tutoriel : on ne peut pas perdre
    const c={}; sel.forEach(w=>c[groupOf(w)]=(c[groupOf(w)]||0)+1);
    if(Object.values(c).includes(3)) toast("Presque ! Un seul intrus",true);
    tiles.forEach(t=>{ t.classList.remove("shake","spring"); void t.offsetWidth; t.classList.add("shake"); });
    updateUi();
    if(mistakes>=maxErr){ busy=true; const id=gameId; setTimeout(()=>{ if(id===gameId) finish(false); },500); }
    else { sauverPartie(); if(!tuto&&mistakes>=2) proposerBulle("indice"); }
    tutoEvent("erreur");
  }
}

function finish(win){
  done=true; selected.clear(); const id=gameId; lastWin=win;
  if(tuto){ // fin du tutoriel : pas de résultats ni de stats
    $("lives").style.display="none"; document.querySelector(".dock").style.display="none"; tutoEvent("fin");
    setTimeout(()=>{ if(id===gameId){ confetti(); buzz([20,40,20],"FETE"); SON.jouer("victoire"); } },650); return; }
  $("grid").querySelectorAll(".tile.on").forEach(t=>{ t.classList.remove("on"); t.setAttribute("aria-pressed",false); });
  duree=Math.min(86400,Math.round(chrono.ms()/1000)); chrono.stop();
  oublierPartie(grid.id);   // grille terminée : plus de partie en cours à reprendre
  // Résultats enregistrés dès maintenant (même si l'appli est fermée juste après) :
  // premier essai, nombre d'essais, dernier plateau, groupes trouvés et « solution vue » (vu)
  const res=loadRes(), prev=res[grid.id];
  // d : date du jour où elle a été terminée la 1re fois ; jdj : c'était la grille du jour (stats et série) ; s : durée (s)
  if(!prev) res[grid.id]={win,mistakes,tries:1,first:{win,mistakes},hist:history,found:found.slice(),vu:win,hints,d:todayStr,jdj:!practice,s:duree};
  else if(attempt>1&&!prev.win){
    prev.first=prev.first||{win:prev.win,mistakes:prev.mistakes};
    prev.tries=attempt; prev.win=win; prev.mistakes=mistakes; prev.hist=history; prev.found=found.slice(); prev.vu=win; prev.hints=hints; prev.s=duree;
  } // (une grille déjà réussie rejouée ne change rien)
  saveRes(res);
  // Stats et série : seul le premier essai de la grille du jour compte
  // (grilles des jours précédents, thèmes, hasard… sont « practice » : jamais de stats ni de série)
  if(!practice&&attempt===1){
    const s=load();
    if(s.lastPlayed!==dayNum){
      s.played=(s.played||0)+1; s.lastPlayed=dayNum;
      if(win){ s.wins=(s.wins||0)+1; s.streak=(s.lastWin===dayNum-1?(s.streak||0):0)+1; s.lastWin=dayNum; s.best=Math.max(s.best||0,s.streak); }
      else s.streak=0;
      save(s);
    }
  }
  recalculerStats();   // mode en ligne : même calcul sur tous les appareils (à partir des résultats datés)
  stat(win?"Grille.reussie":"Grille.ratee",{grille:grid.id,typeGrille:typeGrille(),erreurs:mistakes,indices:hints,duree:duree,essai:attempt});
  if(EN_LIGNE) EN_LIGNE.signaler();
  planifierRappels();
  clearTimeout(minuteurIndice);
  bullesProgression(win&&!practice);
  if(!win){ showPending(700); return; }   // défaite : la solution reste cachée, on propose de réessayer
  const dk=document.querySelector(".dock");
  $("lives").style.display="none"; dk.classList.add("over"); dk.classList.remove("lost","pending");
  if(!RM()) dk.animate([{opacity:0,transform:"translateY(12px)"},{opacity:1,transform:"none"}],{duration:420,easing:"cubic-bezier(.2,.8,.3,1)"});
  // Célébration : vibrations + petit arpège ; confettis pour une grille réussie sans faute (ni erreur ni indice)
  const sansFaute=mistakes===0&&!hints;
  setTimeout(()=>{ if(id===gameId){ if(sansFaute) confetti(); buzz([20,40,20],"FETE"); SON.jouer("victoire"); } },650);
  setTimeout(()=>{ if(id===gameId) openResults(win); },RM()?600:1500);
}

function load(){ try{ return JSON.parse(ls.get("quatuor"))||{}; }catch(e){ return {}; } }
function save(s){ try{ ls.set("quatuor",JSON.stringify(s)); }catch(e){} }
function statsHtml(){
  const s=load(), alive=s.lastWin===dayNum||s.lastWin===dayNum-1, pct=s.played?Math.round((s.wins||0)/s.played*100):0;
  return `<div class="stats"><div><b>${s.played||0}</b><small>${pl(s.played||0,"partie","parties")}</small></div><div><b>${pct}</b><small>% réussite</small></div>
    <div><b>${alive?(s.streak||0):0}</b><small>série 🔥</small></div><div><b>${s.best||0}</b><small>record</small></div></div>`;
}
function gridItem(i,r,label,n){
  const x=r[GRIDS[i].id], tries=x?(x.tries||1):0, st = x ? (x.win?(tries>1?"win2":"win"):"lost") : "";
  const sub = !x ? "À jouer"
    : x.win ? (tries>1 ? `Réussie au ${ordinal(tries)} essai` : x.mistakes? `Réussie · ${x.mistakes} ${pl(x.mistakes,"erreur","erreurs")}` : x.hints ? "Réussie" : "Réussie sans faute")+(x.hints?` · 💡${x.hints}`:"")
    : (tries>1 ? `Perdue · ${tries} essais` : "Perdue");
  const lost=x&&!x.win;
  return `<div class="grow${lost?" can":""}"><button class="gitem ${st}${i===gridIdx?" cur":""}" data-i="${i}"><span class="num">${x?(x.win?"✓":"✗"):(n??GRIDS[i].num)}</span>
    <span class="txt"><b>${label?`${label}<span class="dbadge l${DIFFS[GRIDS[i].diff].c}">${dname(GRIDS[i].diff)}</span>`:`Grille n°${GRIDS[i].num}`}</b><small>${sub}</small></span>${i===dailyIdx?'<span class="tag">Aujourd\'hui</span>':""}</button>${lost?`<button class="gretry" data-i="${i}">Retenter 🔄</button>`:""}</div>`;
}
function randHtml(){
  return `<div class="rand"><div class="rpills" role="radiogroup" aria-label="Difficulté">${RAND_KEYS.map(k=>
    `<button class="rpill${k===randChoice?" on":""}" data-k="${k}" role="radio" aria-checked="${k===randChoice}">${k==="toutes"?'<i class="all"><b style="background:var(--l0)"></b><b style="background:var(--l1)"></b><b style="background:var(--l2)"></b><b style="background:var(--l3)"></b></i>':`<i class="l${DIFFS[k].c}"></i>`}${randLabel(k)}</button>`).join("")}</div>
    <button class="pill main rgo" id="randGo">Lancer <span class="die">🎲</span></button></div>`;
}
// ---- Compte à rebours jusqu'à la prochaine grille (minuit, heure locale) ----
function cdInner(){
  const now=new Date();
  if(isoDay(now)!==todayStr) return `Nouvelle grille disponible ! <button class="cdgo">Jouer</button>`;
  const m=new Date(now); m.setHours(24,0,0,0);
  const t=Math.max(1,Math.ceil((m-now)/60000)), h=Math.floor(t/60), mn=t%60;
  return `⏳ Prochaine grille dans <b>${h?`${h} h ${mn} min`:`${mn} min`}</b>`;
}
const cdHtml=()=>`<span class="cd" data-cd>${cdInner()}</span>`;
function cdTick(){
  document.querySelectorAll("[data-cd]").forEach(e=>{ const h=cdInner(); if(e.innerHTML!==h) e.innerHTML=h; });
  setTimeout(cdTick,60000-Date.now()%60000+50);   // au début de chaque minute
}
// Après minuit : on recharge pour obtenir la nouvelle grille du jour
document.addEventListener("click",e=>{ if(e.target.closest&&e.target.closest(".cdgo")) location.reload(); });

// =====================================================================
// RAPPELS QUOTIDIENS (appli iOS uniquement, @capacitor/local-notifications) — masqués dans la PWA
// quatuor-rappel = { actif, h, m, serie } (9 h par défaut ; serie = alerte de 20 h, activée par défaut) ; quatuor-rappel-demande = "1" une fois l'écran explicatif montré.
// La permission n'est jamais demandée au premier lancement : seulement à la fin de la première grille terminée
// (proposerRappels), après un écran explicatif. Les rappels des 14 prochains jours sont programmés à l'avance
// et reprogrammés à chaque lancement, retour dans l'appli, fin de grille ou changement de réglage.
// Pas de rappel le jour où la grille du jour est déjà faite ; « série en danger » à 20 h.
// =====================================================================
const Notifs=plugin("LocalNotifications");
const RAPPEL_JOURS=14, ID_RAPPEL=1000, ID_SERIE=2000, HEURE_SERIE=20;
const RAPPEL_TEXTES=["🧩 La grille du jour t'attend !","☕ 16 mots, 4 groupes : ta grille du jour est prête.","🧠 Prêt pour le défi culture G du jour ?",
  "💡 Une nouvelle anecdote t'attend dans la grille du jour.","🎯 4 groupes à trouver aujourd'hui. À toi de jouer !","✨ Ta pause culture G du jour est servie."].map(fr);
function lireRappel(){
  try{ const r=JSON.parse(ls.get("quatuor-rappel")||"null");
    if(r&&typeof r==="object") return {actif:r.actif===true,h:Number.isInteger(r.h)&&r.h>=0&&r.h<24?r.h:9,m:Number.isInteger(r.m)&&r.m>=0&&r.m<60?r.m:0,serie:r.serie!==false}; }catch(e){}
  return {actif:false,h:9,m:0,serie:true};
}
// serie : alerte « Série en danger » de 20 h (activée par défaut, désactivable)
const ecrireRappel=r=>ls.set("quatuor-rappel",JSON.stringify({actif:r.actif,h:r.h,m:r.m,serie:r.serie}));
const heureTxt=(h,m)=>`${h} h${m?" "+String(m).padStart(2,"0"):""}`;
let planif=Promise.resolve();
function planifierRappels(){ if(Notifs) planif=planif.then(planifier).catch(e=>console.warn("Quatuor : rappels non programmés",e)); return planif; }
async function planifier(){
  if(!GRIDS.length||dailyIdx<0) return;   // grilles pas encore chargées
  const pend=await Notifs.getPending(), nos=((pend&&pend.notifications)||[]).filter(n=>n.id>=ID_RAPPEL&&n.id<ID_SERIE+RAPPEL_JOURS);
  if(nos.length) await Notifs.cancel({notifications:nos.map(n=>({id:n.id}))});
  const r=lireRappel(); if(!r.actif&&!r.serie) return;
  if((await Notifs.checkPermissions()).display!=="granted") return;
  const now=new Date(), fait=!!loadRes()[GRIDS[dailyIdx].id], s=load(), liste=[];
  const le=(k,h,m)=>new Date(today.getFullYear(),today.getMonth(),today.getDate()+k,h,m,0,0);
  // Série en danger : aujourd'hui si elle court encore et que la grille du jour n'est pas faite ;
  // demain si elle vient d'être prolongée (reprogrammé dès que le joueur revient)
  const danger=new Map();
  if(r.serie&&(s.streak||0)>=2){ if(s.lastWin===dayNum-1&&!fait) danger.set(0,s.streak); if(s.lastWin===dayNum) danger.set(1,s.streak); }
  for(let k=0;r.actif&&k<RAPPEL_JOURS;k++){
    if(k===0&&fait) continue;
    if(danger.has(k)&&r.h>=HEURE_SERIE) continue;   // l'alerte de 20 h remplace un rappel plus tardif
    const at=le(k,r.h,r.m); if(at<=now) continue;
    liste.push({id:ID_RAPPEL+k,title:"Quatuor",body:RAPPEL_TEXTES[((dayNum+k)%RAPPEL_TEXTES.length+RAPPEL_TEXTES.length)%RAPPEL_TEXTES.length],schedule:{at,allowWhileIdle:true}});
  }
  danger.forEach((n,k)=>{ const at=le(k,HEURE_SERIE,0);
    if(at>now) liste.push({id:ID_SERIE+k,title:"Quatuor",body:fr(`Ta série de ${n} jours 🔥 est en danger ! Joue la grille du jour avant minuit pour la garder.`),schedule:{at,allowWhileIdle:true}}); });
  if(liste.length) await Notifs.schedule({notifications:liste});
}
// Active ou coupe le rappel quotidien (champ "actif") ou l'alerte de série ("serie").
// À l'activation seulement : demande système d'iOS si besoin. Renvoie true si c'est fait.
async function activerRappels(on,champ="actif"){
  if(!Notifs) return false;
  const r=lireRappel();
  if(on){
    let p=await Notifs.checkPermissions().catch(()=>({display:"denied"}));
    if(p.display!=="granted") p=await Notifs.requestPermissions().catch(()=>({display:"denied"}));
    if(p.display!=="granted"){ r[champ]=false; ecrireRappel(r); planifierRappels(); toast("Autorise les notifications dans les Réglages d'iOS"); return false; }
  }
  r[champ]=on; ecrireRappel(r); planifierRappels(); return true;
}
// Écran explicatif (une seule fois), puis la demande système d'iOS
function proposerRappels(){
  if(!Notifs||ls.get("quatuor-rappel-demande")) return;
  ls.set("quatuor-rappel-demande","1");
  const r=lireRappel();
  openSheet(`<div class="notif"><span class="big${RM()?"":" ring"}">🔔</span><h2>Un petit rappel ?</h2>
    <p class="lead">Une nouvelle grille t'attend chaque jour. Quatuor peut te le rappeler à <b>${heureTxt(r.h,r.m)}</b>, sans rien dévoiler.</p>
    <div class="nex"><span class="ic"><span class="mark"><i></i><i></i><i></i><i></i></span></span><div><b>Quatuor</b><small>${RAPPEL_TEXTES[0]}</small></div></div>
    <p>Pas de rappel les jours où tu as déjà joué. Heure et rappels se règlent dans les Paramètres ⚙️.</p>
    <button class="pill main full" id="nOui">Oui, me le rappeler</button>
    <button class="pill soft full" id="nNon">Plus tard</button></div>`);
  $("nOui").onclick=()=>{ buzz(10); closeSheet(); setTimeout(()=>activerRappels(true).then(ok=>{ if(ok) toast(`C'est noté : rappel à ${heureTxt(r.h,r.m)} 🔔`); }),350); };
  $("nNon").onclick=closeSheet;
}
// Paramètres › Rappel quotidien : activer/désactiver, heure, alerte « Série en danger »
function reglagesHtml(){
  if(!Notifs) return "";
  const r=lireRappel(), v=`${String(r.h).padStart(2,"0")}:${String(r.m).padStart(2,"0")}`;
  return `<p class="sec">Rappel quotidien</p><div class="regl">
    <label class="rrow"><span><b>🔔 Rappel quotidien</b><small>Jamais si la grille du jour est déjà faite</small></span><input type="checkbox" class="tgl" id="rapOn"${r.actif?" checked":""}></label>
    <label class="rrow${r.actif?"":" off"}" id="rapRow"><span><b>Heure du rappel</b></span><input type="time" class="rheure" id="rapH" value="${v}"${r.actif?"":" disabled"}></label>
    <label class="rrow"><span><b>🔥 Série en danger</b><small>Alerte à 20 h si ta série (2 jours ou plus) n'est pas encore jouée</small></span><input type="checkbox" class="tgl" id="rapSerie"${r.serie?" checked":""}></label></div>`;
}
function brancherReglages(){
  const on=$("rapOn"), h=$("rapH"), se=$("rapSerie"); if(!on||!h) return;
  se.onchange=async()=>{ buzz(8); const ok=await activerRappels(se.checked,"serie"); if(se.checked&&!ok) se.checked=false; };
  const maj=a=>{ $("rapRow").classList.toggle("off",!a); h.disabled=!a; };
  on.onchange=async()=>{ buzz(8); ls.set("quatuor-rappel-demande","1"); const ok=await activerRappels(on.checked); if(on.checked&&!ok) on.checked=false; maj(on.checked); };
  h.onchange=()=>{ const m=/^(\d{1,2}):(\d{2})/.exec(h.value); if(!m) return;
    const r=lireRappel(); r.h=+m[1]; r.m=+m[2]; ecrireRappel(r); planifierRappels(); toast(`Rappel à ${heureTxt(r.h,r.m)}`); };
}

// ---- Barre d'état (appli iOS) : texte foncé en mode clair, clair en mode sombre ----
const StatusBar=plugin("StatusBar");
const sombre=()=>REG.theme==="dark"||(REG.theme!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);
function majBarreEtat(){
  const d=sombre(), m=document.querySelector('meta[name="theme-color"]'); if(m) m.content=d?"#12152A":"#EEF0F7";
  if(StatusBar) StatusBar.setStyle({style:d?"DARK":"LIGHT"}).catch(()=>{});
}
majBarreEtat(); try{ matchMedia("(prefers-color-scheme: dark)").addEventListener("change",majBarreEtat); }catch(e){}
// Applique les réglages d'apparence (thème Clair / Sombre / Automatique, taille du texte, mode daltonien)
function appliquerReglages(){
  const h=document.documentElement;
  if(REG.theme==="light"||REG.theme==="dark") h.dataset.theme=REG.theme; else delete h.dataset.theme;
  const grand=h.classList.contains("grand");
  h.classList.toggle("grand",REG.texte==="grand"); h.classList.toggle("dalto",!!REG.daltonien);
  majBarreEtat();
  if(grand!==h.classList.contains("grand")) requestAnimationFrame(()=>document.querySelectorAll(".tile").forEach(fit));
}

// ---- Pages légales ----
const SITE_URL="https://playquatuor.fr/";   // adresse du site (pour l'appli native)
const legalHtml=()=>`<nav class="legal" aria-label="Informations légales"><a href="mentions-legales.html" data-legal>Mentions légales</a><span>·</span><a href="confidentialite.html" data-legal>Confidentialité</a><span>·</span><a href="cgu.html" data-legal>CGU</a></nav>`;
// Point d'entrée unique pour ouvrir une page légale.
// PWA : la page s'ouvre normalement (nouvel onglet, ou même fenêtre si c'est impossible).
// Appli native (Capacitor) : navigateur intégré via @capacitor/browser, avec l'adresse complète du site.
function ouvrirPageLegale(url){
  const browser=plugin("Browser");
  if(browser){ browser.open({url:new URL(url,SITE_URL).href}).catch(()=>{}); return; }
  const w=window.open(url,"_blank");   // (avec "noopener", window.open renvoie toujours null : on détache à la main)
  if(w) w.opener=null; else location.href=url;
}
document.addEventListener("click",e=>{ const a=e.target.closest&&e.target.closest("a[data-legal]"); if(!a) return; e.preventDefault(); ouvrirPageLegale(a.getAttribute("href")); });
const APP_VERSION="1.3";   // version affichée sur le web ; dans l'appli : @capacitor/app (version et n° de build)
const SHARE_ICON='<svg viewBox="0 0 24 24"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
// =====================================================================
// NAVIGATION : barre d'onglets en bas (Jouer, Thèmes, Progrès, Moi) + Paramètres (engrenage, en haut à droite)
// Vues : "jeu" (plateau), "bonus" et "hasard" (onglet Jouer), "themes", "progres", "moi", "reglages".
// Onglet Jouer : sélecteur « Grille du jour | Bonus | Hasard 🎲 ».
// =====================================================================
const PAGES=["bonus","hasard","progres","moi","reglages"];
let derJouer="jeu", avantReglages=null;   // dernière vue de l'onglet Jouer ; vue d'où l'on a ouvert les Paramètres
const ongletDe=v=>v==="themes"||(v==="jeu"&&isTheme())?"themes":v==="progres"||v==="moi"?v:v==="reglages"?null:"jouer";
function updateTabs(){
  const t=ongletDe(view);
  $("tabs").querySelectorAll("button").forEach(b=>{ const on=b.dataset.tab===t; b.classList.toggle("on",on); if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  $("setBtn").classList.toggle("on",view==="reglages");
}
function showPage(v,opts={}){
  if(!GRIDS.length&&(v==="bonus"||v==="hasard"||v==="progres")){ toast("Chargement des grilles…"); return; }
  if(v==="reglages"&&view!=="reglages") avantReglages=view;
  closeSheet(); setView(v); renderPage(); scrollTo(0,0);
  const cible=opts.scroll&&$(opts.scroll);
  if(cible) requestAnimationFrame(()=>scrollTo(0,cible.getBoundingClientRect().top+scrollY-70));
  else if(!RM()) $("pageView").animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:300,easing:"cubic-bezier(.2,.8,.3,1)"});
}
function renderPage(){
  const el=$("pageView");
  el.innerHTML=({bonus:bonusHtml,hasard:hasardHtml,progres:progresHtml,moi:moiHtml,reglages:reglagesPageHtml})[view]();
  // listes de grilles (Bonus)
  el.querySelectorAll(".gitem").forEach(b=>b.onclick=()=>switchGame(+b.dataset.i));
  el.querySelectorAll(".gretry").forEach(b=>b.onclick=()=>retenter(+b.dataset.i,{hasard:null}));
  // Grilles des jours précédents : toujours via peutJouerArchive()
  el.querySelectorAll(".arch .gitem").forEach(b=>b.onclick=()=>{ if(!peutJouerArchive(GRIDS[+b.dataset.i].id)){ toast("Grille non disponible"); return; } switchGame(+b.dataset.i); });
  el.querySelectorAll(".arch .gretry").forEach(b=>b.onclick=()=>ouvrirArchive(+b.dataset.i,{essai:true}));
  el.querySelectorAll(".lvgo").forEach(b=>b.onclick=()=>jouerNiveau(b.dataset.k));
  el.querySelectorAll(".lvlist").forEach(b=>b.onclick=()=>{ buzz(8); menuTab=menuTab===b.dataset.k?null:b.dataset.k; renderPage(); });
  if($("pgRep")) $("pgRep").onclick=()=>reprendre(+$("pgRep").dataset.i);
  // Hasard
  el.querySelectorAll(".rpill").forEach(b=>b.onclick=()=>{ randChoice=b.dataset.k; ls.set("quatuor-hasard",randChoice); buzz(8);
    el.querySelectorAll(".rpill").forEach(x=>{ const on=x===b; x.classList.toggle("on",on); x.setAttribute("aria-checked",on); }); });
  if($("randGo")) $("randGo").onclick=()=>launchRandom(randChoice,$("randGo").querySelector(".die"));
  // Progrès : carnet
  const fs=favsTries(); el.querySelectorAll(".fshare").forEach(b=>b.onclick=()=>shareFav(fs[+b.dataset.k],b));
  // Paramètres
  if($("setBack")) $("setBack").onclick=retourReglages;
  if($("setHelp")) $("setHelp").onclick=openHelp;
  if(view==="reglages") brancherParametres(el);
  if(view==="moi"){ proposerBulle("moi"); brancherMoi(); }
  brancherReglages();
  majCompteUi();
}
// Onglet Jouer › Bonus : jours précédents, grilles à retenter, et les 4 niveaux
function bonusHtml(){
  const r=loadRes(), arch=archiveGrids(), rep=partieAReprendre();
  const perdues=GRIDS.map((_,i)=>i).filter(i=>visible(i)&&i!==dailyIdx&&!arch.includes(i)&&r[GRIDS[i].id]&&!r[GRIDS[i].id].win);
  const niv=DKEYS.map(k=>{ const ids=idsOf(k), n=ids.filter(i=>r[GRIDS[i].id]).length, D_=DIFFS[k], open=menuTab===k&&ids.length>0;
    return `<div class="lvcard"><div class="lvhead"><span class="dbadge l${D_.c}">${dname(k)}</span><small>${n}/${ids.length} ${pl(n,"terminée","terminées")} · ${D_.err} ${pl(D_.err,"erreur","erreurs")}</small></div>
      <div class="bar"><i style="width:${ids.length?n/ids.length*100:0}%;background:var(--l${D_.c})"></i></div>
      ${ids.length?`<div class="lvbtns"><button class="pill main lvgo" data-k="${k}">Jouer ▸</button><button class="pill soft lvlist" data-k="${k}" aria-expanded="${open}">${open?"Masquer":"Voir les grilles"}</button></div>`
        :`<p class="gempty">Pas encore de grille ${D_.name.toLowerCase()}. De nouvelles grilles arrivent chaque jour !</p>`}
      ${open?`<div class="glist">${ids.map(i=>gridItem(i,r)).join("")}</div>`:""}</div>`; }).join("");
  return `<h2 class="thtitle">Grilles bonus</h2><p class="thsub">Toutes les grilles, par niveau, à ton rythme.</p>
    ${rep!=null?`<button class="pill main full" id="pgRep" data-i="${rep}">▶️ Reprendre ${repLabel(rep)}</button>`:""}
    ${arch.length?`<p class="sec" id="archSec">Grilles des jours précédents</p><div class="glist arch">${arch.map(i=>gridItem(i,r,`<span class="date">${dateCourte(GRIDS[i].jour)}</span>`)).join("")}</div>`:""}
    ${perdues.length?`<p class="sec">À retenter</p><div class="glist">${perdues.map(i=>gridItem(i,r)).join("")}</div>`:""}
    <p class="sec">Par niveau</p><div class="lvgrid">${niv}</div>`;
}
// « Jouer ▸ » d'un niveau : prochaine grille non terminée de ce niveau (anti-répétition : choisirProchaineGrille)
function jouerNiveau(k){
  const choix=choisirProchaineGrille({portee:{niveau:k},resultats:loadRes()});
  if(choix.fini&&!choix.faites.length){ toast(`Pas encore de grille ${DIFFS[k].name} disponible`); return; }
  buzz(10);
  if(choix.fini) openTermine(choix,{},`de niveau ${dname(k)}`); else ouvrirGrille(choix.idx);
}
function hasardHtml(){
  return `<h2 class="thtitle">Grille au hasard 🎲</h2><p class="thsub">Une grille que tu n'as pas encore faite, tirée au sort.</p>${randHtml()}`;
}
// Onglet Progrès : série, statistiques, progression par niveau, carnet d'anecdotes
const favsTries=()=>loadFavs().sort((a,b)=>b.at-a.at);
function favsHtml(){
  const f=favsTries();
  return f.length ? `<div class="flist">${f.map((x,k)=>`<div class="fcard c${x.lvl}" data-k="${k}">
      <b>${esc(x.name)}</b><small>Grille n°${x.num} · ${esc(x.words.join(", "))}</small><p>${esc(fr(x.fact))}</p>
      <button class="fshare" data-k="${k}">${SHARE_ICON}Partager en image</button>
      <span class="star on" role="button" tabindex="0" data-id="${esc(x.id)}" aria-pressed="true" aria-label="Retirer des favoris">★</span></div>`).join("")}</div>`
    : `<div class="fempty"><span>☆</span>Touche l'étoile ☆ sur une anecdote pour la garder ici.</div>`;
}
function progresHtml(){
  const s=load(), alive=s.lastWin===dayNum||s.lastWin===dayNum-1, serie=alive?(s.streak||0):0, r=loadRes();
  const niv=DKEYS.map(k=>{ const ids=idsOf(k), n=ids.filter(i=>r[GRIDS[i].id]).length;
    return `<div class="pgniv"><span class="dbadge l${DIFFS[k].c}">${dname(k)}</span><div class="bar"><i style="width:${ids.length?n/ids.length*100:0}%;background:var(--l${DIFFS[k].c})"></i></div><small>${n}/${ids.length}</small></div>`; }).join("");
  return `<h2 class="thtitle">Progrès</h2>
    <div class="pserie"><span class="fl">🔥</span><div><b>${serie} ${pl(serie,"jour","jours")} de série</b><small>Record : ${s.best||0} ${pl(s.best||0,"jour","jours")}</small></div></div>
    <div class="cdline">${cdHtml()}</div>
    <p class="sec">Grilles du jour</p>${statsHtml()}
    <p class="sec">Par niveau</p><div class="pgnivs">${niv}</div>
    <p class="sec" id="favSec">Mon carnet ⭐<span class="cnt">${loadFavs().length}</span></p>${favsHtml()}`;
}
// Onglet Moi : préparé pour le futur mode en ligne (aucun appel réseau)
// Onglet Moi : avatar, pseudo (modifiable), code ami, séries, connexion Apple ; Duels et Classement « Bientôt »
const PS=window.QuatuorPseudos||null;
const AV_COUL=["#45D0B0","#FFA552","#EF5B7C","#7888E6"];
const avatarHtml=(n,id)=>`<button class="avatar emo"${id?` id="${id}"`:""} style="--av:${AV_COUL[n%4]}" aria-label="Changer d'avatar">${PS?PS.AVATARS[n]||PS.AVATARS[0]:"🙂"}</button>`;
function moiHtml(){
  const carte=(ic,t,d)=>`<div class="mcard" aria-disabled="true"><span class="mic">${ic}</span><span class="mtx"><b>${t}</b><small>${d}</small></span><span class="soon">Bientôt</span></div>`;
  const s=load(), alive=s.lastWin===dayNum||s.lastWin===dayNum-1, serie=alive?(s.streak||0):0;
  const series=`<div class="mseries"><div><b>🔥 ${serie}</b><small>Série actuelle</small></div><div><b>🏆 ${s.best||0}</b><small>Meilleure série</small></div></div>`;
  const p=EN_LIGNE&&PS?EN_LIGNE.profilLocal():null;
  let tete;
  if(!EN_LIGNE||!PS) tete=`<div class="moi"><span class="avatar"><span class="mark"><i></i><i></i><i></i><i></i></span></span><b>Joueur</b><small>Hors ligne</small></div>`;
  else if(!p) tete=`<div class="moi"><span class="avatar"><span class="mark"><i></i><i></i><i></i><i></i></span></span><b>Joueur</b>
    <small>${EN_LIGNE.enLigne()?"Création de ton profil…":"Connecte-toi à Internet pour créer ton profil"}</small></div>`;
  else tete=`<div class="moi">${avatarHtml(p.avatar||0,"moiAvatar")}
      <button class="mpseudo${p.pseudo?"":" vide"}" id="moiPseudo">${p.pseudo?`${esc(p.pseudo)}<span class="ed" aria-hidden="true">✏️</span>`:"Choisir mon pseudo"}</button></div>
    <div class="mcode"><span><small>Mon code ami</small><b id="moiCode">${esc(p.code_ami||"")}</b></span>
      <span class="bt"><button class="fshare" id="codeCopie">Copier</button><button class="fshare" id="codePartage">${SHARE_ICON}Partager</button></span></div>`;
  return `<h2 class="thtitle">Moi</h2>${tete}${series}
    ${EN_LIGNE?`<div id="moiCompte" data-compte="moi"></div>`:""}
    ${EN_LIGNE&&PS?`<p class="sec">Amis<span class="cnt" id="amisCnt" hidden></span></p><div class="amis" id="moiAmis"></div>`:""}
    <div class="mcards">${EN_LIGNE&&PS?"":carte("👥","Amis","Ajoute tes amis et compare vos séries")}${carte("⚔️","Duels","Défie un ami sur la même grille")}${carte("🏆","Classement","Mesure-toi aux autres joueurs")}</div>`;
}
let pseudoPropose=false;   // la fenêtre « Choisis ton pseudo » s'ouvre seule une fois par session
function brancherMoi(){
  if(!EN_LIGNE||!PS) return;
  const p=EN_LIGNE.profilLocal();
  chargerAmis();
  if(!p){ EN_LIGNE.synchroniser(); return; }   // le profil arrive avec la synchro (apresSynchro réaffiche la page)
  $("moiPseudo").onclick=()=>{ buzz(8); choisirPseudo(); };
  $("moiAvatar").onclick=()=>{ buzz(8); choisirAvatar(); };
  $("codeCopie").onclick=()=>copierTexte(p.code_ami,"Copié !");
  $("codePartage").onclick=()=>partagerTexte(`Ajoute-moi sur Quatuor 🧩\nMon code ami : ${p.code_ami}\nhttps://playquatuor.fr`,"Code copié !");
  if(!p.pseudo&&!pseudoPropose&&!$("sheet").classList.contains("open")){ pseudoPropose=true; setTimeout(()=>{ if(view==="moi") whenSheetFree(choisirPseudo); },350); }
}
// Fenêtre « Choisis ton pseudo » : vérification en direct (client), puis par le serveur (filtre identique, unicité)
function choisirPseudo(){
  const p=EN_LIGNE.profilLocal()||{};
  const premier=!p.pseudo;
  openSheet(`<h2>${premier?"Choisis ton pseudo":"Modifier mon pseudo"}</h2>
    <p>C'est le nom que verront tes amis. 3 à 16 caractères : lettres, chiffres, tiret ou underscore.</p>
    <div class="chrow"><input class="champ" id="psChamp" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" value="${esc(p.pseudo||PS.proposer())}" aria-label="Pseudo">
      <button class="round" id="psDe" aria-label="Proposer un autre pseudo">🎲</button></div>
    <p class="chmsg" id="psMsg" aria-live="polite"></p>
    <button class="pill main full" id="psOk">Valider</button>
    ${premier?"":`<button class="pill soft full" id="psNon">Annuler</button>`}
    <p class="cgu">En choisissant un pseudo, tu acceptes les <a href="cgu.html" data-legal>conditions d'utilisation</a>.</p>`);
  const ch=$("psChamp"), msg=$("psMsg"), ok=$("psOk");
  const maj=()=>{ const v=PS.valider(ch.value); msg.textContent=v.ok?"":v.message; msg.className="chmsg"+(v.ok?"":" ko"); ok.disabled=!v.ok; return v; };
  ch.oninput=maj; maj();
  $("psDe").onclick=()=>{ buzz(8); ch.value=PS.proposer(); maj(); };
  if($("psNon")) $("psNon").onclick=closeSheet;
  ch.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); ok.click(); } };
  ok.onclick=async()=>{
    const v=maj(); if(!v.ok) return;
    if(v.pseudo===p.pseudo){ closeSheet(); return; }
    ok.disabled=true; msg.className="chmsg"; msg.textContent="Vérification…";
    try{ await EN_LIGNE.majProfil({pseudo:v.pseudo}); buzz(10); closeSheet(); toast(`Bienvenue, ${v.pseudo} !`); if(view==="moi") renderPage(); }
    catch(e){
      const r=e.raison||"reseau";
      msg.className="chmsg ko";
      msg.textContent=r==="pris"?"Ce pseudo est déjà pris : essaie une variante ou touche 🎲.":r==="interdit"?"Ce pseudo n'est pas autorisé."
        :r==="format"?"Lettres, chiffres, tiret et underscore uniquement.":r==="trop"?"Trop de changements aujourd'hui : réessaie demain.":"Connecte-toi à Internet pour choisir ton pseudo.";
      ok.disabled=false;
    }
  };
}
function choisirAvatar(){
  const p=EN_LIGNE.profilLocal()||{};
  openSheet(`<h2>Mon avatar</h2><div class="avgrid">${PS.AVATARS.map((a,i)=>`<button data-av="${i}" style="--av:${AV_COUL[i%4]}"${i===(p.avatar||0)?' class="on"':""} aria-label="Avatar ${i+1}">${a}</button>`).join("")}</div>`);
  $("sheetBody").querySelectorAll("[data-av]").forEach(b=>b.onclick=async()=>{
    buzz(8);
    try{ await EN_LIGNE.majProfil({avatar:+b.dataset.av}); closeSheet(); if(view==="moi") renderPage(); }
    catch(e){ toast("Connecte-toi à Internet pour changer d'avatar"); }
  });
}
// ---- Amis (onglet Moi) ----
// Liste : demandes reçues, amis (série, grille du jour sans spoiler), demandes envoyées.
// Le résultat d'un ami pour la grille du jour n'est envoyé par le serveur qu'une fois la mienne terminée.
const avPetit=n=>`<span class="av" style="--av:${AV_COUL[(n||0)%4]}" aria-hidden="true">${PS.AVATARS[n||0]||PS.AVATARS[0]}</span>`;
let amisCache=[];
function etatDuJour(a){
  if(a.aujourdhui==="pas_jouee") return `<span class="st">Pas encore jouée</span>`;
  if(a.aujourdhui==="masque") return `<span class="st">🔒 Termine la grille</span>`;
  const e=a.erreurs||0, err=`${e} ${pl(e,"erreur","erreurs")}`;
  if(a.aujourdhui==="reussie") return `<span class="st ok">✓ ${a.essais>1?`${ordinal(a.essais)} essai`:e?err:"Sans faute"}</span>`;
  if(a.aujourdhui==="ratee") return `<span class="st ko">✗ Ratée</span>`;
  return "";
}
async function chargerAmis(){
  const z=$("moiAmis"); if(!z) return;
  const msg=t=>{ z.innerHTML=`<p class="gempty">${t}</p>`; };
  if(!EN_LIGNE.enLigne()){ msg("Connecte-toi à Internet pour voir tes amis."); return; }
  if(!z.innerHTML) msg("Chargement de tes amis…");
  try{
    const grille=GRIDS.length&&dailyIdx>=0?GRIDS[dailyIdx].id:"";
    amisCache=await EN_LIGNE.amis.liste(grille,todayStr)||[];
  }catch(e){ console.warn("Quatuor : amis indisponibles",e); msg(EN_LIGNE.enLigne()?"Impossible de charger tes amis pour l'instant.":"Connecte-toi à Internet pour voir tes amis."); return; }
  if(!$("moiAmis")) return;
  const recues=amisCache.filter(a=>a.etat==="recue"), liste=amisCache.filter(a=>a.etat==="ami"), envoyees=amisCache.filter(a=>a.etat==="envoyee");
  const cnt=$("amisCnt"); if(cnt){ cnt.hidden=!liste.length; cnt.textContent=liste.length; }
  z.innerHTML=`<button class="pill soft full" id="amiAjout">＋ Ajouter un ami</button>
    ${recues.length?`<p class="asub">${pl(recues.length,"Demande reçue","Demandes reçues")}</p>${recues.map(a=>`<div class="arow">${avPetit(a.avatar)}<span class="tx"><b>${esc(a.pseudo||"Joueur")}</b><small>veut être ton ami</small></span>
      <span class="acts"><button class="oui" data-acc="${a.demande}">Accepter</button><button data-ref="${a.demande}">Refuser</button><button data-plus="${a.ami}" aria-label="Plus d'options">⋯</button></span></div>`).join("")}`:""}
    ${liste.length?`${recues.length?`<p class="asub">Mes amis</p>`:""}${liste.map(a=>`<button class="arow" data-ami="${a.ami}">${avPetit(a.avatar)}<span class="tx"><b>${esc(a.pseudo||"Joueur")}</b><small>🔥 ${a.serie||0} ${pl(a.serie||0,"jour","jours")} de série</small></span>${etatDuJour(a)}</button>`).join("")}`
      :`<p class="gempty">Ajoute tes amis avec leur code ami pour comparer vos séries et vos résultats du jour.</p>`}
    ${envoyees.length?`<p class="asub">En attente</p>${envoyees.map(a=>`<div class="arow">${avPetit(a.avatar)}<span class="tx"><b>${esc(a.pseudo||"Joueur")}</b><small>Demande envoyée</small></span>
      <span class="acts"><button data-ann="${a.ami}">Annuler</button></span></div>`).join("")}`:""}`;
  $("amiAjout").onclick=ajouterAmi;
  z.querySelectorAll("[data-acc],[data-ref]").forEach(b=>b.onclick=()=>repondreAmi(+(b.dataset.acc||b.dataset.ref),!!b.dataset.acc,b));
  z.querySelectorAll("[data-ann]").forEach(b=>b.onclick=()=>actionAmi(()=>EN_LIGNE.amis.retirer(b.dataset.ann),"Demande annulée",b));
  z.querySelectorAll("[data-ami]").forEach(b=>b.onclick=()=>ficheAmi(amisCache.find(a=>a.ami===b.dataset.ami)));
  z.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>ficheAmi(amisCache.find(a=>a.ami===b.dataset.plus)));
}
async function actionAmi(fn,ok,btn){
  if(btn) btn.disabled=true; buzz(8);
  try{ await fn(); if(ok) toast(ok); }
  catch(e){ toast(EN_LIGNE.enLigne()?"Action impossible, réessaie plus tard":"Connecte-toi à Internet"); }
  chargerAmis();
}
function repondreAmi(id,accepter,btn){ actionAmi(()=>EN_LIGNE.amis.repondre(id,accepter),accepter?"Vous êtes maintenant amis !":"Demande refusée",btn); if(accepter) stat("Ami.ajoute",{via:"acceptation"}); }
// Fiche d'un ami : retirer (bloquer et signaler : voir la partie sécurité)
function ficheAmi(a){
  if(!a) return; buzz(8);
  openSheet(`<div class="fini"><div class="big">${PS.AVATARS[a.avatar||0]||"🙂"}</div><h2>${esc(a.pseudo||"Joueur")}</h2>
    <p>${a.etat==="ami"?`🔥 ${a.serie||0} ${pl(a.serie||0,"jour","jours")} de série · 🏆 record ${a.record||0}`:"veut être ton ami"}</p>
    <button class="pill soft full" id="amiRetirer">${a.etat==="ami"?"Retirer de mes amis":"Refuser la demande"}</button>${ficheAmiSecurite(a)}</div>`);
  $("amiRetirer").onclick=()=>{ closeSheet(); if(a.etat==="ami") actionAmi(()=>EN_LIGNE.amis.retirer(a.ami),`${a.pseudo||"Joueur"} a été retiré de tes amis`); else repondreAmi(a.demande,false); };
  brancherFicheSecurite(a);
}
// Ajouter un ami avec son code
function ajouterAmi(){
  buzz(8);
  const p=EN_LIGNE.profilLocal()||{};
  if(!p.pseudo){ toast("Choisis d'abord ton pseudo"); choisirPseudo(); return; }
  openSheet(`<h2>Ajouter un ami</h2><p>Demande son code ami à 6 caractères (onglet Moi de son appli).</p>
    <div class="chrow"><input class="champ code" id="amiCode" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="send" placeholder="ABC234" aria-label="Code ami"></div>
    <p class="chmsg" id="amiMsg" aria-live="polite"></p>
    <button class="pill main full" id="amiEnv" disabled>Envoyer la demande</button><button class="pill soft full" id="amiNon">Fermer</button>`);
  const ch=$("amiCode"), msg=$("amiMsg"), env=$("amiEnv");
  const maj=()=>{ const c=PS.nettoyerCode(ch.value); env.disabled=!PS.codeValide(c); msg.className="chmsg"; msg.textContent=c.length===6&&!PS.codeValide(c)?"Un code ne contient ni 0, ni O, ni 1, ni I.":""; return c; };
  ch.oninput=maj; $("amiNon").onclick=closeSheet;
  ch.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); if(!env.disabled) env.click(); } };
  env.onclick=async()=>{
    const c=maj(); if(!PS.codeValide(c)) return;
    if(c===p.code_ami){ msg.className="chmsg ko"; msg.textContent="C'est ton propre code 😄"; return; }
    env.disabled=true; msg.className="chmsg"; msg.textContent="Envoi…";
    let r; try{ r=await EN_LIGNE.amis.ajouter(c); }catch(e){ r="reseau"; }
    const T={envoyee:["ok","Demande envoyée ! Elle apparaîtra quand ton ami l'aura acceptée."],acceptee:["ok","Vous êtes maintenant amis !"],
      deja_amis:["","Vous êtes déjà amis."],deja_envoyee:["","Demande déjà envoyée."],introuvable:["ko","Aucun joueur avec ce code."],
      soi_meme:["ko","C'est ton propre code 😄"],pseudo_requis:["ko","Choisis d'abord ton pseudo."],limite:["ko","Trop de demandes aujourd'hui : réessaie demain."],
      trop_amis:["ko","Tu as atteint le nombre maximum d'amis (200)."],reseau:["ko","Connecte-toi à Internet pour ajouter un ami."]}[r]||["ko","Erreur, réessaie plus tard."];
    msg.className="chmsg "+T[0]; msg.textContent=T[1]; env.disabled=false;
    if(r==="envoyee"||r==="acceptee"){ buzz(10); ch.value=""; env.disabled=true; chargerAmis(); stat("Ami.ajoute",{via:r==="acceptee"?"demande_croisee":"code"}); }
  };
  setTimeout(()=>ch.focus(),400);
}
// ---- Sécurité : bloquer et signaler (fiche d'un ami ou d'une demande reçue) ----
const ficheAmiSecurite=a=>`<div class="row" style="margin-top:2px"><button class="pill soft" id="amiBloquer">🚫 Bloquer</button><button class="pill soft" id="amiSignaler">⚠️ Signaler</button></div>`;
function brancherFicheSecurite(a){
  const nom=esc(a.pseudo||"Joueur");
  $("amiBloquer").onclick=()=>{ buzz(8);
    openSheet(`<h2>Bloquer ${nom} ?</h2><p>${nom} disparaîtra de tes amis et ne pourra plus t'ajouter. Il n'en sera pas informé. Tu pourras le débloquer dans Paramètres › Compte.</p>
      <button class="pill danger full" id="blOui">Bloquer</button><button class="pill soft full" id="blNon">Annuler</button>`);
    $("blNon").onclick=closeSheet;
    $("blOui").onclick=()=>{ closeSheet(); actionAmi(()=>EN_LIGNE.amis.bloquer(a.ami),`${a.pseudo||"Joueur"} est bloqué`); };
  };
  $("amiSignaler").onclick=()=>signalerJoueur(a);
}
function signalerJoueur(a){
  buzz(8);
  const nom=esc(a.pseudo||"Joueur");
  openSheet(`<h2>Signaler ${nom}</h2><p>Pourquoi ? Ton signalement est anonyme pour ${nom} et sera examiné.</p>
    <div class="segc" role="radiogroup" aria-label="Motif" id="sgMotif"><button role="radio" data-v="pseudo" class="on" aria-checked="true">Pseudo inapproprié</button><button role="radio" data-v="autre" aria-checked="false">Autre</button></div>
    <p></p><button class="pill danger full" id="sgOui">Envoyer le signalement</button><button class="pill soft full" id="sgNon">Annuler</button>`);
  let motif="pseudo";
  $("sgMotif").querySelectorAll("button").forEach(b=>b.onclick=()=>{ motif=b.dataset.v; $("sgMotif").querySelectorAll("button").forEach(x=>{ x.classList.toggle("on",x===b); x.setAttribute("aria-checked",x===b); }); });
  $("sgNon").onclick=closeSheet;
  $("sgOui").onclick=async()=>{
    $("sgOui").disabled=true;
    let r; try{ r=await EN_LIGNE.amis.signaler(a.ami,motif); }catch(e){ r="reseau"; }
    closeSheet();
    toast({ok:"Merci, ton signalement a été envoyé",deja:"Tu as déjà signalé ce joueur aujourd'hui",limite:"Trop de signalements aujourd'hui",reseau:"Connecte-toi à Internet pour signaler"}[r]||"Signalement impossible");
  };
}
// Paramètres › Compte : joueurs bloqués (débloquer)
async function joueursBloques(){
  buzz(8);
  if(!EN_LIGNE.enLigne()){ toast("Connecte-toi à Internet pour voir les joueurs bloqués"); return; }
  openSheet(`<h2>Joueurs bloqués</h2><div class="amis" id="blListe"><p class="gempty">Chargement…</p></div><p></p><button class="pill soft full" id="blFermer">Fermer</button>`);
  $("blFermer").onclick=closeSheet;
  const remplir=async()=>{
    let l; try{ l=await EN_LIGNE.amis.bloques()||[]; }catch(e){ if($("blListe")) $("blListe").innerHTML=`<p class="gempty">Impossible de charger la liste.</p>`; return; }
    if(!$("blListe")) return;
    $("blListe").innerHTML=l.length?l.map(x=>`<div class="arow">${avPetit(x.avatar)}<span class="tx"><b>${esc(x.pseudo||"Joueur")}</b></span><span class="acts"><button data-debl="${x.id}">Débloquer</button></span></div>`).join("")
      :`<p class="gempty">Tu n'as bloqué personne.</p>`;
    $("blListe").querySelectorAll("[data-debl]").forEach(b=>b.onclick=async()=>{ b.disabled=true;
      try{ await EN_LIGNE.amis.debloquer(b.dataset.debl); toast("Joueur débloqué"); }catch(e){ toast("Connecte-toi à Internet"); } remplir(); });
  };
  remplir();
}
// Paramètres › Compte : supprimer mon compte (double confirmation). Toutes les données serveur sont supprimées
// (fonction serveur sécurisée), puis l'appli est remise à zéro sur cet appareil.
function supprimerCompte(){
  buzz(8);
  openSheet(`<h2>Supprimer mon compte ?</h2><p>Ton profil, ton pseudo, tes amis, tes résultats, tes statistiques, ta série et tes favoris seront supprimés de nos serveurs <b>et</b> de cet appareil.</p>
    <button class="pill danger full" id="sc1">Supprimer mon compte</button><button class="pill soft full" id="scNon">Annuler</button>`);
  $("scNon").onclick=closeSheet;
  $("sc1").onclick=()=>{ buzz(8);
    openSheet(`<h2>Vraiment tout supprimer ? 😬</h2><p>C'est définitif : impossible de récupérer ta progression ensuite, même avec Apple.</p>
      <button class="pill danger full" id="sc2">Oui, supprimer définitivement</button><button class="pill soft full" id="scNon2">Non, garder mon compte</button>`);
    $("scNon2").onclick=closeSheet;
    $("sc2").onclick=async()=>{
      const b=$("sc2"); b.disabled=true; b.textContent="Suppression…";
      try{ await EN_LIGNE.supprimerMonCompte(); }
      catch(e){ b.disabled=false; b.textContent="Oui, supprimer définitivement";
        toast(e&&e.raison==="reseau"?"Connecte-toi à Internet pour supprimer ton compte":"Suppression impossible, réessaie plus tard"); return; }
      await remiseAZeroLocale();
      location.reload();
    };
  };
}
// Efface toutes les données Quatuor de cet appareil (résultats, stats, favoris, réglages, session, rappels)
async function remiseAZeroLocale(){
  try{ if(Notifs){ const p=await Notifs.getPending(); if(p&&p.notifications&&p.notifications.length) await Notifs.cancel({notifications:p.notifications.map(n=>({id:n.id}))}); } }catch(e){}
  const cles=new Set(memo.keys());
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.startsWith("quatuor")) cles.add(k); } }catch(e){}
  cles.forEach(k=>{ if(k.startsWith("quatuor")) ls.del(k); });
  if(Prefs) await Prefs.clear().catch(()=>{});
}
// Copier dans le presse-papiers (avec repli pour les anciens navigateurs)
async function copierTexte(t,msg){
  buzz(8);
  try{ await navigator.clipboard.writeText(t); toast(msg||"Copié !"); }
  catch(e){ const x=document.createElement("textarea"); x.value=t; document.body.appendChild(x); x.select();
    try{ document.execCommand("copy"); toast(msg||"Copié !"); }catch(_){ toast("Copie impossible"); } x.remove(); }
}
// Partager un texte : feuille native (appli), Web Share API (web), sinon copie
async function partagerTexte(text,msgCopie){
  if(Share){ try{ await Share.share({text}); return true; }catch(e){ if(partageAnnule(e)) return false; } }
  else if(navigator.share){ try{ await navigator.share({text}); return true; }catch(e){ if(e.name==="AbortError") return false; } }
  await copierTexte(text,msgCopie||"Copié !"); return true;
}
// Paramètres (engrenage) : Apparence, Sons et vibrations, Rappel quotidien (appli), Aide, Compte, Données, À propos
function reglagesPageHtml(){
  const seg=(cle,opts,nom)=>`<div class="segc" role="radiogroup" aria-label="${nom}" data-r="${cle}">${opts.map(([v,l])=>`<button role="radio" data-v="${v}" aria-checked="${REG[cle]===v}"${REG[cle]===v?' class="on"':""}>${l}</button>`).join("")}</div>`;
  const tg=(cle,titre,sous)=>`<label class="rrow"><span><b>${titre}</b>${sous?`<small>${sous}</small>`:""}</span><input type="checkbox" class="tgl" data-r="${cle}"${REG[cle]?" checked":""}></label>`;
  const lien=(id,titre,sous,attrs="")=>`<button class="rrow rbtn" id="${id}"${attrs}><span><b>${titre}</b><small>${sous}</small></span><span class="chev">›</span></button>`;
  return `<button class="thback" id="setBack">‹ Retour</button><h2 class="thtitle">Paramètres</h2>
    <p class="sec">Apparence</p><div class="regl">
      <div class="rrow col"><b>Thème</b>${seg("theme",[["light","☀️ Clair"],["dark","🌙 Sombre"],["auto","Automatique"]],"Thème")}</div>
      <div class="rrow col"><b>Taille du texte</b>${seg("texte",[["normal","Normale"],["grand","Grande"]],"Taille du texte")}</div>
      ${tg("daltonien","Mode daltonien","Couleurs bien distinctes et un symbole par groupe : ● ▲ ■ ◆")}</div>
    <p class="sec">Sons et vibrations</p><div class="regl">${tg("sons","🔊 Sons")}${VIBRE?tg("vibrations","📳 Vibrations"):""}</div>
    ${reglagesHtml()}
    <p class="sec">Aide</p><div class="regl">${lien("setTuto","🎓 Revoir le tuto","La prise en main, pas à pas")}${lien("setHelp","📖 Comment jouer","Les règles en une page")}</div>
    <p class="sec">Compte</p><div class="regl">${EN_LIGNE?`<div id="setCompte" data-compte="reglages"></div>${lien("setBloques","🚫 Joueurs bloqués","Les débloquer")}${lien("setSuppr","🗑️ Supprimer mon compte","Efface toutes tes données, en ligne et sur cet appareil").replace('class="rrow rbtn"','class="rrow rbtn danger"')}`
      :`<div class="rrow" aria-disabled="true"><span><b>👤 Compte Quatuor</b><small>Sauvegarde en ligne, amis et duels</small></span><span class="soon">Bientôt disponible</span></div>`}</div>
    <p class="sec">Données</p><div class="regl">${PUBS&&PUBS.choixRequis()?lien("setPubs","📺 Mes choix publicitaires","Consentement aux pubs personnalisées"):""}${STATS?tg("stats","📊 Partager des statistiques anonymes","Aide à améliorer Quatuor. Aucune donnée personnelle."):""}${lien("setReset","🗑️ Réinitialiser ma progression","Résultats, statistiques, série (favoris et réglages conservés)",' data-danger').replace('class="rrow rbtn"','class="rrow rbtn danger"')}</div>
    <p class="sec">À propos</p><div class="regl">
      <div class="rrow"><span><b>Version</b></span><span class="rval" id="setVer">${APP_VERSION}</span></div>
      <a class="rrow" href="mailto:playquatuor@gmail.com"><span><b>✉️ Contact</b><small>playquatuor@gmail.com</small></span><span class="chev">›</span></a></div>
    ${legalHtml()}`;
}
function brancherParametres(el){
  el.querySelectorAll(".segc").forEach(g=>g.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const cle=g.dataset.r; if(REG[cle]===b.dataset.v) return; buzz(8);
    REG[cle]=b.dataset.v; ecrireReglages(); appliquerReglages();
    g.querySelectorAll("button").forEach(x=>{ const on=x===b; x.classList.toggle("on",on); x.setAttribute("aria-checked",on); }); }));
  el.querySelectorAll(".tgl[data-r]").forEach(t=>t.onchange=()=>{
    REG[t.dataset.r]=t.checked; ecrireReglages(); appliquerReglages();
    if(t.checked&&t.dataset.r==="vibrations") buzz(10);
    if(t.checked&&t.dataset.r==="sons") SON.jouer("groupe",2); });
  if($("setTuto")) $("setTuto").onclick=revoirTuto;
  if($("setPubs")) $("setPubs").onclick=()=>{ buzz(8); PUBS.optionsConfidentialite().catch(()=>toast("Connecte-toi à Internet pour modifier tes choix")); };
  if($("setReset")) $("setReset").onclick=reinitialiser;
  if($("setBloques")) $("setBloques").onclick=joueursBloques;
  if($("setSuppr")) $("setSuppr").onclick=supprimerCompte;
  const App=plugin("App");
  if(App&&$("setVer")) App.getInfo().then(i=>{ if($("setVer")) $("setVer").textContent=`${i.version} (${i.build})`; }).catch(()=>{});
}
// « Revoir le tuto » : remet à zéro le tutoriel et toutes les bulles, puis relance le tutoriel guidé
function revoirTuto(){
  buzz(8); closeSheet(); BULLE.fermer(true); bulleCtx=null; fileBulles=[];
  Object.keys(BULLES).forEach(id=>ls.del("quatuor-bulle-"+id));
  lancerTuto();
}
// « Réinitialiser ma progression » : double confirmation. Efface résultats, statistiques, série et parties en cours ;
// garde les favoris, les réglages et le tutoriel.
function reinitialiser(){
  buzz(8);
  openSheet(`<h2>Réinitialiser ?</h2><p>Tes résultats, tes statistiques, ta série et tes parties en cours seront effacés. Tes favoris ⭐ et tes réglages sont conservés.</p>
    <button class="pill danger full" id="rz1">Réinitialiser ma progression</button><button class="pill soft full" id="rzNon">Annuler</button>`);
  $("rzNon").onclick=closeSheet;
  $("rz1").onclick=()=>{ buzz(8);
    openSheet(`<h2>Vraiment tout effacer ? 😬</h2><p>C'est définitif : impossible de revenir en arrière.</p>
      <button class="pill danger full" id="rz2">Oui, tout effacer</button><button class="pill soft full" id="rzNon2">Non, garder ma progression</button>`);
    $("rzNon2").onclick=closeSheet;
    $("rz2").onclick=async()=>{
      const cles=["quatuor-res","quatuor","quatuor-encours","quatuor-bonus"];
      cles.forEach(k=>ls.del(k));
      // Mode en ligne : base remise à zéro, et effacement côté serveur à la prochaine synchro (même hors ligne)
      const ecr={};
      if(QC){ ecr["quatuor-base"]=JSON.stringify(QC.BASE_VIDE);
        let sy={}; try{ sy=JSON.parse(ls.get("quatuor-sync"))||{}; }catch(e){}
        ecr["quatuor-sync"]=JSON.stringify({...sy,reinitAFaire:true}); }
      Object.entries(ecr).forEach(([k,v])=>ls.set(k,v));
      if(Prefs) await Promise.all([...cles.map(key=>Prefs.remove({key}).catch(()=>{})),
        ...Object.entries(ecr).map(([key,value])=>Prefs.set({key,value}).catch(()=>{}))]);   // écrit avant de recharger
      location.reload();
    }; };
}
function retourReglages(){
  const v=avantReglages||"jeu"; avantReglages=null; buzz(8);
  if(v==="themes") openThemes(themeOpen); else if(PAGES.includes(v)) showPage(v); else setView("jeu");
}
$("setBtn").onclick=()=>{ if(view==="reglages") retourReglages(); else { buzz(8); showPage("reglages"); } };
// Onglet Jouer : « Grille du jour » ramène à la grille du jour, « Bonus » et « Hasard » ouvrent leur page
function goJouer(m){
  if(m!=="jour"){ showPage(m); return; }
  if(!GRIDS.length||dailyIdx<0){ setView("jeu"); return; }
  if(view==="jeu"&&gridIdx===dailyIdx){ scrollTo({top:0,behavior:RM()?"auto":"smooth"}); return; }
  if(gridIdx===dailyIdx&&!tuto) setView("jeu"); else switchGame(dailyIdx);
}
$("tabs").addEventListener("click",e=>{
  const b=e.target.closest("button[data-tab]"); if(!b||busy&&!done&&view==="jeu"&&GRIDS.length) return; buzz(8);   // (bloqué seulement pendant une animation de jeu)
  const t=b.dataset.tab, cur=ongletDe(view);
  if(t==="jouer"){
    if(cur==="jouer") goJouer("jour");                        // déjà dans Jouer : retour à la grille du jour
    else if(derJouer!=="jeu") showPage(derJouer);
    else if(GRIDS.length&&isTheme()) switchGame(dailyIdx);    // on quitte une grille de thème
    else setView("jeu");
  } else if(t==="themes"){
    if(!GRIDS.length){ toast("Chargement des grilles…"); return; }
    if(view==="themes") openThemes(null);
    else openThemes(view==="jeu"&&isTheme()?grid.theme:themeOpen);
  } else if(view!==t) showPage(t);
});
let onSheetClose=null;
function openSheet(html,onClose){ suspendreBulle(); $("sheetBody").innerHTML=html; $("sheet").scrollTop=0; onSheetClose=onClose||null;
  $("veil").classList.add("open"); $("sheet").classList.add("open"); document.documentElement.classList.add("lock"); }
function closeSheet(){ $("veil").classList.remove("open"); $("sheet").classList.remove("open");
  document.documentElement.classList.remove("lock");
  const f=onSheetClose; onSheetClose=null; if(f) f(); }
$("veil").onclick=closeSheet;

function openResults(win){
  // « Sans faute ! » seulement pour une réussite du premier coup sans erreur
  const nInd = hints ? `${hints} ${pl(hints,"indice","indices")}` : "";
  const title = !win ? "Pas cette fois" : attempt>1 ? `Réussie au ${ordinal(attempt)} essai !`
    : mistakes===0&&!hints ? "Sans faute !" : hints ? `Réussie avec ${nInd} !` : "Bien joué !";
  const temps = duree!=null&&QC ? QC.dureeTexte(duree) : "";
  const text = win ? `Grille résolue${temps?` en <b>${temps}</b>`:""} avec ${mistakes} ${pl(mistakes,"erreur","erreurs")}${hints?` et ${nInd}`:""}.`
    : `Tous les groupes sont révélés${attempt>1?` (${ordinal(attempt)} essai)`:""}.${temps?` Temps de jeu : <b>${temps}</b>.`:""}`;
  let k=0; const recap = history.map(r=>`<div>${r.map(i=>`<i class="l${i}" style="--k:${k++}"></i>`).join("")}</div>`).join("");
  const learned = grid.map((g,i)=>g.fact?`<div class="b${i}"><b>${esc(g.name)}</b>${esc(g.fact)}${starHtml(gridIdx,i)}</div>`:"").join("");
  openSheet(`<h2>${title}</h2><p>${text}${practice?"":" Nouvelle grille demain."}</p>${practice?"":cdHtml()}
    <div class="recap">${recap}</div>${practice?"":statsHtml()}
    ${win?"":`<button class="pill main full" id="retry">Retenter 🔄</button>`}
    <div class="row"><button class="pill ${win?"main":"soft"}" id="share">Partager</button><button class="pill soft" id="next">${nextLabel()}</button></div>
    ${learned?`<h3>Ce que tu as appris aujourd'hui</h3><div class="learned">${learned}</div>`:""}`);
  $("share").onclick=share;
  $("next").onclick=nextOrRandom;
  // Appli iOS : première grille réussie -> proposition de rappel quotidien, une fois les résultats fermés
  if(win&&Notifs&&!ls.get("quatuor-rappel-demande")) onSheetClose=()=>setTimeout(()=>whenSheetFree(proposerRappels),450);
  if(!win) $("retry").onclick=()=>retenter(gridIdx);
}
// =====================================================================
// NOUVEL ESSAI SUR UNE GRILLE PERDUE
// ⚠️ autoriserNouvelEssai() est le SEUL point d'entrée pour rejouer une grille perdue.
// Pour l'instant elle autorise toujours. Plus tard (appli iOS), c'est ici qu'on affichera
// une pub récompensée AdMob : ne renvoyer true que si la pub a été regardée jusqu'au bout,
// false si le joueur l'a fermée avant ou si elle n'a pas pu se charger.
// newGame() refuse de relancer une grille perdue sans JETON_ESSAI, que seul retenter() transmet.
// =====================================================================
async function autoriserNouvelEssai(idGrille){
  return true;
}
const JETON_ESSAI=Symbol("nouvel essai autorisé");
let essaiEnCours=false;
async function retenter(idx,opts={}){
  const g=GRIDS[idx]; if(!g||essaiEnCours) return;
  essaiEnCours=true;
  try{
    const ok=await autoriserNouvelEssai(g.id);
    if(!ok){ toast("Nouvel essai non disponible"); return; }
    closeSheet(); buzz(12);
    setTimeout(()=>switchGame(idx,{essai:JETON_ESSAI,hasard:opts.hasard!==undefined?opts.hasard:hasard}),200);
  }finally{ essaiEnCours=false; }
}
const ordinal=n=>n===1?"1er":n+"e";
const pl=(n,un,plusieurs)=>Math.abs(n)>=2?plusieurs:un;   // accord : 0 et 1 au singulier

// =====================================================================
// GRILLE AU HASARD
// =====================================================================
const RAND_KEYS=["toutes",...DKEYS];
const randLabel=k=>k==="toutes"?"Toutes":dname(k);
let randChoice;
const lireHasard=()=>{ randChoice=ls.get("quatuor-hasard"); if(!RAND_KEYS.includes(randChoice)) randChoice="toutes"; };
lireHasard();
// =====================================================================
// PROCHAINE GRILLE (« Suivante », « Grille suivante », « Encore une 🎲 ») : jamais une grille déjà terminée
// Toute la logique est ici, pour pouvoir la brancher plus tard sur des comptes en ligne :
//   portee    : { theme:"histoire" } | { niveau:"moyen" | "toutes", repli:true }
//               (repli : niveau épuisé -> grilles restantes des autres niveaux)
//   courante  : index de la grille en cours (toujours exclue)
//   resultats : { idGrille: { win, … } }, aujourd'hui quatuor-res ; demain, ceux du compte
//   aleatoire : tirage au sort (mode hasard, hors grille du jour) au lieu de l'ordre de la liste
// Renvoie { idx } ou, s'il ne reste rien, { fini:true, perdues:[idx…], faites:[idx…] }.
// Grilles exclues : terminées (gagnées ou perdues), en cours, et grilles du calendrier pas encore sorties.
// =====================================================================
function choisirProchaineGrille({portee,courante=-1,resultats={},aleatoire=false}){
  const fait=i=>!!resultats[GRIDS[i].id];
  // dans l'ordre de la liste, à partir de la grille en cours
  const tourne=l=>{ const p=l.indexOf(courante); return (p<0?l:l.slice(p+1).concat(l.slice(0,p))).filter(i=>i!==courante); };
  const base=portee.theme ? themeGrids(portee.theme)
    : GRIDS.map((_,i)=>i).filter(i=>visible(i)&&!(aleatoire&&i===dailyIdx));
  const niv=portee.niveau&&portee.niveau!=="toutes" ? base.filter(i=>GRIDS[i].diff===portee.niveau) : base;
  let champ=niv, libres=tourne(niv).filter(i=>!fait(i));
  if(!libres.length&&portee.repli){ champ=base; libres=tourne(base).filter(i=>!fait(i)); }
  if(libres.length) return {idx:aleatoire?libres[Math.floor(Math.random()*libres.length)]:libres[0]};
  const faites=champ.filter(fait);
  return {fini:true, perdues:faites.filter(i=>!resultats[GRIDS[i].id].win), faites};
}
// Ouvre une grille : une grille perdue passe toujours par retenter() (autorisation de nouvel essai)
function ouvrirGrille(i,opts={}){
  const x=loadRes()[GRIDS[i].id];
  if(x&&!x.win) retenter(i,opts);
  else { closeSheet(); setTimeout(()=>switchGame(i,opts),250); }
}
// Tout est fait dans la portée : « Retenter mes grilles perdues » / « Rejouer au hasard »
function openTermine(choix,opts,quoi){
  const {perdues,faites}=choix, any=a=>a[Math.floor(Math.random()*a.length)];
  openSheet(`<div class="fini"><div class="big">🎉</div><h2>${perdues.length?"Tu as tout terminé !":"Tu as tout réussi !"}</h2>
    <p>Tu as fait ${faites.length===1?`la seule grille ${quoi.replace(/^disponibles$/,"disponible")}`:`les ${faites.length} grilles ${quoi}`}.</p>
    ${perdues.length?`<button class="pill main full" id="finPerdues">Retenter mes grilles perdues (${perdues.length})</button>`:""}
    <button class="pill ${perdues.length?"soft":"main"} full" id="finHasard">Rejouer au hasard 🎲</button></div>`);
  if(perdues.length) $("finPerdues").onclick=()=>ouvrirGrille(opts.hasard?any(perdues):perdues[0],opts);
  $("finHasard").onclick=()=>{ const autres=faites.filter(i=>i!==gridIdx); ouvrirGrille(any(autres.length?autres:faites),opts); };
}
function launchRandom(diff,die){
  if(!GRIDS.length) return;
  const choix=choisirProchaineGrille({portee:{niveau:diff},courante:gridIdx,resultats:loadRes(),aleatoire:true});
  if(choix.fini&&!choix.faites.length){ toast(diff==="toutes"?"Aucune grille disponible pour l'instant":`Pas encore de grille ${DIFFS[diff].name} disponible`); return; }
  buzz(10);
  const go=()=>{
    if(choix.fini) openTermine(choix,{hasard:diff},diff==="toutes"?"disponibles":`de niveau ${dname(diff)}`);
    else ouvrirGrille(choix.idx,{hasard:diff});
  };
  // Petit dé qui roule (< 0,6 s), puis la grille s'ouvre
  if(die&&!RM()) die.animate([{transform:"none"},{transform:"rotate(200deg) scale(1.25)",offset:.5},{transform:"rotate(360deg)"}],{duration:520,easing:"cubic-bezier(.3,.7,.4,1)"}).onfinish=go;
  else go();
}
// Libellés du bouton « Grille suivante » selon le mode
const nextLabel=()=>hasard?"Encore une 🎲":isTheme()?"Suivante":"Grille suivante";
function updateNextLabels(){
  const t=nextLabel(), court=hasard?"Encore 🎲":"Suivante";
  $("nextG").innerHTML=`<span class="lg">${t}</span><span class="sm">${court}</span>`;
  const n=$("next"); if(n) n.textContent=t;
}
function nextOrRandom(){ if(hasard) launchRandom(hasard); else if(isTheme()) nextInTheme(); else nextGrid(); }

// =====================================================================
// MODE « THÈMES » : grilles regroupées par sujet, à faire à son rythme
// (jamais grille du jour, ne comptent pas dans les stats ni la série)
// Un thème « publie: false » n'apparaît qu'en local (localhost) pour le tester, jamais dans l'appli native.
// =====================================================================
let THEMES=[], view="jeu", themeOpen=null;
const IS_LOCAL=!IS_NATIVE&&["localhost","127.0.0.1","[::1]"].includes(location.hostname);
const themeOf=id=>THEMES.find(t=>t.id===id)||{id,nom:id,icone:"🗂️",publie:false};
const themesVisibles=()=>THEMES.filter(t=>t.publie||IS_LOCAL).sort((a,b)=>a.ordre-b.ordre);
const isTheme=()=>!!(grid&&!tuto&&grid.theme&&grid.theme!=="quotidien");
// Grilles d'un thème, triées par difficulté puis par numéro
const themeGrids=id=>GRIDS.map((_,i)=>i).filter(i=>GRIDS[i].theme===id)
  .sort((a,b)=>DKEYS.indexOf(GRIDS[a].diff)-DKEYS.indexOf(GRIDS[b].diff)||GRIDS[a].num-GRIDS[b].num);
const themeLabel=i=>GRIDS[i].titre||`Grille ${themeGrids(GRIDS[i].theme).indexOf(i)+1}`;
const themeProgress=(id,r)=>{ const ids=themeGrids(id); return {n:ids.length,d:ids.filter(i=>r[GRIDS[i].id]).length}; };
const progTxt=(d,n)=>n?`${d}/${n} ${pl(n,"grille terminée","grilles terminées")}`:"Bientôt disponible";
// Sélecteur de l'onglet Jouer : visible seulement dans cet onglet (jamais pendant le tutoriel)
function updateModes(){
  const m=$("modes"); m.hidden=tuto||ongletDe(view)!=="jouer";
  const cur=view==="bonus"||view==="hasard"?view:hasard?"hasard":gridIdx===dailyIdx||!GRIDS.length?"jour":"bonus";
  m.querySelectorAll("button").forEach(b=>{ const on=b.dataset.m===cur; b.classList.toggle("on",on); b.setAttribute("aria-selected",on); });
  updateTabs();
}
function setView(v){
  view=v; document.body.dataset.view=v; if(ongletDe(v)==="jouer") derJouer=v;
  $("themesView").hidden=v!=="themes"; $("pageView").hidden=!PAGES.includes(v); updateModes();
}
function openThemes(id){
  themeOpen=id||null; if(themeOpen) ls.set("quatuor-theme",themeOpen);
  closeSheet(); setView("themes"); renderThemes(); scrollTo(0,0);
}
function renderThemes(){
  const r=loadRes(), el=$("themesView"), list=themesVisibles(), t=themeOpen&&list.find(x=>x.id===themeOpen);
  if(!t){
    themeOpen=null;
    el.innerHTML=`<h2 class="thtitle">Thèmes</h2><p class="thsub">Des grilles par sujet, à faire à ton rythme.</p>
      <div class="thgrid">${list.map(x=>{ const {n,d}=themeProgress(x.id,r);
        return `<button class="thcard" data-t="${esc(x.id)}">${x.publie?"":'<span class="draft">Non publié</span>'}<span class="ic">${x.icone}</span><b>${esc(x.nom)}</b><small>${progTxt(d,n)}</small>
          <div class="bar"><i style="width:${n?d/n*100:0}%"></i></div></button>`; }).join("")}</div>`;
    el.querySelectorAll(".thcard").forEach(b=>b.onclick=()=>{ buzz(8); openThemes(b.dataset.t); });
  } else {
    const ids=themeGrids(t.id), {n,d}=themeProgress(t.id,r);
    el.innerHTML=`<div class="thdetail"><button class="thback">‹ Thèmes</button>
      <div class="thhead"><span class="ic">${t.icone}</span><div><h2>${esc(t.nom)}</h2><p>${progTxt(d,n)}${t.publie?"":" · non publié"}</p></div></div>
      <div class="bar"><i style="width:${n?d/n*100:0}%"></i></div>
      <div class="glist">${ids.length?ids.map((i,k)=>gridItem(i,r,themeLabel(i),k+1)).join(""):`<p class="gempty">Pas encore de grille dans ce thème.</p>`}</div></div>`;
    el.querySelector(".thback").onclick=()=>openThemes(null);
    el.querySelectorAll(".gitem").forEach(b=>b.onclick=()=>switchGame(+b.dataset.i));
    el.querySelectorAll(".gretry").forEach(b=>b.onclick=()=>retenter(+b.dataset.i,{hasard:null}));
  }
  if(!RM()) el.animate([{opacity:0,transform:"translateY(8px)"},{opacity:1,transform:"none"}],{duration:300,easing:"cubic-bezier(.2,.8,.3,1)"});
}
// « Suivante » : prochaine grille non terminée du même thème
function nextInTheme(){
  const id=grid.theme, choix=choisirProchaineGrille({portee:{theme:id},courante:gridIdx,resultats:loadRes()});
  if(choix.fini) openTermine(choix,{},`du thème ${themeOf(id).icone} ${esc(themeOf(id).nom)}`);
  else ouvrirGrille(choix.idx);
}
$("modes").addEventListener("click",e=>{
  const b=e.target.closest("button[data-m]"); if(!b||busy&&!done&&view==="jeu"&&GRIDS.length) return; buzz(8);   // (bloqué seulement pendant une animation de jeu)
  goJouer(b.dataset.m);
});

// Grille suivante : une grille non terminée de la même difficulté, sinon d'une autre difficulté
function nextGrid(){
  const choix=choisirProchaineGrille({portee:{niveau:grid.diff,repli:true},courante:gridIdx,resultats:loadRes()});
  if(choix.fini&&!choix.faites.length){ toast("Pas d'autre grille pour l'instant"); return; }
  if(choix.fini) openTermine(choix,{},"disponibles");
  else ouvrirGrille(choix.idx);
}
function openHelp(){
  openSheet(`<h2>Comment jouer</h2>
    <p class="lead">Range les 16 mots en <b>4 groupes de 4</b> qui ont un point commun.</p>
    <div class="rule"><span class="n">1</span><div>Touche 4 mots, puis <b>Valider</b>.</div></div>
    <div class="rule"><span class="n">2</span><div>Tu as droit à <b>4 erreurs</b> (3 en Difficile, 2 en GOAT 🐐). Gare aux pièges !</div></div>
    <div class="rule"><span class="n">3</span><div>Chaque groupe trouvé révèle une <b>anecdote</b>.</div></div>
    <div class="rule"><span class="n">4</span><div>Bloqué ? Touche 💡 : jusqu'à <b>${MAX_HINTS} indices</b> par grille (le nom d'un groupe, puis ses mots un par un)${PUBS?". Chaque indice se débloque avec une courte pub":""}.</div></div>
    <div class="legend"><span class="t">La couleur d'un groupe indique sa difficulté :</span>
      <div class="sw">${LEVELS.map((l,i)=>`<span><i class="l${i}"></i>${l}</span>`).join("")}</div>
      <div class="ax"><span>plus facile</span><span>plus difficile →</span></div></div>
    <button class="pill main" style="width:100%" id="okHelp">Jouer</button>${legalHtml()}`);
  $("okHelp").onclick=closeSheet;
}
// ---- Partage du résultat, façon Wordle, sans spoiler (texte : js/calculs.js) ----
// Grille du jour : « Quatuor #42 » ; autres grilles : leur nom (grille bonus, thème…) à la place du numéro.
function titrePartage(){
  if(isTheme()){ const t=themeOf(grid.theme); return `Quatuor · ${t.icone} ${t.nom} · ${themeLabel(gridIdx)}`; }
  if(!practice&&!dailyBonus) return `Quatuor #${grid.num}`;
  if(!practice&&dailyBonus) return `Quatuor · Grille bonus du ${today.toLocaleDateString("fr-FR",{day:"numeric",month:"long"})}`;
  if(isArchive(gridIdx)) return `Quatuor #${grid.num}`;
  return `Quatuor · Grille bonus n°${grid.num} (${DIFFS[grid.diff].name})`;
}
// =====================================================================
// STATISTIQUES ANONYMES (TelemetryDeck, js/telemetrie.js) : ouverture, tuto, grilles, partage, amis, Apple.
// Aucune donnée personnelle ; désactivables dans Paramètres › Données ; jamais en développement local.
// =====================================================================
const STATS=(()=>{ try{
  const c=window.QUATUOR_CONFIG||{}; if(!window.QuatuorStats||!c.telemetryDeckAppId) return null;
  const local=!IS_NATIVE&&(IS_LOCAL||location.protocol==="file:");
  return QuatuorStats.creer({appId:c.telemetryDeckAppId,ls,autorise:()=>REG.stats!==false,local:local&&!c.telemetrieDev,test:!!c.telemetrieDev,
    commun:{plateforme:IS_NATIVE?"ios":"web",version:APP_VERSION}});
}catch(e){ return null; } })();
function stat(type,valeurs){ try{ if(STATS) STATS.signal(type,valeurs); }catch(e){} }
// Type de grille (sans contenu) : jour, bonus du jour, ancienne grille du jour, thème, hasard, bonus
const typeGrille=()=>tuto?"tuto":isTheme()?"theme":!practice?(dailyBonus?"bonus_du_jour":"jour"):isArchive(gridIdx)?"jour_precedent":hasard?"hasard":"bonus";
const textePartage=()=>!QC?`${titrePartage()} 🧩\nplayquatuor.fr`:QC.texteDePartage({titre:titrePartage(),history,hints,attempt,duree,daltonien:!!REG.daltonien,site:"playquatuor.fr"});
async function share(){
  if(!grid||tuto) return;
  buzz(8);
  const fait=await partagerTexte(textePartage(),"Copié !");
  if(fait) stat("Partage",{grille:grid.id,typeGrille:typeGrille()});
}
let tt; function toast(m,bounce){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove("show"),1500);
  if(bounce&&!RM()) t.animate([{transform:"translate(-50%,-16px) scale(.97)",opacity:0},{transform:"translate(-50%,3px) scale(1.01)",opacity:1,offset:.6},
    {transform:"translate(-50%,0)",opacity:1}],{duration:550,easing:"ease-out"}); }

$("submit").onclick=submit;
$("shuffle").onclick=()=>{
  if(busy||done) return; buzz(10); shuffleArr(words); sauverPartie();
  const g=$("grid"), m=new Map([...g.children].map(t=>[t.dataset.w,t]));
  flipLayout(()=>words.forEach(w=>g.appendChild(m.get(w))),{dur:560,stagger:15,lift:true});
  const s=$("shuffle"); s.classList.remove("spin"); void s.offsetWidth; s.classList.add("spin");
};
$("clear").onclick=()=>{
  if(busy||done) return; selected.clear();
  $("grid").querySelectorAll(".tile.on").forEach(t=>{ t.classList.remove("on"); t.setAttribute("aria-pressed",false); spring(t); });
  updateUi();
};
$("seeRes").onclick=()=>{ if(done&&!tuto) openResults(lastWin); };
$("nextG").onclick=nextOrRandom;
$("hintBtn").onclick=demanderIndice;
$("retryD").onclick=()=>{ if(done&&!tuto&&!lastWin) retenter(gridIdx); };
$("retryP").onclick=()=>{ if(done&&!tuto&&!lastWin) retenter(gridIdx); };
$("revealP").onclick=demanderSolution;
$("revealP").textContent=libelleSolution();

// ---- Panneau du bas : le faire glisser vers le bas pour le fermer ----
(function(){
  const sh=$("sheet"), veil=$("veil");
  let y0=0, dy=0, h=0, active=false, dragging=false, grab=false, pts=[];
  const start=(y,target)=>{
    if(!sh.classList.contains("open")) return;
    grab=!!target.closest(".grab"); active=grab||sh.scrollTop<=0; dragging=false; dy=0; y0=y; h=sh.offsetHeight; pts=[[y,performance.now()]];
  };
  const move=(y,e)=>{
    const fixed=sh.scrollHeight<=sh.clientHeight+1;
    if(!active){ if(fixed&&e.cancelable) e.preventDefault(); return; }   // rien à faire défiler : on bloque la page derrière
    if(!dragging){
      const d=y-y0;
      if(d>6&&(grab||sh.scrollTop<=0)){ dragging=true; y0=y; sh.style.transition="none"; veil.style.transition="none"; }
      else if(d<-6&&!grab&&!fixed){ active=false; return; }               // défilement normal du contenu
      else { if((grab||fixed)&&e.cancelable) e.preventDefault(); return; }
    }
    if(e.cancelable) e.preventDefault();
    const raw=y-y0; dy=raw>0?raw:raw*.25;                                    // léger amorti vers le haut
    sh.style.transform=`translateY(${dy}px)`; veil.style.opacity=String(Math.max(0,1-Math.max(0,dy)/h));
    pts.push([y,performance.now()]); if(pts.length>6) pts.shift();
  };
  const end=()=>{
    if(!active) return; active=false; if(!dragging) return; dragging=false;
    const a=pts[0], b=pts[pts.length-1], v=(b[0]-a[0])/Math.max(1,b[1]-a[1]);  // px/ms
    sh.style.transition=""; veil.style.transition=""; sh.style.transform=""; veil.style.opacity="";
    if(dy>h/3||(v>.5&&dy>20)) closeSheet();
  };
  sh.addEventListener("touchstart",e=>start(e.touches[0].clientY,e.target),{passive:true});
  sh.addEventListener("touchmove",e=>move(e.touches[0].clientY,e),{passive:false});
  sh.addEventListener("touchend",end); sh.addEventListener("touchcancel",end);
  sh.addEventListener("pointerdown",e=>{ if(e.pointerType!=="mouse") return; start(e.clientY,e.target);
    const mv=ev=>move(ev.clientY,ev), up=()=>{ end(); removeEventListener("pointermove",mv); removeEventListener("pointerup",up); };
    addEventListener("pointermove",mv); addEventListener("pointerup",up); });
  // Fond assombri : jamais de défilement de la page derrière
  veil.addEventListener("touchmove",e=>{ if(e.cancelable) e.preventDefault(); },{passive:false});
  // Un geste de glisser ne doit pas déclencher un bouton du panneau
  sh.addEventListener("click",e=>{ if(Math.abs(dy)>6){ e.stopPropagation(); e.preventDefault(); dy=0; } },true);
})();

// Pas de zoom au double-tap
document.addEventListener("dblclick",e=>e.preventDefault(),{passive:false});
let rt; addEventListener("resize",()=>{ clearTimeout(rt); rt=setTimeout(()=>document.querySelectorAll(".tile").forEach(fit),150); });

// =====================================================================
// MODE EN LIGNE (js/en-ligne.js) : compte anonyme créé automatiquement, synchronisation des résultats,
// stats, série et favoris. Jamais bloquant : sans réseau (ou sans configuration), rien ne change.
// =====================================================================
function chargerScript(src){ return new Promise((ok,ko)=>{ const s=document.createElement("script"); s.src=src; s.async=true; s.onload=ok; s.onerror=()=>ko(new Error("chargement de "+src)); document.head.appendChild(s); }); }
const EN_LIGNE=(()=>{ try{
  if(!window.QuatuorEnLigne||!QC) return null;
  const e=QuatuorEnLigne.demarrer({ls,config:window.QUATUOR_CONFIG,aujourdhui:()=>todayStr,charger:chargerScript,apres:apresSynchro,natif:IS_NATIVE});
  return e.actif?e:null; }catch(err){ console.warn("Quatuor : mode en ligne indisponible",err); return null; } })();
// Après une synchronisation : l'affichage suit les données reçues (autre appareil)
function apresSynchro(r){
  if(!r||!r.ok) return;
  if(["progres","bonus","moi"].includes(view)&&!$("sheet").classList.contains("open")) renderPage();
  else if(view==="themes") renderThemes();
  planifierRappels();
}

// ---- Compte : se connecter (Apple ou code e-mail), se déconnecter (Paramètres › Compte et onglet Moi) ----
// Compte anonyme : « Se connecter avec Apple » (appli iOS ; site si config.appleWeb) et « Continuer avec un e-mail ».
// Le compte anonyme est relié (même compte, rien n'est perdu) ; si l'Apple ou l'e-mail appartient déjà à un compte
// Quatuor, on demande « Récupérer ta progression existante ? ». Compte relié : « Se déconnecter » (appareil remis à zéro).
const APPLE_MSG="Garde ta progression, même si tu changes de téléphone.";
const LOGO_APPLE='<svg viewBox="0 0 17 20" width="16" height="19" aria-hidden="true"><path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM11.6 3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>';
let etatCompte=null;
async function majCompteUi(){
  const zones=[...document.querySelectorAll("[data-compte]")]; if(!EN_LIGNE||!zones.length) return;
  etatCompte=await EN_LIGNE.compte();
  const relie=etatCompte&&!etatCompte.anonyme&&(etatCompte.apple||etatCompte.emailLie);
  const apple=EN_LIGNE.appleDisponible||EN_LIGNE.appleWebDisponible;
  zones.forEach(z=>{
    const ou=z.dataset.compte;
    if(relie) z.innerHTML=ou==="moi"?"":`<div class="compte"><div class="cok"><span class="ic">✓</span><span><b>Connecté ${etatCompte.apple?"avec Apple":"par e-mail"}</b><small>${etatCompte.email?esc(etatCompte.email)+" · ":""}Ta progression est sauvegardée</small></span></div>
      <button class="pill soft full" data-deco style="margin:12px 0 0">Se déconnecter</button></div>`;
    else z.innerHTML=`<div class="compte"><p>${fr(APPLE_MSG)}</p>
      ${apple?`<button class="bapple" data-apple>${LOGO_APPLE} Se connecter avec Apple</button>`:""}
      <button class="pill soft full" data-email style="margin:${apple?"8px":"0"} 0 0">✉️ Continuer avec un e-mail</button>
      <small>Déjà un compte ? Le même moyen te permet de retrouver ta progression.</small></div>`;
  });
  document.querySelectorAll("[data-apple]").forEach(b=>b.onclick=()=>seConnecterApple(b));
  document.querySelectorAll("[data-email]").forEach(b=>b.onclick=connexionEmail);
  document.querySelectorAll("[data-deco]").forEach(b=>b.onclick=seDeconnecter);
}
// « Ce compte Apple / cet e-mail a déjà une progression » : on demande avant de changer de compte
function demanderRecuperation(quoi="apple"){
  return new Promise(ok=>{
    let rep=false;
    openSheet(`<div class="fini"><div class="big">☁️</div><h2>Récupérer ta progression existante ?</h2>
      <p>${quoi==="email"?"Cette adresse e-mail":"Ce compte Apple"} est déjà lié à une progression Quatuor (sans doute sur un autre appareil).</p>
      <p>Si tu la récupères, les grilles jouées sur cet appareil y seront ajoutées (le meilleur résultat est gardé). Le pseudo et les amis seront ceux de ce compte.</p>
      <button class="pill main full" id="recOui">Récupérer ma progression</button><button class="pill soft full" id="recNon">Annuler</button></div>`,()=>ok(rep));
    $("recOui").onclick=()=>{ rep=true; closeSheet(); };
    $("recNon").onclick=closeSheet;
  });
}
// Connexion par code e-mail : adresse → (question si le compte existe déjà) → code à 6 chiffres
function connexionEmail(){
  buzz(8);
  if(!EN_LIGNE.enLigne()){ toast("Connecte-toi à Internet pour continuer"); return; }
  const flux=EN_LIGNE.connexionEmail(()=>demanderRecuperation("email"));
  const etape1=(valeur="")=>{
    openSheet(`<h2>Continuer avec un e-mail</h2><p>Tu recevras un code à 6 chiffres. Pas de mot de passe.</p>
      <div class="chrow"><input class="champ" id="emChamp" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="toi@exemple.fr" value="${esc(valeur)}" aria-label="Adresse e-mail"></div>
      <p class="chmsg" id="emMsg" aria-live="polite"></p>
      <button class="pill main full" id="emOk">Recevoir un code</button><button class="pill soft full" id="emNon">Annuler</button>`);
    const ch=$("emChamp"), msg=$("emMsg"), ok=$("emOk");
    $("emNon").onclick=closeSheet;
    ch.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); ok.click(); } };
    ok.onclick=async()=>{
      const email=ch.value.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ msg.className="chmsg ko"; msg.textContent="Adresse e-mail invalide."; return; }
      ok.disabled=true; msg.className="chmsg"; msg.textContent="Envoi…";
      try{
        const r=await flux.envoyerCode(email);
        if(r.mode==="annule") return;   // (la fenêtre de question s'est fermée)
        etape2(email,r.mode);
      }catch(e){ console.warn("Quatuor : envoi du code impossible",e);
        if(!$("emMsg")) etape1(email);
        $("emMsg").className="chmsg ko"; $("emMsg").textContent=QuatuorEnLigne.messageErreurEmail(e); $("emOk").disabled=false; }
    };
    setTimeout(()=>ch.focus(),400);
  };
  const etape2=(email,mode)=>{
    openSheet(`<h2>Code envoyé ✉️</h2><p>Saisis le code reçu à <b>${esc(email)}</b> (pense à regarder les courriers indésirables).</p>
      <div class="chrow"><input class="champ code" id="emCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" aria-label="Code reçu par e-mail"></div>
      <p class="chmsg" id="emMsg" aria-live="polite"></p>
      <button class="pill main full" id="emOk" disabled>Valider</button><button class="pill soft full" id="emRet">Changer d'adresse</button>`);
    const ch=$("emCode"), msg=$("emMsg"), ok=$("emOk");
    ch.oninput=()=>{ ch.value=ch.value.replace(/\D/g,""); ok.disabled=ch.value.length<6; };
    ch.onkeydown=e=>{ if(e.key==="Enter"&&!ok.disabled){ e.preventDefault(); ok.click(); } };
    $("emRet").onclick=()=>etape1(email);
    ok.onclick=async()=>{
      ok.disabled=true; msg.className="chmsg"; msg.textContent="Vérification…";
      try{
        const r=await flux.verifierCode(email,ch.value,mode);
        closeSheet(); buzz(10);
        if(r.etat==="lie"){ toast("Connecté par e-mail ✓"); stat("Compte.email",{issue:"liaison"}); majCompteUi(); }
        else { toast("Progression récupérée ✓"); stat("Compte.email",{issue:"recuperation"}); if(STATS) STATS.vider(); setTimeout(()=>location.reload(),900); }
      }catch(e){ msg.className="chmsg ko"; msg.textContent=QuatuorEnLigne.messageErreurEmail(e); ok.disabled=false; }
    };
    setTimeout(()=>ch.focus(),400);
  };
  etape1();
}
// Se déconnecter : la progression reste sur le compte ; l'appareil repart à zéro (réglages et tuto conservés)
function seDeconnecter(){
  buzz(8);
  openSheet(`<h2>Se déconnecter ?</h2><p>Ta progression reste sauvegardée sur ton compte : tu la retrouveras en te reconnectant.
    Sur cet appareil, le jeu repartira à zéro (tes réglages sont conservés).</p>
    <button class="pill main full" id="decoOui">Se déconnecter</button><button class="pill soft full" id="decoNon">Annuler</button>`);
  $("decoNon").onclick=closeSheet;
  $("decoOui").onclick=async()=>{
    const b=$("decoOui"); b.disabled=true; b.textContent="Sauvegarde…";
    try{ await EN_LIGNE.seDeconnecter(); }
    catch(e){ b.disabled=false; b.textContent="Se déconnecter";
      toast(e&&e.raison==="reseau"?"Connecte-toi à Internet pour te déconnecter":"Sauvegarde impossible pour l'instant : réessaie"); return; }
    await effacerDonneesJoueur();
    location.reload();
  };
}
// Données personnelles de cet appareil (progression, favoris, profil, session) ; réglages et tuto conservés
async function effacerDonneesJoueur(){
  const cles=["quatuor-res","quatuor","quatuor-encours","quatuor-bonus","quatuor-favs","quatuor-favs-suppr","quatuor-base","quatuor-sync","quatuor-profil","quatuor-auth"];
  cles.forEach(k=>ls.del(k));
  if(Prefs) await Promise.all(cles.map(key=>Prefs.remove({key}).catch(()=>{})));
}
// Site : retour de la connexion Apple (redirection)
async function traiterRetourAppleWeb(){
  if(!EN_LIGNE||IS_NATIVE) return;
  let r=null; try{ r=await EN_LIGNE.retourAppleWeb(); }catch(e){ console.warn("Quatuor : retour Apple",e); }
  if(!r) return;
  if(r.etat==="lie"){ toast("Connecté avec Apple ✓"); stat("Compte.apple",{issue:"liaison"}); majCompteUi(); }
  else if(r.etat==="recupere"){ toast("Progression récupérée ✓"); stat("Compte.apple",{issue:"recuperation"}); setTimeout(()=>location.reload(),900); }
  else if(r.etat==="deja_lie"){ if(await demanderRecuperation("apple")) EN_LIGNE.appleWeb("recuperer").catch(()=>toast("Connexion impossible, réessaie plus tard")); }
  else toast("Connexion Apple impossible, réessaie plus tard");
}
let appleEnCours=false;
async function seConnecterApple(btn){
  if(appleEnCours) return;
  if(!EN_LIGNE.enLigne()){ toast("Connecte-toi à Internet pour continuer"); return; }
  appleEnCours=true; buzz(10); if(btn) btn.disabled=true;
  try{
    if(!IS_NATIVE){ await EN_LIGNE.appleWeb("lier"); return; }   // le navigateur part chez Apple, puis revient (traiterRetourAppleWeb)
    const r=await EN_LIGNE.connexionApple(()=>demanderRecuperation("apple"));
    if(r.etat==="lie"){ toast("Connecté avec Apple ✓"); stat("Compte.apple",{issue:"liaison"}); }
    else if(r.etat==="recupere"){ toast("Progression récupérée ✓"); stat("Compte.apple",{issue:"recuperation"}); if(STATS) STATS.vider(); setTimeout(()=>location.reload(),900); }
  }catch(e){
    const code=e&&(e.code||e.errorMessage||e.message)||"";
    if(!/ANNUL|cancel/i.test(String(code))){ console.warn("Quatuor : connexion Apple impossible",e); toast("Connexion impossible, réessaie plus tard"); }
  }finally{ appleEnCours=false; if(btn) btn.disabled=false; majCompteUi(); }
}

// Lancement : tutoriel au tout premier lancement, pop-up de bienvenue à chaque ouverture (sauf « Ne plus afficher »)
let gridsReady;
function boot(){
  gridsReady=loadGrids().then(g=>{
    if(!g){ if(!tuto) showLoadError(); return false; }
    GRIDS=g; THEMES=g.themes||[]; dailyIdx=pickDaily();
    if(dailyIdx<0){ if(!tuto) showLoadError(); return false; }   // aucune grille du jeu quotidien
    if(!tuto){   // le tutoriel n'a pas besoin des grilles : on ne l'interrompt pas
      newGame(dailyIdx,{accueil:true});
      bullesProgression(false);   // anciens joueurs : bulles de la nouvelle navigation jamais vues
      if(PUBS) PUBS.demarrer();   // pubs récompensées : consentement (RGPD puis Apple) et première pub chargée à l'avance
      if(!RM()) [...$("grid").children].forEach((t,i)=>t.animate([{opacity:0,transform:"scale(.96)"},{opacity:1,transform:"none"}],
        {duration:380,delay:i*18,easing:"cubic-bezier(.2,.8,.3,1)",fill:"backwards"}));
    }
    planifierRappels();
    if(EN_LIGNE) EN_LIGNE.synchroniser();
    traiterRetourAppleWeb();
    return true;
  });
}
function lancer(){
  lireReglages(); appliquerReglages();
  migrateData(); migrerVersEnLigne(); recalculerStats();
  // Économe (offre gratuite TelemetryDeck) : une seule ouverture comptée par jour et par appareil
  if(ls.get("quatuor-stats-ouverture")!==todayStr){ ls.set("quatuor-stats-ouverture",todayStr); stat("App.ouverture"); }
  cdTick();
  // Premier lancement : tutoriel guidé (marqué comme vu à la fin ou sur « Passer »)
  if(!ls.get("quatuor-tuto-done")) lancerTuto(); else showSkeleton();
  boot();
  // Appli iOS : l'écran de lancement s'efface dès que le jeu est affiché
  const splash=plugin("SplashScreen"); if(splash) requestAnimationFrame(()=>splash.hide({fadeOutDuration:250}).catch(()=>{}));
}
// PWA : lancement immédiat. Appli iOS : d'abord les données du joueur (préférences natives, migration).
if(IS_NATIVE) initStockage().then(()=>{ lireHasard(); lancer(); }); else lancer();
// Service worker (hors ligne) : PWA uniquement, jamais dans l'appli native
if(!IS_NATIVE&&"serviceWorker" in navigator){ addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{})); }
