import { call, serverNow, type ReviewItem } from './api';
import { esc, richText, icon, readStore, writeStore, notebook, recordMiss, reviewCard, uncertainButton, type Question } from './ui';
import { reviewCourse, renderReviewCourse } from './learning';
export type SoloMode = 'study' | 'ai';
export type Difficulty = 'easy' | 'normal' | 'hard';
interface SoloState {
  id: string; mode: SoloMode; difficulty: Difficulty; q_index: number; q_total: number; q_id: string;
  phase: 'question' | 'reveal' | 'finished'; answer_seconds: number; phase_ends_at: string | null;
  my_choice: number | null; my_score: number; ai_score: number; ai_mark: 'o'|'x'|null;
  winner: 'me'|'ai'|null; reveal: {answer:number;explanation:string}|null; version:number;
}
export const difficultyName: Record<Difficulty,string> = {easy:'ビギナー',normal:'スタンダード',hard:'エキスパート'};
export class SoloController {
  state: SoloState | null = null;
  busy=false; error=''; reviewing=false; review: ReviewItem[]=[];
  reviewLoaded=false; reviewLoading=false; course=false;
  private reviewPromise:Promise<void>|null=null;
  private ticking=false; private lastTick=0; private generation=0;
  constructor(private device: string, private questions: Map<string,Question>, private changed:()=>void, private name:()=>string, private finished:()=>void) {}
  get active(): boolean { return this.state !== null; }
  async start(mode: SoloMode, ids: string[], seconds: number, difficulty: Difficulty, course=false): Promise<void> {
    const generation=++this.generation;
    const s=await call<SoloState>('start_solo',{p_device:this.device,p_mode:mode,p_ids:ids,p_seconds:seconds,p_difficulty:difficulty});
    if (generation !== this.generation) return;
    this.busy=false; this.review=[]; this.reviewing=false; this.reviewLoaded=false; this.reviewLoading=false; this.reviewPromise=null; this.course=course; this.error='';
    writeStore('gb.solo-course',course?JSON.stringify({id:s.id}):null,sessionStorage); this.apply(s);
    writeStore('gb.solo',s.id,sessionStorage);
  }
  async resume(): Promise<void> {
    const id=readStore('gb.solo',sessionStorage); if (!id) return;
    try {
      const s=await call<SoloState>('get_solo',{p_session:id,p_device:this.device});
      try {this.course=JSON.parse(readStore('gb.solo-course',sessionStorage) ?? 'null')?.id===s.id;}
      catch {this.course=false;writeStore('gb.solo-course',null,sessionStorage);}
      this.apply(s);
    }
    catch { writeStore('gb.solo',null,sessionStorage); }
  }
  stop(): void { this.generation++; this.state=null; this.busy=false; this.error=''; this.reviewing=false; this.reviewLoaded=false; this.reviewLoading=false; this.reviewPromise=null; this.course=false; writeStore('gb.solo',null,sessionStorage); writeStore('gb.solo-course',null,sessionStorage); }
  private apply(s:SoloState):void {
    if (this.state?.id===s.id && this.state.version>s.version) return;
    const same=this.state?.id===s.id && this.state.version===s.version;
    this.state=s;
    if (s.phase==='reveal' && s.reveal && s.my_choice!==null && s.my_choice!==s.reveal.answer)
      recordMiss(`${s.id}:${s.q_index}`,{id:s.q_id,answer:s.reveal.answer,explanation:s.reveal.explanation,my_choice:s.my_choice});
    if (s.phase==='finished') {
      if (s.mode==='study') writeStore('gb.solo',null,sessionStorage);
      if (!same) {this.finished();void this.loadReview();}
    }
    if (!same) this.changed();
  }
  currentReviewItem():ReviewItem|null {
    const s=this.state;
    return s?.phase==='reveal' && s.reveal?{id:s.q_id,answer:s.reveal.answer,explanation:s.reveal.explanation,my_choice:s.my_choice}:null;
  }
  async loadReview():Promise<void> {
    const s=this.state; if (!s || s.phase!=='finished' || this.reviewLoaded) return;
    if (this.reviewPromise) return this.reviewPromise;
    const generation=this.generation; this.reviewLoading=true; this.error=''; this.changed();
    this.reviewPromise=(async()=>{
      try {
        const items=await call<ReviewItem[]|null>('review_solo',{p_session:s.id,p_device:this.device});
        if (generation!==this.generation || this.state?.id!==s.id) return;
        if (!items) throw new Error('REVIEW_UNAVAILABLE');
        this.review=items;this.reviewLoaded=true;
      } catch(e) {if (generation===this.generation) this.error=this.message(e);}
      finally {if (generation===this.generation) {this.reviewLoading=false;this.reviewPromise=null;this.changed();}}
    })();
    return this.reviewPromise;
  }
  private message(e:unknown):string {
    return e instanceof Error && e.message.includes('SOLO_NOT_FOUND') ? 'このセッションは見つかりません。ホームからやり直してください。' : '通信できませんでした。接続を確認して、もう一度お試しください。';
  }
  async act(action:'answer'|'next'|'review',choice?:number):Promise<void> {
    const s=this.state; if (!s || this.busy) return;
    if (action==='answer' && (s.phase!=='question' || s.my_choice!==null)) return;
    const generation=this.generation;
    this.busy=true; this.error=''; this.changed();
    try {
      const args={p_session:s.id,p_device:this.device};
      if (action==='review') {
        await this.loadReview();
        if (generation!==this.generation) return;
        if (this.reviewLoaded) this.reviewing=true;
      } else {
        const next=await call<SoloState>(action==='next'?'next_solo':'answer_solo',{...args,p_q_index:s.q_index,...(action==='answer'?{p_choice:choice}:{})});
        if (generation!==this.generation) return;
        this.apply(next);
      }
    } catch(e) { if (generation===this.generation) this.error=this.message(e); }
    finally { if (generation===this.generation) {this.busy=false; this.changed();} }
  }
  async tick():Promise<void> {
    const s=this.state;
    if (!s || s.mode!=='ai' || s.phase!=='question' || this.ticking || this.busy || Date.now()-this.lastTick<1000) return;
    const generation=this.generation; this.ticking=true; this.lastTick=Date.now();
    try {
      const next=await call<SoloState>('get_solo',{p_session:s.id,p_device:this.device});
      if (generation===this.generation) {this.error=''; this.apply(next);}
    } catch(e) { if (generation===this.generation) {this.error=this.message(e); this.changed();} }
    finally {this.ticking=false;}
  }
  updateClock():void {
    const s=this.state; if (!s?.phase_ends_at) return;
    const seconds=Math.max(0,(Date.parse(s.phase_ends_at)-serverNow())/1000);
    document.querySelectorAll('[data-solo-count]').forEach(e=>e.textContent=String(Math.ceil(seconds)));
    document.querySelectorAll<HTMLElement>('[data-solo-bar]').forEach(e=>{e.style.width=`${Math.min(100,100*seconds/s.answer_seconds)}%`;e.classList.toggle('low',seconds<=5);});
  }
  retryIds():string[] {return reviewCourse(this.review).ids;}
  render():string {
    const s=this.state; if (!s) return '';
    const notice=this.error?`<p class="error" role="alert">${esc(this.error)}</p>`:'';
    if (this.reviewing) return `<header class="hero small"><p class="eyebrow">SESSION REVIEW</p><h1>解説を振り返る</h1><p class="lead">理解を深めて、次の一問へ。</p></header>${renderReviewCourse(this.review,s.mode==='ai'?'battle-retry':'solo-retry',this.reviewLoaded,this.reviewLoading,s.mode==='ai'?'対戦直後の復習コース':'間違えた・迷った問題を復習')}${this.review.map((r,i)=>this.renderReview(r,i)).join('')}${notice}<div class="panel actions"><button class="btn" data-act="leave">ホームへ戻る</button></div>`;
    if (s.phase==='finished') {
      const ai=s.mode==='ai'; const win=s.my_score>s.ai_score;
      return `<section class="panel center result-panel"><div class="result-icon">${icon(ai?'trophy':'check')}</div><p class="eyebrow">${ai?'BATTLE COMPLETE':'SESSION COMPLETE'}</p><h1>${ai?(win?'あなたの勝利！':s.my_score===s.ai_score?'引き分け！':'AIの勝利'):'学習、おつかれさまでした。'}</h1><p class="lead">${ai?`${difficultyName[s.difficulty]}との対戦`:'一問ずつ、知識が積み重なっています。'}</p><div class="result-score"><strong>${s.my_score}</strong><span>${ai?`点 / AI ${s.ai_score}点`:`/ ${s.q_index+1} 問正解`}</span></div>${ai?renderReviewCourse(this.review,'battle-retry',this.reviewLoaded,this.reviewLoading):''}<button class="btn ${ai?'':'primary'}" data-act="solo-review" ${this.busy?'disabled':''}>${icon('book')}正解と解説を振り返る</button><button class="btn" data-act="solo-again">もう一度${ai?'対戦':'学習'}する</button><button class="btn ghost" data-act="leave">ホームへ戻る</button>${notice}</section>`;
    }
    const q=this.questions.get(s.q_id); if (!q) return '<p role="alert">問題を読み込めませんでした。ホームへ戻ってください。</p>';
    const reveal=s.reveal; const locked=s.phase!=='question' || s.my_choice!==null || this.busy;
    const ai=s.mode==='ai';
    return `<div class="session-label"><span class="tag">${icon(ai?'bot':'book')}${ai?'AI対戦 · '+difficultyName[s.difficulty]:(this.course?'対戦直後の復習':'一人で学習')}</span><span>${ai?'5問先取':'自分のペースで'}</span></div>
      ${ai?`<div class="duel"><div><span class="avatar">${icon('user')}</span><span>${esc(this.name()||'あなた')}</span><b>${s.my_score}</b></div><span class="versus">VS</span><div><span class="avatar ai">${icon('bot')}</span><span>GENOME AI</span><b>${s.ai_score}</b></div></div>`:`<div class="study-score">${icon('check')}ここまで ${s.my_score} 問正解</div>`}
      <div class="qhead"><span>第${s.q_index+1}問 <small>/ ${s.q_total}問</small></span><span class="tag">${esc(q.field)}</span>${ai && s.phase==='question'?'<span class="clock"><span data-solo-count></span>秒</span>':''}</div>
      <div class="timer"><i ${ai && s.phase==='question'?'data-solo-bar':`style="width:${100*(s.q_index+1)/s.q_total}%"`}></i></div>
      <section class="question"><p>${esc(q.question)}</p>${q.image?`<img src="${import.meta.env.BASE_URL}${q.image}" alt="${esc(q.imageAlt??'問題の図')}"/>`:''}</section>
      <ol class="choices">${q.choices.map((c,i)=>`<li><button class="choice ${reveal?.answer===i?'correct':''} ${s.my_choice===i?'mine':''} ${s.my_choice===i && reveal && reveal.answer!==i?'wrong':''}" data-solo-choice="${i}" ${locked?'disabled':''}><span class="num">${i+1}</span><span>${esc(c)}</span>${reveal?.answer===i?icon('check'):''}</button></li>`).join('')}</ol>
      ${reveal?`<section class="reveal ${s.winner==='me'?'win':''}"><p class="banner">${ai?(s.winner==='me'?'あなたが先に正解！':s.winner==='ai'?'AIが先に正解':'正解者なし'):(s.my_choice===reveal.answer?'正解！':'もう一度、確認しよう。')}</p><div class="expl">${richText(reveal.explanation)}</div><div class="confidence-actions">${uncertainButton({id:s.q_id,answer:reveal.answer,explanation:reveal.explanation,my_choice:s.my_choice})}</div><button class="btn primary" data-act="solo-next" ${this.busy?'disabled':''}>${s.q_index+1===s.q_total || (ai && Math.max(s.my_score,s.ai_score)>=5)?'結果を見る':'次の問題へ'}${icon('arrow')}</button></section>`:(s.my_choice!==null?'<p class="note">お手つき。AIの解答を待っています…</p>':ai && s.ai_mark==='x'?'<p class="note">AIがお手つき。まだ解答できます。</p>':'')}${notice}`;
  }
  private renderReview(r:ReviewItem,i:number):string {
    const q=this.questions.get(r.id); if (!q) return '';
    return reviewCard(q,r,`第${i+1}問 · ${esc(q.field)}`,!!notebook().saved[r.id]);
  }
}
