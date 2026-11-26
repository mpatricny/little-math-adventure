// The base landmarks identify the reward. Longer trials also follow painted
// edges of the tail, paws and reward so extra stars stay on the subject.
export const constellations = {
  rescue: { label: 'Osvobození', color: '#ffbd6b', points: [[61,183],[111,120],[77,49],[174,113],[213,83],[221,192]] },
  attack: { label: 'Síla lišky', color: '#ffb25e', points: [[30,165],[94,126],[53,77],[129,84],[199,105],[242,62],[274,117]] },
  shield: { label: 'Štít', color: '#7edfff', points: [[85,177],[128,109],[149,37],[203,88],[218,139],[190,182]] },
  heal: { label: 'Léčení', color: '#b7eea4', points: [[86,180],[67,109],[121,45],[183,67],[221,125],[155,123]] },
  strike: { label: 'Zásah', color: '#e2bbff', points: [[53,63],[92,36],[128,89],[87,125],[165,136],[218,132],[205,181],[246,204]] },
  rune: { label: 'Bod lišky', color: '#ffe5a7', points: [[87,111],[70,84],[121,48],[175,46],[226,92],[191,155],[148,179],[103,159]] },
};

const routes = {
  rescue: [[61,183],[84,147],[111,120],[86,130],[61,114],[59,86],[77,49],[51,45],[86,18],[116,15],[143,41],[143,70],[124,95],[103,109],[142,118],[174,113],[184,86],[165,62],[187,69],[186,53],[213,83],[232,78],[211,102],[202,138],[228,144],[244,161],[240,180],[221,192]],
  attack: [[30,165],[60,147],[94,126],[113,103],[86,104],[50,99],[13,126],[24,87],[53,77],[72,58],[100,64],[115,81],[129,84],[137,62],[113,42],[143,44],[162,61],[188,76],[199,105],[220,90],[249,78],[267,71],[242,62],[218,42],[201,42],[220,65],[214,104],[244,99],[271,105],[274,117]],
  shield: [[85,177],[65,165],[74,143],[87,123],[109,109],[128,109],[143,87],[151,66],[128,72],[139,50],[123,22],[149,37],[168,31],[188,41],[173,53],[170,77],[180,95],[203,88],[236,99],[232,119],[218,139],[211,162],[200,195],[177,200],[166,183],[135,187],[104,192],[122,169],[148,157],[174,159],[190,182]],
  heal: [[86,180],[66,159],[57,136],[67,109],[62,82],[78,57],[99,38],[121,45],[144,28],[161,23],[169,42],[183,67],[205,51],[205,76],[194,97],[202,108],[225,80],[244,107],[239,145],[221,125],[206,150],[228,159],[209,181],[183,197],[146,202],[121,190],[108,171],[132,166],[147,148],[127,131],[120,111],[140,108],[155,123]],
  strike: [[53,63],[49,37],[66,20],[92,15],[106,23],[92,36],[109,48],[111,62],[128,89],[107,84],[90,77],[66,86],[91,102],[113,104],[87,125],[115,124],[145,150],[165,136],[148,110],[130,91],[148,85],[170,96],[187,111],[191,93],[207,106],[218,132],[241,144],[223,151],[247,181],[225,167],[198,150],[173,148],[191,165],[164,158],[205,181],[190,177],[216,193],[246,204]],
  rune: [[87,111],[68,102],[70,84],[84,65],[97,78],[101,100],[114,87],[104,62],[110,37],[121,48],[137,27],[144,49],[142,72],[156,68],[160,38],[175,46],[190,28],[194,53],[182,79],[192,97],[206,73],[222,69],[231,80],[226,92],[219,116],[203,124],[212,146],[212,170],[191,155],[166,132],[151,115],[132,116],[118,129],[131,146],[154,158],[170,173],[148,179],[122,188],[98,181],[103,159]],
};

const namespace = 'http://www.w3.org/2000/svg';
const plane = { width: 300, height: 225 };
export const artUrl = name => '/assets/ui/catacomb-observatory/mural-' + name + '.webp';
export const illustration = (key, etched) => key === 'rune'
  ? '/assets/ui/catacomb-crafted-v3/paw-' + (etched ? 'normal' : 'active') + '.webp'
  : artUrl((etched ? 'etch-' : '') + key);
