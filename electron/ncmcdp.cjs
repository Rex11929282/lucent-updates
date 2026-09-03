// 透過 Chrome DevTools Protocol 連進「以 --remote-debugging-port 啟動的網易雲 v3」，
// 掛上它原生的 PlayProgress / PlayState 事件，取得「即時精準播放進度」。不改檔、不裝外掛。
const http = require('http')
const WebSocket = require('ws')
const { normalizeCdpSnapshot } = require('../shared/songSwitch.cjs')
const { selectLyricCandidate, buildLyricSnapshot, effectiveLyricAlpha } = require('../shared/lyricMirror.cjs')
const { selectProgressInput, selectPlaybackProgress } = require('../shared/progressInput.cjs')

const SELECT_LYRIC_SOURCE = selectLyricCandidate.toString()
const BUILD_SNAPSHOT_SOURCE = buildLyricSnapshot.toString()
const EFFECTIVE_LYRIC_ALPHA_SOURCE = effectiveLyricAlpha.toString()
const SELECT_PROGRESS_SOURCE = selectProgressInput.toString()
const SELECT_PLAYBACK_SOURCE = selectPlaybackProgress.toString()

let ws = null
let connected = false
let timer = null
let onUpdate = null
let stopped = true
let directLyricEvents = 0
let lastDirectLyricAt = 0
const PORT = 9222

function emitSnapshot(snapshot) {
  if (onUpdate && snapshot && (snapshot.songId || snapshot.lyric || (Array.isArray(snapshot.vals) && snapshot.vals.length))) {
    onUpdate(snapshot)
  }
}

function parseBindingPayload(payload) {
  try {
    const raw = JSON.parse(String(payload || ''))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    return normalizeCdpSnapshot(raw)
  } catch { return null }
}

function getJson(port = PORT) {
  return new Promise((res, rej) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } })
    })
    req.on('error', rej)
    req.setTimeout(1500, () => req.destroy(new Error('timeout')))
  })
}

