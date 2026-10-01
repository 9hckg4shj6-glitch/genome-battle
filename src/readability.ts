import {esc,readStore,writeStore,type Question} from './ui';
export type ReadSize='standard'|'large'|'xlarge';
export function readSize(value:string|null|undefined):ReadSize {return value==='large'||value==='xlarge'?value:'standard';}
export function setReadSize(value:ReadSize):void {
  document.documentElement.dataset.readingSize=value;writeStore('gb.read-size',value);
  document.querySelectorAll<HTMLButtonElement>('[data-read-size]').forEach(b=>{const on=b.dataset.readSize===value;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
}
export function renderReadingControls():string {
  const current=readSize(document.documentElement.dataset.readingSize);
  return `<div class="reading-controls" role="group" aria-label="問題・解説の文字サイズ"><span>文字サイズ</span>${(['standard','large','xlarge'] as ReadSize[]).map((size,i)=>`<button class="reading-size ${size===current?'on':''}" data-read-size="${size}" aria-pressed="${size===current}" aria-label="文字サイズ：${['標準','大','特大'][i]}">${['標準','大','特大'][i]}</button>`).join('')}</div>`;
}
if(typeof document!=='undefined') {
  document.documentElement.dataset.readingSize=readSize(readStore('gb.read-size'));
  window.addEventListener('storage',e=>{if(e.key==='gb.read-size'||e.key===null){const size=readSize(readStore('gb.read-size'));document.documentElement.dataset.readingSize=size;document.querySelectorAll<HTMLElement>('[data-read-size]').forEach(b=>{const on=b.dataset.readSize===size;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});}});
}
export class ImageViewer {
  private dialog=document.createElement('dialog');
  private scale=1;private baseWidth=0;private baseHeight=0;
  constructor() {
    this.dialog.className='image-viewer';this.dialog.setAttribute('aria-label','問題の図を拡大');document.body.append(this.dialog);
    this.dialog.addEventListener('click',e=>{
      const action=(e.target as HTMLElement).closest<HTMLElement>('[data-image-action]')?.dataset.imageAction;
      if(action==='close')this.dialog.close();
      if(action==='in')this.zoom(Math.min(4,this.scale+.5));
      if(action==='out')this.zoom(Math.max(1,this.scale-.5));
      if(action==='fit')this.zoom(1);
    });
    window.addEventListener('resize',()=>{if(this.dialog.open)this.fit();});
  }
  open(q:Question,timed=false):void {
    if(!q.image)return;
    this.scale=1;
    this.dialog.innerHTML=`<header class="image-viewer-header"><h2>問題の図</h2><button class="btn" data-image-action="close" aria-label="拡大図を閉じる">閉じる</button></header><p class="image-description">${esc(q.imageAlt||q.question)}</p><div class="image-zoom-controls" role="group" aria-label="図の拡大操作"><button class="btn" data-image-action="out" aria-label="図を縮小">−</button><output aria-live="polite">×1.0</output><button class="btn" data-image-action="in" aria-label="図を拡大">＋</button><button class="btn" data-image-action="fit">全体表示</button></div><div class="image-scroll" tabindex="0" aria-label="図の表示領域。拡大後は上下左右にスクロールできます"><div class="image-canvas"><img src="${import.meta.env.BASE_URL}${esc(q.image)}" alt="${esc(q.imageAlt??'問題の図')}" draggable="false"/></div></div><p class="image-viewer-hint">＋／−で拡大し、拡大後は指で上下左右に動かせます。${timed?'対戦の制限時間は進みます。':''}</p>`;
    if(!this.dialog.open)this.dialog.showModal();
    const img=this.dialog.querySelector<HTMLImageElement>('img')!;
    img.addEventListener('load',()=>this.fit());
    img.addEventListener('error',()=>{this.dialog.querySelector('.image-viewer-hint')!.textContent='図を読み込めませんでした。通信を確認して、いったん閉じてから開き直してください。';});
    if(img.complete&&img.naturalWidth)this.fit();
  }
  private fit():void {
    const img=this.dialog.querySelector<HTMLImageElement>('img');const stage=this.dialog.querySelector<HTMLElement>('.image-scroll');
    if(!img?.naturalWidth||!stage)return;
    const fit=Math.min(1,stage.clientWidth/img.naturalWidth,stage.clientHeight/img.naturalHeight);
    this.baseWidth=img.naturalWidth*fit;this.baseHeight=img.naturalHeight*fit;this.zoom(this.scale);
  }
  private zoom(scale:number):void {
    const stage=this.dialog.querySelector<HTMLElement>('.image-scroll');const canvas=this.dialog.querySelector<HTMLElement>('.image-canvas');const img=this.dialog.querySelector<HTMLImageElement>('img');if(!stage||!canvas||!img)return;
    const x=(stage.scrollLeft+stage.clientWidth/2)/this.scale;const y=(stage.scrollTop+stage.clientHeight/2)/this.scale;
    this.scale=scale;img.style.width=`${this.baseWidth*scale}px`;img.style.height=`${this.baseHeight*scale}px`;
    canvas.style.width=`${Math.max(stage.clientWidth,this.baseWidth*scale)}px`;canvas.style.height=`${Math.max(stage.clientHeight,this.baseHeight*scale)}px`;
    stage.scrollLeft=x*scale-stage.clientWidth/2;stage.scrollTop=y*scale-stage.clientHeight/2;
    this.dialog.querySelector('output')!.textContent=`×${scale.toFixed(1)}`;
    (this.dialog.querySelector('[data-image-action="out"]') as HTMLButtonElement).disabled=scale<=1;
    (this.dialog.querySelector('[data-image-action="in"]') as HTMLButtonElement).disabled=scale>=4;
  }
}