let instances = 0;

function element(tag, attrs, parent) {
  const child = document.createElementNS(namespace, tag);
  for (const [key,value] of Object.entries(attrs)) child.setAttribute(key,String(value));
  parent.append(child);
  return child;
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function pointsFor(key, count) {
  const landmarks = constellations[key].points;
  if (count === undefined || count === landmarks.length) return landmarks;
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Expected a positive star count');
  if (count === 1) return [landmarks.at(-1)];
  if (count < landmarks.length) {
    return Array.from({ length: count }, (_, i) => landmarks[Math.round(i * (landmarks.length - 1) / (count - 1))]);
  }
  const route = routes[key];
  const candidates = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const steps = Math.ceil(distance(a, b) / 3);
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      candidates.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  candidates.push(route.at(-1));
  const selected = candidates.map(p => landmarks.some(anchor => distance(p, anchor) < .01));
  const nearest = candidates.map(p => Math.min(...landmarks.map(anchor => distance(p, anchor))));
  const anchorCount = selected.filter(Boolean).length;
  if (count > candidates.length || anchorCount !== landmarks.length) throw new RangeError('Unexpected constellation route or length');
  // Bisect the largest empty patch, taking the distance to other branches
  // into account. A hairpin bend must never stack two jewels on one another.
  for (let n = anchorCount; n < count; n++) {
    const index = nearest.indexOf(Math.max(...nearest));
    selected[index] = true;
    candidates.forEach((p, j) => { nearest[j] = Math.min(nearest[j], distance(p, candidates[index])); });
  }
  return candidates.filter((_, i) => selected[i]);
}

const textureUrls = [artUrl('star-sleep'), artUrl('star-lit'), ...Object.keys(constellations).flatMap(key => [illustration(key, false), illustration(key, true)])];
let loading;
function preloadArt(){
  loading ??= Promise.all(textureUrls.map(url=>{
    const img = new Image();
    img.src=url;
    return img.decode();
  }));
  return loading;
}

/** The host controls placement. Returned points account for SVG letterboxing on a tablet. */
export function createMural(host) {
  const id='fox-mural-'+(++instances);
  const svg=element('svg', {class:'fox-mural',viewBox:'0 0 300 225','aria-hidden':true},host);
  const defs=element('defs',{},svg);
  const wash=element('radialGradient',{id:id+'-wash'},defs);
  element('stop',{offset:'0%','stop-color':'white'},wash);
  element('stop',{offset:'46%','stop-color':'white','stop-opacity':.9},wash);
  element('stop',{offset:'100%','stop-color':'white','stop-opacity':0},wash);
  const mask=element('mask',{id:id+'-mask',maskUnits:'userSpaceOnUse',x:0,y:0,width:300,height:225},defs);
  const art=element('g',{},svg);
  let reward, points, hitNodes=[];
  function describe() {
    const earned = hitNodes.filter(({group}) => group.dataset.state === 'earned').length;
    const assisted = hitNodes.filter(({group}) => group.dataset.state === 'assisted').length;
    host.setAttribute('aria-label', `Souhvězdí · ${reward.label}. Hvězdy ${earned} z ${points.length}. Pomoc planety ${assisted}.`);
  }
  function setVariant(key, count){
    reward=constellations[key];
    if(!reward) throw new RangeError('Unknown fox constellation: '+key);
    points=pointsFor(key,count);
    host.dataset.constellation=key;
    host.style.setProperty('--mural-hue',reward.color);
    host.setAttribute('role','img');
    host.removeAttribute('aria-hidden');
    art.replaceChildren(); mask.replaceChildren(); hitNodes=[];
    svg.classList.remove('is-complete');
    element('image',{class:'mural-etch',href:illustration(key,true),width:300,height:225},art);
    element('image',{class:'mural-local-color',href:illustration(key,false),width:300,height:225,mask:'url(#'+id+'-mask)'},art);
    element('image',{class:'mural-awakened',href:illustration(key,false),width:300,height:225},art);
    const tracks=element('g',{},art);
    const stones=element('g',{},art);
    points.forEach(([x,y],i)=>{
      const nearest = Math.min(...points.filter((_, j) => j !== i).map(p => distance(p, points[i])));
      const scale = Math.min(1, nearest / 38);
      const reveal=element('circle',{cx:x,cy:y,r:Math.min(39, nearest * .88),fill:'url(#'+id+'-wash)',class:'mural-pool'},mask);
      let line=null;
      if(i){
        const [px,py]=points[i-1], path='M'+px+' '+py+'L'+x+' '+y;
        element('path',{d:path,class:'mural-groove'},tracks);
        line=element('path',{d:path,pathLength:1,class:'mural-wire'},tracks);
      }
      const group=element('g',{transform:'translate('+x+' '+y+') scale('+scale+')',class:'mural-gem mural-star-anchor','data-star':i,'data-state':'waiting'},stones);
      element('path',{class:'mural-seat',d:'M0 -14.8L3.4 -3.2L11 0L3.4 3.2L0 14.8L-3.4 3.2L-11 0L-3.4 -3.2Z'},group);
      element('image',{x:-16,y:-16,width:32,height:32,href:artUrl('star-sleep'),class:'mural-cold'},group);
      element('image',{x:-16,y:-16,width:32,height:32,href:artUrl('star-lit'),class:'mural-hot'},group);
      const planet = element('g',{class:'mural-planet-star',transform:'rotate(-24)'},group);
      element('ellipse',{rx:16,ry:5,class:'mural-orbit-shadow'},planet);
      element('ellipse',{rx:16,ry:5,class:'mural-orbit'},planet);
      element('path',{d:'M0 -10 2.8 -3 8 0 2.8 2.8 0 10 -2.8 2.8 -8 0 -2.8 -3Z',class:'mural-orbit-core'},planet);
      element('path',{d:'M-16 0A16 5 0 0 0 16 0',class:'mural-orbit-front'},planet);
      const rays=element('g',{class:'mural-corona'},group);
      for(let p=0;p<7;p++){
        const angle=(p*137+i*17)*Math.PI/180;
        const reach=9+(p%3)*3;
        const sx=Math.cos(angle)*reach,sy=Math.sin(angle)*reach;
        element('path',{d:'M'+sx+' '+sy+'l'+(sx*.46)+' '+(sy*.46),class:'mural-fleck'},rays);
      }
      hitNodes.push({group,reveal,line});
    });
    describe();
  }
  function light(i, {assisted=false} = {}) {
    if(!hitNodes[i] || hitNodes[i].group.dataset.state !== 'waiting')return;
    const {group,reveal}=hitNodes[i];
    group.dataset.state = assisted ? 'assisted' : 'earned';
    group.classList.add('is-lit');
    reveal.classList.add('is-lit');
    // A missed answer leaves a true gap. Connect its neighbours only when
    // both endpoints actually have a star, including a later planetary visit.
    for (const end of [i, i+1]) {
      if (end > 0 && end < hitNodes.length && hitNodes[end-1].group.dataset.state !== 'waiting' && hitNodes[end].group.dataset.state !== 'waiting') {
        hitNodes[end].line.classList.add('is-lit');
      }
    }
    describe();
  }
  function reset() {
    svg.classList.remove('is-complete');
    hitNodes.forEach(({group,reveal,line})=>{
      group.dataset.state='waiting';
      group.classList.remove('is-lit');reveal.classList.remove('is-lit');line?.classList.remove('is-lit');
    });
    describe();
  }
  function point(i) {
    const [px,py]=points[Math.max(0,Math.min(points.length-1,i))];
    const r=host.getBoundingClientRect();
    if (!r.width||!r.height) return {x:px/plane.width,y:py/plane.height};
    const s=Math.min(r.width/plane.width,r.height/plane.height);
    return {x:((r.width-plane.width*s)/2+px*s)/r.width,y:((r.height-plane.height*s)/2+py*s)/r.height};
  }
  function finish({fill=true}={}) {
    if(fill) for(let i=0;i<points.length;i++)light(i);
    svg.classList.add('is-complete');
  }
  setVariant('rescue');
  return { ready:preloadArt(),setVariant,point,light,finish,reset,get count(){return points.length;} };
}