function buildHook() {
  return `(()=>{try{
    // 原生播放事件只是進度的加速來源；即使網易雲暫時拒絕註冊，也不能阻斷歌詞鏡像。
    if(!window.__lglHookedV6){
      try{
        if(typeof legacyNativeCmder!=='undefined'&&legacyNativeCmder&&typeof legacyNativeCmder.appendRegisterCall==='function'){
          legacyNativeCmder.appendRegisterCall('PlayProgress','audioplayer',(id,p)=>{
            window.__lglProgressSongId=String(id||''); window.__lglProgressSongAt=Date.now();
            window.__lglPos=p; window.__lglPosAt=Date.now();
          });
          legacyNativeCmder.appendRegisterCall('PlayState','audioplayer',(id,st)=>{
            window.__lglStateSongId=String(id||''); window.__lglState=String(st); window.__lglStateAt=Date.now();
            if(typeof window.lglReport==='function')window.lglReport(JSON.stringify({stateSongId:window.__lglStateSongId,playState:window.__lglState,stateAt:window.__lglStateAt}));
          });
        }
      }catch(e){}
      window.__lglHookedV6=true;
    }
    // 攔截網易雲自己的請求，取得「正在播的確切歌曲 ID」→ 歌詞永遠對得上
    if(!window.__lglIdHook){window.__lglIdHook=true;
      var grab=function(u){try{
        var s=String(u||'');
        if(/song\\/lyric|lyric\\/v1|song\\/detail/.test(s)){
          var m=s.match(/[?&]id=(\\d+)/);
          if(m && window.__lglSongId!==m[1]){
            window.__lglSongId=m[1];
            if(window.__lglSink) window.__lglSink(JSON.stringify({songId:m[1]}));
          }
        }
      }catch(e){}};
      var of=window.fetch;
      window.fetch=function(u){ grab(typeof u==='string'?u:(u&&u.url)); return of.apply(this,arguments); };
      var oo=XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open=function(m,u){ grab(u); return oo.apply(this,arguments); };
    }
    window.__lglScanKnownSongId=function(){try{
      var entries=performance.getEntriesByType('resource');
      for(var i=entries.length-1;i>=0;i--){
        var u=String(entries[i].name||'');
        if(!/song\\/lyric|lyric\\/v1|song\\/detail/.test(u))continue;
        var m=u.match(/[?&]id=(\\d+)/);
        if(m){window.__lglSongId=m[1];return m[1]}
      }
    }catch(e){}return null};
    if(!window.__lglSongId)window.__lglScanKnownSongId();
    window.__lglSelectLyric=${SELECT_LYRIC_SOURCE};
    window.__lglBuildLyricSnapshot=${BUILD_SNAPSHOT_SOURCE};
    window.__lglEffectiveLyricAlpha=${EFFECTIVE_LYRIC_ALPHA_SOURCE};
    window.__lglSelectProgress=${SELECT_PROGRESS_SOURCE};
    window.__lglSelectPlayback=${SELECT_PLAYBACK_SOURCE};
    window.__lglReportLyric=function(snapshot){try{
      if(snapshot&&typeof window.lglReport==='function')window.lglReport(JSON.stringify({requestSongId:window.__lglSongId||null,lyric:snapshot}));
    }catch(e){}};
    window.__lglReadLyric=function(){try{
      var inputs=Array.from(document.querySelectorAll('input'));
      var ranges=inputs.map(function(el){return {value:parseFloat(el.value),max:parseFloat(el.max)}});
      var position=window.__lglSelectPlayback(ranges,Number(window.__lglPos),Date.now()-Number(window.__lglPosAt||0));
      var rows=Array.from(document.querySelectorAll('.line')).map(function(el,index){
        var parts=[];
        el.querySelectorAll('div,p,span').forEach(function(n){
          if(n.children.length) return;
          var t=(n.textContent||'').trim();
          if(t&&parts.indexOf(t)<0) parts.push(t);
        });
        if(!parts.length){var all=(el.textContent||'').trim();if(all)parts.push(all)}
        var inner=el.querySelector('div,p,span')||el;
        var rowStyle=getComputedStyle(el);
        var innerStyle=getComputedStyle(inner);
        var col=innerStyle.color||'';
        var match=col.match(/rgba?\\(([^)]+)\\)/);
        var colorAlpha=match?parseFloat((match[1].split(',')[3]||'1')):1;
        var rowOpacity=parseFloat(rowStyle.opacity||'1');
        var textOpacity=parseFloat(innerStyle.opacity||'1');
        var alpha=window.__lglEffectiveLyricAlpha(colorAlpha,rowOpacity,textOpacity);
        var alphaKnown=(Number.isFinite(colorAlpha)&&colorAlpha<.999)
          ||(Number.isFinite(rowOpacity)&&rowOpacity<.999)
          ||(Number.isFinite(textOpacity)&&textOpacity<.999);
        var rawTime=el.getAttribute('data-time')||el.getAttribute('data-start-time')||el.getAttribute('data-start');
        var time=parseFloat(rawTime);
        if(Number.isFinite(time)&&time>10000)time/=1000;
        var aria=String(el.getAttribute('aria-current')||'').toLowerCase();
        return {index:index,main:parts[0]||'',sub:parts[1]||'',alpha:alpha,alphaKnown:alphaKnown,time:time,
          current:el.classList.contains('current'),ariaCurrent:aria==='true'||aria==='page'||aria==='step'};
      });
      var selected=window.__lglSelectLyric(rows,position);
      var readAt=Date.now();
      if(selected){
        var previous=window.__lglLyricSnapshot;
        var snapshot=window.__lglBuildLyricSnapshot(previous,selected,readAt);
        window.__lglLyricSnapshot=snapshot;
        if(snapshot!==previous) window.__lglReportLyric(snapshot);
      }
      window.__lglLyricReadAt=readAt;
      return window.__lglLyricSnapshot||null;
    }catch(e){return window.__lglLyricSnapshot||null}};
    window.__lglEnsureLyricObserver=function(){
      var root=document.querySelector('.line')?.parentElement||document.body;
      if(!root)return;
      if(window.__lglLyricRoot===root&&window.__lglLyricObserver)return;
      if(window.__lglLyricObserver)window.__lglLyricObserver.disconnect();
      window.__lglLyricRoot=root;
      window.__lglLyricObserver=new MutationObserver(function(){window.__lglReadLyric()});
      window.__lglLyricObserver.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','aria-current','data-time','data-start-time','data-start']});
    };
    window.__lglEnsureLyricObserver();
    window.__lglReadLyric();
    return 'ok'
  }catch(e){return 'err:'+(e&&e.message)}})()`
}

