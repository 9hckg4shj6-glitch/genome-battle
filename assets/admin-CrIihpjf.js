import{c as q}from"./chunk-CGOna12K.js";const g=q("https://hfuixjjfhjjvvzcnlfhv.supabase.co","sb_publishable_zwSPabzGyB4IVd1ZycXsEQ_TB8J2aIr",{auth:{persistSession:!0,storageKey:"gb-admin-auth",autoRefreshToken:!0,detectSessionInUrl:!0}}),M=200,x=2e4;let _=null,T=!1,I;function H(){if(T)return;T=!0;const t=g.channel("presence:app");t.on("presence",{event:"sync"},()=>{_=Object.keys(t.presenceState()),clearTimeout(I),I=setTimeout(()=>{f()},1500)}).subscribe(e=>{e!=="SUBSCRIBED"&&(_=null)})}const d=document.querySelector("#admin");let u=null,h=null,p="",b=!1,w="",S=!1,$="online",L="";const l=t=>String(t??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),o=t=>t.toLocaleString("ja-JP"),v=t=>new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",...t}),y=v({month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}),R=v({hour:"numeric"}),k=v({month:"numeric",day:"numeric",weekday:"short"}),A=()=>v({year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date).replace(/\//g,"-");function N(t){const e=Math.max(0,(Date.now()-Date.parse(t))/1e3);return e<90?"いま":e<3600?`${Math.floor(e/60)}分前`:e<86400?`${Math.floor(e/3600)}時間前`:e<86400*30?`${Math.floor(e/86400)}日前`:y.format(new Date(t))}function m(){d.innerHTML=`<section class="login card">
    <h1>ログイン</h1>
    <form id="login-form" novalidate>
      <label class="field"><span>メールアドレス</span><input name="email" type="email" autocomplete="username" required /></label>
      <label class="field"><span>パスワード</span><input name="password" type="password" autocomplete="current-password" required /></label>
      <div role="status" class="error">${l(w)}</div>
      <button class="btn primary" ${S?"disabled":""}>ログイン</button>
    </form>
  </section>`}const P=t=>/invalid login credentials/i.test(t)?"メールアドレスかパスワードが違います。":/email not confirmed/i.test(t)?"メールアドレスの確認がまだです。":/rate limit|too many/i.test(t)?"試行が多すぎます。しばらく待ってからやり直してください。":"ログインできませんでした。通信を確認して、もう一度お試しください。";async function z(t){const e=new FormData(t),s=String(e.get("email")??"").trim().toLowerCase(),n=String(e.get("password")??"");if(w="",!s||!n){w="メールアドレスとパスワードを入力してください。",m();return}S=!0,m();try{const{data:a,error:r}=await g.auth.signInWithPassword({email:s,password:n});if(r)throw r;u=a.session}catch(a){w=P(a instanceof Error?a.message:String(a))}finally{S=!1}u?f():m()}let D=!1;async function f(){if(u){if(b){D=!0;return}H(),b=!0,h||(d.innerHTML='<p class="loading">読み込み中…</p>');try{const{data:t,error:e}=await g.rpc("get_admin_dashboard",{p_present:_});if(e)throw new Error(e.message);h=t,p=""}catch(t){const e=t instanceof Error?t.message:String(t);p=/ADMIN_ONLY/.test(e)?"ADMIN_ONLY":"最新の状況を取得できませんでした。前回の値を表示しています。"}finally{b=!1}j(),D&&(D=!1,f())}}const c=(t,e,s="",n=!1,a="")=>`<div class="tile ${n?"big":""}"><span>${t}</span><strong>${o(e)}${a?`<em>${a}</em>`:""}</strong>${s?`<small>${s}</small>`:""}</div>`;function E(t,e,s,n){const a=Math.max(1,...s.map(i=>i.value)),r=Math.max(1,Math.ceil(a/(a>10?5:1))*(a>10?5:1));return`<figure class="chart" id="${t}">
    <figcaption>${e}</figcaption>
    <div class="plot" role="img" aria-label="${l(e)}。最大 ${o(a)}${n}">
      <span class="y-top">${o(r)}</span><span class="y-zero">0</span>
      <div class="cols">${s.map(i=>`<div class="col" data-tip="${l(`${i.tip}：${o(i.value)}${n}`)}"><i style="height:${(100*i.value/r).toFixed(1)}%" class="${i.value?"":"zero"}"></i><b>${i.tick?l(i.label):""}</b></div>`).join("")}</div>
    </div>
    <details><summary>表で見る</summary><table><thead><tr><th>時刻</th><th>最大同時人数</th></tr></thead><tbody>${s.map(i=>`<tr><td>${l(i.tip)}</td><td>${o(i.value)}${n}</td></tr>`).join("")}</tbody></table></details>
  </figure>`}function B(t){const e=new Map(t.hourly.map(n=>[Date.parse(n.at),n.online])),s=new Date(t.server_now);return s.setUTCMinutes(0,0,0),Array.from({length:24},(n,a)=>{const r=new Date(s.getTime()-(23-a)*36e5),i=Number(R.format(r).replace(/\D/g,""));return{label:`${i}時`,tip:`${k.format(r)} ${i}時台`,value:e.get(r.getTime())??0,tick:i%3===0}})}function O(t){const e=new Map(t.daily.map(n=>[n.day,n.online])),s=new Date(`${A()}T12:00:00+09:00`);return Array.from({length:14},(n,a)=>{const r=new Date(s.getTime()-(13-a)*864e5),i=v({year:"numeric",month:"2-digit",day:"2-digit"}).format(r).replace(/\//g,"-");return{label:v({day:"numeric"}).format(r),tip:k.format(r),value:e.get(i)??0,tick:!0}})}const U={study:"学習中",ai:"AI対戦中",battle:"対人戦中"};function W(t){const e=Date.parse(`${A()}T00:00:00+09:00`),s=Date.now()-7*864e5,n=L.trim().toLowerCase();return t.users.filter(a=>($==="all"||($==="online"?a.online||a.present:$==="today"?Date.parse(a.last_seen)>=e:Date.parse(a.last_seen)>=s))&&(!n||a.name.toLowerCase().includes(n)||a.code.toLowerCase().includes(n)))}function C(t){const e=W(t),s=e.slice(0,500),n=s.map(a=>`<tr>
      <td class="name"><strong>${l(a.name)}</strong><small>${l(a.code)}</small></td>
      <td><span class="state ${a.online||a.activity?"on":a.present?"bg":""}"><i></i>${a.activity?U[a.activity]:a.online?"画面を表示中":a.present?"裏で開いている":"オフライン"}</span></td>
      <td data-label="最終利用">${l(N(a.last_seen))}</td>
      <td data-label="初回">${a.first_seen?l(y.format(new Date(a.first_seen))):"—"}</td>
      <td data-label="今日の解答" class="n">${o(a.answers_today)}</td>
      <td data-label="累計の解答" class="n">${o(a.answers)}</td>
      <td data-label="取り組んだ問題" class="n">${o(a.questions)}</td></tr>`).join("");return`<p class="muted users-count">${o(e.length)}人${e.length>s.length?`（先頭${s.length}人を表示）`:""}</p>
    ${s.length?`<div class="table-wrap"><table class="users"><thead><tr><th>名前</th><th>状態</th><th>最終利用</th><th>初回</th><th class="n">今日の解答</th><th class="n">累計の解答</th><th class="n">取り組んだ問題</th></tr></thead><tbody>${n}</tbody></table></div>`:'<p class="empty">該当する利用者はいません。</p>'}`}function j(){if(!u){m();return}if(p==="ADMIN_ONLY"){d.innerHTML='<section class="login card"><h1>表示できるページがありません</h1><p class="muted">このアカウントでは利用できません。</p><button class="btn" data-act="logout">ログアウト</button></section>';return}const t=h;if(!t){d.innerHTML=`<p class="loading">${l(p||"読み込み中…")}</p>`;return}const e=document.activeElement?.id==="user-search",s=t.presence??null,n=s?s.open:t.now.online,a=Math.round(100*n/M),r=Math.round(100*t.db.connections/t.db.max);if(d.innerHTML=`<header class="top">
      <div><p class="eyebrow">ADMIN</p><h1>ゲノム対戦 管理</h1></div>
      <div class="top-actions"><small class="muted">${b?"更新中…":`${l(y.format(new Date(t.server_now)))} 時点 · 20秒ごとに更新`}</small><button class="btn" data-act="refresh">更新</button><button class="btn ghost" data-act="logout">ログアウト</button></div>
    </header>
    ${p?`<p class="error" role="status">${l(p)}</p>`:""}
    <section class="tiles now">
      ${c("アプリを開いている",n,s?`画面を表示中 ${o(t.now.online)} · 裏で開いている ${o(s.background)}${s.open>s.matched?` · 名前の分からない端末 ${o(s.open-s.matched)}`:""}`:"接続中… いまは画面を表示中の端末だけ",!0)}
      ${c("学習中",t.now.studying)}${c("AI対戦中",t.now.ai)}${c("対人戦中",t.now.battle)}
    </section>
    <section class="card"><h2>利用した端末</h2><div class="tiles">
      ${c("直近1時間",t.active.h1)}${c("今日",t.active.today,`うち初めて ${o(t.active.new_today)}`)}${c("直近7日",t.active.d7,`うち初めて ${o(t.active.new_d7)}`)}${c("累計",t.active.total)}
    </div></section>
    <section class="card"><h2>今日の利用</h2><div class="tiles">
      ${c("学習の解答",t.today.answers,"",!1,"問")}${c("学習の開始",t.today.studies,"",!1,"回")}${c("AI対戦",t.today.ai,"",!1,"試合")}${c("対人戦",t.today.battles,"",!1,"試合")}
    </div></section>
    <section class="card"><h2>最大同時人数</h2>
      <p class="muted">${t.peak?`記録上の最大：<b>${o(t.peak.online)}人</b>（${l(y.format(new Date(t.peak.at)))}）`:"まだ記録がありません。"}${t.sampled_since?` · ${l(y.format(new Date(t.sampled_since)))}から記録`:""} · 画面を表示していた端末を1分ごとに記録しています（裏に回していた端末は含みません）</p>
      <div class="charts">${E("hourly","過去24時間（1時間ごとの最大）",B(t),"人")}${E("daily","過去14日（1日ごとの最大）",O(t),"人")}</div>
    </section>
    <section class="card"><h2>サーバーの余裕</h2>
      <div class="meters">
        <div class="meter"><span>リアルタイム接続（無料プランの上限 約${M}）</span><strong>${o(n)} / ${M}</strong><span class="bar ${a>=80?"warn":""}"><i style="width:${Math.min(100,a)}%"></i></span></div>
        <div class="meter"><span>データベース接続</span><strong>${o(t.db.connections)} / ${o(t.db.max)}</strong><span class="bar ${r>=80?"warn":""}"><i style="width:${Math.min(100,r)}%"></i></span></div>
      </div>
      <p class="muted">2026年10月13日の負荷テストでは、120端末の同時利用で失敗0件でした。オンラインが160人を超えるようなら、上限への備えを検討してください。</p>
    </section>
    <section class="card"><h2>利用者一覧</h2>
      <div class="user-tools">
        <div class="chips" role="group" aria-label="絞り込み">${["online","today","d7","all"].map(i=>`<button class="chip ${$===i?"on":""}" data-filter="${i}" aria-pressed="${$===i}">${{online:"開いている",today:"今日",d7:"7日以内",all:"すべて"}[i]}</button>`).join("")}</div>
        <input id="user-search" type="search" placeholder="名前・フレンドコードで検索" value="${l(L)}" />
      </div>
      <div id="users">${C(t)}</div>
      <p class="muted">名前はアプリで設定されたニックネーム（未設定は「ゲストプレイヤー」）です。「画面を表示中」は直近90秒にアプリを表示していた端末、「裏で開いている」はアプリを開いたまま別の画面に切り替えている端末です。1台の端末を1人として数えるため、スマホとPCを使い分ける人は2人と数えます。</p>
    </section>
    <div class="tip" id="tip" role="tooltip" hidden></div>`,e){const i=document.querySelector("#user-search");i?.focus(),i?.setSelectionRange(i.value.length,i.value.length)}}d.addEventListener("submit",t=>{const e=t.target;e.id==="login-form"&&(t.preventDefault(),z(e))});d.addEventListener("click",async t=>{const e=t.target.closest("[data-act],[data-filter]");if(!e)return;if(e.dataset.filter){$=e.dataset.filter,j();return}const s=e.dataset.act;s==="refresh"?f():s==="logout"&&(await g.auth.signOut(),u=null,h=null,p="",m())});d.addEventListener("input",t=>{const e=t.target;e.id==="user-search"&&h&&(L=e.value,document.querySelector("#users").innerHTML=C(h))});d.addEventListener("pointermove",t=>{const e=document.querySelector("#tip");if(!e)return;const s=t.target.closest(".col");if(!s){e.hidden=!0;return}e.textContent=s.dataset.tip??"",e.hidden=!1;const n=s.getBoundingClientRect();e.style.left=`${Math.min(window.innerWidth-e.offsetWidth-8,Math.max(8,n.left+n.width/2-e.offsetWidth/2))}px`,e.style.top=`${n.top+window.scrollY-e.offsetHeight-8}px`});d.addEventListener("pointerleave",()=>{const t=document.querySelector("#tip");t&&(t.hidden=!0)});setInterval(()=>{u&&document.visibilityState==="visible"&&f()},x);document.addEventListener("visibilitychange",()=>{u&&document.visibilityState==="visible"&&f()});g.auth.onAuthStateChange((t,e)=>{u=e,e||(h=null,m())});(async()=>(u=(await g.auth.getSession()).data.session,u?f():m()))();
