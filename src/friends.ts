import {call,type MatchState} from './api';
import {esc,icon} from './ui';
interface Friend {id:string;code:string;name:string;online?:boolean;}
interface Invite {id:string;name:string;is_private:boolean;field?:string|null;q_total?:number;player_count:number;capacity:number;}
export interface FriendState {profile:{code:string;name:string};friends:Friend[];incoming:Friend[];outgoing:Friend[];invites:Invite[];}
const messages:Record<string,string>={FRIEND_NOT_FOUND:'そのフレンドコードは見つかりません。',FRIEND_SELF:'自分のコードは追加できません。',FRIEND_LIMIT:'フレンド・申請は100人までです。',FRIEND_ACTION_DENIED:'この申請は承認できません。更新してください。',FRIEND_NOT_ACCEPTED:'承認済みのフレンドを選んでください。',FRIEND_ALREADY_IN_ROOM:'そのフレンドは参加済みです。',FRIEND_INVITE_EXPIRED:'招待の期限が切れたか、部屋が開始・終了しました。',ROOM_FULL:'部屋が満員です。',ROOM_NOT_FOUND:'部屋が開始・終了しました。',HOST_ONLY:'部屋の作成者だけが招待できます。'};
export class FriendsController {
  state:FriendState|null=null;
  private dialog=document.createElement('dialog');
  private loading=false;private mutating=false;private lastFetch=0;private notice='';private error='';
  constructor(private device:string,private name:()=>string,private setName:(name:string)=>void,private room:()=>MatchState|null,private joined:(s:MatchState)=>void) {
    this.dialog.className='friends-dialog';this.dialog.setAttribute('aria-label','フレンド');document.body.append(this.dialog);
    this.dialog.addEventListener('cancel',()=>this.close());
    this.dialog.addEventListener('click',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-friend-action]');if(el)void this.act(el.dataset.friendAction!,el.dataset.id??'');});
    this.dialog.addEventListener('keydown',e=>{if(e.key==='Enter' && (e.target as HTMLElement).id==='friend-add-code'){e.preventDefault();void this.act('request','');}});
  }
  badge():number {return (this.state?.incoming.length??0)+(this.state?.invites.length??0);}
  private updateBadge():void {const b=document.querySelector('#friends-badge');if(b){b.textContent=String(this.badge());b.toggleAttribute('hidden',!this.badge());}}
  open():void {
    if(this.dialog.open)return;
    this.notice='';this.error='';
    this.dialog.innerHTML=`<div class="friends-heading"><div><p class="eyebrow">FRIENDS</p><h1>フレンド</h1></div><button class="btn ghost" data-friend-action="close" aria-label="フレンドを閉じる">閉じる</button></div><p class="friend-help">フレンドコードで申請し、相手が承認すると一緒に対戦できます。</p><section class="friend-profile"><label class="field"><span>フレンドに表示する名前</span><input id="friend-name" maxlength="12" value="${esc(this.name()||this.state?.profile.name||'')}" autocomplete="nickname"/></label><button class="btn" data-friend-action="name">名前を保存</button><label class="field friend-code"><span>あなたのフレンドコード</span><input id="friend-own-code" value="${esc(this.state?.profile.code??'取得中…')}" readonly/></label><button class="btn" data-friend-action="copy">コードをコピー</button></section><div class="friend-add"><label class="field"><span>相手のフレンドコード</span><input id="friend-add-code" maxlength="20" placeholder="10文字のコード" autocapitalize="characters" autocomplete="off"/></label><button class="btn primary" data-friend-action="request">申請する</button></div><div id="friends-notice" role="status"></div><div class="friends-refresh"><small>このブラウザのプレイヤーに紐づきます · 約10秒ごとに更新</small><button class="btn ghost" data-friend-action="refresh">更新</button></div><div id="friends-lists"></div>`;
    this.update();this.dialog.showModal();void this.refresh(true);
  }
  close():void {this.dialog.close();}
  async refresh(force=false):Promise<void> {
    if(this.loading || this.mutating || (!force && Date.now()-this.lastFetch<(this.dialog.open?10000:30000)))return;
    if(!force && document.visibilityState!=='visible')return;
    this.loading=true;this.lastFetch=Date.now();
    try {this.state=await call<FriendState>('friend_sync',{p_device:this.device,p_name:this.name()||null});this.error='';}
    catch {this.error='フレンドを取得できませんでした。通信を確認して更新してください。';}
    finally {this.loading=false;this.update();}
  }
  update():void {
    this.updateBadge();if(!this.dialog.open && !this.dialog.innerHTML)return;
    const code=this.dialog.querySelector<HTMLInputElement>('#friend-own-code');if(code && this.state)code.value=this.state.profile.code;
    const notice=this.dialog.querySelector('#friends-notice');if(notice){notice.className=this.error?'error':'friend-notice';notice.textContent=this.error||this.notice;}
    const lists=this.dialog.querySelector('#friends-lists');if(!lists)return;
    const s=this.state;if(!s){lists.innerHTML='<p>フレンド一覧を読み込んでいます…</p>';return;}
    const button=(action:string,id:string,label:string)=>`<button class="btn ${action==='accept' || action==='join'?'primary':'ghost'}" data-friend-action="${action}" data-id="${esc(id)}" ${this.mutating?'disabled':''}>${label}</button>`;
    const row=(f:Friend,actions:string)=>`<li><div><strong>${esc(f.name)}</strong><small>${esc(f.code)}${f.online!==undefined?` · ${f.online?'オンライン':'オフライン'}`:''}</small></div><div class="friend-row-actions">${actions}</div></li>`;
    const room=this.room();const canInvite=room?.status==='waiting' && room.code && room.my_seat===room.host_seat;
    lists.innerHTML=`${s.invites.length?`<section><h2>対戦室への招待 ${s.invites.length}件</h2><ul class="friend-list">${s.invites.map(i=>`<li><div><strong>${esc(i.name)}からの招待</strong><small>${i.is_private?'鍵付き':'公開'}ルーム · ${esc(i.field||'すべての分野')}${i.q_total?` · 最大${i.q_total}問`:''} · ${i.player_count}/${i.capacity}人</small></div><div class="friend-row-actions">${button('join',i.id,'参加する')}${button('dismiss',i.id,'辞退')}</div></li>`).join('')}</ul></section>`:''}
      <section><h2>届いた申請 ${s.incoming.length}件</h2>${s.incoming.length?`<ul class="friend-list">${s.incoming.map(f=>row(f,button('accept',f.id,'承認')+button('remove',f.id,'拒否'))).join('')}</ul>`:'<p class="friend-empty">届いた申請はありません。</p>'}</section>
      <section><h2>フレンド ${s.friends.length}人</h2><p class="friend-help">${canInvite?'この部屋へフレンドを招待できます。':'対戦室を作成し、待機中にフレンドを招待できます。'}</p>${s.friends.length?`<ul class="friend-list">${s.friends.map(f=>row(f,(canInvite?button('invite',f.code,'この部屋に招待'):'')+button('remove',f.id,'解除'))).join('')}</ul>`:'<p class="friend-empty">コードを交換して、フレンドを追加しましょう。</p>'}</section>
      ${s.outgoing.length?`<section><h2>承認待ち ${s.outgoing.length}件</h2><ul class="friend-list">${s.outgoing.map(f=>row(f,button('remove',f.id,'申請を取り消す'))).join('')}</ul></section>`:''}`;
  }
  private async act(action:string,id:string):Promise<void> {
    if(action==='close'){this.close();return;}if(this.mutating)return;
    if(action==='refresh'){await this.refresh(true);return;}
    this.error='';this.notice='';
    if(action==='copy'){
      try {if(!this.state)throw new Error();await navigator.clipboard.writeText(this.state.profile.code);this.notice='フレンドコードをコピーしました。';}
      catch {this.error='コピーできませんでした。コードを選択してコピーしてください。';}this.update();return;
    }
    this.mutating=true;this.update();
    try {
      if(!this.state)this.state=await call<FriendState>('friend_sync',{p_device:this.device,p_name:this.name()||null});
      if(action==='name'){
        const name=this.dialog.querySelector<HTMLInputElement>('#friend-name')!.value.trim();if(!name)throw new Error('名前を入力してください。');
        this.state=await call<FriendState>('friend_sync',{p_device:this.device,p_name:name});this.setName(name);this.notice='表示名を保存しました。';
      }else if(action==='request'){
        const code=this.dialog.querySelector<HTMLInputElement>('#friend-add-code')!.value.trim();if(!/^[a-f\d\s-]{10,20}$/i.test(code))throw new Error('10文字のフレンドコードを入力してください。');
        this.state=await call<FriendState>('friend_request',{p_device:this.device,p_code:code});this.notice='申請を送信しました。届いた申請・承認済みの相手も一覧に表示されます。';this.dialog.querySelector<HTMLInputElement>('#friend-add-code')!.value='';
      }else if(action==='accept'||action==='remove'){
        this.state=await call<FriendState>('friend_respond',{p_device:this.device,p_friendship:id,p_action:action});this.notice=action==='accept'?'フレンド申請を承認しました。':'一覧から外しました。';
      }else if(action==='invite'){
        const m=this.room();if(!m)throw new Error('対戦室を作成してください。');await call('invite_friend',{p_device:this.device,p_code:id,p_match:m.id});this.notice='フレンドにこの部屋の招待を送信しました。';
      }else if(action==='dismiss'){
        this.state=await call<FriendState>('dismiss_friend_invite',{p_device:this.device,p_invite:id});
      }else if(action==='join'){
        const s=await call<MatchState>('join_friend_invite',{p_device:this.device,p_invite:id,p_name:this.name()||this.state.profile.name});this.state.invites=this.state.invites.filter(i=>i.id!==id);this.close();this.joined(s);
      }
    }catch(e){const message=e instanceof Error?e.message:'';this.error=Object.entries(messages).find(([code])=>message.includes(code))?.[1] || (message.endsWith('。')?message:'通信できませんでした。接続を確認し、更新してください。');}
    finally{this.mutating=false;this.update();}
  }
}
export const friendsIcon=():string=>icon('user');