async function connect(port = PORT) {
  clearTimeout(timer)
  timer = null
  if (stopped) return
  try {
    const pages = await getJson(port)
    if (stopped) return
    const page = pages.find((p) => p.type === 'page') || pages[0]
    if (!page || !page.webSocketDebuggerUrl) throw new Error('no page')
    const socket = new WebSocket(page.webSocketDebuggerUrl)
    ws = socket
    let id = 0
    const send = (method, params) => socket.send(JSON.stringify({ id: ++id, method, params }))
    socket.on('open', () => {
      if (stopped || socket !== ws) { try { socket.close() } catch {}; return }
      send('Runtime.enable', {})
      send('Runtime.addBinding', { name: 'lglReport' })
      const hook = buildHook()
      send('Runtime.evaluate', { expression: hook })
      connected = true
      startPolling()
    })
    socket.on('message', (buf) => {
      if (stopped || socket !== ws) return
      let m; try { m = JSON.parse(buf.toString()) } catch { return }
      if (m.method === 'Runtime.bindingCalled' && m.params?.name === 'lglReport') {
        const snapshot = parseBindingPayload(m.params.payload)
        // Only count a lyric binding as live exact sync when it can be tied to
        // the active song. Unbound DOM leftovers are rejected by main anyway.
        if (snapshot?.lyric?.songId) {
          directLyricEvents += 1
          lastDirectLyricAt = Date.now()
        }
        emitSnapshot(snapshot)
        return
      }
      if (m.id === POLL_ID) {
        pollInFlight = false
        const v = m.result && m.result.result && m.result.result.value
        if (!v) return
        let d; try { d = JSON.parse(v) } catch { return }
        emitSnapshot(normalizeCdpSnapshot(d))
      }
    })
    socket.on('close', () => {
      if (socket !== ws) return
      connected = false
      ws = null
      stopPolling()
      if (!stopped) schedule(port)
    })
    socket.on('error', () => {
      if (socket !== ws) return
      connected = false
      ws = null
      stopPolling()
      try { socket.close() } catch {}
      if (!stopped) schedule(port)
    })
  } catch {
    connected = false
    if (!stopped) schedule(port)
  }
}

