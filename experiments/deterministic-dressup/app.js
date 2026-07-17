const models = [
  { id:'A', name:'짧고 슬림', src:'assets/models/model-a-slim-short.png', p:{neckY:.236, shoulderY:.255, shoulderL:.343, shoulderR:.657, elbowL:[.205,.314], elbowR:[.795,.314], wristL:[.225,.165], wristR:[.775,.165], waist:[.382,.618,.470], hip:[.356,.644,.553], crotch:.585, kneeL:[.425,.690], kneeR:[.575,.690], ankleL:[.405,.895], ankleR:[.595,.895], arm:.030, thigh:.050, calf:.035}},
  { id:'B', name:'키 크고 마름', src:'assets/models/model-b-tall-lean.png', p:{neckY:.190, shoulderY:.212, shoulderL:.354, shoulderR:.646, elbowL:[.191,.286], elbowR:[.809,.286], wristL:[.214,.132], wristR:[.786,.132], waist:[.394,.606,.445], hip:[.372,.628,.520], crotch:.548, kneeL:[.425,.676], kneeR:[.575,.676], ankleL:[.408,.895], ankleR:[.592,.895], arm:.026, thigh:.043, calf:.030}},
  { id:'C', name:'넓은 어깨·근육형', src:'assets/models/model-c-athletic.png', p:{neckY:.215, shoulderY:.238, shoulderL:.315, shoulderR:.685, elbowL:[.188,.302], elbowR:[.812,.302], wristL:[.207,.138], wristR:[.793,.138], waist:[.358,.642,.462], hip:[.348,.652,.540], crotch:.572, kneeL:[.405,.695], kneeR:[.595,.695], ankleL:[.380,.900], ankleR:[.620,.900], arm:.042, thigh:.058, calf:.038}},
  { id:'D', name:'플러스 체형', src:'assets/models/model-d-plus.png', p:{neckY:.195, shoulderY:.228, shoulderL:.300, shoulderR:.700, elbowL:[.170,.280], elbowR:[.830,.280], wristL:[.218,.117], wristR:[.782,.117], waist:[.300,.700,.448], hip:[.278,.722,.555], crotch:.588, kneeL:[.390,.697], kneeR:[.610,.697], ankleL:[.360,.900], ankleR:[.640,.900], arm:.052, thigh:.076, calf:.050}},
  { id:'E', name:'장신·긴 몸통·넓은 골반', src:'assets/models/model-e-pear.png', p:{neckY:.175, shoulderY:.205, shoulderL:.300, shoulderR:.700, elbowL:[.092,.295], elbowR:[.908,.295], wristL:[.125,.135], wristR:[.875,.135], waist:[.300,.700,.455], hip:[.255,.745,.545], crotch:.580, kneeL:[.390,.700], kneeR:[.610,.700], ankleL:[.360,.930], ankleR:[.640,.930], arm:.045, thigh:.073, calf:.045}}
];

const outfits = [
  ['정장 / 네이비','assets/outfits/outfit-1-navy-suit.png'],
  ['정장 / 차콜 차이나칼라','assets/outfits/outfit-2-charcoal-mandarin.png'],
  ['캐주얼 / 버건디 후디','assets/outfits/outfit-3-burgundy-hoodie.png'],
  ['캐주얼 / 데님·카고','assets/outfits/outfit-4-denim-cargo.png'],
  ['세미캐주얼 / 봄버·치노','assets/outfits/outfit-5-bomber-chino.png']
].map(([name,src],i)=>({id:i+1,name,src}));

const S = [
  [.12,.08],[.13,.245],[.32,.18],[.43,.14],[.57,.14],[.68,.18],[.87,.245],[.88,.08],
  [.34,.29],[.66,.29],[.36,.48],[.64,.48],[.37,.515],[.50,.57],[.63,.515],
  [.36,.75],[.46,.75],[.54,.75],[.64,.75],[.35,.94],[.47,.94],[.53,.94],[.65,.94],
  [.21,.27],[.19,.10],[.79,.27],[.81,.10],[.50,.30],[.50,.48],[.50,.515]
];
const T = [
  [0,24,1],[24,23,1],[1,23,2],[23,8,2],[2,8,3],
  [5,9,25],[5,25,6],[25,26,6],[6,26,7],
  [3,8,27],[3,27,4],[4,27,9],[4,9,5],[8,10,27],[10,28,27],[27,28,9],[9,28,11],
  [10,12,28],[12,29,28],[28,29,14],[28,14,11],[12,13,29],[29,13,14],
  [12,15,13],[15,16,13],[15,19,16],[19,20,16],[13,17,14],[14,17,18],[17,21,18],[18,21,22]
];

