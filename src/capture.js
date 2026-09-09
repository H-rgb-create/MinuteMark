const img = document.querySelector('#capture-image');
const selectionEl = document.querySelector('#selection');
const paint = document.querySelector('#paint');
const ctx = paint.getContext('2d');
const toolbar = document.querySelector('#toolbar');
const hint = document.querySelector('#hint');
const colorInput = document.querySelector('#color');
let sourceReady = false;
let selecting = false;
let drawing = false;
let start = null;
let selection = null;
let tool = 'arrow';
let preview = null;
let items = [];

function point(event) { return { x: event.clientX, y: event.clientY }; }
function box(a, b) { return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) }; }
function setSelection(value) { selection = value; selectionEl.style.display='block'; Object.assign(selectionEl.style,{left:value.x+'px',top:value.y+'px',width:value.w+'px',height:value.h+'px'}); toolbar.classList.remove('hidden'); hint.classList.add('hidden'); positionToolbar(); }
function positionToolbar() { if (!selection) return; const top = Math.min(window.innerHeight-52, selection.y + selection.h + 10); toolbar.style.left=Math.min(window.innerWidth-toolbar.offsetWidth-10,Math.max(10,selection.x))+'px'; toolbar.style.top=top+'px'; }
function drawShape(context, item, offsetX=0, offsetY=0) {
  context.save(); context.strokeStyle=item.color; context.fillStyle=item.color; context.lineWidth=3; context.lineCap='round'; context.lineJoin='round';
  const x1=item.x1-offsetX, y1=item.y1-offsetY, x2=item.x2-offsetX, y2=item.y2-offsetY;
  if (item.type==='pen') { context.beginPath(); item.points.forEach((p,index)=>index ? context.lineTo(p.x-offsetX,p.y-offsetY) : context.moveTo(p.x-offsetX,p.y-offsetY)); context.stroke(); }
  if (item.type==='rect') { context.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1)); }
  if (item.type==='arrow') { const angle=Math.atan2(y2-y1,x2-x1); context.beginPath();context.moveTo(x1,y1);context.lineTo(x2,y2);context.stroke();context.beginPath();context.moveTo(x2,y2);context.lineTo(x2-12*Math.cos(angle-Math.PI/6),y2-12*Math.sin(angle-Math.PI/6));context.lineTo(x2-12*Math.cos(angle+Math.PI/6),y2-12*Math.sin(angle+Math.PI/6));context.closePath();context.fill(); }
  if (item.type==='text') { context.font='20px "Microsoft YaHei", sans-serif'; context.fillText(item.text, x1, y1); }
  context.restore();
}
function repaint() { ctx.clearRect(0,0,paint.width,paint.height); items.forEach((item)=>drawShape(ctx,item)); if(preview) drawShape(ctx,preview); }
function beginDrawing(p) { if(!selection || p.x<selection.x || p.y<selection.y || p.x>selection.x+selection.w || p.y>selection.y+selection.h) return; if(tool==='text') { const text=window.prompt('输入标注文字'); if(text) { items.push({type:'text',x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:colorInput.value,text}); repaint(); } return; } drawing=true; start=p; preview=tool==='pen'?{type:'pen',points:[p],color:colorInput.value}:{type:tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:colorInput.value}; }
function updateDrawing(p) { if(!drawing) return; if(preview.type==='pen') preview.points.push(p); else { preview.x2=p.x; preview.y2=p.y; } repaint(); }
function endDrawing() { if(!drawing) return; if(preview.type==='pen' ? preview.points.length>1 : Math.abs(preview.x2-preview.x1)+Math.abs(preview.y2-preview.y1)>4) items.push(preview); preview=null; drawing=false; repaint(); }

window.minuteMark.onCaptureSource((dataUrl)=>{ img.src=dataUrl; img.onload=()=>{sourceReady=true; paint.width=window.innerWidth;paint.height=window.innerHeight;}; });
window.addEventListener('mousedown',(event)=>{ if(!sourceReady || event.target.closest('#toolbar')) return; const p=point(event); if(!selection) { selecting=true;start=p;setSelection({x:p.x,y:p.y,w:0,h:0}); } else beginDrawing(p); });
window.addEventListener('mousemove',(event)=>{const p=point(event);if(selecting){setSelection(box(start,p));}else updateDrawing(p);});
window.addEventListener('mouseup',()=>{if(selecting){selecting=false;if(!selection || selection.w<8 || selection.h<8){selection=null;selectionEl.style.display='none';toolbar.classList.add('hidden');hint.classList.remove('hidden');} }else endDrawing();});
document.querySelectorAll('[data-tool]').forEach((button)=>button.onclick=()=>{tool=button.dataset.tool;document.querySelectorAll('[data-tool]').forEach((el)=>el.classList.toggle('active',el===button));});
document.querySelector('[data-tool="arrow"]').classList.add('active');
document.querySelector('#undo').onclick=()=>{items.pop();repaint();};
document.querySelector('#cancel').onclick=()=>window.minuteMark.cancelCapture();
document.querySelector('#confirm').onclick=()=>{
  if(!selection) return;
  const scaleX=img.naturalWidth/window.innerWidth, scaleY=img.naturalHeight/window.innerHeight;
  const out=document.createElement('canvas');out.width=Math.max(1,Math.round(selection.w*scaleX));out.height=Math.max(1,Math.round(selection.h*scaleY));const output=out.getContext('2d');
  output.drawImage(img, selection.x*scaleX,selection.y*scaleY,selection.w*scaleX,selection.h*scaleY,0,0,out.width,out.height);
  output.save();output.scale(scaleX,scaleY);items.forEach((item)=>drawShape(output,item,selection.x,selection.y));output.restore();
  window.minuteMark.finishCapture(out.toDataURL('image/png'));
};
window.addEventListener('keydown',(event)=>{if(event.key==='Escape')window.minuteMark.cancelCapture();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){items.pop();repaint();}});