// 輪詢頁面變數取得播放位置 / 歌曲 ID（比 CDP binding 可靠：不受連線重建影響）
const POLL_ID = 987654
const POLL_INTERVAL_MS = 120
let pollTimer = null
let pollInFlight = false
function startPolling() {
  stopPolling()
  const poll = () => {
    if (pollInFlight) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    pollInFlight = true
    try {
      ws.send(JSON.stringify({
        id: POLL_ID,
        method: 'Runtime.evaluate',
        params: {
          // 進度來源：網易雲介面的進度條 input（value = 播放秒數）。
          // 實測這是唯一可用的來源：SMTC 位置永遠 0、PlayProgress 事件不觸發。
          // 可能有多個 input（音量等），全部回傳由主行程挑出「以 1x 速度前進」的那個。
          // 同時取得：播放進度(input) + 歌曲ID + 「網易雲畫面上正在高亮的那一句」。
          // 高亮句是最可靠的來源：它由網易雲自己決定，完全不需要我們算時間軸。
          expression: `(()=>{try{
            var vals=[]; var ranges=[];
            document.querySelectorAll('input').forEach(function(el){
              var v=parseFloat(el.value);
              if(!isNaN(v)) vals.push(v);
              ranges.push({value:v,max:parseFloat(el.max)});
            });
            var progressSec=window.__lglSelectPlayback&&ranges.length
              ?window.__lglSelectPlayback(ranges,Number(window.__lglPos),Date.now()-Number(window.__lglPosAt||0))
              :null;
            if(!window.__lglSongId&&window.__lglScanKnownSongId)window.__lglScanKnownSongId();
            var lastProgress=Number(window.__lglLastPollProgress);
            var seeked=Number.isFinite(progressSec)&&Number.isFinite(lastProgress)&&Math.abs(progressSec-lastProgress)>.8;
            window.__lglLastPollProgress=progressSec;
            if(Number.isFinite(progressSec))window.__lglPos=progressSec;
            var lyric=null;
            try{
              if(window.__lglEnsureLyricObserver)window.__lglEnsureLyricObserver();
              lyric=window.__lglLyricSnapshot||null;
              if((!lyric||seeked||Date.now()-Number(window.__lglLyricReadAt||0)>180)&&window.__lglReadLyric)lyric=window.__lglReadLyric();
            }catch(e){}
            return JSON.stringify({
              vals:vals,
              progressSec:progressSec,
              progressSongId:window.__lglProgressSongId||null,
              progressAt:window.__lglProgressSongAt||0,
              stateSongId:window.__lglStateSongId||null,
              playState:window.__lglState||null,
              stateAt:window.__lglStateAt||0,
              requestSongId:window.__lglSongId||null,
              lyric:lyric
            });
          }catch(e){return JSON.stringify({vals:[]})}})()`,
          returnByValue: true,
        },
      }))
    } catch { pollInFlight = false }
  }
  poll()
  pollTimer = setInterval(poll, POLL_INTERVAL_MS)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  pollInFlight = false
}

function schedule(port = PORT) {
  clearTimeout(timer)
  if (stopped) return
  timer = setTimeout(() => connect(port), 3000)
}

// 用網易雲自己的登入態抓「逐字歌詞 YRC」（必須帶 yv=1；套件的 lyric_new 抓不到）
let evalId = 100000
function fetchYrc(songId) {
  return new Promise((resolve) => {
    if (!ws || !connected) return resolve('')
    const id = ++evalId
    const expr = `(async()=>{try{
      const r = await fetch('https://music.163.com/api/song/lyric/v1?id=${songId}&cp=false&tv=0&lv=0&rv=0&kv=0&yv=1&ytv=0&yrv=0',{credentials:'include'});
      const j = await r.json();
      return (j.yrc && j.yrc.lyric) || '';
    }catch(e){ return '' }})()`
    const onMsg = (buf) => {
      let m; try { m = JSON.parse(buf.toString()) } catch { return }
      if (m.id === id) {
        ws.removeListener('message', onMsg)
        resolve((m.result && m.result.result && m.result.result.value) || '')
      }
    }
    ws.on('message', onMsg)
    try {
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
    } catch { ws.removeListener('message', onMsg); resolve('') }
    setTimeout(() => { try { ws.removeListener('message', onMsg) } catch {} ; resolve('') }, 6000)
  })
}

function start(cb, options = {}) {
  stop()
  onUpdate = cb
  directLyricEvents = 0
  lastDirectLyricAt = 0
  stopped = false
  connect(options.port || PORT)
}
function stop() {
  stopped = true
  clearTimeout(timer)
  timer = null
  stopPolling()
  onUpdate = null
  const socket = ws
  ws = null
  connected = false
  if (socket) { try { socket.close() } catch {} }
}
function isConnected() { return connected }
function getStatus() {
  return { connected, directLyricEvents, lastDirectLyricAt }
}

module.exports = { start, stop, isConnected, getStatus, fetchYrc, parseBindingPayload, buildHook, PORT }