const cache = new Map();
function load(src){ if(!cache.has(src)) cache.set(src,new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})); return cache.get(src); }
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]], sub=(a,b)=>[a[0]-b[0],a[1]-b[1]], mul=(a,k)=>[a[0]*k,a[1]*k];
function pair(center, from, half){ const v=sub(center,from), n=Math.hypot(...v)||1, q=[-v[1]/n*half,v[0]/n*half]; return [sub(center,q),add(center,q)]; }
function targetPoints(p){
  const sl=[p.shoulderL,p.shoulderY], sr=[p.shoulderR,p.shoulderY], nl=[.46,p.neckY], nr=[.54,p.neckY];
  const [lw0,lw1]=pair(p.wristL,p.elbowL,p.arm*.72).sort((a,b)=>a[0]-b[0]), [le0,le1]=pair(p.elbowL,sl,p.arm).sort((a,b)=>a[0]-b[0]);
  const [rw1,rw0]=pair(p.wristR,p.elbowR,p.arm*.72).sort((a,b)=>a[0]-b[0]), [re1,re0]=pair(p.elbowR,sr,p.arm).sort((a,b)=>a[0]-b[0]);
  const armpitL=[sl[0]+.025,p.shoulderY+.085], armpitR=[sr[0]-.025,p.shoulderY+.085];
  const wl=[p.waist[0],p.waist[2]], wr=[p.waist[1],p.waist[2]], hl=[p.hip[0],p.hip[2]], hr=[p.hip[1],p.hip[2]], c=[.5,p.crotch];
  const [lk0,lk1]=pair(p.kneeL,[.5,p.crotch],p.thigh).sort((a,b)=>a[0]-b[0]), [la0,la1]=pair(p.ankleL,p.kneeL,p.calf).sort((a,b)=>a[0]-b[0]);
  const [rk1,rk0]=pair(p.kneeR,[.5,p.crotch],p.thigh).sort((a,b)=>a[0]-b[0]), [ra1,ra0]=pair(p.ankleR,p.kneeR,p.calf).sort((a,b)=>a[0]-b[0]);
  return [lw0,le0,sl,nl,nr,sr,re0,rw0,armpitL,armpitR,wl,wr,hl,c,hr,lk0,lk1,rk1,rk0,la0,la1,ra1,ra0,le1,lw1,re1,rw1,[.5,(p.shoulderY+p.waist[2])*.5],[.5,p.waist[2]],[.5,p.hip[2]]];
}
function area(a,b,c){ return ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2; }
function affine(s0,s1,s2,d0,d1,d2){
  const den=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
  const solve=(v0,v1,v2)=>[(v0*(s1[1]-s2[1])+v1*(s2[1]-s0[1])+v2*(s0[1]-s1[1]))/den,(v0*(s2[0]-s1[0])+v1*(s0[0]-s2[0])+v2*(s1[0]-s0[0]))/den,(v0*(s1[0]*s2[1]-s2[0]*s1[1])+v1*(s2[0]*s0[1]-s0[0]*s2[1])+v2*(s0[0]*s1[1]-s1[0]*s0[1]))/den];
  const x=solve(d0[0],d1[0],d2[0]), y=solve(d0[1],d1[1],d2[1]); return [x[0],y[0],x[1],y[1],x[2],y[2]];
}
function fit(img,w,h){ const k=Math.min(w/img.width,h/img.height); return {x:(w-img.width*k)/2,y:(h-img.height*k)/2,k}; }
async function render(canvas,model,outfit,mode,showMesh){
  const ctx=canvas.getContext('2d'), W=canvas.width=320, H=canvas.height=480;
  const [person,garment]=await Promise.all([load(model.src),load(outfit.src)]); ctx.clearRect(0,0,W,H);
  const f=fit(person,W,H); ctx.drawImage(person,f.x,f.y,person.width*f.k,person.height*f.k);
  const D=targetPoints(model.p).map(([x,y])=>[f.x+x*person.width*f.k,f.y+y*person.height*f.k]);
  if(mode==='rigid'){
    const xs=D.map(p=>p[0]), ys=D.map(p=>p[1]), x=Math.min(...xs), y=Math.min(...ys), w=Math.max(...xs)-x, h=Math.max(...ys)-y;
    ctx.drawImage(garment,x-12,y-10,w+24,h+24);
    return {max:Infinity,flips:0};
  }
  const src=S.map(([x,y])=>[x*garment.width,y*garment.height]); let flips=0; const ratios=[];
  for(const tri of T){ const s=tri.map(i=>src[i]), d=tri.map(i=>D[i]); if(area(...s)*area(...d)<=0) flips++; ratios.push(Math.abs(area(...d)/area(...s)));
    ctx.save(); ctx.beginPath(); ctx.moveTo(...d[0]); ctx.lineTo(...d[1]); ctx.lineTo(...d[2]); ctx.closePath(); ctx.clip(); ctx.transform(...affine(...s,...d)); ctx.drawImage(garment,0,0); ctx.restore();
  }
  if(showMesh){ ctx.strokeStyle='rgba(77,255,213,.7)'; ctx.lineWidth=.7; for(const tri of T){ctx.beginPath();ctx.moveTo(...D[tri[0]]);ctx.lineTo(...D[tri[1]]);ctx.lineTo(...D[tri[2]]);ctx.closePath();ctx.stroke();} }
  const sorted=[...ratios].sort((a,b)=>a-b), med=sorted[Math.floor(sorted.length/2)]||1, max=Math.max(...ratios.map(r=>Math.max(r/med,med/r)));
  return {max,flips};
}

let mode='mesh', showMesh=false;
async function build(){
  const root=document.querySelector('#matrix'); root.innerHTML='';
  for(const model of models) for(const outfit of outfits){
    const card=document.createElement('article'); card.className='card'; const canvas=document.createElement('canvas');
    const meta=document.createElement('div'); meta.className='meta'; meta.innerHTML=`<strong>${model.id}. ${model.name} × ${outfit.name}</strong><span class="metric">rendering</span>`;
    card.append(canvas,meta); root.append(card); const metric=meta.querySelector('.metric');
    render(canvas,model,outfit,mode,showMesh).then(({max,flips})=>{ const fail=flips>0||max>2.5; metric.classList.toggle('fail',fail); metric.textContent=mode==='rigid'?'1-box':`stretch ${max.toFixed(2)}× / flip ${flips}`; });
  }
}
document.querySelectorAll('button[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('button[data-mode]').forEach(x=>x.classList.toggle('active',x===b));build()}));
document.querySelector('#showMesh').addEventListener('change',e=>{showMesh=e.target.checked;build()});
build();
