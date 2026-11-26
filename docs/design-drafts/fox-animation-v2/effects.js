// A separate runtime light layer; the video frames are never warped or tinted.
export function drawFoxLight(ctx, {motion, progress, reduced=false, anchor}) {
 const cast = motion === 'cast';
 const start=cast?.23:.39,end=cast?.76:.69;
 if (motion === 'idle' || progress <= start || progress >= end || !anchor) return;
 const strength = Math.sin(Math.PI * (progress-start)/(end-start));
 const x = anchor?.x ?? (cast ? 69 : 57), y = anchor?.y ?? (cast ? 257 : 327);
 ctx.save();ctx.globalCompositeOperation='screen';
 const radius = reduced ? 18 : cast ? 35 : 27;
 const glow=ctx.createRadialGradient(x,y,0,x,y,radius);
 glow.addColorStop(0,`rgba(220,255,245,${.65*strength})`);
 glow.addColorStop(.3,`rgba(78,230,244,${.43*strength})`);
 glow.addColorStop(1,'rgba(30,186,229,0)');
 ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
 if(!reduced){
  ctx.lineCap='round';ctx.strokeStyle=`rgba(190,255,245,${.8*strength})`;ctx.lineWidth=2;
  if(cast){
   const radius=22+progress*13;
   ctx.beginPath();ctx.ellipse(x,y,radius,radius*.38,-.35,-Math.PI*.8,Math.PI*.8);ctx.stroke();
  }else{
   ctx.beginPath();ctx.arc(x+27,y-21,43,Math.PI*.7,Math.PI*1.18);ctx.stroke();
  }
  for(let i=0;i<5;i++){
   const angle=i*2.4+(cast?progress*1.3:-progress*.5);
   const distance=12+((progress+i*.13)%1)*29;
   const px=x+Math.cos(angle)*distance,py=y+Math.sin(angle)*distance-(cast?progress*14:0);
   const size=(i%2?1.4:2.2)*strength;
   ctx.fillStyle=i%2?`rgba(255,222,150,${strength})`:`rgba(192,255,255,${strength})`;
   ctx.beginPath();ctx.arc(px,py,size,0,Math.PI*2);ctx.fill();
  }
 }
 ctx.restore();
}
export function foxLightAnchor(form,motion,cell){
 const hands={
  '01':{attack:{3:[57,327],4:[73,425]},cast:{2:[124,296],3:[65,257],4:[54,272],5:[88,307]}},
  '02':{attack:{3:[111,461],4:[112,450]},cast:{2:[115,280],3:[115,280],4:[115,283],5:[115,280],6:[115,275]}},
  '03':{attack:{3:[45,434],4:[85,395]},cast:{2:[137,298],3:[133,302],4:[131,304],5:[132,303],6:[137,298]}},
  '04':{attack:{3:[53,455],4:[65,457]},cast:{2:[101,353],3:[76,321],4:[66,340],5:[66,340],6:[66,340],7:[76,350],8:[90,370]}},
  '05':{attack:{3:[81,442],4:[58,437]},cast:{2:[145,312],3:[139,315],4:[133,317],5:[137,315]}}
 };
 const xy=hands[form]?.[motion]?.[cell];return xy?{x:xy[0],y:xy[1]}:undefined;
}
