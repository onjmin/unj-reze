(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,59911,t=>{t.q("/unj-reze/_next/static/media/voice-worker.0-2eet5p8gboy.js")},62055,t=>{"use strict";let e,o,a,r,A,n;async function l(t){let e=await fetch(`https://rpgen3.github.io/soundfont/list/${t}.txt`);return(await e.text()).trim().split("\n")}async function u(){let t={};try{(await l("fontName_surikov")).forEach(e=>{let[o,...a]=e.split(" ");t[a.join(" ")]=o})}catch(t){console.error("Failed to build name-to-key mapping:",t)}return t}var i,s,d,c,g,m,p,C=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],B=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],h=t=>(t%12+12)%12,E=(t,e=!1)=>(e?B:C)[h(t)],f=class extends Error{constructor(t,e){super(`SyntaxError: ${e}
input.idx: ${t.idx}
input.str: ${t.str}`),this.name="ChordSyntaxError"}},Q=(t,e)=>{throw new f(t,e)},I=class t{static nums=new Set("0123456789");str;nest;idx;constructor(t,e=0){this.str=t,this.nest=e,this.idx=0}get isEOF(){return this.str.length<=this.idx}get char(){return this.str[this.idx]}get num(){let e="";for(;!this.isEOF;){let o=this.char;if(!t.nums.has(o))break;e+=o,this.idx++}return e.length?Number(e):null}slice(t){return this.str.slice(this.idx,this.idx+t)}},v=class{pitch=null;chord=null;isChord=!1;pending=null;nest=-1;get value(){let{pitch:t,chord:e}=this;return new Set([...e].map(e=>e+t))}set value(t){let e=this.pitch;this.chord=new Set([...t].map(t=>t-e))}},y=class{map=new Map;lengths=[];_set(t,e){this.map.set(t,e),this.lengths.includes(t.length)||(this.lengths.push(t.length),this.lengths.sort((t,e)=>e-t))}set(t,e){if(Array.isArray(t))for(let o of t)this._set(o,e);else this._set(t,e)}parse(t){for(let e of this.lengths){let o=t.slice(e);if(this.map.has(o))return t.idx+=o.length,this.map.get(o)}return null}},b=new y;b.set("(",0),b.set(")",1),b.set(",",2),b.set(["/","on"],3);var w=(t,e=new v,o=0)=>{let a=t.idx,r=r=>{let A=t.str.slice(a,r);A.length&&F(new I(A,o),e)};for(;;){let{idx:A}=t;if(t.isEOF)return o&&Q(t,`Unclosed ${o} brackets`),r(A),e;let n=b.parse(t);if(null===n){t.idx++;continue}let{pending:l}=e;switch(r(A),n){case 0:w(t,e,o+1);break;case 1:return o-1<0&&Q(t,"Unable to close brackets"),e;case 2:e.pending=l;break;case 3:{let a=w(t,new v,o),r=[...e.value];if(a.isChord)e.value=[...a.value].concat(r);else{let t=r.sort((t,e)=>t-e),o=(a.pitch+3)%12-3;if(t[0]<o)for(;t[0]<o;)t.push(t.shift()+12);else for(;;){let e=t[t.length-1]-12;if(e<o)break;t.pop(),t.unshift(e)}t.push(o),e.value=t}}}a=t.idx}},F=(t,e)=>t.isEOF?e:null===e.pitch?R(t,e):null===e.pending?O(t,e):G(t,e),x=new y,k=new y;for(let t of[x,k])t.set(["#","♯"],1),t.set(["b","♭"],-1);x.set("+",1),x.set("-",-1);var D=(t,e=!1)=>(e?k:x).parse(t),M=[0,2,4,5,7,9,11];for(let t of[...M.keys()])M.push(M[t]+12);var S=t=>M[t-1],L=new y;for(let[t,e]of[..."CDEFGAB"].entries())L.set(e,M[t]);var R=(t,e)=>{let o=L.parse(t);null===o&&Q(t,"Not found pitch"),e.pitch=o;let a=D(t,!0);return null!==a&&(e.pitch+=a),J(t,e)},N=[0,4,7],T=[0,3,6],U=new y;U.set(["m","min","Min","minor","Minor","-"],[0,3,7]),U.set(["dim","〇"],T),U.set("+",[0,4,8]),U.set(["Φ","φ","ø"],[0,3,6,10]);var J=(t,e)=>{let o=/^maj/i.test(t.str.slice(t.idx))?null:U.parse(t);if(null!==o&&(e.isChord=!0),e.chord=new Set(o||N),o===T){let{num:o}=t,a=e.chord;null!==o&&a.add(S(o)-2)}return e.nest=t.nest,F(t,e)},P=(t,e,o)=>{t.add(S(e)+o)},K=t=>{t.delete(S(5)),t.add(S(5)+1)},Y=(t,e,o,a=!1)=>{5===e?t.delete(S(3)):6===e?t.add(S(6)):69===e?t.add(S(6)).add(S(9)):(e>=7&&t.add(S(7)+(a?-1:0)),e>=9&&t.add(S(9)),e>=11&&t.add(S(11)),e>=13&&t.add(S(13)))},H=new y;H.set("add",P),H.set(["omit","no"],(t,e,o)=>{t.delete(S(e)+o)}),H.set("sus",(t,e,o)=>{t.delete(S(3)),t.add(S(e)+o)}),H.set(["M","maj","Maj","major","Major","△","Δ"],Y),H.set("aug",K);var O=(t,e)=>{e.isChord||(e.isChord=!0);let o=H.parse(t),a=e.chord;if(null===o){let o="+"===t.char,r=D(t),{num:A}=t;if(null===A&&(o?K(a):Q(t,"Not found number")),null===r)t.nest===e.nest?Y(a,A,0,!0):P(a,A,0);else a.delete(S(A)),a.add(S(A)+r)}else o===K?K(a):e.pending=o;return F(t,e)},G=(t,e)=>{let o=D(t),{num:a}=t,{pending:r,chord:A}=e;return null===a&&Q(t,"Not found number"),r(A,a,null===o?0:o),e.pending=null,F(t,e)},V=t=>{let e=w(new I(t)),o=[...e.value].sort((t,e)=>t-e),a=[...e.chord].sort((t,e)=>t-e),r=[...new Set(o.map(h))].sort((t,e)=>t-e);return{symbol:t,root:h(e.pitch),notes:o,pitchClasses:r,intervals:a}},q=["","m","7","M7","m7","dim","m7b5","aug","6","m6","sus4","sus2","mM7","dim7","7sus4","7#5","add9","madd9","9","M9","m9","69","m69","5"].map((t,e)=>({quality:t,pitchClasses:V(`C${t}`).pitchClasses,priority:e}));let z=new Map;for(let t of q){let e=t.pitchClasses.join(",");z.has(e)||z.set(e,t)}var X=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],W=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17],j=t=>t.reduce((t,e)=>t+e,0)/t.length,Z=(t,e)=>{let o=j(t),a=j(e),r=0,A=0,n=0;for(let l=0;l<t.length;l++){let u=t[l]-o,i=e[l]-a;r+=u*i,A+=u*u,n+=i*i}let l=Math.sqrt(A*n);return 0===l?0:r/l},$=(t,e,o)=>`${E(t,o)} ${e}`,_=t=>({tonic:t.tonic,mode:t.mode,name:t.name}),tt=(t,e)=>t.tonic===e.tonic&&t.mode===e.mode,te=(t,e,o)=>{let a=Array(12).fill(0);for(let r of t){if(r.duration<=0){r.when>=e&&r.when<o&&(a[h(r.pitch)]+=1);continue}let t=Math.max(r.when,e),A=Math.min(r.when+r.duration,o)-t;A>0&&(a[h(r.pitch)]+=A)}return a},to=(t,e)=>{let o=[];for(let a=0;a<12;a++)for(let r of["major","minor"]){let A="major"===r?X:W,n=t.map((t,e)=>A[h(e-a)]);o.push({tonic:a,mode:r,name:$(a,r,e),score:Z(t,n)})}return o.sort((t,e)=>e.score-t.score),o},ta=t=>{let e=[];for(let o of t){let t=e[e.length-1];t&&tt(t.key,o.key)?t.duration=o.when+o.duration-t.when:e.push({...o})}return e},tr=t=>0===t?1.3:3===t||4===t?1.2:10===t||11===t?.95:6===t||7===t||8===t?.7:.85,tA=(()=>{let t=[];for(let e=0;e<12;e++)for(let o of q){let a=new Set,r=Array(12).fill(0),A=new Set;for(let t of o.pitchClasses){A.add(t);let o=h(t+e);a.add(o),r[o]=tr(t)}t.push({root:e,quality:o.quality,priority:o.priority,pcs:a,weights:r,rel:A})}return t})(),tn=[0,2,4,5,7,9,11],tl=[0,2,3,5,7,8,10],tu=(t,e,o)=>{let a=Array(12).fill(0),r=0,A=1/0,n=-1;for(let l of t){let t=Math.max(l.when,e),u=Math.min(l.when+Math.max(l.duration,0),o),i=l.duration<=0?+(l.when>=e&&l.when<o):Math.max(u-t,0);!(i<=0)&&(a[h(l.pitch)]+=i,r+=i,l.pitch<A&&(A=l.pitch,n=h(l.pitch)))}return{when:e,duration:o-e,profile:r>0?a.map(t=>t/r):a,bass:n,empty:0===r}},ti=["I","II","III","IV","V","VI","VII"],ts=(t,e)=>{let o="major"===t.mode?tn:tl,a=h(e.root-t.tonic),r=o.indexOf(a),A="";if(-1===r){let t=o.indexOf(h(a-1)),e=o.indexOf(h(a+1));-1!==t?(r=t,A="#"):-1!==e?(r=e,A="b"):(r=0,A="?")}let n=e.rel.has(4),l=e.rel.has(3),u=e.rel.has(6),i=e.rel.has(8),s=e.rel.has(10),d=ti[r],c="";return l&&u?(d=d.toLowerCase(),c=s?"ø7":"°",e.rel.has(9)&&(c="°7")):n&&i?c="+":l&&(d=d.toLowerCase()),c||(e.rel.has(11)?c="M7":s?c="7":e.rel.has(9)&&!e.rel.has(10)&&(c="6")),A+d+c},td=(t,e)=>{for(let o of t)if(e>=o.when&&e<o.when+o.duration)return o.key;return t.length?t[t.length-1].key:null},tc=(t,e,o)=>{let a=E(t.root,o)+t.quality,r=-1!==e&&e!==t.root&&t.pcs.has(e);return{symbol:r?`${a}/${E(e,o)}`:a,rootSymbol:a,inversion:r,bass:-1===e?t.root:e}},tg={play:{d:"M8 5v14l11-7z"},pause:{d:"M6 5h4v14H6zm8 0h4v14h-4z"},stop:{d:"M6 6h12v12H6z"},record:{d:"M12 6a6 6 0 100 12 6 6 0 000-12z"},undo:{d:"M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",stroke:!0},redo:{d:"M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6",stroke:!0},chevronUp:{d:"M5 15l7-7 7 7",stroke:!0},chevronDown:{d:"M19 9l-7 7-7-7",stroke:!0},chevronLeft:{d:"M15 19l-7-7 7-7",stroke:!0},chevronRight:{d:"M9 5l7 7-7 7",stroke:!0},first:{d:"M18 18l-6-6 6-6M11 18l-6-6 6-6",stroke:!0},copy:{d:"M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",stroke:!0},pen:{d:"M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"},eraser:{d:"M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"},select:{d:"M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2M20 7V5a1 1 0 00-1-1h-2M20 17v2a1 1 0 01-1 1h-2M4 11v2M20 11v2M11 4h2M11 20h2",stroke:!0},settings:{d:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",stroke:!0},info:{d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"},more:{d:"M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"}},tm=(t,e=20)=>{let o=tg[t];if(!o)return"";let a=o.stroke?'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"':'fill="currentColor"';return`<svg viewBox="0 0 24 24" width="${e}" height="${e}" ${a} aria-hidden="true"><path d="${o.d}"/></svg>`},tp={kick:36,snare:38,clap:39,rimshot:37,hihatClosed:42,hihatPedal:44,hihatOpen:46,tomLow:45,tomMid:47,tomHigh:50,crash:49,ride:51,splash:55,tambourine:54},tC={"4beat":[{step:0,pitch:tp.kick,velocity:1},{step:48,pitch:tp.kick,velocity:.9},{step:96,pitch:tp.kick,velocity:1},{step:144,pitch:tp.kick,velocity:.9}],"8beat":[{step:0,pitch:tp.kick,velocity:1},{step:0,pitch:tp.hihatClosed,velocity:.8},{step:24,pitch:tp.hihatClosed,velocity:.5},{step:48,pitch:tp.snare,velocity:1},{step:48,pitch:tp.clap,velocity:.6},{step:48,pitch:tp.hihatClosed,velocity:.8},{step:72,pitch:tp.hihatClosed,velocity:.5},{step:96,pitch:tp.kick,velocity:.9},{step:96,pitch:tp.hihatClosed,velocity:.8},{step:120,pitch:tp.hihatClosed,velocity:.5},{step:144,pitch:tp.snare,velocity:1},{step:144,pitch:tp.hihatClosed,velocity:.8},{step:168,pitch:tp.hihatClosed,velocity:.5}],"16beat":[{step:0,pitch:tp.kick,velocity:1},{step:0,pitch:tp.hihatClosed,velocity:.8},{step:12,pitch:tp.hihatClosed,velocity:.4},{step:24,pitch:tp.hihatClosed,velocity:.6},{step:36,pitch:tp.hihatClosed,velocity:.4},{step:48,pitch:tp.snare,velocity:1},{step:48,pitch:tp.hihatClosed,velocity:.8},{step:60,pitch:tp.hihatClosed,velocity:.4},{step:72,pitch:tp.hihatClosed,velocity:.6},{step:84,pitch:tp.hihatClosed,velocity:.4},{step:96,pitch:tp.kick,velocity:.9},{step:96,pitch:tp.hihatClosed,velocity:.8},{step:108,pitch:tp.kick,velocity:.7},{step:108,pitch:tp.hihatClosed,velocity:.4},{step:120,pitch:tp.hihatClosed,velocity:.6},{step:132,pitch:tp.hihatClosed,velocity:.4},{step:144,pitch:tp.snare,velocity:1},{step:144,pitch:tp.hihatClosed,velocity:.8},{step:156,pitch:tp.hihatClosed,velocity:.4},{step:168,pitch:tp.hihatClosed,velocity:.6},{step:180,pitch:tp.hihatClosed,velocity:.4}],shuffle:[{step:0,pitch:tp.kick,velocity:1},{step:0,pitch:tp.hihatClosed,velocity:.8},{step:32,pitch:tp.hihatClosed,velocity:.5},{step:48,pitch:tp.snare,velocity:1},{step:48,pitch:tp.hihatClosed,velocity:.8},{step:80,pitch:tp.hihatClosed,velocity:.5},{step:96,pitch:tp.kick,velocity:.9},{step:96,pitch:tp.hihatClosed,velocity:.8},{step:128,pitch:tp.hihatClosed,velocity:.5},{step:144,pitch:tp.snare,velocity:1},{step:144,pitch:tp.hihatClosed,velocity:.8},{step:176,pitch:tp.hihatClosed,velocity:.5}],dance:[{step:0,pitch:tp.kick,velocity:1},{step:24,pitch:tp.hihatOpen,velocity:.7},{step:48,pitch:tp.kick,velocity:1},{step:48,pitch:tp.clap,velocity:1},{step:72,pitch:tp.hihatOpen,velocity:.7},{step:96,pitch:tp.kick,velocity:1},{step:120,pitch:tp.hihatOpen,velocity:.7},{step:144,pitch:tp.kick,velocity:1},{step:144,pitch:tp.clap,velocity:1},{step:168,pitch:tp.hihatOpen,velocity:.7}],bossa:[{step:0,pitch:tp.kick,velocity:.9},{step:0,pitch:tp.hihatClosed,velocity:.6},{step:24,pitch:tp.hihatClosed,velocity:.4},{step:48,pitch:tp.rimshot,velocity:.8},{step:48,pitch:tp.hihatClosed,velocity:.6},{step:72,pitch:tp.kick,velocity:.7},{step:72,pitch:tp.hihatClosed,velocity:.4},{step:96,pitch:tp.kick,velocity:.9},{step:96,pitch:tp.hihatClosed,velocity:.6},{step:120,pitch:tp.hihatClosed,velocity:.4},{step:144,pitch:tp.rimshot,velocity:.8},{step:144,pitch:tp.hihatClosed,velocity:.6},{step:168,pitch:tp.hihatClosed,velocity:.4}],disco:[{step:0,pitch:tp.kick,velocity:1},{step:0,pitch:tp.hihatClosed,velocity:.7},{step:24,pitch:tp.tambourine,velocity:.8},{step:48,pitch:tp.snare,velocity:1},{step:48,pitch:tp.hihatClosed,velocity:.7},{step:72,pitch:tp.tambourine,velocity:.8},{step:96,pitch:tp.kick,velocity:1},{step:96,pitch:tp.hihatClosed,velocity:.7},{step:120,pitch:tp.tambourine,velocity:.8},{step:144,pitch:tp.snare,velocity:1},{step:144,pitch:tp.hihatClosed,velocity:.7},{step:168,pitch:tp.tambourine,velocity:.8}]},tB={piano:{displayName:"グランドピアノ",description:"最も破綻しにくい構成。楽曲制作のスケッチにも最適。",melody:"Acoustic Grand Piano",submelody:"Vibraphone",bass:"Electric Bass (finger)",chord:"Pad 2 (warm)"},acoustic:{displayName:"アコースティック",description:"生楽器の温かみを重視。フォークやポップスに。",melody:"Acoustic Guitar (steel)",submelody:"Harmonica",bass:"Acoustic Bass",chord:"Acoustic Guitar (nylon)"},jazz_night:{displayName:"ジャズ・ナイト",description:"Rhodes風のEPとウッドベースによる、大人びたアンサンブル。",melody:"Electric Piano 1",submelody:"Flute",bass:"Acoustic Bass",chord:"Electric Guitar (jazz)"},synth_pop:{displayName:"シンセポップ",description:"80s〜現代まで。抜けるリードと太いベースの王道。",melody:"Lead 2 (sawtooth)",submelody:"Lead 4 (chiff)",bass:"Synth Bass 2",chord:"Pad 3 (polysynth)"},cyber_punk:{displayName:"サイバーパンク",description:"デジタルな冷たさと歪みが混ざり合う、未来的な響き。",melody:"Lead 8 (bass + lead)",submelody:"Lead 5 (charang)",bass:"Synth Bass 2",chord:"Pad 8 (sweep)"},rock:{displayName:"ハードロック",description:"歪みギターと重厚なベースで、パワーを前面に。",melody:"Distortion Guitar",submelody:"Rock Organ",bass:"Electric Bass (pick)",chord:"Overdriven Guitar"},orchestra:{displayName:"オーケストラ",description:"壮大な物語を予感させる、管弦楽器の重厚な響き。",melody:"French Horn",submelody:"Pizzicato Strings",bass:"Cello",chord:"Tremolo Strings"},japanese_wa:{displayName:"和風・雅",description:"琴と三味線の繊細な調べに、尺八の情緒を添えて。",melody:"Koto",submelody:"Shamisen",bass:"Taiko Drum",chord:"Shakuhachi"},arabic_exotic:{displayName:"エキゾチック",description:"シタールやバグパイプによる、異国情緒溢れるサウンド。",melody:"Sitar",submelody:"Bagpipe",bass:"Fretless Bass",chord:"Kalimba"},fantasy_rpg:{displayName:"ファンタジーRPG",description:"オカリナとハープが紡ぐ、冒険と魔法の世界観。",melody:"Ocarina",submelody:"Celesta",bass:"Timpani",chord:"Orchestral Harp"},ambient_cloud:{displayName:"アンビエント",description:"輪郭をぼかした音色で、深い没入感と余韻を演出。",melody:"Lead 6 (voice)",submelody:"Music Box",bass:"Synth Bass 1",chord:"Pad 7 (halo)"},retro_game:{displayName:"8-bit レトロ",description:"矩形波を想起させる、初期ゲーム機のような懐かしい響き。",melody:"Lead 1 (square)",submelody:"Lead 2 (sawtooth)",bass:"Synth Bass 1",chord:"Clavinet"}};function th(t){let e=new DataView(t);if(e.byteLength<8||0x4b4f4500!==e.getUint32(0,!1))throw Error("Not a .koe file (bad magic)");return{jsonLength:e.getUint32(4,!0)}}var tE=class{constructor(t,e){this.blob=t,this.base=e}blob;base;readBytes(t,e){let o=this.base+t;return this.blob.slice(o,o+e).arrayBuffer()}},tf=class{constructor(t,e){this.url=t,this.base=e}url;base;async readBytes(t,e){let o=this.base+t,a=await fetch(this.url,{headers:{Range:`bytes=${o}-${o+e-1}`}});if(!a.ok&&206!==a.status)throw Error(`.koe range request failed: ${a.status}`);return a.arrayBuffer()}};async function tQ(t,e,o){let a=await fetch(t,{headers:{Range:`bytes=${e}-${e+o-1}`}});if(!a.ok&&206!==a.status)throw Error(`.koe fetch failed: ${a.status}`);return a.arrayBuffer()}var tI=class t{constructor(t,e){this.manifest=t,this.source=e}manifest;source;static async load(e){if("string"==typeof e){let{jsonLength:o}=th(await tQ(e,0,8)),a=await tQ(e,8,o);return new t(JSON.parse(new TextDecoder().decode(a)),new tf(e,8+o))}let{jsonLength:o}=th(await e.slice(0,8).arrayBuffer()),a=await e.slice(8,8+o).arrayBuffer();return new t(JSON.parse(new TextDecoder().decode(a)),new tE(e,8+o))}has(t){return void 0!==this.manifest.phonemes[t]}async readPcmBytes(t){let e=this.manifest.phonemes[t];return e?this.source.readBytes(e.offset,2*e.length):null}async getPcm(t){let e=await this.readPcmBytes(t);if(!e)return null;let o=new Int16Array(e),a=new Float64Array(o.length);for(let t=0;t<o.length;t++)a[t]=o[t]/32768;return a}},tv=new Map,ty=class t{constructor(t){this.wasm=t}wasm;sampleRate=48e3;static async load(e){return new t(await function(t){let e,o=tv.get(t);if(o)return o;let a=t.slice(0,t.lastIndexOf("/")+1),r=()=>{let t=globalThis.WorldlineModule;if(!t)throw Error("worldline: WorldlineModule global was not defined by the script");return t({locateFile:t=>a+t})};if("u">typeof document)e=new Promise((e,o)=>{if(document.querySelector(`script[data-koe-worldline="${t}"]`))return void e();let a=document.createElement("script");a.src=t,a.dataset.koeWorldline=t,a.onload=()=>e(),a.onerror=()=>o(Error(`worldline: failed to load ${t}`)),document.head.appendChild(a)}).then(r);else{if("function"!=typeof globalThis.importScripts)return Promise.reject(Error("Worldline.load requires a DOM or a classic Web Worker (importScripts) to load worldline.js"));e=Promise.resolve().then(()=>(globalThis.importScripts(t),r()))}return tv.set(t,e),e}(e.scriptUrl))}renderNote(t){let{pcm:e,pitch:o,durationMs:a,preMs:r,consonantMs:A,tempo:n=120}=t;if(!e||e.length<4096)return null;let l=this.wasm,u=Math.round(69+12*Math.log2(o/440)),i=r+a,s=l._PhraseSynthNew();if(!s)return null;let d=l._malloc(120);if(!d)return l._PhraseSynthDelete(s),null;let c=l._malloc(8*e.length);if(!c)return l._free(d),l._PhraseSynthDelete(s),null;l.HEAPF64.set(e,c>>3);let g=(t,e,o)=>l.setValue(d+t,e,o);g(0,48e3,"i32"),g(4,e.length,"i32"),g(8,c,"*"),g(12,0,"i32"),g(16,0,"*"),g(20,u,"i32"),g(24,100,"double"),g(32,0,"double"),g(40,i,"double"),g(48,A,"double"),g(56,20,"double"),g(64,100,"double"),g(72,0,"double"),g(80,n,"double"),g(88,0,"i32"),g(92,0,"*"),g(96,0,"i32"),g(100,0,"i32"),g(104,100,"i32"),g(108,0,"i32"),g(112,0,"i32"),g(116,100,"i32"),l._PhraseSynthAddRequest(s,d,0,0,i,0,0,0),l._free(c),l._free(d);let m=Math.ceil((0+i+20)/10)+4,p=new Float64Array(m).fill(o),C=new Float64Array(m).fill(.5),B=new Float64Array(m).fill(.5),h=new Float64Array(m).fill(.5),E=new Float64Array(m).fill(1),f=l._malloc(8*m),Q=l._malloc(8*m),I=l._malloc(8*m),v=l._malloc(8*m),y=l._malloc(8*m);if(!f||!Q||!I||!v||!y)return f&&l._free(f),Q&&l._free(Q),I&&l._free(I),v&&l._free(v),y&&l._free(y),l._PhraseSynthDelete(s),null;l.HEAPF64.set(p,f>>3),l.HEAPF64.set(C,Q>>3),l.HEAPF64.set(B,I>>3),l.HEAPF64.set(h,v>>3),l.HEAPF64.set(E,y>>3),l._PhraseSynthSetCurves(s,f,Q,I,v,y,m,10),l._free(f),l._free(Q),l._free(I),l._free(v),l._free(y);let b=l._malloc(4);if(!b)return l._PhraseSynthDelete(s),null;let w=l._PhraseSynthSynth(s,b,0),F=l.getValue(b,"*"),x=w>0?new Float32Array(l.HEAPF32.buffer,F,w).slice():null;return l._free(b),l._PhraseSynthDelete(s),x}},tb="#end;",tw={あ:["","a"],い:["","i"],う:["","u"],え:["","e"],お:["","o"],か:["k","a"],き:["k","i"],く:["k","u"],け:["k","e"],こ:["k","o"],さ:["s","a"],し:["sh","i"],す:["s","u"],せ:["s","e"],そ:["s","o"],た:["t","a"],ち:["ch","i"],つ:["ts","u"],て:["t","e"],と:["t","o"],な:["n","a"],に:["n","i"],ぬ:["n","u"],ね:["n","e"],の:["n","o"],は:["h","a"],ひ:["h","i"],ふ:["f","u"],へ:["h","e"],ほ:["h","o"],ま:["m","a"],み:["m","i"],む:["m","u"],め:["m","e"],も:["m","o"],や:["y","a"],ゆ:["y","u"],よ:["y","o"],ら:["r","a"],り:["r","i"],る:["r","u"],れ:["r","e"],ろ:["r","o"],わ:["w","a"],を:["w","o"],が:["g","a"],ぎ:["g","i"],ぐ:["g","u"],げ:["g","e"],ご:["g","o"],ざ:["z","a"],じ:["j","i"],ず:["z","u"],ぜ:["z","e"],ぞ:["z","o"],だ:["d","a"],ぢ:["j","i"],づ:["z","u"],で:["d","e"],ど:["d","o"],ば:["b","a"],び:["b","i"],ぶ:["b","u"],べ:["b","e"],ぼ:["b","o"],ぱ:["p","a"],ぴ:["p","i"],ぷ:["p","u"],ぺ:["p","e"],ぽ:["p","o"],ん:["N","N"]},tF={a:"あ",i:"い",u:"う",e:"え",o:"お"},tx=t=>/[ぁゃ]/.test(t)?"a":/[ぃ]/.test(t)?"i":/[ぅゅ]/.test(t)?"u":/[ぇ]/.test(t)?"e":/[ぉょ]/.test(t)?"o":/[あかさたなはまやらわがざだばぱ]/.test(t)?"a":/[いきしちにひみりぎじぢびぴ]/.test(t)?"i":/[うくすつぬふむゆるぐずづぶぷ]/.test(t)?"u":/[えけせてねへめれげぜでべぺ]/.test(t)?"e":/[おこそとのほもよろごぞどぼぽ]/.test(t)?"o":"",tk=t=>{if("ー"===t)return{kana:t,consonant:"-",vowel:"-"};if("っ"===t)return{kana:t,consonant:"Q",vowel:""};let e=t[0],o=tw[e],a=o?o[0]:"",r=o?o[1]:tx(e);if(2===t.length&&"っ"!==t[1]){let e=tx(t[1]);e&&(r=e)}return{kana:t,consonant:a,vowel:r}},tD=t=>(t=>{let e=[],o="";for(let a of t){if("-"===a.consonant){if(!o)continue;e.push({kana:tF[o]??a.kana,consonant:"",vowel:o});continue}a.vowel&&"N"!==a.vowel&&(o=a.vowel),e.push(a)}return e})((t=>{let e=[];for(let o of t)e.length>0&&"ぁぃぅぇぉゃゅょっ".includes(o)?e[e.length-1]+=o:e.push(o);return e})(t.normalize("NFKC").replace(/[ァ-ヶ]/g,t=>String.fromCharCode(t.charCodeAt(0)-96)).replace(/[^ぁ-ゖー]/g,"")).map(tk)),tM=t=>{let e=[],o=[];for(let a of t){let t=tD(a);0!==t.length&&(e.length>0&&o.push(e.length),e.push(...t))}return{syllables:e,lineBreaks:o}},tS=/^@@(\d+)\s*(.*)$/,tL=t=>!/^[@#]/.test(t),tR=t=>t.split(/[;\n\r]+/).map(t=>t.trim()).filter(t=>t.length>0),tN=(t,e,o)=>Math.min(o,Math.max(e,t)),tT=t=>t<=0?0:t<=100?t/100:10**((t-100)*.08/20),tU=t=>Math.max(-1,Math.min(1,(t-64)/64)),tJ={a:[800,1200],i:[300,2300],u:[350,800],e:[500,1900],o:[500,900],N:[250,1e3]},tP=t=>440*2**((t-69)/12),tK="https://pub-12482a6b5cbc4c9e906b2e1904cabae5.r2.dev",tY={tsukuyomi:"つくよみちゃん.koe",rino:"春音リノver0.3.koe",roze:"束音ロゼver0.５1(多音階).koe",ruko_male:"欲音ルコ♂連続音Ver.1.03.koe",ruko_female:"欲音ルコ♀歌連続音普1.00.koe",teto:"重音テト単独音.koe",shiyo:"革命シヨ.koe"},tH={tsukuyomi:"つくよみちゃん",rino:"春音リノ",roze:"束音ロゼ",ruko_male:"欲音ルコ♂",ruko_female:"欲音ルコ♀",teto:"重音テト",shiyo:"革命シヨ"},tO={klatt:"puyuyu",tsukuyomi:"tsukuyomi",rino:"rino",roze:"roze",ruko_male:"ruko",ruko_female:"ruko",teto:"teto",shiyo:"shiyo"},tG={tsukuyomi:"https://tyc.rei-yumesaki.net/material/utau/terms/",rino:"https://hatenakun1.github.io/halunelino/",roze:"https://tabaneroze.ninja-web.net/terms-of-use.html",ruko_male:"https://long-sleeper.net/index.php?id=22",ruko_female:"https://long-sleeper.net/index.php?id=22",teto:"https://kasaneteto.jp/guidelines/voice.html",shiyo:"https://kakumeisiyo.my.canva.site/dagkuyjwycs"},tV=(t,e=tK)=>`${e}/${encodeURIComponent(t)}`,tq="https://onjmin.github.io/koe/demo/world/worldline.js",tz=/_([A-G][#b]?-?\d+)$/,tX={c:0,d:2,e:4,f:5,g:7,a:9,b:11},tW=t=>{let e=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(t);if(!e)return null;let o=tX[e[1].toLowerCase()];return"#"===e[2]?o++:"b"===e[2]&&o--,(Number.parseInt(e[3],10)+1)*12+o},tj=t=>{let e=new Map;for(let o of t){let t=tz.exec(o);if(!t||e.has(t[1]))continue;let a=tW(t[1]);null!=a&&e.set(t[1],a)}return[...e].map(([t,e])=>({token:t,midi:e}))},tZ=(t,e,o,a,r)=>{let A=o.kana,n="N"===o.consonant?"n":o.consonant,l="N"===o.vowel?"":o.vowel,u=`${n}${l}`||l,i=a||"-",s=[`${i} ${A}`,`${i} ${u}`,A,u],d=tF[o.vowel];d&&s.push(`${i} ${d}`,d,o.vowel),"N"===o.vowel&&s.push("ん","n","N",`${i} \u3093`);let c=new Set,g=e=>{for(let o of e.includes(" ")?[e,e.replace(/ /g,"　"),e.replace(/ /g,"")]:[e])if(!c.has(o)&&(c.add(o),t(o)))return o;return null};if(e.length)for(let{token:t}of e.slice().sort((t,e)=>Math.abs(t.midi-r)-Math.abs(e.midi-r)))for(let e of s){let o=g(`${e}_${t}`);if(o)return o}for(let t of s){let e=g(t);if(e)return e}return null},t$=async t=>{let e=await tI.load(t.koe),o=t.lightweight?null:await ty.load({scriptUrl:t.worldlineScriptUrl??tq}).catch(()=>null),a=new Map,r=async(t,r,A)=>{var n;let l,u=await (!(l=a.get(t))&&(l=e.getPcm(t),a.set(t,l)),l);if(!u||0===u.length)return null;let i=e.manifest.phonemes[t],s={preMs:((n=i).pre||0)/48e3*1e3,consonantMs:(n.consonant||0)/48e3*1e3},d=tP(r);if(o){let t=o.renderNote({pcm:u,pitch:d,durationMs:A,...s});if(t)return{pcm:t,preSec:s.preMs/1e3,rate:1}}let c=i.pitch>0?d/i.pitch:1;return{pcm:Float32Array.from(u),preSec:i.pre/48e3/c,rate:c}};return{hasAlias:t=>e.has(t),pitchTokens:tj(Object.keys(e.manifest.phonemes)),renderAlias:r,dispose:()=>{}}},t_=async t=>{if(new URL(t,location.href).origin===location.origin)return new Worker(t);let e=await fetch(t).then(t=>t.text());return new Worker(URL.createObjectURL(new Blob([e],{type:"text/javascript"})))},t0=async(t,e)=>{let o=await t_(t),a=new Set,r=new Map,A=0,n=null,l=null;return o.onmessage=t=>{let e=t.data;if("ready"===e.type){for(let t of e.aliases)a.add(t);n?.()}else if("error"===e.type)l?.(Error(e.message));else if("rendered"===e.type){let t=r.get(e.id);t&&(r.delete(e.id),t(e))}},o.onerror=t=>{l?.(Error(t.message||t.error||`Event: ${t.type}`))},await new Promise((t,a)=>{n=t,l=a,o.postMessage({type:"init",koe:e.koe,worldlineScriptUrl:e.worldlineScriptUrl??tq,lightweight:!!e.lightweight})}),n=null,l=null,{hasAlias:t=>a.has(t),pitchTokens:tj(a),renderAlias:(t,e,a)=>new Promise(n=>{let l=++A;r.set(l,t=>n(t.pcm?{pcm:t.pcm,preSec:t.preSec??0,rate:t.rate??1}:null)),o.postMessage({type:"render",id:l,alias:t,pitch:e,durationMs:a})}),dispose:()=>o.terminate()}},t3=async(t,e,o)=>{let a;if(o.voiceWorkerUrl)try{a=await t0(o.voiceWorkerUrl,o)}catch(t){console.warn("[dtm] Failed to spawn voice worker. Falling back to local backend.",t),a=await t$(o)}else a=await t$(o);let r=new Map,A=new Map,n=new Set,l="",u=(t,e,o)=>`${t}|${e}|${10*Math.round(o/10)}`,i=(e,o,n)=>{let l=u(e,o,n),i=r.get(l);if(void 0!==i)return Promise.resolve(i);let s=A.get(l);if(s)return s;let d=(async()=>{let u=await a.renderAlias(e,o,n),i=null;if(u){let e=t.createBuffer(1,u.pcm.length,48e3);e.copyToChannel(u.pcm,0),i={audio:e,preSec:u.preSec,rate:u.rate}}return r.set(l,i),A.delete(l),i})();return A.set(l,d),d},s=(o,a,r,A)=>{let l=e,u=null;"function"==typeof t.createStereoPanner&&((u=t.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,A)),u.connect(e),l=u);let i=t.createBufferSource();i.buffer=o.audio,i.playbackRate.value=o.rate;let s=Math.min(o.preSec,.09),d=o.preSec-s,c=Math.max(t.currentTime+.001,a-s),g=c+(o.audio.duration/o.rate-d),m=t.createGain();m.gain.setValueAtTime(1e-4,c),m.gain.exponentialRampToValueAtTime(r,c+.01);let p=Math.max(c+.01,g-.04);m.gain.setValueAtTime(r,p),m.gain.exponentialRampToValueAtTime(1e-4,g),i.connect(m).connect(l),i.start(c,d),i.stop(g+.02),n.add(i),i.onended=()=>{n.delete(i),i.disconnect(),m.disconnect(),u?.disconnect()}},d=(e,o)=>{if("Q"===e.consonant||""===e.vowel)return;let r=tZ(a.hasAlias,a.pitchTokens,e,l,o.pitch);if(e.vowel&&"N"!==e.vowel&&(l=e.vowel),!r)return;let A=t.currentTime+o.when,n=Math.max(1e-4,o.volume),u=o.pan??0,d=Math.max(60,1e3*o.duration);i(r,o.pitch,d).then(t=>{t&&s(t,A,n,u)})};return d.renderToCache=async(t,e,o,r)=>{if("Q"===t.consonant||""===t.vowel)return null;let A=tZ(a.hasAlias,a.pitchTokens,t,e,o);if(!A)return null;let n=Math.max(60,r);return await i(A,o,n)?u(A,o,n):null},d.scheduleCached=(t,e,o,a)=>{let A=r.get(t);A&&s(A,e,o,a)},d.stopAll=()=>{for(let t of n){try{t.stop()}catch{}t.disconnect()}n.clear()},d.reset=()=>{l=""},d},t1=3,t2=(t,e,o={})=>{let a,r,A={};for(let[t,e]of Object.entries(tY))A[t]=tV(e);for(let[t,e]of Object.entries(o.voicebanks??{}))A[t.toLowerCase()]=e;let n=0,l=new Map([["klatt",(a=new Set,(r=(o,r)=>{let A=t.currentTime+r.when,n=Math.max(1e-4,r.volume);if(""===o.vowel||"Q"===o.consonant)return;let[l,u]=tJ[o.vowel]??tJ.a,i=A+Math.max(.04,r.duration),s=null,d=e;"function"==typeof t.createStereoPanner&&((s=t.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,r.pan??0)),s.connect(e),d=s);let c=t.createOscillator();c.type="sawtooth",c.frequency.value=tP(r.pitch);let g=(e,o,a)=>{let r=t.createBiquadFilter();r.type="bandpass",r.frequency.value=e,r.Q.value=o;let A=t.createGain();return A.gain.value=a,c.connect(r).connect(A),A},m=t.createGain();if(m.gain.setValueAtTime(1e-4,A),m.gain.exponentialRampToValueAtTime(n,A+.02),m.gain.setValueAtTime(n,i),m.gain.exponentialRampToValueAtTime(1e-4,i+.06),g(l,6,4).connect(m),g(u,9,2.8).connect(m),m.connect(d),new Set(["s","sh","ch","ts","h","f"]).has(o.consonant)){let e=Math.max(1,Math.floor(.05*t.sampleRate)),r=t.createBuffer(1,e,t.sampleRate),l=r.getChannelData(0);for(let t=0;t<e;t++)l[t]=2*Math.random()-1;let u=t.createBufferSource();u.buffer=r;let i=t.createBiquadFilter();i.type="highpass",i.frequency.value="sh"===o.consonant?3e3:4500;let s=t.createGain();s.gain.setValueAtTime(.5*n,A),s.gain.exponentialRampToValueAtTime(1e-4,A+.05),u.connect(i).connect(s).connect(d),u.start(A),u.stop(A+.05),a.add(u),u.onended=()=>{a.delete(u),u.disconnect(),i.disconnect(),s.disconnect()}}c.start(A),c.stop(i+.06+.02),a.add(c),c.onended=()=>{a.delete(c),c.disconnect(),s?.disconnect()}}).stopAll=()=>{for(let t of a){try{t.stop()}catch{}t.disconnect()}a.clear()},r)]]),u=new Map,i=(t,e)=>{let o="";for(let a of t.notes){let t=a.syllable;"Q"!==t.consonant&&""!==t.vowel&&(e(a,o),t.vowel&&"N"!==t.vowel&&(o=t.vowel))}},s=()=>{for(let t of(n++,l.values()))t.stopAll?.()};return{loadModels:async a=>{let r=new Set;for(let t of a)t&&r.add(t.toLowerCase());await Promise.all([...r].map(a=>(a=>{let r=a.toLowerCase(),n=l.get(r);if(n)return Promise.resolve(n);let i=u.get(r);if(i)return i;let s=A[r];if(!s)return Promise.resolve(null);let d=(async()=>t3(t,e,{koe:s,worldlineScriptUrl:o.worldlineScriptUrl,lightweight:o.lightweight,voiceWorkerUrl:o.voiceWorkerUrl}))().then(t=>(l.set(r,t),t)).catch(t=>(console.warn(`[dtm] koe\u97F3\u6E90 "${r}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F`,t),null));return u.set(r,d),d})(a)))},warm:async(t,e=t1,o)=>{let a=[];for(let o of t){let t=l.get(o.model.toLowerCase());if(!t?.renderToCache)continue;let r=0;i(o,(o,A)=>{r>=e&&o.startSec>=1.5||(r++,a.push({model:t,note:o,prevVowel:A}))})}let r=a.length;if(0===r)return void o?.(0,0);let A=0;o?.(A,r);let n=a.map(async t=>{await (t.model.renderToCache?.(t.note.syllable,t.prevVowel,t.note.pitch,1e3*t.note.durationSec)??Promise.resolve(null)),A++,o?.(A,r)});await Promise.all(n)},startStream:(e,o,a)=>{let r=++n,A=async e=>{let A=l.get(e.model.toLowerCase());if(!A)return;let u=[];i(e,(t,e)=>{u.push({note:t,prevVowel:e})});let s=Math.max(1e-4,e.volume);for(let{note:l,prevVowel:i}of u){if(r!==n)return;for(;l.startSec-(t.currentTime-o)>1.5;)if(await new Promise(t=>setTimeout(t,100)),r!==n)return;if(a?.isAudible&&!a.isAudible(e))continue;let u=o+l.startSec;if(A.renderToCache&&A.scheduleCached){let o=A.renderToCache,d=A.scheduleCached;(async()=>{let A=await o(l.syllable,i,l.pitch,1e3*l.durationSec);if(r===n&&A){let o=t.currentTime-u;o<.05?d(A,u,s,e.pan):(console.warn(`[dtm] Synthesizer late skip: ${l.syllable.kana} at ${l.startSec}s (delayed by ${o.toFixed(3)}s)`),a?.onLateSkip?.(l,o))}})()}else{let o=u-t.currentTime;A(l.syllable,{trackId:"",pitch:l.pitch,velocity:100,volume:s,when:o,duration:l.durationSec,pan:e.pan}),await new Promise(t=>setTimeout(t,0))}}};for(let t of e)A(t)},stopStream:s,reset:()=>{for(let t of(s(),l.values()))t.reset?.()}}},t5=[[0,2,4,5,7,9,11],[0,2,3,5,7,8,10],[0,2,4,7,9]],t6=t=>{let{tracks:e}=t,o=[];for(let t=0;t<e.length;t++){let a=[],r=0;for(let o of e[t])if(r+=o.delta,o.noteOn&&o.noteOn.velocity>0)a.push({pitch:o.noteOn.noteNumber,channel:o.channel??0});else if(o.noteOff||o.noteOn&&0===o.noteOn.velocity){let t=o.noteOff||o.noteOn;if(t){for(let e=a.length-1;e>=0;e--)if(a[e].pitch===t.noteNumber&&void 0===a[e].end){a[e].end=r;break}}}let A=a.filter(t=>void 0!==t.end),n=A.filter(t=>9!==t.channel);A.length>0&&0===n.length||o.push({index:t,name:`Ch${t+1}`,noteCount:n.length,selected:n.length>0})}return o},t4=t=>{let{tracks:e}=t;for(let t of e)for(let e of t)if(e.setTempo&&"number"==typeof e.setTempo.microsecondsPerQuarter)return 6e7/e.setTempo.microsecondsPerQuarter;return 120},t8=t=>[(65280&t)>>8,255&t],t9=t=>[(0xff0000&t)>>16,...t8(t)],t7=t=>[(0xff000000&t)>>24,...t9(t)],et=t=>{let e=[127&t],o=t>>7;for(;o>0;)e.push(127&o|128),o>>=7;return e.reverse()},ee=(t,e)=>{t.push(77,84,114,107);let o=[];e(o),o.push(...et(0)),o.push(255,47,0),t.push(...t7(o.length)),t.push(...o)},eo=class{#t;constructor(){this.#t={value:null,prev:null,next:null}}add(t){let e={value:t,prev:this.#t,next:null};this.#t.next=e,this.#t=e}undo(){let{prev:t}=this.#t;return null===t||null===t.value?null:(this.#t=t,this.#t.value)}redo(){let{next:t}=this.#t;return null===t||null===t.value?null:(this.#t=t,this.#t.value)}canUndo(){return this.#t.prev?.value!==null}canRedo(){let{next:t}=this.#t;return null!==t&&null!==t.value}},ea=0,er=0,eA=()=>({x:ea,y:er}),en=new Set([1,3,6,8,10]),el=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],eu=()=>{g.clearRect(0,0,s.width,s.height);let{keyHeight:t,keyCount:e,pitchRangeStart:o}=p,a=Math.floor(er/t)*t,r=er+s.height,A="#ccc8b4";for(let n=a;n<r;n+=t){let a=e-1-n/t+o,r=a%12,l=en.has(r),u=n-er,i=Math.floor(37.2);if(l?(g.fillStyle=A,g.fillRect(0,u,60,t),g.fillStyle="#111111",g.fillRect(0,u,i,t),g.strokeStyle="#383838",g.lineWidth=1,g.beginPath(),g.moveTo(i,u),g.lineTo(i,u+t),g.stroke()):(g.fillStyle=A,g.fillRect(0,u,60,t),(5===r||0===r)&&(g.strokeStyle="#807a6a",g.lineWidth=1,g.beginPath(),g.moveTo(0,u+t-.5),g.lineTo(60,u+t-.5),g.stroke())),0===r){let e=Math.floor(a/12)-1;g.fillStyle="#555040",g.font="10px 'k8x12',monospace",g.textAlign="right",g.textBaseline="bottom",g.fillText(`${el[r]}${e}`,56,u+t-2)}}g.beginPath(),g.strokeStyle="#29adff",g.lineWidth=2,g.moveTo(60,0),g.lineTo(60,s.height),g.stroke()},ei=()=>{c.clearRect(0,0,i.width,i.height);let{stepWidth:t,stepsPerBar:e}=p;c.save(),c.translate(-ea,0),c.fillStyle="#0a0f1f",c.fillRect(ea,0,i.width,20),c.strokeStyle="#3d405b",c.lineWidth=1,c.font="11px 'k8x12',monospace",c.fillStyle="#83769c";let o=Math.floor(ea/(e*t)),a=Math.ceil((ea+i.width)/(e*t));for(let r=o;r<=a+1;r++){let o=r*e*t;c.beginPath(),c.moveTo(o,0),c.lineTo(o,20),c.stroke(),r>=0&&(c.textAlign="left",c.textBaseline="middle",c.fillText(`${r+1}`,o+5,10))}c.restore()},es=(t,e=[59,130,246,1])=>{let{keyHeight:o,stepWidth:a,keyCount:r,pitchRangeStart:A}=p;for(let n of t){let t=n.startStep*a,l=(r-1-(n.pitch-A))*o,u=n.durationSteps*a,i=t-ea,s=l-er,d=void 0!==n.velocity?.5+n.velocity/127*.5:1,[c,g,p,C]=e,B=C*d;m.fillStyle=`rgba(${c},${g},${p},${B})`,m.fillRect(i+1,s+1,u-2,o-2)}},ed=t=>{let[e,o]=(t=>{let{clientX:e,clientY:o}=t,a=d.getBoundingClientRect();return[Math.floor(e-a.left),Math.floor(o-a.top),t.buttons]})(t),{keyCount:a,pitchRangeStart:r,keyHeight:A,stepWidth:n}=p;return{step:Math.floor((e+ea)/n),pitch:a-1-Math.floor((o+er)/A)+r,x:e,y:o}},ec=(t,e)=>{ea=t,er=e,eu(),ei()},eg=["c","c+","d","d+","e","f","f+","g","g+","a","a+","b"],em=class t{notes=[];nextNoteId=0;handlers;volume=80;tempo=120;history=new eo;isUndoRedo=!1;isBatchOperation=!1;lastHistorySnapshot="[]";lastUndoTime=0;static UNDO_DEBOUNCE_MS=100;toolMode="pen";constructor(t,e=80){this.handlers=t,this.volume=e,this.lastHistorySnapshot=JSON.stringify(this.notes),this.history.add([]),this.generateAndNotify()}beginBatch(){this.isBatchOperation=!0}endBatch(){this.isBatchOperation=!1,this.saveHistory()}saveHistory(){if(this.isUndoRedo||this.isBatchOperation)return;let t=JSON.stringify(this.notes);t!==this.lastHistorySnapshot&&(this.lastHistorySnapshot=t,this.history.add(JSON.parse(t)))}restoreHistory(t){return null!==t&&(this.isUndoRedo=!0,this.notes=JSON.parse(JSON.stringify(t)),this.nextNoteId=this.notes.length>0?Math.max(...this.notes.map(t=>t.id))+1:0,this.lastHistorySnapshot=JSON.stringify(this.notes),this.generateAndNotify(),this.isUndoRedo=!1,!0)}undo(){let e=Date.now();return!(e-this.lastUndoTime<t.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=e,this.restoreHistory(this.history.undo()))}redo(){let e=Date.now();return!(e-this.lastUndoTime<t.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=e,this.restoreHistory(this.history.redo()))}canUndo(){return this.history.canUndo()}canRedo(){return this.history.canRedo()}setToolMode(t){this.toolMode=t}getToolMode(){return this.toolMode}resetHistory(){this.history=new eo,this.history.add([]),this.lastHistorySnapshot=JSON.stringify(this.notes)}addHistoryOnce(){this.lastHistorySnapshot="[]",this.saveHistory()}clearNotesWithoutHistory(){this.notes=[],this.nextNoteId=0,this.lastHistorySnapshot="[]"}setLoadMode(t){this.isUndoRedo=t}addNote(t,e,o){if(-1===this.notes.findIndex(o=>o.startStep===t&&o.pitch===e)){let a={id:this.nextNoteId++,startStep:t,durationSteps:o.noteLengthSteps,pitch:e,velocity:o.velocity??100};this.notes.push(a)}this.notes.sort((t,e)=>t.startStep-e.startStep),this.saveHistory(),this.generateAndNotify()}deleteNoteById(t){let e=this.notes.findIndex(e=>e.id===t);-1!==e&&(this.notes.splice(e,1),this.saveHistory(),this.generateAndNotify())}getMaxStep(){return 0===this.notes.length?0:12*Math.ceil(Math.max(...this.notes.map(t=>t.startStep+t.durationSteps))/12)}moveNote(t,e,o){let a=this.notes.find(e=>e.id===t);if(!a)return;let r=this.getMaxStep()+p.stepsPerBar,A=p.pitchRangeStart,n=A+p.keyCount-1,l=Math.min(Math.max(o,A),n),u=Math.min(Math.max(e,0),r-a.durationSteps);a.startStep=u,a.pitch=l,this.notes.sort((t,e)=>t.startStep-e.startStep),this.generateAndNotify()}moveNoteEnd(t){this.saveHistory()}resizeNote(t,e){let o=this.notes.find(e=>e.id===t);o&&(o.durationSteps=Math.max(1,e),this.notes.sort((t,e)=>t.startStep-e.startStep),this.generateAndNotify())}resizeNoteEnd(t){this.saveHistory()}getNotes(){return this.notes}getMML(t){return this.generateMML(t)}setVolume(t){this.volume=t,this.generateAndNotify()}setTempo(t){this.tempo=t,this.generateAndNotify()}generateAndNotify(){this.handlers.onNotesChanged([...this.notes]);let t=this.generateMML();this.handlers.onMMLGenerated(t)}stepsToMMLDuration(t,e){let o=p.stepsPerBar,a="64",r=1/0;for(let A of[{dur:"1.",s:1.5*o},{dur:"1",s:o/1},{dur:"2.",s:o/2*1.5},{dur:"2",s:o/2},{dur:"4.",s:o/4*1.5},{dur:"4",s:o/4},{dur:"8.",s:o/8*1.5},{dur:"8",s:o/8},{dur:"12",s:o/12},{dur:"16.",s:o/16*1.5},{dur:"16",s:o/16},{dur:"24",s:o/24},{dur:"32",s:o/32},{dur:"64",s:o/64}]){if(A.s>e)continue;let o=Math.abs(t-A.s);o<r&&(r=o,a=A.dur)}return a}findBestFitDuration(t){let e=p;for(let o of[1,2,4,8,12,16,24,32,48,64]){let a=e.stepsPerBar/o;if(t>=a)return{dur:o,steps:a}}return{dur:64,steps:e.stepsPerBar/64}}getNoteWithOctave(t,e){let o=Math.floor(t/12)-1,a=eg[t%12];return -1===e||Math.abs(o-e)>=2?{text:`o${o}${a}`,currentOctave:o}:o===e?{text:a,currentOctave:o}:o===e+1?{text:`>${a}`,currentOctave:o}:o===e-1?{text:`<${a}`,currentOctave:o}:{text:`o${o}${a}`,currentOctave:o}}generateMML=t=>{let e=p,o=t??this.volume,a=`t${this.tempo} v${o}`,r=[],A=-1,n=0;if(0===this.notes.length)return a;let l=Math.max(...this.notes.map(t=>t.startStep+t.durationSteps)),u=new Map;for(let t of this.notes){let e=u.get(t.startStep)??[];e.push(t),u.set(t.startStep,e)}let i=Array.from(u.keys()).sort((t,e)=>t-e),s=e.stepsPerBar/64,d=t=>{for(;t-n>=s;){let e=t-n,{dur:o,steps:a}=this.findBestFitDuration(e);r.push(`r${o}`),n+=a}};for(let t=0;t<i.length;t++){let e=i[t],o=u.get(e);if(!o)continue;d(e);let a=(i[t+1]??l)-n;if(a<s)continue;let c=o[0].durationSteps,g=this.stepsToMMLDuration(c,a),m=this.getStepFromDottedMML(g);if(o.length>1){let t=o.map(t=>{let e=Math.floor(t.pitch/12)-1,o=eg[t.pitch%12];return`o${e}${o}`});r.push(`[${t.join("")}]${g}`)}else{let{text:t,currentOctave:e}=this.getNoteWithOctave(o[0].pitch,A);r.push(`${t}${g}`),A=e}n+=m}return d(l),`${a} ${r.join(" ")}`};getMMLFromNotes(t,e,o){let a=this.notes,r=this.tempo,A=this.volume;this.notes=[...t].sort((t,e)=>t.startStep-e.startStep),void 0!==e&&(this.tempo=e),void 0!==o&&(this.volume=o);let n=this.generateMML();return this.notes=a,this.tempo=r,this.volume=A,n}getStepFromDottedMML(t){let e=p.stepsPerBar,o=t.endsWith("."),a=e/parseInt(o?t.slice(0,-1):t,10);return o?1.5*a:a}},ep=`
<div class="dtm-modal-body-content">
  <h4>1. \u97F3\u7B26\u3068\u4F11\u7B26</h4>
  <p><code>c</code>(\u30C9) <code>d</code>(\u30EC) <code>e</code>(\u30DF) <code>f</code>(\u30D5\u30A1) <code>g</code>(\u30BD) <code>a</code>(\u30E9) <code>b</code>(\u30B7) \u306E\u30A2\u30EB\u30D5\u30A1\u30D9\u30C3\u30C8\u3067\u8868\u3057\u307E\u3059\u3002</p>
  <ul>
    <li>\u534A\u97F3\u4E0A\u3052\u308B: <code>c#</code> \u307E\u305F\u306F <code>c+</code></li>
    <li>\u534A\u97F3\u4E0B\u3052\u308B: <code>d-</code></li>
    <li>\u4F11\u7B26: <code>r</code></li>
  </ul>

  <h4>2. \u97F3\u306E\u9577\u3055</h4>
  <p>\u97F3\u540D\u3084\u4F11\u7B26\u306E\u5F8C\u306B\u6570\u5024\u3067\u6307\u5B9A\u3057\u307E\u3059\uFF08\u4F8B: <code>4</code> = 4\u5206\u97F3\u7B26, <code>8</code> = 8\u5206\u97F3\u7B26, <code>16</code> = 16\u5206\u97F3\u7B26\uFF09\u3002</p>
  <ul>
    <li><code>c4</code> : 4\u5206\u97F3\u7B26\u306E\u30C9</li>
    <li><code>r8</code> : 8\u5206\u4F11\u7B26</li>
    <li><code>c4.</code> : \u4ED8\u70B94\u5206\u97F3\u7B26\u306E\u30C9\uFF08\u9577\u3055\u30921.5\u500D\u306B\uFF09</li>
    <li>\u6570\u5024\u3092\u7701\u7565\u3059\u308B\u3068\u3001<code>l</code> \u30B3\u30DE\u30F3\u30C9\u3067\u8A2D\u5B9A\u3055\u308C\u305F\u30C7\u30D5\u30A9\u30EB\u30C8\u9577\uFF08\u901A\u5E3816\u5206\uFF09\u306B\u306A\u308A\u307E\u3059\u3002</li>
  </ul>

  <h4>3. \u30AA\u30AF\u30BF\u30FC\u30D6\uFF08\u97F3\u306E\u9AD8\u3055\uFF09</h4>
  <ul>
    <li><code>o4</code>, <code>o5</code> : \u9AD8\u3055\u3092\u76F4\u63A5\u6307\u5B9A\uFF08\u3075\u3064\u3046\u306F o4 \u304B o5\uFF09</li>
    <li><code>&gt;</code> : 1\u30AA\u30AF\u30BF\u30FC\u30D6\u4E0A\u3052\u308B</li>
    <li><code>&lt;</code> : 1\u30AA\u30AF\u30BF\u30FC\u30D6\u4E0B\u3052\u308B</li>
  </ul>

  <h4>4. \u30C6\u30F3\u30DD</h4>
  <ul>
    <li><code>t120</code> : \u66F2\u306E\u901F\u3055\u3092BPM120\u306B\u6307\u5B9A\u3002\u203B\u30E1\u30ED\u30C7\u30A3\uFF08@0\uFF09\u306E\u30C6\u30F3\u30DD\u6307\u5B9A\u304C\u66F2\u5168\u4F53\u306B\u53CD\u6620\u3055\u308C\u307E\u3059\u3002</li>
  </ul>

  <h4>5. \u548C\u97F3</h4>
  <p>\u97F3\u7B26\u3092 <code>[</code> \u3068 <code>]</code> \u3067\u56F2\u3080\u3068\u540C\u6642\u306B\u767A\u97F3\u3057\u307E\u3059\u3002</p>
  <pre>\u4F8B: [ceg]4 \uFF08\u30C9\u30FB\u30DF\u30FB\u30BD\u30924\u5206\u97F3\u7B26\u3067\u540C\u6642\u306B\u767A\u97F3\uFF09</pre>

  <h4>6. \u30C8\u30E9\u30C3\u30AF\u306E\u533A\u5207\u308A</h4>
  <p><code>;</code> \u307E\u305F\u306F <code>@0</code>\u301C<code>@3</code> \u3067\u30C8\u30E9\u30C3\u30AF\u3092\u5207\u308A\u66FF\u3048\u307E\u3059\u3002</p>
  <ul>
    <li><code>@0</code>: \u30E1\u30ED\u30C7\u30A3</li>
    <li><code>@1</code>: \u30B5\u30D6\u30E1\u30ED</li>
    <li><code>@2</code>: \u30D9\u30FC\u30B9</li>
    <li><code>@3</code>: \u4F34\u594F</li>
  </ul>

  <h4>7. \u6B4C\u58F0\u30FB\u6B4C\u8A5E\u5165\u529B</h4>
  <p><code>@@&lt;\u30C8\u30E9\u30C3\u30AF\u756A\u53F7&gt; &lt;\u97F3\u6E90\u540D&gt; &lt;\u6B4C\u8A5E&gt;</code> \u306E\u5F62\u5F0F\u3067\u3001\u97F3\u7B26\u3068\u540C\u671F\u3059\u308B\u6B4C\u8A5E\u3092\u5165\u529B\u3067\u304D\u307E\u3059\u3002</p>
  <pre>\u4F8B: @@0 tsukuyomi \u3069\u3093\u3050\u308A\u3053\u308D\u3053\u308D\u3069\u3093\u3050\u308A\u3053</pre>
  <p style="margin-top:4px; margin-bottom:16px;"><small>\uFF08\u97F3\u6E90\u540D\u306F <code>tsukuyomi</code> \u3084 <code>klatt</code>, <code>roze</code> \u306A\u3069\u306E\u97F3\u58F0\u30E2\u30C7\u30EB\u3092\u6307\u5B9A\u3067\u304D\u307E\u3059\uFF09</small></p>

  <h4 style="margin-top: 18px; border-top: 1px solid var(--dtm-border2); padding-top: 8px;">\u30B5\u30F3\u30D7\u30EB\u66F2\uFF08\u8A66\u8074\u30FB\u30B3\u30D4\u30FC\uFF09</h4>

  <!-- \u30B5\u30F3\u30D7\u30EB1 -->
  <div class="dtm-modal-sample-box">
    <div class="dtm-modal-sample-header">
      <span class="dtm-modal-sample-tag">1. \u57FA\u672C\u306E\u30E1\u30ED\u30C7\u30A3</span>
      <button class="dtm-btn dtm-btn--ghost dtm-btn--xs dtm-modal-sample-copy-btn" data-mml="@0 t120 l8 o5 c d e f g a b > c">\u{1F4CB} \u30B3\u30D4\u30FC</button>
    </div>
    <pre style="margin: 0; padding: 6px;">@0 t120 l8 o5 c d e f g a b &gt; c</pre>
    <div class="dtm-modal-sample-desc">
      \u57FA\u672C\u7684\u306A\u30E1\u30ED\u30C7\u30A3\u306E\u66F8\u304D\u65B9\uFF08\u97F3\u540D\u30FB\u9577\u3055\u30FB\u30AA\u30AF\u30BF\u30FC\u30D6\u3068\u30C6\u30F3\u30DD\uFF09\u3002
    </div>
    <div style="margin-top: 8px;">
      <button class="dtm-btn dtm-btn--primary dtm-btn--xs dtm-modal-sample-play-btn" data-mml="@0 t120 l8 o5 c d e f g a b > c">\u25B6 \u8A66\u8074</button>
    </div>
    <div class="dtm-modal-sample-player-container"></div>
  </div>

  <!-- \u30B5\u30F3\u30D7\u30EB2 -->
  <div class="dtm-modal-sample-box">
    <div class="dtm-modal-sample-header">
      <span class="dtm-modal-sample-tag">2. \u8907\u6570\u30C8\u30E9\u30C3\u30AF\u3068\u548C\u97F3</span>
      <button class="dtm-btn dtm-btn--ghost dtm-btn--xs dtm-modal-sample-copy-btn" data-mml="@0 t120 o5 c e g2 ; @3 o4 [ceg]2 [ceg]2">\u{1F4CB} \u30B3\u30D4\u30FC</button>
    </div>
    <pre style="margin: 0; padding: 6px;">@0 t120 o5 c e g2 ;
@3 o4 [ceg]2 [ceg]2</pre>
    <div class="dtm-modal-sample-desc">
      ; \u3067\u30C8\u30E9\u30C3\u30AF\uFF08\u4E0A\uFF1D\u30E1\u30ED\u30C7\u30A3\uFF0F\u4E0B\uFF1D\u4F34\u594F\uFF09\u3092\u5206\u3051\u3001[ceg] \u3067\u548C\u97F3\u3092\u9CF4\u3089\u3057\u307E\u3059\u3002
    </div>
    <div style="margin-top: 8px;">
      <button class="dtm-btn dtm-btn--primary dtm-btn--xs dtm-modal-sample-play-btn" data-mml="@0 t120 o5 c e g2 ; @3 o4 [ceg]2 [ceg]2">\u25B6 \u8A66\u8074</button>
    </div>
    <div class="dtm-modal-sample-player-container"></div>
  </div>

  <!-- \u30B5\u30F3\u30D7\u30EB3 -->
  <div class="dtm-modal-sample-box">
    <div class="dtm-modal-sample-header">
      <span class="dtm-modal-sample-tag">3. \u6B4C\u5531\u4ED8\u304D (\u3069\u3093\u3050\u308A\u3053\u308D\u3053\u308D)</span>
      <button class="dtm-btn dtm-btn--ghost dtm-btn--xs dtm-modal-sample-copy-btn" data-mml="@0 t120 v100 o4g8 g8 e8 e8 f8 e8 d8 c8 g8 g8 e8 e8 d4.; @@0 tsukuyomi \u3069\u3093\u3050\u308A\u3053\u308D\u3053\u308D\u3069\u3093\u3050\u308A\u3053;">\u{1F4CB} \u30B3\u30D4\u30FC</button>
    </div>
    <pre style="margin: 0; padding: 6px;">@0 t120 v100 o4g8 g8 e8 e8 f8 e8 d8 c8 g8 g8 e8 e8 d4.;
@@0 tsukuyomi \u3069\u3093\u3050\u308A\u3053\u308D\u3053\u308D\u3069\u3093\u3050\u308A\u3053;</pre>
    <div class="dtm-modal-sample-desc">
      @@0 tsukuyomi \u6B4C\u8A5E... \u3067\u30E1\u30ED\u30C7\u30A3\u30C8\u30E9\u30C3\u30AF\u306B\u6B4C\u8A5E\u3092\u540C\u671F\u3055\u305B\u3066\u6B4C\u308F\u305B\u307E\u3059\u3002\u203B\u72EC\u81EA\u62E1\u5F35
    </div>
    <div style="margin-top: 8px;">
      <button class="dtm-btn dtm-btn--primary dtm-btn--xs dtm-modal-sample-play-btn" data-mml="@0 t120 v100 o4g8 g8 e8 e8 f8 e8 d8 c8 g8 g8 e8 e8 d4.; @@0 tsukuyomi \u3069\u3093\u3050\u308A\u3053\u308D\u3053\u308D\u3069\u3093\u3050\u308A\u3053;">\u25B6 \u8A66\u8074</button>
    </div>
    <div class="dtm-modal-sample-player-container"></div>
  </div>
</div>
`,eC={c:0,d:2,e:4,f:5,g:7,a:9,b:11},eB=(t,e,o)=>Math.min(o,Math.max(e,t)),eh=/#(inst|drum|volume|drumvolume|mode)=([\w-]+)/gi,eE=t=>{let e={};for(let o of t.matchAll(eh)){let t=o[1].toLowerCase();if("inst"===t)e.instrument=o[2];else if("drum"===t)e.drum=o[2];else if("volume"===t){let t=Number.parseInt(o[2],10);Number.isNaN(t)||(e.volume=t)}else if("drumvolume"===t){let t=Number.parseInt(o[2],10);Number.isNaN(t)||(e.drumVolume=t)}else"mode"===t&&("simple"===o[2]||"advanced"===o[2])&&(e.mode=o[2])}return e},ef=(t,e="")=>{let o=[];return t.instrument&&o.push(`#inst=${t.instrument}`),t.drum&&o.push(`#drum=${t.drum}`),void 0!==t.volume&&o.push(`#volume=${t.volume}`),void 0!==t.drumVolume&&o.push(`#drumvolume=${t.drumVolume}`),t.mode&&o.push(`#mode=${t.mode}`),o.join(e)},eQ=(t,e={})=>{let o=e.stepsPerBar??192,a=e.collectTokens??!1,r=e.collectLyrics??!1,A=e.clampTrackCount,n=[],l=new Map,u=null;if(!t)return{placements:n,bpm:u,tokenTracks:a?l:void 0,lyrics:r?new Map:void 0,mergedTrackCount:0,meta:{}};let i=t.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,""),s=eE(i),d=i.replace(eh,""),c=r?(t=>{let e=new Map,o=tR(t);for(let t=0;t<o.length;t++){let a=o[t].match(tS);if(!a)continue;let r=Number.parseInt(a[1],10),A=a[2].trim(),n=200,l=100,u=64,i=0,s=A.match(/^([a-z_]+?)(?=(?:[vqpo]-?\d)|[^a-z_]|$)(?::(\d+))?/i),d="",c=[];for(s&&(d=s[1].toLowerCase(),s[2]&&(n=tN(Number.parseInt(s[2],10),0,400)),c.push(s[0]),A=A.substring(s[0].length).trim());;){let t=A.match(/^v(\d+)/i);if(t){n=tN(Number.parseInt(t[1],10),0,400),c.push(t[0]),A=A.substring(t[0].length).trim();continue}let e=A.match(/^q(\d+)/i);if(e){l=tN(Number.parseInt(e[1],10),0,100),c.push(e[0]),A=A.substring(e[0].length).trim();continue}let o=A.match(/^p(\d+)/i);if(o){u=tN(Number.parseInt(o[1],10),0,127),c.push(o[0]),A=A.substring(o[0].length).trim();continue}let a=A.match(/^o(-?\d+)/i);if(a){i=tN(Number.parseInt(a[1],10),-2,2),c.push(a[0]),A=A.substring(a[0].length).trim();continue}break}let g=[A];for(;t+1<o.length&&tL(o[t+1]);)g.push(o[++t]);let{syllables:m,lineBreaks:p}=tM(g);e.set(r,{trackId:r,model:d,volume:n,gate:l,pan:u,octave:i,syllables:m,metaText:c.join(" "),...p.length>0?{lineBreaks:p}:{}})}return e})(d):void 0,g=tb.replace(/;+$/,""),m=RegExp(`(?<![cdafgCDAFG])${g}\\b;?`,"gi"),p=(t=>{let e=tR(t),o=[];for(let t=0;t<e.length;t++){if(tS.test(e[t])){for(;t+1<e.length&&tL(e[t+1]);)t++;continue}o.push(e[t])}return o.join("\n")})(d).replace(m,"").replace(/[\n\r]+/g," ").trim().split(/(@\d+)/).filter(t=>t.trim().length>0),C=0,B=0,h=4,E=0,f=16,Q=new Map,I=()=>{let t=Q.get(C);t||(t=new Set,Q.set(C,t)),t.add(B)};for(let t of p){let e=t.trim();if(e.startsWith("@")){let t=Number.parseInt(e.substring(1),10);B=t,void 0!==A&&t>=A&&(t=A-1),C=t,h=4,E=0,f=16;continue}let r=e.replace(/\s+/g,"").toLowerCase(),i=0,s=(t,e,o,A)=>{if(!a)return;let n=l.get(C);n||(n=[],l.set(C,n)),n.push({text:r.slice(A,i),startStep:e,durationSteps:o,type:t})},d=()=>{let t="";for(;i<r.length&&/\d/.test(r[i]);)t+=r[i],i++;let e=Math.round(o/(t?eB(Number.parseInt(t,10),1,64):f));for(;i<r.length&&"."===r[i];)e=Math.round(1.5*e),i++;return e};for(;i<r.length;){let t=r[i],e=i;if("o"===t){i++;let t="";for(;i<r.length&&/\d/.test(r[i]);)t+=r[i],i++;h=t?eB(Number.parseInt(t,10),0,8):4,s("octave",E,0,e)}else if(">"===t)h=Math.min(8,h+1),i++,s("shift",E,0,e);else if("<"===t)h=Math.max(0,h-1),i++,s("shift",E,0,e);else if("l"===t){i++;let t="";for(;i<r.length&&/\d/.test(r[i]);)t+=r[i],i++;f=eB(Number.parseInt(t,10)||16,1,64),s("length",E,0,e)}else if("r"===t){i++;let t=E,o=d();s("rest",t,o,e),E+=o}else if("t"===t||"v"===t||"q"===t||"p"===t){i++;let o="";for(;i<r.length&&/\d/.test(r[i]);)o+=r[i],i++;"t"===t&&o&&null===u&&(u=eB(Number.parseInt(o,10),1,255)),s("ctrl",E,0,e)}else if("["===t){i++;let t=[],o=h;for(;i<r.length&&"]"!==r[i];){let e=r[i];if(Object.hasOwn(eC,e)){let o=eC[e];++i<r.length&&("#"===r[i]||"+"===r[i])?(o++,i++):i<r.length&&"-"===r[i]&&(o--,i++),t.push((h+1)*12+o)}else if(">"===e)h=Math.min(8,h+1),i++;else if("<"===e)h=Math.max(0,h-1),i++;else if("o"===e){i++;let t="";for(;i<r.length&&/\d/.test(r[i]);)t+=r[i],i++;h=t?eB(Number.parseInt(t,10),0,8):4}else i++}i<r.length&&"]"===r[i]&&i++;let a=d();for(let e of(t.length>0&&I(),t))n.push({trackIndex:C,startStep:E,pitch:e,durationSteps:Math.max(1,a)});s("chord",E,Math.max(1,a),e),E+=a,h=o}else if(Object.hasOwn(eC,t)){let o=eC[t];++i<r.length&&("#"===r[i]||"+"===r[i])?(o++,i++):i<r.length&&"-"===r[i]&&(o--,i++);let a=(h+1)*12+o,A=d();I(),n.push({trackIndex:C,startStep:E,pitch:a,durationSteps:Math.max(1,A)}),s("note",E,Math.max(1,A),e),E+=A}else i++}}let v=0;for(let t of Q.values())t.size>=2&&v++;return{placements:n,bpm:u,tokenTracks:a?l:void 0,lyrics:c,mergedTrackCount:v,meta:s}},eI={puyuyu:"data:image/png;base64,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",rino:"data:image/png;base64,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",roze:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYAAAAGACAYAAACkx7W/AAAQAElEQVR4AezXv2+dVxkH8OPsDHRsiqpEAiMjuQaxRCJLt2RiYWhVqRtTR89V1dmRMrGyZWEIU8KeIQsCx4IWg5SIIZlKM/AHXJxfLXZ8fX+9z/uec55PlBP73vu+5zzP53njr3ypBP/Z3d6bRa7g8m2/QCBytvZe/H9nwXjSfxz9DLUOHB4ArQOpnwABAr0KCIBeJ6svAosEfJ5eQACkfwQAECCQVUAAZJ28vgkQSC8gANI+AhonQCC7gADI/gTonwCBtAICIO3oNU6AQFaBN30LgDcSvhIgQCCZgABINnDtEiBA4I2AAHgj4SuBLAL6JPBaQAC8hvCFAAEC2QQEQLaJ65cAAQKvBQTAa4g8X3RKgACBVwIC4JWDfwkQIJBOQACkG7mGCRDIKnC2bwFwVsRrAgQIJBEQAEkGrU0CBAicFRAAZ0W8JtCrgL4InBEQAGdAvCRAgEAWAQGQZdL6JECAwBkBAXAGpN+XOiNAgMBpAQFw2sMrAgQIpBEQAGlGrVECBLIKzOv70u723ixyPfrHX0vkmgX/OYGbRa5I+zH2PrEJ/fvk6ePS8grFebV56PP56oi4f6Of0aPjw63IFV1/9P5+A4h7tu1MgACBqgUEQNXjURyBAQRsQWCOgACYA+NtAgQI9C4gAHqfsP4IECAwR0AAzIHp522dECBA4HwBAXC+i3cJECDQvYAA6H7EGiRAIKvAor4FwCIhnxMgQKBTAQHQ6WC1RYAAgUUCAmCRkM8JtCqgbgILBATAAiAfEyBAoFcBAdDrZPVFgACBBQICYAFQux+rnAABAhcLCICLfXxKgACBbgUEQLej1RgBAlkFlu1bACwr5ToCBAh0JiAAOhuodggQILCsgABYVsp1BFoRUCeBJQUEwJJQLiNAgEBvAgKgt4nqhwABAksKCIAlodq5TKUECBBYTkAALOfkKgIECHQnIAC6G6mGCBDIKrBq35eOjg+3ItflP90qkWtra6tsbcWt3e29ErmePH1cWl6rPnCrXn/l8tUSuVatp7brI5/NF3vPgv98c/uTErmi5xX5s3OMvf0GEP2E2J8AAQKVCgiASgejLAIrC7iBwIoCAmBFMJcTIECgFwEB0Msk9UGAAIEVBQTAimD1Xq4yAgQIrCYgAFbzcjUBAgS6ERAA3YxSIwQIZBVYt28BsK6c+wgQINC4gABofIDKJ0CAwLoCAmBdOfcRqEVAHQTWFBAAa8K5jQABAq0LCIDWJ6h+AgQIrCkgANaEq+c2lRAgQGA9AQGwnpu7CBAg0LyAAGh+hBogQCCrwKZ9C4BNBd1PgACBRgUEQKODUzYBAgQ2FRAAmwq6n8BUAs4lsKGAANgQ0O0ECBBoVUAAtDo5dRMgQGBDAQGwIeB0tzuZAAECmwkIgM383E2AAIFmBQRAs6NTOAECWQWG6js8AJ7d2C+Ra3d7r0SuJ08fl8h15fLVErk+vvFpiVzXdq+XllekzYu9I5+dF3sP9YOg431mJ701u05+ts0iV3gAnOD7S4AAAQIVCgiACoeiJAIXCviQwEACAmAgSNsQIECgNQEB0NrE1EuAAIGBBATAQJDjbeMkAgQIDCMgAIZxtAsBAgSaExAAzY1MwQQIZBUYum8BMLSo/QgQINCIgABoZFDKJECAwNACAmBoUfsRiBKwL4GBBQTAwKC2I0CAQCsCAqCVSamTAAECAwsIgIFB47azMwECBIYVEADDetqNAAECzQgIgGZGpVACBLIKRPUtAKJk7UuAAIHKBQRA5QNSHgECBKIEBECUrH0JDCVgHwJBAgIgCNa2BAgQqF1AANQ+IfURIEAgSEAABMEOt62dCBAgECMgAGJc7UqAAIHqBQRA9SNSIAECWQWi+760u703i1zRDTx5+rhEro9vfFoi17Xd6yVyPTx6UKzpDKKf/+j9P/jpz0vk+u9vviyRK9rn5GdniVxHx4clcvkNIPoJsT8BAgQqFRAAlQ5GWQQKAgLBAgIgGNj2BAgQqFVAANQ6GXURIEAgWEAABAOvv707CRAgECsgAGJ97U6AAIFqBQRAtaNRGAECWQXG6lsAjCXtHAIECFQmIAAqG4hyCBAgMJaAABhL2jkElhVwHYGRBATASNCOIUCAQG0CAqC2iaiHAAECIwkIgJGglz/GlQQIEBhHQACM4+wUAgQIVCcgAKobiYIIEMgqMHbfAmBscecRIECgEgEBUMkglEGAAIGxBQTA2OLOIzBPwPsERhYQACODO44AAQK1CAiAWiahDgIECIwsIABGBp9/nE8IECAwroAAGNfbaQQIEKhGQABUMwqFECCQVWCqvgXAAvmHRw9Ky2tBe9V//OjunRK5qgdQYGqB3e29ErkEQOrHS/MECGQWEACZp6/3OgRUQWAiAQEwEbxjCRAgMLWAAJh6As4nQIDARAICYCL474/1HQECBKYREADTuDuVAAECkwsIgMlHoAACBLIKTN23AJh6As4nQIDARAICYCJ4xxIgQGBqAQEw9QScn1dA5wQmFhAAEw/A8QQIEJhKQABMJe9cAgQITCwgACYbgIMJECAwrYAAmNbf6QQIEJhMQABMRu9gAgSyCtTStwCoZRLqIECAwMgCAmBkcMcRIECgFgEBUMsk1JFHQKcEKhEQAJUMQhkECBAYW0AAjC3uPAIECFQiIABGH4QDCRAgUIeAAKhjDqogQIDA6AICYHRyBxIgkFWgtr4FQG0TUU9XAlcuXy2RqyusBpu5tnu9tLwEQIMPnZIJECAwhIAAGELRHgSWEXANgcoEBEBlA1EOAQIExhIQAGNJO4cAAQKVCQiA0QbiIAIECNQlIADqmodqCBAgMJqAABiN2kEECGQVqLVvAVDrZNRFgACBYAEBEAxsewIECNQqIABqnYy6+hHQCYFKBQRApYNRFgECBKIFBEC0sP0JECBQqYAACB+MAwgQIFCngACocy6qIkCAQLiAAAgndgABAlkFau9bANQ+IfURIEAgSEAABMHalgABArULCIDaJ6S+dgVUTqByAQFQ+YCUR4AAgSgBARAla18CBAhULiAAwgZkYwIECNQtIADqno/qCBAgECYgAMJobUyAQFaBVvq+dG33eolc0RBXLl8tkSu6/kd375TI1Xr9Wzs7JXIdHR+Wllf0fO1/scDDowel5eU3gIvn61MCBAh0KyAAuh2txiYTcDCBRgQEQCODUiYBAgSGFhAAQ4vajwABAo0ICIDBB2VDAgQItCEgANqYkyoJECAwuIAAGJzUhgQIZBVorW8B0NrE1EuAAIGBBATAQJC2IUCAQGsCAqC1iam3XgGVEWhMQAA0NjDlEiBAYCgBATCUpH0IECDQmIAAGGxgNiJAgEBbAgKgrXmplgABAoMJCIDBKG1EgEBWgVb7FgCtTk7dBAgQ2FBAAGwI6HYCBAi0KiAAWp2cuusRUAmBRgUEQKODUzYBAgQ2FRAAmwq6nwABAo0KCICNB2cDAgQItCkgANqcm6oJECCwsYAA2JjQBgQIZBVove9LD48elMjVOtDR8WGJXFs7OyVyPbp7p0Su6PnOZrMSud69f1BaXtH+0fv/+4vPS+SKrr/1/f0G0PoE1U+AAIE1BQTAmnBuI1AQEGhcQAA0PkDlEyBAYF0BAbCunPsIECDQuIAAWHuAbiRAgEDbAgKg7fmpngABAmsLCIC16dxIgEBWgV76FgC9TFIfBAgQWFFAAKwI5nICBAj0IiAAepmkPsYTcBKBTgQEQCeD1AYBAgRWFRAAq4q5ngABAp0ICICVB+kGAgQI9CEgAPqYoy4IECCwsoAAWJnMDQQIZBXorW8B0NtE9UOAAIElBQTAklAuI0CAQG8CAqC3ieonTsDOBDoTEACdDVQ7BAgQWFZAACwr5ToCBAh0JiAAlh6oCwkQINCXgADoa566IUCAwNICAmBpKhcSIJBVoNe+wwNgd3uvRK6j48MSuaIH/+79gxK5ousP3//rr0sJXE/fv1laXuH+DuhaIDwAutbTHAECBBoWEAAND0/pIwk4hkCnAgKg08FqiwABAosEBMAiIZ8TIECgUwEBsHCwLiBAgECfAgKgz7nqigABAgsFBMBCIhcQIJBVoPe+BUDvE9YfAQIE5ggIgDkw3iZAgEDvAgKg9wnrb30BdxLoXEAAdD5g7REgQGCegACYJ+N9AgQIdC4gAOYO2AcECBDoW0AA9D1f3REgQGCugACYS+MDAgSyCmTpWwBkmbQ+CRAgcEZAAJwB8ZIAAQJZBARAlknrc3kBVxJIIiAAkgxamwQIEDgrIADOinhNgACBJAIC4K1Be4MAAQI5BARAjjnrkgABAm8JCIC3SLxBgEBWgWx9C4AFE5/NZiVyLTh+44+f37tXItfGBdogtcD7X3xZItfu9l6JXK0PTwC0PkH1EyBAYE0BAbAmnNs6FNASgWQCAiDZwLVLgACBNwIC4I2ErwQIEEgmIAC+G7hvCBAgkEtAAOSat24JECDwnYAA+I7CNwQIZBXI2rcAyDp5fRMgkF5AAKR/BAAQIJBVQABknby+vxfwHYGkAgIg6eC1TYAAAQHgGSBAgEBSAQFQkk5e2wQIpBcQAOkfAQAECGQVEABZJ69vAgRKdgIBkP0J0D8BAmkFBEDa0WucAIHsAgIg+xOQuX+9E0guIACSPwDaJ0Agr4AAyDt7nRMgkFwgcQAkn7z2CRBILyAA0j8CAAgQyCogALJOXt8EEgto/ZWAAHjlMPff57dulcj1t7+XErnmNjbQB8/v3Sstr4EYbFOpwDe3PymRq9K2ly5LACxN5UICBAj0JSAA+pqnbpYRcA0BAi8FBMBLBv8QIEAgn4AAyDdzHRMgQOClQMIAeNm3fwgQIJBeQACkfwQAECCQVUAAZJ28vgkkFNDyaQEBcNrDKwIECKQREABpRq1RAgQInBYQAKc9vOpZQG8ECJwSEACnOLwgQIBAHgEBkGfWOiVAgMApgUQBcKpvLwgQIJBeQACkfwQAECCQVUAAZJ28vgkkEtDq+QIC4HwX7xIgQKB7AQHQ/Yg1SIAAgfMFBMD5Lt7tSUAvBAicKyAAzmXxJgECBPoXEAD9z1iHBAgQOFcgQQCc27c3CRAgkF5AAKR/BAAQIJBVQABknby+CSQQ0OLFAs0HwLv3D0rkemd/v7S8Lh5//Z/+8ObNErmiBbZ2dkrkiq7/ydPHJXL94A+fl8gV7XN0fLgVuaLrbz4AooHsT4AAgV4FBECvk9VXKQwIELhQQABcyONDAgQI9CsgAPqdrc4IECBwoUDHAXBh3z4kQIBAegEBkP4RAECAQFYBAZB18vom0LGA1pYTEADLObmKAAEC3QkIgO5GqiECBAgsJyAAlnNyVUsCaiVAYCkBAbAUk4sIECDQn4AA6G+mOiJAgMBSAh0GwFJ9u4gAAQLpBQRA+kcAAAECWQUEQNbJ65tAhwJaWk1AAKzm5WoCBAh0IyAAuhmlRggQILCagABYzcvVNQuojQCBlQQE93G0pAAABDFJREFUwEpcLiZAgEA/AgKgn1nqhAABAisJdBQAK/XtYgIECKQXEADpHwEABAhkFRAAWSevbwIdCWhlPYFLR8eHW5FrvbLquevd+wclckV3+s7+fml5be3slMj18We/K5Hrow8/K5HrZ5d/VSLXlctXS+R6dmO/RK7o/1/R+0f+bH6xt98AoidofwIECFQqIAAqHYyyVhBwKQECawkIgLXY3ESAAIH2BQRA+zPUAQECBNYS6CAA1urbTQQIEEgvIADSPwIACBDIKiAAsk5e3wQ6ENDCZgICYDM/dxMgQKBZAQHQ7OgUToAAgc0EBMBmfu6eUsDZBAhsJCAANuJzMwECBNoVEADtzk7lBAgQ2Eig4QDYqG83EyBAIL2AAEj/CAAgQCCrgADIOnl9E2hYQOnDCAiAYRztQoAAgeYEBEBzI1MwAQIEhhEQAMM42mVMAWcRIDCIgAAYhNEmBAgQaE9AALQ3MxUTIEBgEIEGA2CQvm1CgACB9AICIP0jAIAAgawCAiDr5PVNoEEBJQ8rEB4A39z+pESuYTne3u3Zjf0Sub49OCiR69Z775XI9dGHn5XItf2jD0rk+su/HpSW1y//+ccSuR7dvVMiV+Sz/2LvyP+7L/Z++ydGW++EB0BbHKolQIBAHgEBkGfW7XeqAwIEBhUQAINy2owAAQLtCAiAdmalUgIECAwq0FAADNq3zQgQIJBeQACkfwQAECCQVUAAZJ28vgk0JKDUGAEBEONqVwIECFQvIACqH5ECCRAgECMgAGJc7TqkgL0IEAgREAAhrDYlQIBA/QICoP4ZqZAAAQIhAg0EQEjfNiVAgEB6AQGQ/hEAQIBAVgEBkHXy+ibQgIASYwUEQKyv3QkQIFCtgACodjQKI0CAQKyAAIj1tfsmAu4lQCBUQACE8tqcAAEC9QoIgHpnozICBAiEClQcAKF925wAAQLpBQRA+kcAAAECWQUEQNbJ65tAxQJKG0eg+QB4dmO/RK5vDw5K5Pr97dslcv35J78ukSv6Mf3t7D8lcv3ix9dLyyva//m9eyVy/fDmzRK5Zl99VSLXif8seJ1sH/e3+QCIo7EzAQIE+hYQAH3Pt83uVE2AwCgCAmAUZocQIECgPgEBUN9MVESAAIFRBCoMgFH6dggBAgTSCwiA9I8AAAIEsgoIgKyT1zeBCgWUNK6AABjX22kECBCoRkAAVDMKhRAgQGBcAQEwrrfTLhLwGQECowoIgFG5HUaAAIF6BARAPbNQCQECBEYVqCgARu3bYQQIEEgvIADSPwIACBDIKiAAsk5e3wQqElDKNAICYBp3pxIgQGByAQEw+QgUQIAAgWkEBMA07k79fwHfEyAwiYAAmITdoQQIEJheQABMPwMVECBAYBKBCgJgkr4dSoAAgfQCAiD9IwCAAIGsAgIg6+T1TaACASVMK/A/AAAA//9C2QX5AAAABklEQVQDAPX7Xs1/pt8dAAAAAElFTkSuQmCC",ruko:"data:image/png;base64,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",shiyo:"data:image/png;base64,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",teto:"data:image/png;base64,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",tsukuyomi:"data:image/png;base64,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"},ev=(t,e,o,a)=>"step"in t?t.step:"bar"in t?Math.max(0,t.bar-1)*o:"seconds"in t?t.seconds/a:0,ey=t=>{let e=[],o=0,a=0,r=null,A=null,n=!1,l=0,u=new Map,i=-1,s=-1,d=!1,c=0,g=0,m=0,p=0,C=0,B=0,h=0,E=0,f=()=>60/t.getBpm()/48,Q=(t,e)=>!d||C<=0||t<p?l+t/e:c+(t-p)%C/e,I=()=>{let r=f(),A=t.getAudioTime()-o,n=t.getSoloTrackId(),l=performance.now()/1e3;if(i>0&&s>=0){let e=l-i,o=A-s;if(e>.5||o>.5){console.warn(`[sequencer] Interruption detected (realDelta: ${e.toFixed(3)}s, audioDelta: ${o.toFixed(3)}s). Stopping playback.`),y(),t.onEnd(!0);return}}for(let e of(i=l,s=A,t.getTracks()))u.set(e.id,e.volume);for(;;){let o=e[a];if(a>=e.length||d&&o&&o.when>=p){if(!d||C<=0)break;a=B,h+=C,o=e[a]}if(!o)break;let r=o.when+h-A;if(r>.5)break;if(a++,n&&o.trackId!==n)continue;let l=o.velocity/127,i=(u.get(o.trackId)??100*o.volume)/100;t.onPlayNote({trackId:o.trackId,pitch:o.pitch,velocity:o.velocity,volume:i*l,when:Math.max(0,r),duration:o.duration})}let m=t.getDrumPattern();if(m&&m.length>0){let{stepsPerBar:e}=t,o=Q(A,r)%e,a=o+4,n=o<4;for(let e of m){if(!(n&&0===e.step||e.step>=o&&e.step<a))continue;let A=(e.step-o)*r;A<-.1||A>.5||t.onPlayDrum({pitch:e.pitch,velocity:e.velocity??1,when:Math.max(0,A),duration:.1})}}if(A>=0){let e=Q(A,r);if(t.cues&&t.cues.length>0&&t.onCue){let o=t.getBpm(),a=t.stepsPerBar,A=(t,e,o)=>{if(o>=e)return t>e&&t<=o;{let a=t>e&&t<=g,r=t>=c&&t<=o;return a||r}};for(let n of t.cues)A(ev(n.time,o,a,r),E,e)&&t.onCue(n.id)}E=e}if(!d){let o=e[e.length-1],r=o?.when??0,n=o?.duration??0;a>=e.length&&A>r+n+.1&&(y(),t.onEnd(!1))}},v=()=>{if(!n)return;let e=f(),a=t.getAudioTime()-o;t.onTick(Q(a,e)),A=requestAnimationFrame(v)},y=()=>{null!==r&&(clearInterval(r),r=null),null!==A&&(cancelAnimationFrame(A),A=null),n=!1};return{start:Q=>{if(y(),(o=>{e=[],u=new Map;let a=f(),r=t.getBpm(),A=t.stepsPerBar,n=t.getLoop?.()??!1;if(d=!!n,"object"==typeof n){c=n.start?ev(n.start,r,A,a):0;let t=n.end?ev(n.end,r,A,a):null;g=null!==t?t:-1}else c=0,g=-1;let l=d?Math.min(o,c):o,i=0;for(let r of t.getTracks())for(let t of(u.set(r.id,r.volume),r.notes)){if(t.startStep<l)continue;let A=(t.startStep-o)*a,n=t.durationSteps*a;i=Math.max(i,t.startStep+t.durationSteps),e.push({trackId:r.id,pitch:t.pitch,volume:r.volume/100,velocity:t.velocity??127,when:A,duration:n})}for(e.sort((t,e)=>t.when-e.when),-1===g&&(g=i),m=(c-o)*a,C=(p=(g-o)*a)-m,B=0;B<e.length&&!(o+e[B].when/a>=c-1e-4);)B++})(l=Q??t.getPlayStartStep()),0===e.length&&!t.getDrumPattern()?.length)return;n=!0,o=t.getAudioTime()+.1;let b=f();for(a=0;a<e.length&&!(l+e[a].when/b>=l-1e-4);)a++;h=0,E=l-1e-4,i=-1,s=-1,r=setInterval(I,20),A=requestAnimationFrame(v)},stop:y,isActive:()=>n,getStartTime:()=>o}},eb="dtm-daw-styles",ew=`
@font-face {
  font-family: 'k8x12';
  src: url('https://db.onlinewebfonts.com/t/777630d46640dc5a928ea833c2fcb875.woff2') format('woff2'),
       url('https://db.onlinewebfonts.com/t/777630d46640dc5a928ea833c2fcb875.woff') format('woff'),
       url('https://db.onlinewebfonts.com/t/777630d46640dc5a928ea833c2fcb875.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

/* ====================================================
   PIXEL MUSIC STUDIO \u2014 \u30C9\u30C3\u30C8\u7D75UI\u30B7\u30B9\u30C6\u30E0
   PICO-8\u30AB\u30E9\u30FC\u30D1\u30EC\u30C3\u30C8\u30FB\u7F8E\u54B2\u30D5\u30A9\u30F3\u30C8\u30FB\u30B2\u30FC\u30E0\u30A6\u30A3\u30F3\u30C9\u30A6\u67A0
   ==================================================== */

/* \u30C7\u30B6\u30A4\u30F3\u30C8\u30FC\u30AF\u30F3\u306F\u7DE8\u96C6UI\u672C\u4F53\uFF08.dtm-daw\uFF09\u306B\u52A0\u3048\u3001\u305D\u306E\u5916\u5074\u306B\u5DEE\u3057\u8FBC\u307E\u308C\u308B
   \u30B3\u30F3\u30C8\u30ED\u30FC\u30EB\u30D0\u30FC\uFF08.dtm-controlbar\uFF09\u306B\u3082\u4F9B\u7D66\u3059\u308B\u3002mountPresetSelect /
   mountModeSwitch \u306EUI\u306F .dtm-daw \u306E\u5144\u5F1F\u3068\u3057\u3066\u7F6E\u304B\u308C\u308B\u305F\u3081\u3001\u3053\u3053\u3067\u914D\u3089\u306A\u3044\u3068
   var(--dtm-*) \u304C\u89E3\u6C7A\u3067\u304D\u305A\u7121\u88C5\u98FE\uFF08\u767D\u5730\u30FB\u65E2\u5B9A\u30D5\u30A9\u30F3\u30C8\uFF09\u306B\u306A\u3063\u3066\u3057\u307E\u3046\u3002
   \u518D\u751F\u5C02\u7528\u30D3\u30E5\u30FC\u306E\u30E2\u30FC\u30C0\u30EB\uFF0F\u5229\u7528\u898F\u7D04\u30AB\u30D0\u30FC\u306F document.body \u76F4\u4E0B\u3078\u91CD\u306D\u308B\u305F\u3081\u3001
   .dtm-daw \u306E\u5916\u306B\u51FA\u308B\u3002\u3053\u308C\u3089\u3082\u540C\u69D8\u306B\u30C8\u30FC\u30AF\u30F3\u3092\u4F9B\u7D66\u3057\u306A\u3044\u3068\u9ED2\u5730\u30FB\u767D\u6587\u5B57\u306B\u306A\u308B\u3002 */
.dtm-daw,
.dtm-controlbar,
.dtm-modal-overlay,
.dtm-consent-overlay {
  /* PICO-8 16\u8272\u30D1\u30EC\u30C3\u30C8\u3088\u308A */
  --c-black:   #000000;
  --c-navy:    #1d2b53;
  --c-purple:  #7e2553;
  --c-dkgreen: #008751;
  --c-brown:   #ab5236;
  --c-dkgray:  #5f574f;
  --c-gray:    #c2c3c7;
  --c-white:   #fff1e8;
  --c-red:     #ff004d;
  --c-orange:  #ffa300;
  --c-yellow:  #ffec27;
  --c-green:   #00e436;
  --c-cyan:    #29adff;
  --c-lavend:  #83769c;
  --c-pink:    #ff77a8;
  --c-peach:   #ffccaa;

  /* \u30BB\u30DE\u30F3\u30C6\u30A3\u30C3\u30AF\u30C8\u30FC\u30AF\u30F3 */
  --dtm-bg:       var(--c-black);
  --dtm-surface:  var(--c-navy);
  --dtm-deep:     #0a0f1f;
  --dtm-border:   var(--c-cyan);
  --dtm-border2:  var(--c-dkgray);
  --dtm-text:     var(--c-white);
  --dtm-muted:    var(--c-lavend);
  --dtm-primary:  var(--c-cyan);
  --dtm-pfg:      var(--c-black);
  --dtm-danger:   var(--c-red);
  --dtm-success:  var(--c-green);
  --dtm-accent:   var(--c-pink);
  --dtm-gold:     var(--c-yellow);
  --dtm-warn:     var(--c-orange);
  --dtm-tap:      40px;
  --dtm-gap:      6px;
  --dtm-font:     'k8x12',ui-monospace,monospace;
}

.dtm-daw {
  box-sizing: border-box;
  font-family: var(--dtm-font);
  font-size: 14px;
  line-height: 1.6;
  letter-spacing: .06em;
  color: var(--dtm-text);
  background: var(--dtm-bg);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--dtm-gap);
  padding: 6px;
  image-rendering: pixelated;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  -webkit-tap-highlight-color: transparent;
}
.dtm-daw *,
.dtm-daw *::before,
.dtm-daw *::after { box-sizing: border-box; }

/* \u2500\u2500\u2500 \u30B2\u30FC\u30E0\u30A6\u30A3\u30F3\u30C9\u30A6\u5171\u901A\u67A0 \u2500\u2500\u2500 */
/* \u5916\u67A0(\u9ED22px) \u2192 \u8272\u4ED8\u304D2px border \u2192 \u5185\u67A0(\u9ED2inset2px) \u306E3\u91CD\u69CB\u9020 */
.dtm-win {
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-primary),
    4px 4px 0 var(--c-black);
  background: var(--dtm-surface);
}

/* \u2500\u2500\u2500 \u5171\u901A\u30DC\u30BF\u30F3 \u2500\u2500\u2500 */
.dtm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: var(--dtm-tap);
  min-width: var(--dtm-tap);
  padding: 0 10px;
  border: 2px solid var(--dtm-border2);
  background: var(--dtm-surface);
  color: var(--dtm-text);
  font-family: var(--dtm-font);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .12em;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  box-shadow: 3px 3px 0 var(--c-black);
  transition: none;
}
.dtm-btn:active  { transform: translate(3px,3px); box-shadow: none; }
.dtm-btn:disabled { opacity: .3; cursor: default; box-shadow: none; }
.dtm-btn--ghost   { background: transparent; border-color: var(--dtm-border2); }
.dtm-btn--primary { border-color: var(--dtm-primary); background: var(--dtm-primary); color: var(--dtm-pfg); }
.dtm-btn--success { border-color: var(--dtm-success); background: var(--dtm-success); color: var(--c-black); }
.dtm-btn--danger  { border-color: var(--dtm-danger);  background: var(--dtm-danger);  color: var(--c-white); }
.dtm-btn--accent  { border-color: var(--dtm-accent);  background: var(--dtm-accent);  color: var(--c-black); }
.dtm-btn--icon    { padding: 0; }

/* \u2500\u2500\u2500 \u30A2\u30A4\u30B3\u30F3\u30DC\u30BF\u30F3 \u2500\u2500\u2500 */
.dtm-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dtm-tap);
  height: var(--dtm-tap);
  flex: 0 0 auto;
  border: 2px solid var(--dtm-border2);
  background: var(--dtm-surface);
  color: var(--dtm-text);
  font-size: 16px;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--c-black);
}
.dtm-iconbtn:active  { transform: translate(3px,3px); box-shadow: none; }
.dtm-iconbtn:disabled { opacity: .3; cursor: default; box-shadow: none; }

/* \u2500\u2500\u2500 \u30C8\u30E9\u30F3\u30B9\u30DD\u30FC\u30C8\u30D0\u30FC\uFF08HUD\u30B9\u30BF\u30A4\u30EB\uFF09 \u2500\u2500\u2500 */
.dtm-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--dtm-gap);
  padding: 6px;
  background: var(--dtm-deep);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-success),
    4px 4px 0 var(--c-black);
  overflow-x: auto;
  scrollbar-width: none;
}
.dtm-topbar::-webkit-scrollbar {
  display: none;
}
.dtm-topbar > * {
  flex-shrink: 0;
}
.dtm-topbar > .dtm-grow {
  flex-shrink: 1;
}

/* PLAY\u30DC\u30BF\u30F3 \u2014 \u30B2\u30FC\u30E0\u306E\u300C\u6C7A\u5B9A\u30DC\u30BF\u30F3\u300D\u7684\u5B58\u5728\u611F */
.dtm-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 20px;
  border: 2px solid var(--c-black);
  background: var(--dtm-success);
  color: var(--c-black);
  font-family: var(--dtm-font);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: .2em;
  cursor: pointer;
  box-shadow: 0 0 0 2px var(--dtm-success), 4px 4px 0 var(--c-black);
}
.dtm-play:active  { transform: translate(4px,4px); box-shadow: none; }
.dtm-play:disabled { opacity: .35; cursor: default; box-shadow: none; }
.dtm-play--stop {
  background: var(--dtm-danger);
  box-shadow: 0 0 0 2px var(--dtm-danger), 4px 4px 0 var(--c-black);
  color: var(--c-white);
}
.dtm-rec { color: var(--dtm-danger); }

/* BPM \u2014 \u30C7\u30B8\u30BF\u30EB\u30AB\u30A6\u30F3\u30BF\u30FC\u98A8 */
.dtm-label {
  font-family: var(--dtm-font);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .14em;
  color: var(--dtm-muted);
  white-space: nowrap;
}
.dtm-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--dtm-font);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: var(--dtm-muted);
  cursor: pointer;
  user-select: none;
  margin-top: 4px;
}
.dtm-checkbox-label:hover { color: var(--dtm-text); }
.dtm-checkbox-label--sub { margin-left: 20px; font-size: 10px; }
.dtm-checkbox {
  width: 14px;
  height: 14px;
  accent-color: var(--dtm-success);
  cursor: pointer;
  flex-shrink: 0;
}

.dtm-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--dtm-font);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--dtm-muted);
  cursor: pointer;
}
.dtm-toggle input { width: 16px; height: 16px; accent-color: var(--dtm-accent); }

/* \u2500\u2500\u2500 \u30C4\u30FC\u30EB\u30C9\u30C3\u30AF\uFF08\u88C5\u5099\u30B9\u30ED\u30C3\u30C8\u98A8\uFF09 \u2500\u2500\u2500 */
.dtm-tooldock {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dtm-gap);
  padding: 6px;
  background: var(--dtm-deep);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-border2),
    4px 4px 0 var(--c-black);
}
.dtm-sep {
  width: 2px; align-self: stretch;
  background: var(--dtm-border2); margin: 2px;
}
.dtm-row .dtm-label[data-dtm] { min-width: 48px; text-align: center; }

/* \u2500\u2500\u2500 \u30BB\u30B0\u30E1\u30F3\u30C8\uFF08\u30A2\u30A4\u30C6\u30E0\u30B9\u30ED\u30C3\u30C8\uFF09 \u2500\u2500\u2500 */
.dtm-seg {
  display: inline-flex;
  border: 2px solid var(--dtm-border2);
  background: var(--dtm-deep);
  box-shadow: 3px 3px 0 var(--c-black);
}
.dtm-segbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dtm-tap);
  height: var(--dtm-tap);
  border: none;
  border-right: 2px solid var(--dtm-border2);
  background: transparent;
  color: var(--dtm-muted);
  cursor: pointer;
}
.dtm-segbtn:last-child { border-right: none; }
.dtm-segbtn--active {
  background: var(--dtm-gold);
  color: var(--c-black);
}
.dtm-segbtn:not(.dtm-segbtn--active):active { background: var(--dtm-border2); }

/* \u2500\u2500\u2500 \u30D5\u30A9\u30FC\u30E0\u8981\u7D20 \u2500\u2500\u2500 */
.dtm-select, .dtm-input, .dtm-textarea {
  min-height: var(--dtm-tap);
  padding: 4px 8px;
  border: 2px solid var(--dtm-border2);
  background: var(--dtm-deep);
  color: var(--dtm-text);
  font-family: var(--dtm-font);
  font-size: 13px;
  letter-spacing: .06em;
  box-shadow: inset 2px 2px 0 var(--c-black);
}
.dtm-select:focus, .dtm-input:focus, .dtm-textarea:focus {
  outline: none;
  border-color: var(--dtm-primary);
}
.dtm-input--num { width: 64px; text-align: center; font-size: 16px; }
.dtm-textarea { width: 100%; min-height: 56px; resize: vertical; line-height: 1.7; }
.dtm-textarea.dtm-grow { width: 0; }
.dtm-range { height: var(--dtm-tap); accent-color: var(--dtm-primary); }

/* \u2500\u2500\u2500 \u30B3\u30F3\u30C8\u30ED\u30FC\u30EB\u30D0\u30FC\uFF08\u697D\u5668\u30D7\u30EA\u30BB\u30C3\u30C8 / \u30E2\u30FC\u30C9\u5207\u66FF\u306A\u3069\u306E\u5DEE\u3057\u8FBC\u307FUI\uFF09 \u2500\u2500\u2500 */
.dtm-controlbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dtm-gap);
  padding: 6px 8px;
  background: var(--dtm-deep);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-border2),
    4px 4px 0 var(--c-black);
  margin-bottom: var(--dtm-gap);
}
.dtm-controlbar-label {
  font-family: var(--dtm-font);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .14em;
  color: var(--dtm-accent);
  white-space: nowrap;
  flex-shrink: 0;
}
.dtm-controlbar .dtm-select { flex: 1 1 160px; }

/* \u30E2\u30FC\u30C9\u5207\u66FF\uFF08\u30C6\u30AD\u30B9\u30C8\u7248\u30BB\u30B0\u30E1\u30F3\u30C8\uFF09 */
.dtm-modeseg {
  display: inline-flex;
  border: 2px solid var(--dtm-border2);
  box-shadow: 3px 3px 0 var(--c-black);
}
.dtm-modebtn {
  min-height: var(--dtm-tap);
  padding: 0 14px;
  border: none;
  border-right: 2px solid var(--dtm-border2);
  background: var(--dtm-deep);
  color: var(--dtm-muted);
  font-family: var(--dtm-font);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .12em;
  cursor: pointer;
}
.dtm-modebtn:last-child { border-right: none; }
.dtm-modebtn--active { background: var(--dtm-primary); color: var(--dtm-pfg); }
.dtm-modebtn:not(.dtm-modebtn--active):active { background: var(--dtm-border2); }

/* \u2500\u2500\u2500 \u30C8\u30E9\u30C3\u30AF\u30D4\u30EB\uFF08\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC\u9078\u629E\u30DC\u30BF\u30F3\uFF09 \u2500\u2500\u2500 */
.dtm-tracks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dtm-gap);
}
.dtm-pill {
  --dtm-pill-color: var(--dtm-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  justify-content: center;
  min-height: 42px;
  padding: 0 12px;
  border: 2px solid var(--dtm-border2);
  background: var(--dtm-deep);
  color: var(--dtm-muted);
  font-family: var(--dtm-font);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: .1em;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--c-black);
}
.dtm-pill .dtm-dot {
  width: 8px; height: 8px;
  background: var(--dtm-pill-color);
  flex: 0 0 auto;
  box-shadow: 1px 1px 0 var(--c-black);
}
/* \u30A2\u30AF\u30C6\u30A3\u30D6\u9078\u629E = \u91D1\u8272\u30CF\u30A4\u30E9\u30A4\u30C8 + \u30AB\u30FC\u30BD\u30EB */
.dtm-pill--active {
  border-color: var(--dtm-gold);
  color: var(--dtm-gold);
  background: var(--dtm-surface);
  box-shadow: 0 0 0 2px var(--dtm-gold), 3px 3px 0 var(--c-black);
}
.dtm-pill--active::before { content: "\u25BA "; font-size: 10px; }
.dtm-pill:not(.dtm-pill--active):active { transform: translate(3px,3px); box-shadow: none; }

/* \u2500\u2500\u2500 \u30D4\u30A2\u30CE\u30ED\u30FC\u30EB\uFF08\u30C8\u30E9\u30C3\u30AB\u30FC\u98A8\uFF09 \u2500\u2500\u2500 */
.dtm-roll-wrap { display: flex; gap: var(--dtm-gap); }
.dtm-roll {
  position: relative;
  flex: 1 1 auto;
  height: 56vh;
  min-height: 280px;
  background: var(--dtm-deep);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-border2),
    4px 4px 0 var(--c-black);
  overflow: hidden;
}
.dtm-vscroll {
  position: relative;
  width: 20px;
  background: var(--dtm-deep);
  border: 2px solid var(--dtm-border2);
  cursor: pointer;
  flex: 0 0 auto;
  touch-action: none;
}
.dtm-vscroll-thumb, .dtm-hscroll-thumb {
  position: absolute;
  background: var(--dtm-primary);
  min-width: 20px;
  min-height: 20px;
}
.dtm-vscroll-thumb { left: 0; width: 100%; }
.dtm-hscroll {
  position: relative;
  width: 100%; height: 20px;
  background: var(--dtm-deep);
  border: 2px solid var(--dtm-border2);
  cursor: pointer;
  touch-action: none;
}
.dtm-hscroll-thumb { top: 0; height: 100%; }

/* \u2500\u2500\u2500 \u30D1\u30CD\u30EB\uFF08RPG\u30C0\u30A4\u30A2\u30ED\u30B0\u30A6\u30A3\u30F3\u30C9\u30A6\uFF09 \u2500\u2500\u2500 */
.dtm-panel {
  background: var(--dtm-surface);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-primary),
    4px 4px 0 var(--c-black);
  overflow: hidden;
}
.dtm-panel > summary {
  list-style: none;
  cursor: pointer;
  padding: 0 12px;
  font-family: var(--dtm-font);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .14em;
  display: flex;
  align-items: center;
  min-height: var(--dtm-tap);
  background: var(--dtm-deep);
  border-bottom: 2px solid var(--dtm-border2);
  color: var(--dtm-primary);
  gap: 8px;
}
.dtm-panel:not([open]) > summary { border-bottom: none; }
.dtm-panel > summary::-webkit-details-marker { display: none; }
/* \u5DE6\u7AEF\u30E9\u30A4\u30F3\uFF08\u30B2\u30FC\u30E0UI\u306E\u30BB\u30AF\u30B7\u30E7\u30F3\u8272\u5206\u3051\uFF09 */
.dtm-panel > summary::before {
  content: '';
  display: block;
  width: 4px;
  height: 20px;
  background: var(--dtm-accent);
  flex: 0 0 auto;
}
.dtm-panel[open] > summary::before { background: var(--dtm-primary); }
/* \u6298\u308A\u305F\u305F\u307F\u77E2\u5370 */
.dtm-panel > summary::after {
  content: "\u25B6";
  margin-left: auto;
  color: var(--dtm-muted);
  font-size: 10px;
}
.dtm-panel[open] > summary::after { content: "\u25BC"; }
.dtm-panel-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.dtm-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dtm-track-body { display: flex; flex-direction: column; gap: 10px; }

/* \u2500\u2500\u2500 MML\u51FA\u529B\uFF08CRT\u30BF\u30FC\u30DF\u30CA\u30EB\uFF09 \u2500\u2500\u2500 */
.dtm-output {
  background: var(--c-black);
  color: var(--dtm-success);
  border: 2px solid var(--dtm-success);
  padding: 10px;
  box-shadow: 0 0 0 2px var(--c-black), 4px 4px 0 var(--c-black);
}
.dtm-output::before {
  content: "C:\\> MML OUTPUT";
  display: block;
  font-size: 11px;
  color: var(--dtm-muted);
  letter-spacing: .14em;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--dtm-border2);
}
.dtm-output pre {
  margin: 0;
  background: transparent;
  padding: 0;
  overflow-x: auto;
  font-family: var(--dtm-font);
  font-size: 12px;
  line-height: 1.8;
  color: var(--dtm-success);
}
.dtm-output-label {
  font-size: 11px;
  color: var(--dtm-muted);
  font-family: var(--dtm-font);
  margin-top: 10px;
}
.dtm-output-label:first-of-type {
  margin-top: 0;
}
.dtm-output-row { display: flex; gap: 8px; align-items: flex-start; margin-top: 6px; }
.dtm-output-row pre { flex: 1; }

/* \u2500\u2500\u2500 \u30ED\u30FC\u30C7\u30A3\u30F3\u30B0\u30AA\u30FC\u30D0\u30FC\u30EC\u30A4 \u2500\u2500\u2500 */
.dtm-overlay {
  position: absolute; inset: 0; z-index: 10;
  background: rgba(0,0,0,.92);
  display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 14px;
  pointer-events: auto;
  cursor: wait;
}
.dtm-overlay[hidden] { display: none; }
.dtm-overlay::before {
  content: 'NOW LOADING';
  font-family: var(--dtm-font);
  font-size: 13px;
  color: var(--dtm-primary);
  text-transform: uppercase;
  letter-spacing: .25em;
  animation: dtm-blink 1s steps(1) infinite;
}
/* 8\u30D6\u30ED\u30C3\u30AF\u523B\u307F\u3067\u57CB\u307E\u308B\u30D4\u30AF\u30BB\u30EB\u30D0\u30FC */
.dtm-spinner {
  width: 96px; height: 12px;
  position: relative;
  background: var(--c-navy);
  border: 2px solid var(--dtm-primary);
  box-shadow: 0 0 0 2px var(--c-black), 4px 4px 0 var(--c-black);
}
.dtm-spinner::after {
  content: '';
  position: absolute;
  left: 0; top: 0; height: 100%;
  background: var(--dtm-primary);
  animation: dtm-load 1.6s steps(8) infinite;
}
@keyframes dtm-load { 0%{width:0} 100%{width:100%} }
/* \u9032\u6357\u304C\u78BA\u5B9A\u3057\u305F\u3089\u7121\u9650\u30EB\u30FC\u30D7\u6F14\u51FA\u3092\u6B62\u3081\u3001\u5B9F\u6E2C\u5024\u3067\u5857\u308A\u3064\u3076\u3059 */
.dtm-spinner--determinate::after { display: none; }
.dtm-spinner-fill {
  position: absolute;
  left: 0; top: 0; height: 100%;
  width: 0;
  background: var(--dtm-primary);
  transition: width .12s steps(8);
}
.dtm-loading-label {
  font-family: var(--dtm-font);
  font-size: 11px;
  color: var(--dtm-primary);
  letter-spacing: .15em;
  min-height: 1em;
}
.dtm-overlay-skip-btn {
  margin-top: 12px;
  min-height: 32px;
  font-size: 11px;
  font-family: var(--dtm-font);
  padding: 0 12px;
  background: var(--dtm-surface);
  border: 2px solid var(--dtm-border2);
  color: var(--dtm-muted);
  box-shadow: 2px 2px 0 var(--c-black);
  cursor: pointer;
  pointer-events: auto;
}
.dtm-overlay-skip-btn:hover {
  color: var(--dtm-text);
  border-color: var(--dtm-primary);
}
.dtm-overlay-skip-btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.dtm-overlay-skip-btn:disabled {
  opacity: .3;
  cursor: default;
  box-shadow: none;
  transform: none;
}
.dtm-topbar-loading {
  display: none;
  font-family: var(--dtm-font);
  font-size: 11px;
  color: var(--dtm-primary);
  margin-left: 12px;
  letter-spacing: .15em;
  align-self: center;
}
.dtm-topbar.is-loading .dtm-topbar-loading {
  display: inline-block;
}
.dtm-topbar.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

@keyframes dtm-blink { 0%,100%{opacity:1} 50%{opacity:0} }
.dtm-blink { animation: dtm-blink 1s steps(1) infinite; }

/* \u2500\u2500\u2500 \u30A4\u30F3\u30D5\u30A9\u30DC\u30BF\u30F3 \u2500\u2500\u2500 */
.dtm-infobtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  border: 2px solid var(--dtm-border2);
  background: var(--dtm-surface);
  color: var(--dtm-muted);
  cursor: pointer;
  box-shadow: 1px 1px 0 var(--c-black);
  padding: 0;
  margin: 0;
}
.dtm-infobtn:hover {
  color: var(--dtm-primary);
  border-color: var(--dtm-primary);
}
.dtm-infobtn:active {
  transform: translate(1px, 1px);
  box-shadow: none;
}

/* \u2500\u2500\u2500 \u89E3\u8AAC\u30E2\u30FC\u30C0\u30EB \u2500\u2500\u2500 */
.dtm-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  backdrop-filter: blur(2px);
  /* body\u76F4\u4E0B\u306B\u91CD\u306D\u305F\u5834\u5408\uFF08\u518D\u751F\u5C02\u7528\u30D3\u30E5\u30FC\uFF09\u3067\u3082\u6587\u5B57\u8272\u30FB\u30D5\u30A9\u30F3\u30C8\u304C
     .dtm-daw \u304B\u3089\u7D99\u627F\u3067\u304D\u306A\u3044\u305F\u3081\u3001\u3053\u3053\u3067\u660E\u793A\u3059\u308B\u3002 */
  color: var(--dtm-text);
  font-family: var(--dtm-font);
}
.dtm-modal-overlay[hidden] {
  display: none !important;
}

/* \u2500\u2500\u2500 \u5229\u7528\u898F\u7D04\u540C\u610F\u30AB\u30D0\u30FC \u2500\u2500\u2500 */
.dtm-consent-overlay {
  position: fixed;
  inset: 0;
  z-index: 10100;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  backdrop-filter: blur(2px);
  /* body\u76F4\u4E0B\u306B\u91CD\u306D\u308B\u305F\u3081 .dtm-daw \u304B\u3089\u7D99\u627F\u3067\u304D\u306A\u3044\u6587\u5B57\u8272\u30FB\u30D5\u30A9\u30F3\u30C8\u3092\u660E\u793A\u3002 */
  color: var(--dtm-text);
  font-family: var(--dtm-font);
}
.dtm-consent-overlay[hidden] {
  display: none !important;
}
.dtm-consent-modal {
  max-width: 450px;
  width: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--dtm-surface);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-primary),
    4px 4px 0 var(--c-black);
  overflow-y: auto;
}
.dtm-consent-header {
  background: var(--dtm-deep);
  color: var(--dtm-text);
  padding: 8px 12px;
  border-bottom: 2px solid var(--c-black);
  font-weight: bold;
  text-align: center;
  font-size: 14px;
}
.dtm-consent-body {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.6;
}
.dtm-consent-body a {
  color: var(--dtm-primary);
  text-decoration: underline;
}
.dtm-consent-body a:hover {
  color: var(--dtm-accent);
}
.dtm-consent-footer {
  padding: 8px;
  border-top: 2px solid var(--c-black);
  background: var(--dtm-deep);
  display: flex;
  justify-content: center;
}

.dtm-modal {
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--dtm-surface);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-primary),
    4px 4px 0 var(--c-black);
  overflow: hidden;
}
.dtm-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--dtm-deep);
  padding: 8px 12px;
  border-bottom: 2px solid var(--c-black);
}
.dtm-modal-title {
  font-family: var(--dtm-font);
  font-size: 14px;
  color: var(--dtm-gold);
  font-weight: bold;
}
.dtm-modal-close {
  background: transparent;
  border: none;
  color: var(--dtm-text);
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
.dtm-modal-close:hover {
  color: var(--dtm-danger);
}
.dtm-modal-body {
  padding: 12px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
}
.dtm-modal-body a {
  color: var(--dtm-primary);
  text-decoration: underline;
}
.dtm-modal-body a:hover {
  color: var(--dtm-accent);
}
.dtm-modal-body h4 {
  margin: 12px 0 6px 0;
  color: var(--dtm-primary);
  font-size: 13px;
}
.dtm-modal-body h4:first-child {
  margin-top: 0;
}
.dtm-modal-body p {
  margin: 0 0 8px 0;
}
.dtm-modal-body ul {
  margin: 0 0 8px 0;
  padding-left: 16px;
}
.dtm-modal-body li {
  margin-bottom: 4px;
}
.dtm-modal-body code {
  background: var(--dtm-deep);
  color: var(--dtm-accent);
  padding: 1px 4px;
  font-family: var(--dtm-font);
  font-size: 12px;
}
.dtm-modal-body pre {
  background: var(--dtm-deep);
  color: var(--dtm-success);
  padding: 8px;
  border: 1px solid var(--dtm-border2);
  margin: 6px 0;
  overflow-x: auto;
  font-family: var(--dtm-font);
  font-size: 12px;
}

.dtm-modal-sample-box {
  background: var(--dtm-deep);
  border: 1px solid var(--dtm-border2);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 12px;
}
.dtm-modal-sample-box:last-child {
  margin-bottom: 0;
}
.dtm-modal-sample-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.dtm-modal-sample-tag {
  font-family: var(--dtm-font);
  font-size: 11px;
  font-weight: bold;
  color: var(--dtm-accent);
}
.dtm-modal-sample-desc {
  margin: 6px 0 0 0;
  font-size: 11px;
  color: var(--dtm-muted);
}
.dtm-modal-sample-player-container {
  margin-top: 8px;
}
.dtm-modal-sample-player-container:empty {
  margin-top: 0;
}
.dtm-modal-sample-player-container .dtm-player {
  border: 1px solid var(--dtm-border2);
  box-shadow: none;
  background: rgba(0, 0, 0, 0.3);
}
.dtm-modal-sample-player-container .dtm-player-body {
  max-height: 100px;
  overflow-y: auto;
}

.dtm-hidden { display: none !important; }
/* \u8AAD\u8FBC\u6642\u306E\u8B66\u544A\u304A\u77E5\u3089\u305B\uFF08\u4F8B: \u30B7\u30F3\u30D7\u30EB\u30E2\u30FC\u30C9\u3067\u306E\u30C8\u30E9\u30C3\u30AF\u5408\u7B97\uFF09\u3002 */
.dtm-load-note {
  margin: 6px 0 0;
  padding: 0 2px;
  font-family: var(--dtm-font);
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: .04em;
  color: var(--dtm-warn); /* \u8B66\u544A\u8272\uFF08\u30AA\u30EC\u30F3\u30B8\uFF09 */
  font-weight: bold;
  opacity: 1.0;
}
.dtm-load-note::before { content: "\u26A0 "; }
.dtm-grow { flex: 1 1 auto; }
.dtm-lyric-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}

/* \u2500\u2500\u2500 \u5E83\u5E45\u62E1\u5F35 \u2500\u2500\u2500 */
@media (min-width: 768px) {
  .dtm-daw { gap: 8px; padding: 10px; }
  .dtm-roll { height: 420px; }
}

/* ====================================================
   MML PLAYER \u2014 \u518D\u751F\u5C02\u7528\u30D3\u30E5\u30FC\uFF08mountMmlPlayer\uFF09
   ==================================================== */
.dtm-player {
  display: flex;
  flex-direction: column;
  gap: var(--dtm-gap);
  padding: var(--dtm-gap);
  background: var(--dtm-deep);
  border: 2px solid var(--dtm-border2);
  box-shadow: 4px 4px 0 var(--c-black);
}
.dtm-player-message {
  padding: 4px 8px;
  background: var(--c-purple);
  color: var(--c-yellow);
  font-size: 11px;
  border: 2px solid var(--c-black);
  box-shadow: inset 0 -2px 0 rgba(0,0,0,0.2);
  font-family: var(--dtm-font);
  text-align: center;
  width: 100%;
  box-sizing: border-box;
}
.dtm-player-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dtm-player-play {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dtm-primary);
  color: var(--dtm-pfg);
  border: 2px solid var(--c-black);
  box-shadow: 2px 2px 0 var(--c-black);
  cursor: pointer;
  padding: 0;
}
.dtm-player-play:active { transform: translate(2px, 2px); box-shadow: none; }
.dtm-player-play--stop { background: var(--dtm-danger); }
.dtm-player-play:disabled { opacity: 0.4; cursor: default; }
.dtm-player-beat-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dtm-player-beat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dtm-border2);
  transition: background 0.06s;
}
.dtm-player-beat-dot--on { background: var(--dtm-primary); }
.dtm-player-bar {
  font-family: 'k8x12', monospace;
  font-size: 11px;
  color: var(--dtm-text);
  min-width: 2em;
  margin-left: 4px;
}
.dtm-player-chord {
  font-family: 'k8x12', monospace;
  font-size: 11px;
  color: var(--dtm-accent);
  min-width: 4em;
  margin-left: 8px;
  font-weight: bold;
}
.dtm-player-dots {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dtm-player-dot { width: 8px; height: 8px; display: inline-block; }
.dtm-player-mml-header {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}
.dtm-player-mml-link {
  font-family: 'k8x12', monospace;
  font-size: 10px;
  color: var(--dtm-muted);
  text-decoration: none;
  white-space: nowrap;
}
.dtm-player-mml-link:hover { color: var(--dtm-primary); }
.dtm-player-more-container {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.dtm-player-more-btn {
  background: transparent;
  border: none;
  color: var(--dtm-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  transition: color 0.15s, background-color 0.15s;
}
.dtm-player-more-btn:hover,
.dtm-player-more-btn.is-active {
  color: var(--dtm-text);
  background: var(--dtm-border2);
}
.dtm-player-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--dtm-deep);
  border: 2px solid var(--dtm-border2);
  box-shadow: 4px 4px 0 var(--c-black);
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding: 4px 0;
  min-width: 130px;
  font-family: var(--dtm-font);
}
.dtm-player-menu-item {
  background: transparent;
  border: none;
  color: var(--dtm-text);
  padding: 6px 12px;
  text-align: left;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  white-space: nowrap;
  width: 100%;
  box-sizing: border-box;
  transition: background-color 0.1s, color 0.1s;
}
.dtm-player-menu-item:hover {
  background: var(--dtm-primary);
  color: var(--dtm-pfg);
}
.dtm-player-emoji {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 18px;
  line-height: 1;
  user-select: none;
}
.dtm-player-balloon {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: none;
  pointer-events: none;
  font-family: var(--dtm-font);
  font-size: 9px;
  color: var(--c-black);
  background: var(--c-white);
  border: 2px solid var(--c-black);
  padding: 2px 4px;
  white-space: nowrap;
  box-shadow: 2px 2px 0 var(--c-black);
}
.dtm-player-balloon::after {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: var(--c-white);
  border-right: 2px solid var(--c-black);
  border-bottom: 2px solid var(--c-black);
}
.dtm-player-balloon--visible {
  display: block;
  animation: dtm-balloon-fade-in 0.1s steps(2);
}
@keyframes dtm-balloon-fade-in {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes dtm-emoji-jump {
  0%   { transform: translateY(0); }
  35%  { transform: translateY(-5px); }
  65%  { transform: translateY(-5px); }
  100% { transform: translateY(0); }
}
.dtm-player-emoji--jump {
  animation: dtm-emoji-jump 0.18s ease-out forwards;
}
.dtm-player-chip {
  font-family: 'k8x12', monospace;
  font-size: 9px;
  color: var(--dtm-text);
  background: var(--dtm-border2);
  padding: 2px 6px;
  white-space: nowrap;
}
.dtm-player-body {
  position: relative; /* \u30ED\u30FC\u30C7\u30A3\u30F3\u30B0\u30AA\u30FC\u30D0\u30FC\u30EC\u30A4\u306E\u57FA\u6E96\u3002\u30EC\u30FC\u30F3\u7FA4\u3060\u3051\u3092\u8986\u3046 */
  display: flex;
  flex-direction: column;
  gap: var(--dtm-gap);
}
.dtm-player-lane-row {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 6px;
}
.dtm-player-lane-label {
  position: relative;
  flex: 0 0 auto;
  width: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.dtm-player-lane-label--btn {
  cursor: pointer;
  user-select: none;
}
.dtm-player-lane-label--btn:hover { opacity: 0.7; }
.dtm-player-lane-label--muted { opacity: 0.3; }

/* \u2500\u2500\u2500 \u30DF\u30E5\u30FC\u30C8\u8868\u793A\uFF08\u6392\u4ED6\u540C\u671F\uFF09 \u2500\u2500\u2500 */
.dtm-player-emoji.is-muted,
.dtm-player-lane-label.is-muted {
  position: relative;
}

/* \u30DF\u30E5\u30FC\u30C8\u6642\u306E\u300C\xd7\u300D\u30DE\u30FC\u30AF\u91CD\u306D\u63CF\u304D */
.dtm-player-emoji.is-muted::before,
.dtm-player-lane-label.is-muted::before {
  content: "\xd7";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dtm-danger);
  font-family: var(--dtm-font);
  font-size: 16px;
  font-weight: bold;
  z-index: 10;
  pointer-events: none;
  text-shadow: 1px 1px 0 var(--c-black);
}

.dtm-player-lane-label.is-muted::before {
  font-size: 14px;
}

/* \u30DF\u30E5\u30FC\u30C8\u6642\u306E\u30A2\u30A4\u30B3\u30F3\u3084\u8981\u7D20\u306E\u8584\u6697\u5316\uFF08\u5439\u304D\u51FA\u3057\u306F\u9664\u5916\uFF09 */
.dtm-player-emoji.is-muted > img,
.dtm-player-emoji.is-muted > span:not(.dtm-player-balloon) {
  opacity: 0.25;
  filter: grayscale(80%);
}

.dtm-player-lane-label.is-muted {
  opacity: 0.25;
}

/* \u30DF\u30E5\u30FC\u30C8\u6642\u306E\u30C8\u30E9\u30C3\u30AF\u30EC\u30FC\u30F3\uFF08\u30B9\u30AF\u30ED\u30FC\u30EB\u90E8\uFF09\u306E\u8584\u6697\u5316\u3068\u30C7\u30AB\xd7\u30DE\u30FC\u30AF\uFF08\u8272\u5F31\u5BFE\u5FDC\uFF09 */
.dtm-player-lane-row.is-muted::after {
  content: "\xd7";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 22px; /* label width (16px) + gap (6px) */
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dtm-danger);
  font-family: var(--dtm-font);
  font-size: 24px;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.45);
  z-index: 10;
  pointer-events: none;
  text-shadow: 1px 1px 0 var(--c-black);
}
.dtm-player-lane-no {
  font-family: 'k8x12', monospace;
  font-size: 9px;
  color: var(--dtm-muted);
}
.dtm-player-lane {
  position: relative; /* \u30C8\u30FC\u30AF\u30F3\u306E offsetParent \u3092\u30EC\u30FC\u30F3\u306B\u56FA\u5B9A\u3057\u3001\u4E2D\u592E\u5BC4\u305B\u8A08\u7B97\u3092\u6B63\u3059 */
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  background: var(--c-black);
  border: none;
  padding: 0 6px;
  scrollbar-width: none;
  display: flex;
  align-items: center;
}
.dtm-player-lane::-webkit-scrollbar { display: none; }
.dtm-tk {
  font-family: 'k8x12', monospace;
  font-size: 12px;
  color: var(--dtm-text);
  flex: 0 0 auto;
}
.dtm-tk--rest { color: var(--dtm-muted); }
.dtm-tk--octave,
.dtm-tk--shift,
.dtm-tk--length,
.dtm-tk--ctrl { color: var(--dtm-border2); }
.dtm-tk--lyric { color: var(--dtm-text); letter-spacing: 1px; }
.dtm-tk--break { color: var(--dtm-muted); opacity: 0.7; margin: 0 2px; }
.dtm-tk--meta { color: var(--dtm-border2); margin-right: 4px; }
.dtm-tk.is-active {
  background: var(--tk, var(--dtm-primary));
  color: var(--c-black);
  font-weight: bold;
}
`,eF=(t=document)=>{if(t.getElementById(eb))return;let e=t.createElement("style");e.id=eb,e.textContent=ew,t.head.appendChild(e)},ex=(t,e)=>{let o=t.style.position;"static"===window.getComputedStyle(t).position&&(t.style.position="relative");let a=t.ownerDocument??document,r=a.createElement("div");r.className="dtm-overlay";let A=a.createElement("div");A.className="dtm-spinner";let n=a.createElement("i");n.className="dtm-spinner-fill",A.appendChild(n),r.appendChild(A);let l=a.createElement("div");if(l.className="dtm-loading-label",r.appendChild(l),e?.onSkip){let t=a.createElement("button");t.type="button",t.className="dtm-overlay-skip-btn",t.textContent=e.skipLabel??"音声合成をスキップ",t.addEventListener("click",o=>{o.stopPropagation(),t.disabled=!0,e.onSkip?.()}),r.appendChild(t)}return t.appendChild(r),{remove:()=>{r.parentNode&&(r.remove(),t.style.position=o)},setProgress:(t,e,o)=>{if(e>0){let a=Math.max(0,Math.min(100,Math.round(t/e*100)));A.classList.add("dtm-spinner--determinate"),n.style.width=`${a}%`,null!=o?l.textContent=`${t} / ${e} (${a}%) - \u3042\u3068\u7D04 ${o} \u79D2`:l.textContent=`${t} / ${e} (${a}%)`}else A.classList.remove("dtm-spinner--determinate"),n.style.width="0",l.textContent=""}}},ek=["#00e436","#29adff","#ff77a8","#ffec27"],eD=null,eM=new Set,eS={klatt:"軽量ロボ声",...tH},eL=null,eR=null,eN=()=>{eL&&(eL.classList.remove("dtm-player-balloon--visible"),eL=null),eR&&(clearTimeout(eR),eR=null)},eT=t=>{eL===t?eR&&clearTimeout(eR):(eN(),eL=t,t.classList.add("dtm-player-balloon--visible")),eR=setTimeout(()=>{eN()},3e3)},eU=async(t,e)=>{try{return await navigator.clipboard.writeText(e),!0}catch{try{let o=t.createElement("textarea");o.value=e,o.style.position="fixed",o.style.opacity="0",t.body.appendChild(o),o.select();let a=t.execCommand("copy");return t.body.removeChild(o),a}catch{return!1}}},eJ=async t=>{try{if("u">typeof CompressionStream){let e=new CompressionStream("gzip"),o=e.writable.getWriter();o.write((t=>{let e=[];for(let o=0;o<t.length;o++){let a=t.charCodeAt(o);32!==a&&(a<=127?e.push(a):12540===a?e.push(223):a>=12353&&a<=12447?e.push(128+(a-12353)):a>=12449&&a<=12543&&(e.push(255),e.push(128+(a-96-12353))))}return new Uint8Array(e)})(t)),o.close();let a=await new Response(e.readable).arrayBuffer();return`z.${(t=>{let e="";for(let o=0;o<t.length;o++)e+=String.fromCharCode(t[o]);return btoa(e).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")})(new Uint8Array(a))}`}}catch(t){console.warn("[dtm] CompressionStream failed, fallback to encodeURIComponent",t)}return`u.${encodeURIComponent(t)}`},eP=(t,e,o={})=>{eF(t.ownerDocument??document);let{placements:a,bpm:r,tokenTracks:A,lyrics:n,meta:l}=eQ(e,{collectTokens:!0,collectLyrics:!0}),u=n??new Map,i=r??o.defaultBpm??120,s=o.drumPatterns??tC,d=l.drum?s[l.drum]??null:null,c=l.volume??o.volume??100,g=l.drumVolume??80,m=o.trackColors??ek,p=o.synth??!o.onPlayNote,C=60/i/48,B=[...new Set(a.map(t=>t.trackIndex))].sort((t,e)=>t-e),E=a.reduce((t,e)=>Math.max(t,e.startStep+e.durationSteps),0),f=a.map(t=>({pitch:t.pitch,when:t.startStep*C,duration:t.durationSteps*C})),Q=[];if(f.length>0){let t=[];try{t=((t,e={})=>{if(!t.length)return{keys:[],chords:[]};let{flat:o=!1,bpm:a,frameSize:r=.5,changePenalty:A=.4,nonChordTonePenalty:n=.55,useKey:l=!0}=e,u=((t,e={})=>{if(!t.length)return[];let{flat:o=!1}=e,a=t.reduce((t,e)=>Math.min(t,e.when),1/0),r=t.reduce((t,e)=>Math.max(t,e.when+Math.max(e.duration,0)),-1/0),A=r-a;if(A<=0){let e=((t,e={})=>{if(!t.length)return[];let{flat:o=!1}=e,a=(t=>{let e=Array(12).fill(0);for(let o of t)"number"==typeof o?e[h(o)]+=1:e[h(o.pitch)]+=o.duration??1;return e})(t);return a.every(t=>0===t)?[]:to(a,o)})(t.map(t=>({pitch:t.pitch,duration:Math.max(t.duration,1)})),{flat:o})[0];return e?[{key:_(e),when:a,duration:0}]:[]}let n=e.windowSize??A/4,l=e.hopSize??n/2,u=e.minSegmentDuration??0,i=e.switchMargin??.08,s=[];for(let e=a;e<r-1e-9;e+=l){let A=Math.min(e+l,r),u=Math.min(e+n,r),d=te(t,Math.max(a,u-n),u),c=s[s.length-1];if(d.every(t=>0===t)){c&&(c.duration=A-c.when);continue}let g=to(d,o),m=g[0];if(c){let t=g.find(t=>tt(t,c.key));t&&m.score-t.score<=i&&(m=t)}c&&tt(c.key,m)?c.duration=A-c.when:s.push({key:_(m),when:e,duration:A-e})}var d=ta(s);if(u<=0)return d;let c=d.map(t=>({...t})),g=0;for(;g<c.length&&c.length>1;){if(c[g].duration>=u){g++;continue}g>0?c[g-1].duration+=c[g].duration:(c[g+1].when=c[g].when,c[g+1].duration+=c[g].duration),c.splice(g,1)}return ta(c)})(t,e),i=t.reduce((t,e)=>Math.min(t,e.when),1/0),s=t.reduce((t,e)=>Math.max(t,e.when+Math.max(e.duration,0)),-1/0);if(s<=i)return{keys:u,chords:[]};let d=a?60/a:Math.max(r,.001),c=[];for(let e=i;e<s-1e-9;e+=d)c.push(tu(t,e,Math.min(e+d,s)));let g=((t,e)=>{let o=t.length,a=tA.length;if(0===o)return[];let r=Array.from({length:o},()=>Array(a).fill(-1)),A=t[0].slice();for(let n=1;n<o;n++){let o=-1/0,l=0;for(let t=0;t<a;t++)A[t]>o&&(o=A[t],l=t);let u=Array(a).fill(0),i=t[n],s=o-e;for(let t=0;t<a;t++)A[t]>=s?(u[t]=i[t]+A[t],r[n][t]=t):(u[t]=i[t]+s,r[n][t]=l);A=u}let n=0;for(let t=1;t<a;t++)A[t]>A[n]&&(n=t);let l=Array(o).fill(0);l[o-1]=n;for(let t=o-1;t>0;t--)l[t-1]=r[t][l[t]];return l})(c.map(t=>{if(t.empty)return Array(tA.length).fill(0);let e=l?td(u,t.when+t.duration/2):null;return tA.map(o=>((t,e,o,a)=>{let r=0,A=0;for(let o=0;o<12;o++){let a=t.profile[o];0!==a&&(e.pcs.has(o)?r+=a*e.weights[o]:A+=a)}let n=r-a*A;return 0===t.profile[e.root]&&(n-=.3),-1!==t.bass&&e.root===t.bass&&(n+=.3),o&&(n+=((t,e)=>{let o=new Set(("major"===e.mode?tn:tl).map(t=>h(t+e.tonic))),a=o.has(t.root),r=!0;for(let e of t.pcs)if(!o.has(e)){r=!1;break}let A=0;r?A+=.25:a&&(A+=.1);let n=h(t.root-e.tonic);return(0===n||5===n||7===n)&&(A+=.05),A})(e,o)),n-=.002*e.priority})(t,o,e,n))}),A),m=[];for(let t=0;t<c.length;t++){let e=c[t],a=tA[g[t]],r=m[m.length-1];if(r&&r.root===a.root&&r.quality===a.quality){r.duration=e.when+e.duration-r.when;continue}let A=td(u,e.when+e.duration/2),{symbol:n,rootSymbol:l,inversion:i,bass:s}=tc(a,e.bass,o);m.push({symbol:n,rootSymbol:l,root:a.root,quality:a.quality,bass:s,inversion:i,when:e.when,duration:e.duration,key:A,degree:A?ts(A,a):null})}return{keys:u,chords:m}})(f,{bpm:i}).chords}catch{t=[]}for(let e of t){let t=Math.max(0,Math.round(e.when/C)),o=Math.round((e.when+e.duration)/C);for(let a=t;a<o&&a<=E;a++)Q[a]=e.symbol}let e="";for(let t=0;t<=E;t++)Q[t]?e=Q[t]:Q[t]=e}let I=B.map(t=>{let e=0,o=a.filter(e=>e.trackIndex===t).map(t=>({id:e++,startStep:t.startStep,durationSteps:t.durationSteps,pitch:t.pitch,velocity:100}));return{id:String(t),volume:c,notes:o}}),v=t=>m[t%m.length]??ek[0],y=null,b=()=>(y||(y=new AudioContext),y),w=null,F=()=>(w||(w=((t,e=t.destination)=>({playNote:o=>{let a,r=t.createOscillator(),A=t.createGain();r.type="square",r.frequency.value=(a=o.pitch,440*2**((a-69)/12));let n=t.currentTime+o.when,l=Math.max(1e-4,.06*o.volume*1.5);if(A.gain.setValueAtTime(l,n),A.gain.exponentialRampToValueAtTime(.001,n+o.duration),r.connect(A),"function"==typeof t.createStereoPanner&&o.pan){let a=t.createStereoPanner();a.pan.value=Math.max(-1,Math.min(1,o.pan)),A.connect(a),a.connect(e)}else A.connect(e);r.start(n),r.stop(n+o.duration+.02)},playDrum:o=>{let a=t.currentTime+o.when,r=Math.max(1e-4,Math.min(1,o.velocity)),A=35===o.pitch||36===o.pitch,n=38===o.pitch||39===o.pitch||40===o.pitch;if(A){let o=t.createOscillator(),A=t.createGain();o.frequency.setValueAtTime(150,a),o.frequency.exponentialRampToValueAtTime(50,a+.12),A.gain.setValueAtTime(.9*r,a),A.gain.exponentialRampToValueAtTime(.001,a+.18),o.connect(A).connect(e),o.start(a),o.stop(a+.2),o.onended=()=>o.disconnect();return}let l=n?.18:.05,u=Math.max(1,Math.floor(t.sampleRate*l)),i=t.createBuffer(1,u,t.sampleRate),s=i.getChannelData(0);for(let t=0;t<u;t++)s[t]=2*Math.random()-1;let d=t.createBufferSource();d.buffer=i;let c=t.createBiquadFilter();c.type=n?"bandpass":"highpass",c.frequency.value=n?2e3:8e3;let g=t.createGain();g.gain.setValueAtTime(r*(n?.7:.4),a),g.gain.exponentialRampToValueAtTime(.001,a+l),d.connect(c).connect(g).connect(e),d.start(a),d.stop(a+l),d.onended=()=>{d.disconnect(),c.disconnect(),g.disconnect()}}}))(b())),w),x=null,k=()=>{if(o.singingVoices)return o.singingVoices;if(!x){let t=b();x=t2(t,t.destination)}return x},D=p||!!o.singingVoices,M=t.ownerDocument??document,S=M.createElement("div");S.className="dtm-daw dtm-player";let L=M.createElement("div");L.className="dtm-player-head";let R=M.createElement("button");R.type="button",R.className="dtm-player-play",R.innerHTML=tm("play",12),R.disabled=0===B.length;let N=new Set,T=new Map,U=new Map,J=new Map,P=t=>{N.has(t)?N.delete(t):N.add(t),K(t)},K=t=>{let e=N.has(t),o=J.get(t);o&&o.classList.toggle("is-muted",e);let a=T.get(t);a&&a.classList.toggle("is-muted",e);let r=U.get(t);r&&r.classList.toggle("is-muted",e)},Y=M.createElement("div");Y.className="dtm-player-mml-header";let H=[];for(let t of B){let e=M.createElement("span");e.className="dtm-player-emoji",e.style.backgroundColor=v(t);let o=M.createElement("span");o.textContent="🥺",e.appendChild(o),e.addEventListener("click",e=>{e.stopPropagation(),P(t)}),Y.appendChild(e),H.push(e),U.set(t,e)}let O=M.createElement("div");O.className="dtm-player-more-container";let G=M.createElement("button");G.type="button",G.className="dtm-player-more-btn",G.innerHTML=tm("more",14),G.title="メニュー",O.appendChild(G);let V=M.createElement("div");V.className="dtm-player-menu",V.style.display="none";let q=t=>{let e=M.createElement("button");return e.type="button",e.className="dtm-player-menu-item",e.textContent=t,e},z=q("MMLを表示"),X=q("MML書式とは"),W=q("埋め込む"),j=q("MMLコピー");V.appendChild(z),V.appendChild(X),V.appendChild(W),V.appendChild(j),O.appendChild(V),Y.appendChild(O);let Z=t=>{let e=void 0!==t?t:"none"===V.style.display;V.style.display=e?"flex":"none",e?(G.classList.add("is-active"),M.addEventListener("click",$)):(G.classList.remove("is-active"),M.removeEventListener("click",$))},$=t=>{O.contains(t.target)||Z(!1)};G.addEventListener("click",t=>{t.stopPropagation(),Z()});let tr=null,ti=null,tg=()=>{ti&&(ti.stop(),ti.destroy(),ti=null),tr?.remove(),tr=null},tp=t=>{tg();let e=M.createElement("div");e.className="dtm-modal-overlay";let o=M.createElement("div");o.className="dtm-win dtm-modal";let a=M.createElement("div");a.className="dtm-modal-header";let r=M.createElement("span");r.className="dtm-modal-title",r.textContent=t;let A=M.createElement("button");A.type="button",A.className="dtm-modal-close",A.innerHTML="&times;",A.title="閉じる",a.append(r,A);let n=M.createElement("div");return n.className="dtm-modal-body",o.append(a,n),e.appendChild(o),A.addEventListener("click",t=>{t.stopPropagation(),tg()}),e.addEventListener("click",t=>{t.target===e&&tg()}),M.body.appendChild(e),tr=e,n},tB=(t,e)=>{let o=M.createElement("div");o.style.marginTop="8px";let a=M.createElement("button");a.type="button",a.className="dtm-btn dtm-btn--primary dtm-btn--xs",a.textContent="📋 コピー",a.addEventListener("click",async t=>{t.stopPropagation();let o=await eU(M,e);a.textContent=o?"✓ コピー完了":"コピー失敗",o&&a.classList.add("dtm-btn--success"),setTimeout(()=>{a.textContent="📋 コピー",a.classList.remove("dtm-btn--success")},1200)}),o.appendChild(a),t.appendChild(o)};z.addEventListener("click",t=>{t.stopPropagation(),Z(!1);let o=tp("MML"),a=M.createElement("pre");a.textContent=e,a.style.whiteSpace="pre-wrap",a.style.wordBreak="break-all",o.appendChild(a),tB(o,e)}),X.addEventListener("click",t=>{t.stopPropagation(),Z(!1);let e=tp("MMLの書き方解説");e.innerHTML=ep,(t=>{for(let e of t.querySelectorAll(".dtm-modal-sample-copy-btn")){let t=e;t.addEventListener("click",async e=>{e.stopPropagation();let o=t.getAttribute("data-mml")??"",a=t.textContent,r=await eU(M,o);t.textContent=r?"✓ コピー完了":"コピー失敗",r&&t.classList.add("dtm-btn--success"),setTimeout(()=>{t.textContent=a,t.classList.remove("dtm-btn--success")},1200)})}let e=null,a=t=>{t&&(t.textContent="▶ 試聴",t.classList.remove("dtm-btn--danger"),t.classList.add("dtm-btn--primary"))},r=t=>{t.textContent="■ 停止",t.classList.remove("dtm-btn--primary"),t.classList.add("dtm-btn--danger")};for(let A of t.querySelectorAll(".dtm-modal-sample-play-btn")){let t=A;t.addEventListener("click",A=>{A.stopPropagation();let n=t.getAttribute("data-mml")??"";if(e===t&&ti)return void(ti.isPlaying()?ti.stop():(ti.play(),r(t)));ti&&(ti.stop(),ti.destroy(),ti=null),a(e),e=t;let l=t.closest(".dtm-modal-sample-box"),u=l?.querySelector(".dtm-modal-sample-player-container");u&&(u.innerHTML="",ti=eP(u,n,{onPlayNote:o.onPlayNote,onPlayDrum:o.onPlayDrum,onResumeAudio:o.onResumeAudio,getAudioTime:o.getAudioTime,singingVoices:o.singingVoices,drumPatterns:o.drumPatterns,volume:c,skipConsent:!0,onStop:()=>{e===t&&a(t)}}),r(t),ti.play())})}})(e)}),W.addEventListener("click",async t=>{t.stopPropagation(),Z(!1);let a=tp("埋め込み"),r=M.createElement("p");r.textContent="生成中...",a.appendChild(r);try{let t=o.embedUrl??"https://onjmin.github.io/dtm/demo/embed.html",A=await eJ(e),n=`${t}#${A}`,l=`<iframe src="${n}" width="100%" height="260" frameborder="0" loading="lazy" title="@onjmin/dtm player"></iframe>`;if(!a.isConnected)return;r.remove();let u=M.createElement("p");u.textContent="このHTMLをブログやサイトに貼り付けると、プレイヤーをそのまま埋め込めます。";let i=M.createElement("pre");i.textContent=l,i.style.whiteSpace="pre-wrap",i.style.wordBreak="break-all",a.append(u,i),tB(a,l)}catch(t){console.error("[dtm] failed to generate embed snippet",t),a.isConnected&&(r.textContent="生成に失敗しました")}}),j.addEventListener("click",async t=>{t.stopPropagation(),await eU(M,e)?j.textContent="コピーしました！":j.textContent="コピー失敗",setTimeout(()=>{j.textContent="MMLコピー"},2e3)});let th=new Set;for(let[t,e]of u){let o=U.get(t);if(!o)continue;let a=tO[e.model.toLowerCase()],r=a?eI[a]:void 0;if(!r)continue;let A=M.createElement("img");A.src=r,A.width=20,A.height=20,A.style.borderRadius="50%",A.style.objectFit="cover",A.draggable=!1,th.add(o),o.textContent="",o.appendChild(A);let n=M.createElement("div");n.className="dtm-player-balloon",n.textContent=eS[e.model.toLowerCase()]??e.model,o.appendChild(n),o.addEventListener("mouseenter",()=>{eT(n)}),o.addEventListener("mouseleave",()=>{eL===n&&eN()}),o.addEventListener("click",t=>{t.stopPropagation(),eT(n)})}let tE=new WeakMap,tf=t=>{let e=performance.now(),o=tE.get(t);void 0!==o&&e-o<50||(tE.set(t,e),t.classList.remove("dtm-player-emoji--jump"),t.offsetWidth,t.classList.add("dtm-player-emoji--jump"))},tQ=[],tI=()=>{for(let t of tQ)clearTimeout(t);tQ.length=0},tv=[],ty=t=>{let e=setTimeout(()=>{if(th.has(t))return;let e=t.querySelector("span");e?e.textContent="😌":t.textContent="😌";let o=setTimeout(()=>{if(th.has(t))return;let e=t.querySelector("span");e?e.textContent="🥺":t.textContent="🥺",ty(t)},100+50*Math.random());tv.push(o)},2e3+5e3*Math.random());tv.push(e)};for(let t of H)ty(t);let tb=M.createElement("div");for(let t of(tb.className="dtm-player-dots",tb.style.display="none",B)){let e=M.createElement("span");e.className="dtm-player-dot",e.style.backgroundColor=v(t),tb.appendChild(e)}let tw=M.createElement("div");tw.className="dtm-player-beat-row";let tF=[];for(let t=0;t<4;t++){let t=M.createElement("span");t.className="dtm-player-beat-dot",tw.appendChild(t),tF.push(t)}let tx=M.createElement("span");tx.className="dtm-player-bar",tx.textContent="-",tw.appendChild(tx);let tk=M.createElement("span");tk.className="dtm-player-chord",tk.textContent="",tw.appendChild(tk),L.append(R,tw,tb,Y),S.appendChild(L);let tD=M.createElement("div");tD.className="dtm-player-message",tD.style.display="none",S.appendChild(tD);let tM=null,tS=0,tL=M.createElement("div");tL.className="dtm-player-body",S.appendChild(tL);let tR=[];for(let t of B){let e=u.get(t),o=!!e&&e.syllables.length>0,r=M.createElement("div");r.className="dtm-player-lane-row",J.set(t,r);let n=M.createElement("div");n.className="dtm-player-lane-label dtm-player-lane-label--btn";let l=M.createElement("span");l.className="dtm-player-dot",l.style.backgroundColor=v(t);let i=M.createElement("span");i.className="dtm-player-lane-no",i.textContent=`@${t}`,n.append(l,i),T.set(t,n),n.addEventListener("click",()=>{P(t)});let s=M.createElement("div");s.className="dtm-player-lane",s.style.setProperty("--tk",v(t));let d=[];if(o){let o=a.filter(e=>e.trackIndex===t).sort((t,e)=>t.startStep-e.startStep),r=(e.gate??100)/100,A=new Set(e.lineBreaks??[]);if(e.metaText){let t=M.createElement("span");t.className="dtm-tk dtm-tk--meta",t.textContent=e.metaText,s.appendChild(t)}let n=Math.min(o.length,e.syllables.length);for(let t=0;t<n;t++){let a=o[t];if(A.has(t)){let t=M.createElement("span");t.className="dtm-tk dtm-tk--break",t.textContent="\\n",s.appendChild(t)}let n=M.createElement("span");n.className="dtm-tk dtm-tk--lyric",n.textContent=e.syllables[t].kana,s.appendChild(n),d.push({el:n,startStep:a.startStep,durationSteps:Math.max(1,Math.round(a.durationSteps*r))})}}else for(let e of A?.get(t)??[]){let t=M.createElement("span");t.className=`dtm-tk dtm-tk--${e.type}`,t.textContent=e.text,s.appendChild(t),e.durationSteps>0&&d.push({el:t,startStep:e.startStep,durationSteps:e.durationSteps})}r.append(n,s),tL.appendChild(r),tR.push({lane:s,tokens:d})}let tN=[...new Set([...u.values()].map(t=>t.model))].filter(t=>tG[t]);if(tN.length>0){let t=M.createElement("div");for(let e of(t.className="dtm-player-terms",t.style.fontSize="10px",t.style.color="var(--dtm-warn)",t.style.display="flex",t.style.flexDirection="column",t.style.gap="4px",t.style.marginTop="4px",t.style.padding="0 4px",tN)){let o=M.createElement("div");o.style.display="flex",o.style.alignItems="center",o.style.gap="4px",o.style.flexWrap="wrap";let a=tH[e]??e,r=tG[e],A=M.createElement("span");A.textContent="使用時には";let n=M.createElement("a");n.textContent=`${a}UTAU\u97F3\u6E90`,n.href=r,n.target="_blank",n.rel="noopener",n.style.color="var(--dtm-primary)",n.style.textDecoration="underline";let l=M.createElement("span");l.textContent="の利用規約に従ってください",o.append(A,n,l),t.appendChild(o)}S.appendChild(t)}t.appendChild(S);let tJ=null,tP=(t,e)=>{if(0===e.offsetWidth||0===t.clientWidth)return;let o=e.offsetLeft+e.offsetWidth/2,a=Math.max(0,t.scrollWidth-t.clientWidth),r=o-t.clientWidth/2;t.scrollLeft=Math.max(0,Math.min(r,a))},tK=ey({getTracks:()=>I,getBpm:()=>i,getPlayStartStep:()=>0,getDrumPattern:()=>d,getSoloTrackId:()=>null,getAudioTime:()=>p?b().currentTime:o.getAudioTime?.()??performance.now()/1e3,onPlayNote:t=>{var e;let a=Number(t.trackId);if(N.has(a))return;let r=U.get(a);r&&((e=t.when)<=0?tf(r):tQ.push(setTimeout(()=>tf(r),1e3*e))),(!u.has(a)||tV)&&(o.onPlayNote?.(t),p&&F().playNote(t))},onPlayDrum:t=>{let e=t.velocity*(g/100)*(c/100);o.onPlayDrum?.({...t,velocity:e}),p&&F().playDrum({...t,velocity:e})},onTick:t=>{(t=>{let e=Math.floor(t),o=Math.floor(t/48)%4;for(let t=0;t<4;t++)tF[t].classList.toggle("dtm-player-beat-dot--on",t===o);tx.textContent=String(Math.floor(t/192)+1);let a=Q[e]??"";for(let o of(tk.textContent!==a&&(tk.textContent=a,a&&console.log(`[dtm-player-chord] Active Chord: ${a} (step: ${e})`)),tR)){let e=null;for(let a of o.tokens){let o=t>=a.startStep&&t<a.startStep+a.durationSteps;a.el.classList.toggle("is-active",o),o&&!e&&(e=a)}e&&tP(o.lane,e.el)}})(t)},onEnd:t=>tz(),stepsPerBar:192}),tY=!1,tV=!1,tq=t=>{tY=t,R.innerHTML=tm(t?"stop":"play",12),R.classList.toggle("dtm-player-play--stop",t)},tz=()=>{for(let t of(tq(!1),tI(),tF))t.classList.remove("dtm-player-beat-dot--on");for(let t of(tx.textContent="-",tk.textContent="",tR)){for(let e of t.tokens)e.el.classList.remove("is-active");t.lane.scrollLeft=0}eD===tZ&&(eD=null),o.onStop?.()},tX=async()=>{let t=D&&u.size>0,e=t?[...u.entries()].map(([t,e])=>{let o=I.find(e=>Number(e.id)===t),a=[...o?.notes??[]].sort((t,e)=>t.startStep-e.startStep),r=(e.gate??100)/100,A=(e.octave??0)*12,n=Math.min(a.length,e.syllables.length),l=[];for(let t=0;t<n;t++){let o=a[t];l.push({syllable:e.syllables[t],pitch:o.pitch+A,startSec:o.startStep*C,durationSec:o.durationSteps*C*r})}return{id:String(t),model:e.model,volume:tT(e.volume??200)*(c/100),pan:tU(e.pan??64),notes:l}}):[];if(t){let t=k(),o=ex(tL,{skipLabel:"音声合成をスキップ（元のメロディで再生）",onSkip:()=>{tY&&eD===tZ&&(tV=!0,o.remove(),tK.start(0))}});try{if(await t.loadModels(e.map(t=>t.model)),tV)return;let a=performance.now();await t.warm(e,t1,(t,e)=>{if(!tV)if(0===t)o.setProgress(t,e);else{let r=(performance.now()-a)/1e3/t,A=e-t,n=Math.ceil(A*r);o.setProgress(t,e,n)}})}catch(t){console.warn("[dtm] voice preload failed",t)}finally{o.remove()}if(!tY||eD!==tZ||tV)return}tK.start(0),t&&!tV&&k().startStream(e,tK.getStartTime(),{isAudible:t=>!N.has(Number(t.id)),onLateSkip:()=>{let t;(t=performance.now())-tS<1500||(tS=t,tD.textContent="音声合成が間に合わないため、一部の発音をスキップしました",tD.style.display="",tM&&clearTimeout(tM),tM=setTimeout(()=>{tD.style.display="none",tD.textContent="",tM=null},3e3))}})},tW=()=>{tY||0===B.length||(t=>{try{if(o.skipConsent)return!1;let e=tN.filter(t=>{if(eM.has(t))return!1;try{if("u"<typeof localStorage||!localStorage)return!0;return"true"!==localStorage.getItem(`dtm_agreed_terms_${t}`)}catch(t){return console.warn("[dtm-player] localStorage access denied in consent check",t),!0}});if(0===e.length)return!1;let a=M.createElement("div");a.className="dtm-consent-overlay";let r=M.createElement("div");r.className="dtm-win dtm-consent-modal";let A=M.createElement("div");A.className="dtm-consent-header",A.textContent="利用規約の確認";let n=M.createElement("div");n.className="dtm-consent-body";let l='<p style="margin: 0 0 8px 0; line-height: 1.4; font-weight: bold; color: var(--dtm-danger);">本データには UTAU 歌声音源が含まれています。<br>ご利用にあたっては、以下の音源利用規約への同意が必要です。</p>';for(let t of e){let e=tH[t]||t,o=tG[t];l+=`
					<div style="margin-bottom: 8px; padding: 6px 10px; background: var(--dtm-deep); border: 2px solid var(--c-black); box-shadow: 2px 2px 0 var(--c-black);">
						<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 11px; font-weight: bold; color: var(--dtm-gold);">
							<span>\u4F7F\u7528\u6642\u306B\u306F</span>
							<a href="${o}" target="_blank" rel="noopener noreferrer" style="color: var(--dtm-primary); text-decoration: underline;">${e}UTAU\u97F3\u6E90</a>
							<span>\u306E\u5229\u7528\u898F\u7D04\u306B\u5F93\u3063\u3066\u304F\u3060\u3055\u3044</span>
						</div>
					</div>
				`}n.innerHTML=l;let u=M.createElement("div");u.className="dtm-consent-footer";let i=M.createElement("button");return i.type="button",i.className="dtm-btn dtm-btn--success",i.textContent="同意して利用する",i.onclick=()=>{for(let t of e){try{"u">typeof localStorage&&localStorage&&localStorage.setItem(`dtm_agreed_terms_${t}`,"true")}catch(t){}eM.add(t)}a.remove(),tJ=null,t&&t()},u.appendChild(i),r.append(A,n,u),a.appendChild(r),M.body.appendChild(a),tJ=a,!0}catch(t){return console.error("[dtm-player] Error in checkConsentAndShow:",t),!1}})(()=>tW())||(eD&&eD!==tZ&&eD.stop(),eD=tZ,tV=!1,tq(!0),(async()=>{let t=[],e=o.onResumeAudio?.();if(e&&t.push(e),p){let e=b();"suspended"===e.state&&t.push(e.resume())}t.length>0&&await Promise.all(t),tY&&eD===tZ&&(D&&u.size>0&&k().reset(),await tX())})())},tj=()=>{tY&&(tK.stop(),(o.singingVoices??x)?.stopStream(),tz())};R.addEventListener("click",()=>{tY?tj():tW()});let tZ={play:tW,stop:tj,isPlaying:()=>tY,destroy:()=>{for(let t of(M.removeEventListener("click",$),tK.stop(),(o.singingVoices??x)?.stopStream(),eD===tZ&&(eD=null),y&&(y.close(),y=null),tv))clearTimeout(t);tI(),eL&&S.contains(eL)&&eN(),S.remove(),tJ?.remove(),tg()}};return tZ},eK=`
<div class="dtm-modal-body-content">
  <h4>1. \u57FA\u672C\u306E\u66F8\u304D\u65B9</h4>
  <p>\u30B3\u30FC\u30C9\u540D\uFF08\u548C\u97F3\u8A18\u53F7\uFF09\u3092\u7E26\u7DDA <code>|</code>\u3001\u30B9\u30DA\u30FC\u30B9\u3001\u307E\u305F\u306F\u30AB\u30F3\u30DE\u3067\u533A\u5207\u3063\u3066\u5165\u529B\u3057\u307E\u3059\u3002\u7E26\u7DDA\u3067\u533A\u5207\u308B\u30681\u5C0F\u7BC0\u3054\u3068\u306E\u914D\u7F6E\u306B\u306A\u308A\u307E\u3059\u3002</p>
  <pre>\u4F8B: C | G | Am | F</pre>
  <p style="margin-top:4px;"><small>\u30B3\u30FC\u30C9\u9032\u884C\u3092\u81EA\u5206\u3067\u8003\u3048\u308B\u306E\u304C\u96E3\u3057\u3044\u3068\u304D\u306F\u3001\u30B3\u30FC\u30C9\u9032\u884C\u306E\u5171\u6709\u30B5\u30A4\u30C8\uFF08\u4F8B: <a href="https://rechord.cc/scores" target="_blank" rel="noopener">rechord.cc</a>\uFF09\u304B\u3089\u597D\u304D\u306A\u9032\u884C\u3092\u63A2\u3057\u3066\u30B3\u30D4\u30DA\u3059\u308B\u306E\u3082\u624B\u3067\u3059\u3002\u533A\u5207\u308A\u6587\u5B57\uFF08<code>|</code> / \u30B9\u30DA\u30FC\u30B9 / \u30AB\u30F3\u30DE\uFF09\u3060\u3051\u4E0A\u306E\u5F62\u5F0F\u306B\u5408\u308F\u305B\u308C\u3070\u3001\u305D\u306E\u307E\u307E\u4F7F\u3048\u307E\u3059\u3002</small></p>

  <h4>2. 1\u5C0F\u7BC0\u306B\u8907\u6570\u30B3\u30FC\u30C9\u3092\u5165\u308C\u308B</h4>
  <p>\u5C0F\u7BC0\u306E\u533A\u5207\u308A\uFF08\u7E26\u7DDA <code>|</code>\uFF09\u306E\u4E2D\u306B\u3001\u30B9\u30DA\u30FC\u30B9\u533A\u5207\u308A\u3067\u30B3\u30FC\u30C9\u3092\u4E26\u3079\u307E\u3059\u3002\u7B49\u9593\u9694\u306B\u914D\u7F6E\u3055\u308C\u307E\u3059\u3002</p>
  <pre>\u4F8B: C G | Am F</pre>
  <p style="margin-top:4px;"><small>\uFF081\u5C0F\u7BC0\u76EE\uFF1A\u524D\u534AC\u30FB\u5F8C\u534AG\u30012\u5C0F\u7BC0\u76EE\uFF1A\u524D\u534AAm\u30FB\u5F8C\u534AF\uFF09</small></p>

  <h4>3. \u5BFE\u5FDC\u30B3\u30FC\u30C9\u540D</h4>
  <ul>
    <li>\u30E1\u30B8\u30E3\u30FC / \u30DE\u30A4\u30CA\u30FC: <code>C</code>, <code>Dm</code>, <code>Am</code> \u306A\u3069</li>
    <li>\u30BB\u30D6\u30F3\u30B9: <code>C7</code>, <code>Am7</code>, <code>FM7</code> \u306A\u3069</li>
    <li>\u305D\u306E\u4ED6: <code>Csus4</code>, <code>Cdim</code>, <code>Caug</code>, <code>Cadd9</code> \u306A\u3069</li>
  </ul>

  <h4>4. \u6F14\u594F\u30D1\u30BF\u30FC\u30F3</h4>
  <ul>
    <li><strong>\u30D6\u30ED\u30C3\u30AF</strong>: \u548C\u97F3\u306E\u69CB\u6210\u97F3\u3092\u3059\u3079\u3066\u540C\u6642\u306B\u4F38\u3070\u3057\u3066\u6F14\u594F\u3057\u307E\u3059\u3002</li>
    <li><strong>\u30A2\u30EB\u30DA\u30B8\u30AA</strong>: \u548C\u97F3\u306E\u69CB\u6210\u97F3\u3092\u4F4E\u3044\u9806\u306B\u5206\u6563\u3057\u3066\u6F14\u594F\u3057\u307E\u3059\u3002</li>
    <li><strong>\u30A2\u30EB\u30DA\u30B8\u30AA\uFF08\u30B8\u30E3\u30E9\u30FC\u30F3\uFF09</strong>: \u7D20\u65E9\u304F\u30A2\u30EB\u30DA\u30B8\u30AA\u3092\u9CF4\u3089\u3057\u307E\u3059\u3002</li>
    <li><strong>\u88CF\u6253\u3061</strong>: \u5404\u62CD\u306E\u88CF\uFF088\u5206\u88CF\uFF09\u306E\u30BF\u30A4\u30DF\u30F3\u30B0\u3067\u30B3\u30FC\u30C9\u3092\u523B\u307F\u307E\u3059\u3002</li>
    <li><strong>\u30E4\u30C4\u30E1\u7A74</strong>: \u30EA\u30BA\u30DF\u30AB\u30EB\u306A\u30D4\u30B3\u30D4\u30B3\u30B2\u30FC\u30E0\u98A8\u306E\u4F34\u594F\u30D1\u30BF\u30FC\u30F3\u3067\u3059\u3002</li>
    <li><strong>\u4EA4\u4E92\u594F</strong>: \u30EB\u30FC\u30C8\u97F3\uFF08\u4F4E\u97F3\uFF09\u3068\u30B3\u30FC\u30C9\u69CB\u6210\u97F3\uFF08\u9AD8\u97F3\uFF09\u3092\u4EA4\u4E92\u306B\u523B\u307F\u307E\u3059\u3002</li>
  </ul>
</div>
`,eY=`
<div class="dtm-modal-body-content">
  <h4>1. MIDI\u30D5\u30A1\u30A4\u30EB\u3068\u306F</h4>
  <p>\u300C\u3069\u306E\u97F3\u3092\u30FB\u3044\u3064\u30FB\u3069\u306E\u304F\u3089\u3044\u306E\u9577\u3055\u3067\u9CF4\u3089\u3059\u304B\u300D\u3092\u8A18\u9332\u3057\u305F\u3001\u6F14\u594F\u30C7\u30FC\u30BF\u306E\u30D5\u30A1\u30A4\u30EB\uFF08\u62E1\u5F35\u5B50 <code>.mid</code> / <code>.midi</code>\uFF09\u3067\u3059\u3002\u97F3\u305D\u306E\u3082\u306E\u3067\u306F\u306A\u304F\u697D\u8B5C\u306B\u8FD1\u3044\u30C7\u30FC\u30BF\u306A\u306E\u3067\u3001\u8AAD\u307F\u8FBC\u3093\u3067\u305D\u306E\u307E\u307E\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002</p>

  <h4>2. \u8AAD\u307F\u8FBC\u307F\u306E\u3057\u304B\u305F</h4>
  <ul>
    <li>\u300C\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E\u300D\u304B\u3089 <code>.mid</code> \u30D5\u30A1\u30A4\u30EB\u3092\u9078\u3073\u307E\u3059\u3002</li>
    <li>\u30D5\u30A1\u30A4\u30EB\u5185\u306E\u30C8\u30E9\u30C3\u30AF\u4E00\u89A7\u304C\u51FA\u308B\u306E\u3067\u3001\u53D6\u308A\u8FBC\u307F\u305F\u3044\u30C8\u30E9\u30C3\u30AF\u3092\u9078\u3073\u307E\u3059\u3002</li>
    <li>\u300C\u8AAD\u8FBC\u300D\u3092\u62BC\u3059\u3068\u53CD\u6620\u3055\u308C\u307E\u3059\u3002</li>
  </ul>

  <h4>3. \u30E2\u30FC\u30C9\u306B\u3088\u308B\u53D6\u308A\u8FBC\u307F\u65B9\u306E\u9055\u3044</h4>
  <ul>
    <li><strong>SIMPLE</strong>: \u5404\u30C8\u30E9\u30C3\u30AF\u306E\u7279\u5FB4\u304B\u3089\u3001\u30E1\u30ED\u30C7\u30A3\u30FC\u30FB\u30B5\u30D6\u30E1\u30ED\u30FB\u30D9\u30FC\u30B9\u30FB\u4F34\u594F\u306E4\u3064\u306E\u5F79\u5272\u306B\u81EA\u52D5\u3067\u632F\u308A\u5206\u3051\u3089\u308C\u307E\u3059\u3002</li>
    <li><strong>ADVANCED</strong>: MIDI\u306E\u30C8\u30E9\u30C3\u30AF\u69CB\u6210\u304C\u305D\u306E\u307E\u307E\u53CD\u6620\u3055\u308C\u307E\u3059\uFF081\u5BFE1\uFF09\u3002</li>
  </ul>

  <h4>4. MIDI\u30D5\u30A1\u30A4\u30EB\u3092\u624B\u306B\u5165\u308C\u308B</h4>
  <p>\u624B\u5143\u306BMIDI\u304C\u7121\u3044\u3068\u304D\u306F\u3001\u300C<code>\u66F2\u540D midi</code>\u300D\u306A\u3069\u3067\u691C\u7D22\u3059\u308C\u3070\u3001\u7121\u6599\u3067\u914D\u5E03\u3057\u3066\u3044\u308B\u30B5\u30A4\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u3059\u3002</p>
  <p style="margin-top:4px;"><small>\u307F\u3093\u306A\u304CMIDI\u3092\u6295\u7A3F\u3067\u304D\u308B\u6295\u7A3F\u578B\u30D7\u30E9\u30C3\u30C8\u30D5\u30A9\u30FC\u30E0: <a href="http://picotune.me/" target="_blank" rel="noopener">picotune.me</a>\uFF08\u3044\u308D\u3093\u306A\u30B8\u30E3\u30F3\u30EB\u306EMIDI\u3092\u7121\u6599\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3067\u304D\u307E\u3059\u3002\u30B5\u30A4\u30C8\u4E0A\u3067\u306F\u30C1\u30C3\u30D7\u30C1\u30E5\u30FC\u30F3\u98A8\u306B\u518D\u751F\u3055\u308C\u307E\u3059\uFF09</small></p>
  <p style="margin-top:4px;"><small>\u203B\u691C\u7D22\u3067\u898B\u3064\u304B\u308B\u914D\u5E03\u30B5\u30A4\u30C8\u306F\u3001\u500B\u4EBA\u904B\u55B6\u306E\u3082\u306E\u304B\u3089\u6A29\u5229\u7684\u306B\u30B0\u30EC\u30FC\u306A\u3082\u306E\u307E\u3067\u69D8\u3005\u3067\u3059\u3002\u305D\u306E\u305F\u3081\u3001\u305D\u308C\u3089\u3078\u306E\u76F4\u63A5\u30EA\u30F3\u30AF\u306F\u8F09\u305B\u3066\u3044\u307E\u305B\u3093\u3002\u5229\u7528\u306E\u969B\u306F\u914D\u5E03\u5143\u3084\u6A29\u5229\u95A2\u4FC2\u3092\u3054\u81EA\u8EAB\u3067\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002</small></p>

  <h4>5. UST\uFF08UTAU\uFF09\u306E\u6B4C\u8A5E\u3092\u4F7F\u3046</h4>
  <p>UTAU\u306EUST\u30D5\u30A1\u30A4\u30EB\u304B\u3089\u6B4C\u8A5E\u3060\u3051\u3092\u53D6\u308A\u51FA\u3057\u3066\u3001\u6B4C\u308F\u305B\u308B\u3053\u3068\u3082\u3067\u304D\u307E\u3059\u3002</p>
  <ul>
    <li>\u97F3\u7B26: UTAU\u306A\u3069\u3067UST\u3092MIDI\u306B\u66F8\u304D\u51FA\u3057\u3001\u4E0A\u306E\u624B\u9806\u3067\u8AAD\u307F\u8FBC\u307F\u307E\u3059\u3002</li>
    <li>\u6B4C\u8A5E: \u4E0B\u8A18\u30B5\u30A4\u30C8\u3067UST\u304B\u3089\u6B4C\u8A5E\u30C6\u30AD\u30B9\u30C8\u3092\u629C\u304D\u51FA\u3057\u3001MML/\u6B4C\u8A5E\u5165\u529B\u6B04\u306E <code>@@</code> \u69CB\u6587\u306B\u8CBC\u308A\u4ED8\u3051\u307E\u3059\u3002</li>
  </ul>
  <p style="margin-top:4px;"><small>\u6B4C\u8A5E\u306E\u62BD\u51FA: <a href="https://rpgen3.github.io/ust2txt/" target="_blank" rel="noopener">ust2txt</a></small></p>
</div>
`,eH=[{id:"melody",name:"メロディー",color:[41,173,255],instrument:0,volume:100},{id:"submelody",name:"サブメロ",color:[255,119,168],instrument:1,volume:95},{id:"bass",name:"ベース",color:[0,228,54],instrument:2,volume:88},{id:"chord",name:"伴奏",color:[255,163,0],instrument:3,volume:76}],eO=[{id:"t0",name:"TRACK 01",color:[41,173,255],instrument:0,volume:100},{id:"t1",name:"TRACK 02",color:[0,228,54],instrument:1,volume:100},{id:"t2",name:"TRACK 03",color:[255,119,168],instrument:2,volume:100},{id:"t3",name:"TRACK 04",color:[255,163,0],instrument:3,volume:100},{id:"t4",name:"TRACK 05",color:[255,236,39],instrument:4,volume:100},{id:"t5",name:"TRACK 06",color:[131,118,156],instrument:5,volume:100},{id:"t6",name:"TRACK 07",color:[255,0,77],instrument:6,volume:100},{id:"t7",name:"TRACK 08",color:[255,204,170],instrument:7,volume:100},{id:"t8",name:"TRACK 09",color:[194,195,199],instrument:8,volume:100},{id:"t9",name:"TRACK 10",color:[0,135,81],instrument:9,volume:100},{id:"t10",name:"TRACK 11",color:[171,82,54],instrument:10,volume:100},{id:"t11",name:"TRACK 12",color:[126,37,83],instrument:11,volume:100},{id:"t12",name:"TRACK 13",color:[255,241,232],instrument:12,volume:100},{id:"t13",name:"TRACK 14",color:[120,200,255],instrument:13,volume:100},{id:"t14",name:"TRACK 15",color:[100,255,160],instrument:14,volume:100}],eG=["klatt",...Object.keys(tY)],eV={klatt:"軽量ロボ声",...tH},eq=t=>eV[t]??t,ez=(t,e,o)=>Math.min(Math.max(t,e),o),eX=void 0===Number.MAX_SAFE_INTEGER?0x1fffffffffffff:Number.MAX_SAFE_INTEGER,eW=new WeakMap,ej=(e=(t,e)=>(eW.set(t,e),e),t=>{let o=eW.get(t),a=void 0===o?t.size:o<0x40000000?o+1:0;if(!t.has(a))return e(t,a);if(t.size<0x20000000){for(;t.has(a);)a=Math.floor(0x40000000*Math.random());return e(t,a)}if(t.size>eX)throw Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;t.has(a);)a=Math.floor(Math.random()*eX);return e(t,a)}),eZ=(o=new WeakMap,r=t=>{if(o.has(t))return o.get(t);let e=new Map;return o.set(t,e),e},a=new WeakMap,A=t=>({...t,connect:({call:t})=>async()=>{let{port1:e,port2:o}=new MessageChannel,r=await t("connect",{port:e},[e]);return a.set(o,r),o},disconnect:({call:t})=>async e=>{let o=a.get(e);if(void 0===o)throw Error("The given port is not connected.");await t("disconnect",{portId:o})},isSupported:({call:t})=>()=>t("isSupported")}),n=t=>"function"==typeof t.start,t=>{let e=A(t);return t=>{let o=r(t);t.addEventListener("message",({data:t})=>{let{id:e}=t;if(null!==e&&o.has(e)){let{reject:a,resolve:r}=o.get(e);o.delete(e),void 0===t.error?r(t.result):a(Error(t.error.message))}}),n(t)&&t.start();let a=(e,a=null,r=[])=>new Promise((A,n)=>{let l=ej(o);o.set(l,{reject:n,resolve:A}),null===a?t.postMessage({id:l,method:e},r):t.postMessage({id:l,method:e,params:a},r)}),A=(e,o,a=[])=>{t.postMessage({id:null,method:e,params:o},a)},l={};for(let[t,o]of Object.entries(e))l={...l,[t]:o({call:a,notify:A})};return{...l}}})({parseArrayBuffer:({call:t})=>async e=>t("parse",{arrayBuffer:e},[e])}),e$=new Blob(['(()=>{var e={455(e,t){!function(e){"use strict";var t=function(e){return function(t){var n=e(t);return t.add(n),n}},n=function(e){return function(t,n){return e.set(t,n),n}},r=void 0===Number.MAX_SAFE_INTEGER?9007199254740991:Number.MAX_SAFE_INTEGER,o=536870912,s=2*o,i=function(e,t){return function(n){var i=t.get(n),a=void 0===i?n.size:i<s?i+1:0;if(!n.has(a))return e(n,a);if(n.size<o){for(;n.has(a);)a=Math.floor(Math.random()*s);return e(n,a)}if(n.size>r)throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;n.has(a);)a=Math.floor(Math.random()*r);return e(n,a)}},a=new WeakMap,f=n(a),c=i(f,a),u=t(c);e.addUniqueNumber=u,e.generateUniqueNumber=c}(t)}},t={};function n(r){var o=t[r];if(void 0!==o)return o.exports;var s=t[r]={exports:{}};return e[r].call(s.exports,s,s.exports,n),s.exports}(()=>{"use strict";const e=-32603,t=-32602,r=-32601,o=(e,t)=>Object.assign(new Error(e),{status:t}),s=t=>o(\'The handler of the method called "\'.concat(t,\'" returned an unexpected result.\'),e),i=(t,n)=>async({data:{id:i,method:a,params:f}})=>{const c=n[a];try{if(void 0===c)throw(e=>o(\'The requested method called "\'.concat(e,\'" is not supported.\'),r))(a);const n=void 0===f?c():c(f);if(void 0===n)throw(t=>o(\'The handler of the method called "\'.concat(t,\'" returned no required result.\'),e))(a);const u=n instanceof Promise?await n:n;if(null===i){if(void 0!==u.result)throw s(a)}else{if(void 0===u.result)throw s(a);const{result:e,transferables:n=[]}=u;t.postMessage({id:i,result:e},n)}}catch(e){const{message:n,status:r=-32603}=e;t.postMessage({error:{code:r,message:n},id:i})}};var a=n(455);const f=new Map,c=(e,n,r)=>({...n,connect:({port:t})=>{t.start();const r=e(t,n),o=(0,a.generateUniqueNumber)(f);return f.set(o,()=>{r(),t.close(),f.delete(o)}),{result:o}},disconnect:({portId:e})=>{const n=f.get(e);if(void 0===n)throw(e=>o(\'The specified parameter called "portId" with the given value "\'.concat(e,\'" does not identify a port connected to this worker.\'),t))(e);return n(),{result:null}},isSupported:async()=>{if(await new Promise(e=>{const t=new ArrayBuffer(0),{port1:n,port2:r}=new MessageChannel;n.onmessage=({data:t})=>e(null!==t),r.postMessage(t,[t])})){const e=r();return{result:e instanceof Promise?await e:e}}return{result:!1}}}),u=(e,t,n=()=>!0)=>{const r=c(u,t,n),o=i(e,r);return e.addEventListener("message",o),()=>e.removeEventListener("message",o)},l=e=>void 0!==e.channel,d=e=>e.toString(16).toUpperCase().padStart(2,"0"),g=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=[],s=new Uint8Array(e.buffer,r,n);for(let e=0;e<n;e+=1)o[e]=d(s[e]);return o.join("")},h=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=new Uint8Array(e.buffer,r,n);return String.fromCharCode.apply(null,o)},m=e=>{const t=new DataView(e),n=v(t);let r=14;const o=[];for(let e=0,s=n.numberOfTracks;e<s;e+=1){let e;({offset:r,track:e}=b(t,r)),o.push(e)}return{division:n.division,format:n.format,tracks:o}},p=(e,t,n)=>{let r;const{offset:o,value:s}=T(e,t),i=e.getUint8(o);return r=240===i?y(e,o+1):255===i?U(e,o+1):w(i,e,o+1,n),{...r,event:{...r.event,delta:s},eventTypeByte:i}},v=e=>{if(e.byteLength<14)throw new Error("Expected at least 14 bytes instead of ".concat(e.byteLength));if("MThd"!==h(e,0,4))throw new Error(\'Unexpected characters "\'.concat(h(e,0,4),\'" found instead of "MThd"\'));if(6!==e.getUint32(4))throw new Error("The header has an unexpected length of ".concat(e.getUint32(4)," instead of 6"));const t=e.getUint16(8),n=e.getUint16(10);return{division:e.getUint16(12),format:t,numberOfTracks:n}},U=(e,t)=>{let n;const r=e.getUint8(t),{offset:o,value:s}=T(e,t+1);if(1===r)n={text:h(e,o,s)};else if(2===r)n={copyrightNotice:h(e,o,s)};else if(3===r)n={trackName:h(e,o,s)};else if(4===r)n={instrumentName:h(e,o,s)};else if(5===r)n={lyric:h(e,o,s)};else if(6===r)n={marker:h(e,o,s)};else if(7===r)n={cuePoint:h(e,o,s)};else if(8===r)n={programName:h(e,o,s)};else if(9===r)n={deviceName:h(e,o,s)};else if(10===r||11===r||12===r||13===r||14===r||15===r)n={metaTypeByte:d(r),text:h(e,o,s)};else if(32===r)n={channelPrefix:e.getUint8(o)};else if(33===r)n={midiPort:e.getUint8(o)};else if(47===r)n={endOfTrack:!0};else if(81===r)n={setTempo:{microsecondsPerQuarter:(e.getUint8(o)<<16)+(e.getUint8(o+1)<<8)+e.getUint8(o+2)}};else if(84===r){let t;const r=e.getUint8(o);96&r?32==(96&r)?t=25:64==(96&r)?t=29:96&~r||(t=30):t=24,n={smpteOffset:{frame:e.getUint8(o+3),frameRate:t,hour:31&r,minutes:e.getUint8(o+1),seconds:e.getUint8(o+2),subFrame:e.getUint8(o+4)}}}else if(88===r)n={timeSignature:{denominator:Math.pow(2,e.getUint8(o+1)),metronome:e.getUint8(o+2),numerator:e.getUint8(o),thirtyseconds:e.getUint8(o+3)}};else if(89===r)n={keySignature:{key:e.getInt8(o),scale:e.getInt8(o+1)}};else{if(127!==r)throw new Error(\'Cannot parse a meta event with a type of "\'.concat(d(r),\'"\'));n={sequencerSpecificData:g(e,o,s)}}return{event:n,offset:o+s}},w=(e,t,n,r)=>{const o=128&e?null:r,s=(null===o?e:o)>>4;let i,a=null===o?n:n-1;if(8===s)i={noteOff:{noteNumber:t.getUint8(a),velocity:t.getUint8(a+1)}},a+=2;else if(9===s){const e=t.getUint8(a),n=t.getUint8(a+1);i=0===n?{noteOff:{noteNumber:e,velocity:n}}:{noteOn:{noteNumber:e,velocity:n}},a+=2}else if(10===s)i={keyPressure:{noteNumber:t.getUint8(a),pressure:t.getUint8(a+1)}},a+=2;else if(11===s)i={controlChange:{type:t.getUint8(a),value:t.getUint8(a+1)}},a+=2;else if(12===s)i={programChange:{programNumber:t.getUint8(a)}},a+=1;else if(13===s)i={channelPressure:{pressure:t.getUint8(a)}},a+=1;else{if(14!==s)throw new Error(\'Cannot parse a midi event with a type of "\'.concat(d(s),\'"\'));i={pitchBend:t.getUint8(a)|t.getUint8(a+1)<<7},a+=2}return i.channel=15&(null===o?e:o),{event:i,offset:a}},y=(e,t)=>{const{offset:n,value:r}=T(e,t);return{event:{sysex:g(e,n,r)},offset:n+r}},b=(e,t)=>{if("MTrk"!==h(e,t,4))throw new Error(\'Unexpected characters "\'.concat(h(e,t,4),\'" found instead of "MTrk"\'));const n=[],r=e.getUint32(t+4)+t+8;let o=null,s=t+8;for(;s<r;){const t=p(e,s,o),{event:r,eventTypeByte:i}=t;n.push(r),s=t.offset,l(r)&&(128&i)>0&&(o=i)}return{offset:s,track:n}},T=(e,t)=>{let n=t,r=0;for(;;){const t=e.getUint8(n);if(n+=1,!(t>127))return r+=t,{offset:n,value:r};r+=127&t,r<<=7}};u(self,{parse:({arrayBuffer:e})=>({result:m(e)})})})()})();'],{type:"application/javascript; charset=utf-8"}),e_=URL.createObjectURL(e$),e0=eZ(new Worker(e_));e0.connect,e0.disconnect,e0.isSupported;var e3=e0.parseArrayBuffer;URL.revokeObjectURL(e_);var e1={soundFont:"https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont.mjs",soundFontDrum:"https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_drum.mjs",soundFontList:"https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_list.mjs"},e2=["melody","submelody","bass","chord","t4","t5","t6","t7","t8","t9","t10","t11","t12","t13","t14"],e5=async(t,e)=>{let o=await Promise.resolve().then(()=>{let t=Error("Cannot find module as expression is too dynamic");throw t.code="MODULE_NOT_FOUND",t});return o[e]??o.default},e6=async(e={})=>{let o,a={...e1,...e.cdn},r={midi:!0,chord:!0,presetUI:!0,...e.features},A=e.audioContext??new AudioContext,n=A.createGain();n.gain.value=e.masterVolume??1,n.connect(A.destination);let l=A.createGain();l.gain.value=e.drumVolume??1,l.connect(A.destination);let C=()=>"suspended"===A.state?A.resume():Promise.resolve(),B=e.engines??{},[h,E,f]=await Promise.all([B.SoundFont??e5(a.soundFont,"SoundFont"),B.SoundFont_drum??e5(a.soundFontDrum,"SoundFont_drum"),B.SoundFont_list??e5(a.soundFontList,"SoundFont_list")]);r.midi&&(o=B.parseMidi||(t=>{let e=t.buffer;if(e instanceof ArrayBuffer)return e3(e.slice(t.byteOffset,t.byteOffset+t.byteLength));throw Error("SharedArrayBuffer is not supported for MIDI parsing")}));let Q=t2(A,n,{voiceWorkerUrl:null===e.voiceWorkerUrl?void 0:e.voiceWorkerUrl??(()=>{try{return new t.U(t.r(59911)).href}catch{return}})()}),I=new Promise(t=>{f.init(),f.onload(()=>t())}),v=(async()=>{try{await E.load({ctx:A,font:"FluidR3_GM_sf2_file",id:"0",keys:Object.values(tp)})}catch(t){console.error("[dtm] ドラム音源の読み込みに失敗",t)}})(),y={},b=new Map,w=new Map,F=e.defaultPreset??"retro_game",x=(t,e="simple")=>"simple"!==e?e2[t]??`t${t}`:0===t?"melody":1===t?"submelody":2===t?"bass":"chord",k=(t,e="simple")=>{if("melody"===t||"submelody"===t||"bass"===t||"chord"===t)return t;if(t.startsWith("t")){let o=Number(t.substring(1));if(!isNaN(o))return x(o,e)}return t},D=(t,e)=>t[e]??t.melody,M=(t,e,o="simple")=>{let a=tB[t];if(!a)return;let r=y[D(a,k(e,o))];return r?b.get(r):void 0},S=async(t,e=[...e2],o="simple")=>{let a=tB[t];if(!a)return;await I;let r=new Set;for(let t of e){let e=y[D(a,k(t,o))];e&&r.add(e)}await Promise.all([...r].map(t=>(t=>{if(b.has(t))return Promise.resolve();let e=w.get(t);if(e)return e;let o=`${t}_FluidR3_GM_sf2_file`,a=h.load({ctx:A,fontName:`_tone_${o}`,url:h.toURL(o)}).then(e=>{b.set(t,e)}).catch(e=>{console.error(`[dtm] \u697D\u5668 "${t}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557`,e)}).finally(()=>{w.delete(t)});return w.set(t,a),a})(t)))},L=async(t,e,o,a,r="simple")=>{let A="playing"===t.getPlaybackState();A&&t.pause();let n=a?ex(a):null;t.setLoading?.(!0);try{t.setInstrument(e),await S(e,o,r)}finally{n?.remove(),t.setLoading?.(!1),A&&t.play()}},R=(t,e)=>{let o=t.ownerDocument,a=o.createElement("div");if(a.className=e.className??"dtm-controlbar",null!==e.label){let t=o.createElement("span");t.className="dtm-controlbar-label",t.textContent=e.label??"INSTRUMENT",a.appendChild(t)}let r=o.createElement("select");for(let[t,e]of(r.className="dtm-select dtm-grow",Object.entries(tB))){let a=o.createElement("option");a.value=t,a.textContent=e.displayName,r.appendChild(a)}r.value=e.value&&tB[e.value]?e.value:F,a.appendChild(r);let A=!1,n=async()=>{let t=e.getDaw();if(!t||A)return;A=!0;let o=r.value;e.onChange?.(o);let a=e.getTrackIds?.()??[...e2],n=a.includes("t0");try{await L(t,o,a,e.loadingTarget,n?"advanced":"simple")}finally{A=!1}};return r.addEventListener("change",n),"prepend"===e.position?t.insertBefore(a,t.firstChild):t.appendChild(a),{element:a,select:r,setValue:t=>{tB[t]&&(r.value=t)},getValue:()=>r.value,destroy:()=>{r.removeEventListener("change",n),a.remove()}}};await I,y=await u(),await Promise.all([v,S(F)]);let N=t=>{E.font&&E.play({ctx:A,destination:l,pitch:t.pitch,volume:t.velocity,when:t.when,duration:t.duration})},T=new WeakMap,U=[],J=[],P=[],K=(t,e={})=>{let{preset:a,presetUI:l,onInstrumentChange:u,...B}=e,h=(B.tracks??eH).map(t=>t.id),E=a&&tB[a]?a:F,f=e.initialMML?eE(e.initialMML):{},I=f.instrument&&tB[f.instrument]?f.instrument:E,v=I,y="advanced"===B.mode,b=null,w=((t,e={})=>{let o,a,r,A,n;eF();let l=e.getAudioTime??(()=>performance.now()/1e3),u=e.tracks??eH,C=e.mode??(u.length>eH.length?"advanced":"simple"),B="advanced"===C,h=e.drumPatterns??tC,E=!!e.parseMidi,f=!B,Q=((t,e)=>{let{drumPatternNames:o,defaultDrumPattern:a,defaultBpm:r,showMidi:A}=e,n=['<option value="none">なし</option>'].concat(o.map(t=>`<option value="${t}" ${t===a?"selected":""}>${t}</option>`)).join("");t.innerHTML=`
<div class="dtm-daw" data-dtm="root">
  <div class="dtm-topbar" data-dtm="transport">
    <button class="dtm-iconbtn" data-dtm="prev-bar" title="1\u5C0F\u7BC0\u524D">${tm("chevronLeft")}</button>
    <button class="dtm-play" data-dtm="play" disabled>${tm("play")}<span>\u8A66\u8074</span></button>
    <button class="dtm-iconbtn" data-dtm="next-bar" title="1\u5C0F\u7BC0\u5F8C">${tm("chevronRight")}</button>
    <label class="dtm-toggle"><input type="checkbox" data-dtm="solo"><span>\u30BD\u30ED</span></label>
    <span class="dtm-topbar-loading dtm-blink" data-dtm="topbar-loading">... LOADING ...</span>
    <span class="dtm-grow"></span>
    <span class="dtm-label">BPM</span>
    <input type="number" class="dtm-input dtm-input--num" data-dtm="bpm" value="${r}" min="20" max="300">
  </div>

  <div class="dtm-tooldock">
    <div class="dtm-seg">
      <button class="dtm-segbtn dtm-segbtn--active" data-dtm="tool-pen" title="\u30DA\u30F3">${tm("pen")}</button>
      <button class="dtm-segbtn" data-dtm="tool-select" title="\u9078\u629E">${tm("select")}</button>
      <button class="dtm-segbtn" data-dtm="tool-eraser" title="\u6D88\u3057\u30B4\u30E0">${tm("eraser")}</button>
    </div>
    <button class="dtm-iconbtn" data-dtm="undo" title="\u5143\u306B\u623B\u3059" disabled>${tm("undo")}</button>
    <button class="dtm-iconbtn" data-dtm="redo" title="\u3084\u308A\u76F4\u3057" disabled>${tm("redo")}</button>
    <select class="dtm-select dtm-grow" data-dtm="note-length" title="\u97F3\u7B26\u306E\u9577\u3055">
      <option value="48">4\u5206</option>
      <option value="32">3\u90234</option>
      <option value="24">8\u5206</option>
      <option value="16">3\u90238</option>
      <option value="12" selected>16\u5206</option>
      <option value="8">3\u902316</option>
      <option value="6">32\u5206</option>
      <option value="4">3\u902332</option>
    </select>
  </div>

  <div class="dtm-tracks" data-dtm="track-tabs"></div>

  <div class="dtm-roll-wrap">
    <div class="dtm-roll" data-dtm="roll">
      <div data-dtm="wrapper" style="position:absolute;inset:0;"></div>
      <div class="dtm-overlay" data-dtm="overlay" hidden><div class="dtm-spinner"></div></div>
    </div>
    <div class="dtm-vscroll" data-dtm="vscroll"><div class="dtm-vscroll-thumb" data-dtm="vscroll-thumb"></div></div>
  </div>
  <div class="dtm-hscroll" data-dtm="hscroll"><div class="dtm-hscroll-thumb" data-dtm="hscroll-thumb"></div></div>

  <details class="dtm-panel" open>
    <summary>\u30C8\u30E9\u30C3\u30AF\u8A2D\u5B9A</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <span class="dtm-label">\u5168\u4F53\u97F3\u91CF</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="master-volume" value="50" min="0" max="100">
        <span class="dtm-label" data-dtm="master-volume-label">50%</span>
      </div>
      <div class="dtm-track-body" data-dtm="track-body"></div>
    </div>
  </details>

  <details class="dtm-panel">
    <summary>\u8868\u793A</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <span class="dtm-label">\u6A2A\u30BA\u30FC\u30E0</span>
        <button class="dtm-iconbtn" data-dtm="zoomx-out" title="\u7E2E\u5C0F">\u2212</button>
        <span class="dtm-label" data-dtm="zoomx-label">100%</span>
        <button class="dtm-iconbtn" data-dtm="zoomx-in" title="\u62E1\u5927">\uFF0B</button>
      </div>
      <div class="dtm-row">
        <span class="dtm-label">\u7E26\u30BA\u30FC\u30E0</span>
        <button class="dtm-iconbtn" data-dtm="zoomy-out" title="\u7E2E\u5C0F">\u2212</button>
        <span class="dtm-label" data-dtm="zoomy-label">100%</span>
        <button class="dtm-iconbtn" data-dtm="zoomy-in" title="\u62E1\u5927">\uFF0B</button>
      </div>
    </div>
  </details>

  <details class="dtm-panel">
    <summary>\u30C9\u30E9\u30E0\u8A2D\u5B9A</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <span class="dtm-label">\u30EA\u30BA\u30E0</span>
        <select class="dtm-select" data-dtm="drum-select">${n}</select>
      </div>
      <div class="dtm-row">
        <span class="dtm-label">\u97F3\u91CF</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="drum-volume" value="80" min="0" max="100">
        <span class="dtm-label" data-dtm="drum-volume-label">80%</span>
      </div>
    </div>
  </details>

  <details class="dtm-panel ${A?"":"dtm-hidden"}" data-dtm="midi-panel">
    <summary>MIDI / MML \u5165\u529B</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; min-width: 48px;">
          <span class="dtm-label" style="line-height: 1;">MIDI</span>
          <button class="dtm-infobtn" data-dtm="midi-info" title="MIDI\u306E\u8AAD\u307F\u8FBC\u307F\u89E3\u8AAC">${tm("info",12)}</button>
        </div>
        <input type="file" class="dtm-input dtm-grow" accept=".mid,.midi" data-dtm="midi-input">
        <button class="dtm-btn dtm-btn--success" data-dtm="midi-load">\u8AAD\u8FBC</button>
      </div>
      <div class="dtm-row dtm-hidden" data-dtm="midi-track-selection"></div>
      <div class="dtm-row">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; min-width: 48px;">
          <span class="dtm-label" style="line-height: 1;">MML</span>
          <button class="dtm-infobtn" data-dtm="mml-info" title="MML\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${tm("info",12)}</button>
        </div>
        <textarea class="dtm-textarea dtm-grow" data-dtm="mml-input" placeholder="MML\u3092\u5165\u529B"></textarea>
        <button class="dtm-btn dtm-btn--primary" data-dtm="mml-load">\u8AAD\u8FBC</button>
      </div>
      <p class="dtm-load-note dtm-hidden" data-dtm="mml-load-note"></p>
    </div>
  </details>

  <details class="dtm-panel">
    <summary>\u30DE\u30AF\u30ED</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <span class="dtm-label">\u5168\u4F53\u30B7\u30D5\u30C8</span>
        <select class="dtm-select" data-dtm="shift-select">
          <option value="-192">-1\u5C0F\u7BC0</option>
          <option value="-96">-2\u5206</option>
          <option value="-48">-4\u5206</option>
          <option value="-24">-8\u5206</option>
          <option value="-12">-16\u5206</option>
          <option value="12">+16\u5206</option>
          <option value="24">+8\u5206</option>
          <option value="48">+4\u5206</option>
          <option value="96">+2\u5206</option>
          <option value="192">+1\u5C0F\u7BC0</option>
        </select>
        <button class="dtm-btn dtm-btn--primary" data-dtm="shift-apply">\u9069\u7528</button>
      </div>
      <div class="dtm-row">
        <button class="dtm-btn dtm-btn--danger" data-dtm="macro-clear">\u5168\u6D88\u53BB</button>
        <button class="dtm-btn dtm-btn--accent" data-dtm="macro-random">\u30E9\u30F3\u30C0\u30E0\u914D\u7F6E</button>
        <button class="dtm-btn dtm-btn--primary" data-dtm="macro-harmonic">\u4F34\u594F\u30D5\u30A3\u30EB\u30BF</button>
        <button class="dtm-btn dtm-btn--primary" data-dtm="macro-mono">\u5358\u97F3\u5316</button>
      </div>
    </div>
  </details>

  <details class="dtm-panel">
    <summary>MIDI / MML \u51FA\u529B</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <button class="dtm-btn dtm-btn--accent" data-dtm="export-midi">MIDI\u51FA\u529B</button>
        <button class="dtm-btn dtm-btn--success" data-dtm="generate-mml">MML\u751F\u6210</button>
      </div>
      <label class="dtm-checkbox-label">
        <input type="checkbox" class="dtm-checkbox" data-dtm="decompose-chord">
        <span>\u548C\u97F3\u5206\u89E3\u30E2\u30FC\u30C9\uFF08\u5358\u97F3\u30C8\u30E9\u30C3\u30AF\u306B\u6700\u9069\u5206\u5272\uFF09</span>
      </label>
      <label class="dtm-checkbox-label dtm-checkbox-label--sub">
        <input type="checkbox" class="dtm-checkbox" data-dtm="ignore-chord-heavy">
        <span>\u548C\u97F3\u4F34\u594F\u30C8\u30E9\u30C3\u30AF\u3092\u7121\u8996\uFF08\u5206\u89E3\u5BFE\u8C61\u304B\u3089\u9664\u5916\uFF09</span>
      </label>
      <div class="dtm-row" style="margin-top:6px;align-items:center;gap:8px;">
        <span class="dtm-label">\u751F\u6210\u4E0A\u9650</span>
        <select class="dtm-select" data-dtm="bar-limit">
          <option value="0">\u5236\u9650\u306A\u3057</option>
          <option value="8">8\u5C0F\u7BC0</option>
          <option value="16">16\u5C0F\u7BC0</option>
          <option value="24">24\u5C0F\u7BC0</option>
          <option value="32">32\u5C0F\u7BC0</option>
          <option value="64">64\u5C0F\u7BC0</option>
          <option value="128">128\u5C0F\u7BC0</option>
        </select>
      </div>
      <div class="dtm-output dtm-hidden" data-dtm="output-container">
        <p class="dtm-label" data-dtm="output-status"></p>
        <div class="dtm-output-label">\u6539\u884C\u3042\u308A\u7248</div>
        <div class="dtm-output-row">
          <pre><code data-dtm="output-full"></code></pre>
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-full" title="\u30B3\u30D4\u30FC">${tm("copy")}</button>
        </div>
        <div class="dtm-output-label">\uFF11\u884C\u7248</div>
        <div class="dtm-output-row">
          <pre><code data-dtm="output-mini"></code></pre>
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-mini" title="\u30B3\u30D4\u30FC">${tm("copy")}</button>
        </div>
      </div>
    </div>
  </details>

  <!-- \u2550\u2550\u2550\u2550 \u89E3\u8AAC\u30E2\u30FC\u30C0\u30EB \u2550\u2550\u2550\u2550 -->
  <div class="dtm-modal-overlay" data-dtm="modal-overlay" hidden>
    <div class="dtm-win dtm-modal">
      <div class="dtm-modal-header">
        <span class="dtm-modal-title" data-dtm="modal-title"></span>
        <button class="dtm-modal-close" data-dtm="modal-close">&times;</button>
      </div>
      <div class="dtm-modal-body" data-dtm="modal-body"></div>
    </div>
  </div>

</div>`;let l=t.querySelector('[data-dtm="root"]'),u=t=>{let e;return e=`[data-dtm="${t}"]`,l.querySelector(e)};return{root:l,topbar:u("transport"),topbarLoading:u("topbar-loading"),playBtn:u("play"),prevBarBtn:u("prev-bar"),nextBarBtn:u("next-bar"),soloCheckbox:u("solo"),toolPen:u("tool-pen"),toolSelect:u("tool-select"),toolEraser:u("tool-eraser"),undoBtn:u("undo"),redoBtn:u("redo"),noteLengthSelect:u("note-length"),bpmInput:u("bpm"),zoomXLabel:u("zoomx-label"),zoomYLabel:u("zoomy-label"),zoomXIn:u("zoomx-in"),zoomXOut:u("zoomx-out"),zoomYIn:u("zoomy-in"),zoomYOut:u("zoomy-out"),rollContainer:u("roll"),wrapper:u("wrapper"),vScroll:u("vscroll"),vScrollThumb:u("vscroll-thumb"),hScroll:u("hscroll"),hScrollThumb:u("hscroll-thumb"),masterVolume:u("master-volume"),masterVolumeLabel:u("master-volume-label"),trackTabs:u("track-tabs"),trackBody:u("track-body"),drumSelect:u("drum-select"),drumVolume:u("drum-volume"),drumVolumeLabel:u("drum-volume-label"),midiInput:u("midi-input"),midiLoadBtn:u("midi-load"),midiInfoBtn:u("midi-info"),midiTrackSelection:u("midi-track-selection"),midiPanel:u("midi-panel"),mmlInput:u("mml-input"),mmlLoadBtn:u("mml-load"),mmlLoadNote:u("mml-load-note"),shiftSelect:u("shift-select"),shiftApplyBtn:u("shift-apply"),macroClear:u("macro-clear"),macroRandom:u("macro-random"),macroHarmonic:u("macro-harmonic"),macroMono:u("macro-mono"),exportMidiBtn:u("export-midi"),generateMmlBtn:u("generate-mml"),decomposeChordToggle:u("decompose-chord"),ignoreChordHeavyToggle:u("ignore-chord-heavy"),barLimitSelect:u("bar-limit"),outputContainer:u("output-container"),outputStatus:u("output-status"),outputFull:u("output-full"),outputMini:u("output-mini"),copyFullBtn:u("copy-full"),copyMiniBtn:u("copy-mini"),overlay:u("overlay"),mmlInfoBtn:u("mml-info"),modalOverlay:u("modal-overlay"),modalTitle:u("modal-title"),modalBody:u("modal-body"),modalClose:u("modal-close")}})(t,{tracks:u,drumPatternNames:Object.keys(h),defaultDrumPattern:h.dance?"dance":Object.keys(h)[0]??"none",defaultBpm:e.defaultBpm??120,showMidi:E,showChord:f}),I={stepsPerBar:192,keyCount:128,pitchRangeStart:0,keyHeight:15,stepWidth:1},v=16*I.stepsPerBar,y=100,b=100,w=e.defaultBpm??120,F=50,x=80,k=Q.drumSelect.value,D="",M=u[0].id,S="pen",L=48,R=12,N=0,T=43*I.keyHeight-215,U=0,J=!1,P=new Set,K="stopped",Y=0,H=0,O=!1,G=[],q=null,z=[],X=[],W=()=>X.find(t=>t.config.id===M)??X[0],j=()=>{let t=4*I.stepsPerBar;for(let e of X)for(let o of e.core.getNotes()){let e=o.startStep+o.durationSteps;e>t&&(t=e)}return t},Z=()=>Math.max(0,I.keyCount*I.keyHeight-d.height),$=()=>{for(let t of(((t=1)=>{eu(),ei(),m.clearRect(0,0,d.width,d.height);let{keyHeight:e,keyCount:o,stepWidth:a,stepsPerBar:r}=p,A=Math.floor(er/e)*e,n=er+d.height;for(let t=A;t<n;t+=e){let a=(o-1-t/e)%12,r=en.has(a),A=0===a,n=t-er;r&&(m.fillStyle="#0d1020",m.fillRect(0,n,d.width,e)),m.beginPath(),m.strokeStyle=A?"#3d405b":"#1a1d30",m.lineWidth=1;let l=n+e;m.moveTo(0,l),m.lineTo(d.width,l),m.stroke()}let l=t||48,u=Math.floor(ea/(a*l))*a*l,i=ea+d.width,s=a*l;for(let t=u;t<=i;t+=s){let e=t/a,o=e%r==0,A=e%l==0,n=t-ea;m.beginPath(),m.strokeStyle=o?"#3d405b":A?"#242840":"#1a1d30",m.lineWidth=o?2:1,m.moveTo(n,0),m.lineTo(n,d.height),m.stroke()}})(48),X)){let[e,o,a]=t.config.color,r=t.config.id===M?1:.3;es(t.core.getNotes(),[e,o,a,r])}if("select"===S&&q){let t=m;t.save(),t.strokeStyle="#ffec27",t.lineWidth=2,t.setLineDash([4,4]),t.strokeRect(q.x,q.y,q.width,q.height),t.fillStyle="rgba(255,236,39,0.08)",t.fillRect(q.x,q.y,q.width,q.height),t.restore()}if("select"===S&&G.length>0){let t=new Set(G.map(t=>t.id)),e=W();((t,e,o=[59,130,246,1])=>{let{keyHeight:a,stepWidth:r,keyCount:A,pitchRangeStart:n}=p;for(let l of t){if(!e.has(l.id))continue;let t=l.startStep*r,u=(A-1-(l.pitch-n))*a,i=l.durationSteps*r,s=t-ea,d=u-er,c=void 0!==l.velocity?.5+l.velocity/127*.5:1,[g,p,C,B]=o,h=Math.min(255,1.3*g),E=Math.min(255,1.3*p),f=Math.min(255,1.3*C),Q=B*c;m.fillStyle=`rgba(${h},${E},${f},${Q})`,m.fillRect(s+1,d+1,i-2,a-2)}})(e.core.getNotes(),t,[...e.config.color,1])}(()=>{let t=m,e=d;if(!t)return;let o=U*I.stepWidth-N;o<-10||o>e.width+10||(t.save(),t.strokeStyle="#ffec27",t.lineWidth=2,t.setLineDash([4,4]),t.beginPath(),t.moveTo(o,0),t.lineTo(o,e.height),t.stroke(),t.restore())})(),"playing"===K&&(()=>{let t=m,e=d;if(!t)return;let o=H*I.stepWidth-N;o<0||o>e.width||(t.save(),t.strokeStyle="#ff004d",t.lineWidth=2,t.beginPath(),t.moveTo(o,0),t.lineTo(o,e.height),t.stroke(),t.restore())})(),_()},_=()=>{let t=d,e=j(),o=v*I.stepWidth,a=e*I.stepWidth,r=a-t.width+o,A=Q.hScroll.clientWidth;if(r<=0)Q.hScrollThumb.style.width="100%",Q.hScrollThumb.style.left="0";else{let e=Math.max(40,t.width/(a+o)*A),n=N/r;Q.hScrollThumb.style.width=`${e}px`,Q.hScrollThumb.style.left=`${ez(n*(A-e),0,A-e)}px`}let n=I.keyCount*I.keyHeight,l=Q.vScroll.clientHeight;if(n<=t.height)Q.vScrollThumb.style.height="100%",Q.vScrollThumb.style.top="0";else{let e=Math.max(40,t.height/n*l),o=Z(),a=T/o;Q.vScrollThumb.style.height=`${e}px`,Q.vScrollThumb.style.top=`${a*(l-e)}px`}},tt=!1,te=!1,to=null,ta=!1,tr="rect",tA=null,tn=[],tl=null,tu=t=>{e.onResumeAudio?.();let o=W();tQ(o.config.id,t,o.volume,100,0,.1)},ti=(t,e,o=0)=>{let a=W(),{stepWidth:r,keyHeight:A,keyCount:n,pitchRangeStart:l}=I,u=eA();for(let i of a.core.getNotes()){let a=i.startStep*r,s=(n-1-(i.pitch-l))*A,d=i.durationSteps*r,c=a-u.x,g=s-u.y;if(t>=c-o&&t<=c+d+o&&e>=g-o&&e<=g+A+o)return i}return null},ts=t=>{t.preventDefault(),e.onResumeAudio?.();let{x:o,y:a,step:r,pitch:A}=ed(t),n=W();if("eraser"===S){let t=ti(o,a);t&&n.core.deleteNoteById(t.id);return}if("select"===S){if(G.length>0){let t=ti(o,a);if(t&&G.some(e=>e.id===t.id)){tn=G.map(t=>({id:t.id,startStep:t.startStep,pitch:t.pitch})),ta=!0,tr="move",tA={x:o,y:a,step:r,pitch:A},te=!1,tl=null;return}G=[],q=null}let t=ti(o,a);t?(G=[t],tn=[{id:t.id,startStep:t.startStep,pitch:t.pitch}],ta=!0,tr="move"):(G=[],q=null,ta=!0,tr="rect"),tA={x:o,y:a,step:r,pitch:A},te=!1;return}te=!1;let l=ti(o,a,6);if(l){tu(l.pitch);let{stepWidth:t}=I,e=eA(),a=l.startStep*t-e.x,n=l.durationSteps*t;to=o>=a+n-10&&o<=a+n?{noteId:l.id,mode:"resize",dragOffsetStep:0,dragOffsetPitch:0,startStep:l.startStep,durationSteps:l.durationSteps,lastPreviewPitch:l.pitch}:{noteId:l.id,mode:"move",dragOffsetStep:r-l.startStep,dragOffsetPitch:A-l.pitch,startStep:l.startStep,durationSteps:l.durationSteps,lastPreviewPitch:l.pitch},tt=!0;return}let u=Math.floor(r/L)*L,i=u+L;if(!n.core.getNotes().some(t=>t.pitch===A&&u<t.startStep+t.durationSteps&&i>t.startStep)){n.core.addNote(u,A,{noteLengthSteps:L}),tu(A);let t=n.core.getNotes().find(t=>t.startStep===u&&t.pitch===A);t&&(to={noteId:t.id,mode:"move",dragOffsetStep:0,dragOffsetPitch:0,startStep:t.startStep,durationSteps:t.durationSteps,lastPreviewPitch:t.pitch},te=!0),tt=!0}},td=t=>{let e=W();if("pen"===S){if(!to)return;let{step:a,pitch:r}=ed(t);if(te=!0,"move"===to.mode){var o;let t=Math.round((a-to.dragOffsetStep)/R)*R,A=r-to.dragOffsetPitch;if(o=to.noteId,W().core.getNotes().some(e=>e.id!==o&&e.pitch===A&&t>=e.startStep&&t<e.startStep+e.durationSteps))return;e.core.moveNote(to.noteId,t,A),A!==to.lastPreviewPitch&&(to.lastPreviewPitch=A,tu(A));return}let A=Math.max(Math.round((a-to.startStep+1)/R)*R,R);e.core.resizeNote(to.noteId,A),to.durationSteps=A,L=A,$();return}if("select"===S&&ta&&tA){let{x:o,y:a,step:r,pitch:A}=ed(t);if("rect"===tr){let t={x:Math.min(o,tA.x),y:Math.min(a,tA.y),width:Math.abs(o-tA.x),height:Math.abs(a-tA.y)};q=t;let{stepWidth:r,keyHeight:A,keyCount:n,pitchRangeStart:l}=I,u=eA();G=e.core.getNotes().filter(e=>{let o=e.startStep*r,a=n-1-(e.pitch-l),i=o-u.x,s=a*A-u.y,d=e.durationSteps*r;return t.x<i+d&&t.x+t.width>i&&t.y<s+A&&t.y+t.height>s}),$()}else{let t=Math.round((r-tA.step)/R)*R,o=A-tA.pitch;if(0!==t||0!==o){for(let a of(te=!0,e.core.isBatchOperation||e.core.beginBatch(),G)){let r=tn.find(t=>t.id===a.id);if(!r)continue;let A=r.pitch+o;A>=0&&A<128&&e.core.moveNote(a.id,r.startStep+t,A)}if(G.length>0){let t=G[0],e=tn.find(e=>e.id===t.id);if(e){let t=e.pitch+o;t!==tl&&t>=0&&t<128&&(tl=t,tu(t))}}}$()}}},tc=()=>{if("pen"===S&&to){if(te){let t=W();"move"===to.mode?t.core.moveNoteEnd(to.noteId):t.core.resizeNoteEnd(to.noteId),tt=!0}to=null,te=!1}"select"===S&&ta&&(te&&"move"===tr&&G.length>0&&W().core.endBatch(),ta=!1,tA=null,te=!1,tl=null,q=null,tn=[],$())},tg=()=>{let t=Q.rollContainer.clientWidth||800,e=Q.rollContainer.clientHeight||450;((t,e=800,o=450,a)=>{p=a;let r=document.createElement("canvas");i=r,r.width=e-60,r.height=20,r.style.position="absolute",r.style.left="60px",r.style.top="0px";let A=r.getContext("2d");if(!A)throw Error("Failed to get 2D rendering context for header.");c=A;let n=document.createElement("canvas");s=n,n.width=60,n.height=o-20,n.style.position="absolute",n.style.left="0px",n.style.top="20px";let l=n.getContext("2d");if(!l)throw Error("Failed to get 2D rendering context for keyboard.");g=l;let u=document.createElement("canvas");d=u,u.width=e-60,u.height=o-20,u.style.position="absolute",u.style.left="60px",u.style.top="20px",u.style.touchAction="none";let C=u.getContext("2d",{willReadFrequently:!0});if(!C)throw Error("Failed to get 2D rendering context for grid.");m=C,t.innerHTML="",t.style.position="relative",t.style.width=`${e+60}px`,t.style.height=`${o}px`,t.append(r,n,u),(()=>{let t=s.parentElement;if(!t)return;let e=t.querySelector("#header-corner");e||((e=document.createElement("div")).id="header-corner",e.style.position="absolute",e.style.left="0px",e.style.top="0px",e.style.width="60px",e.style.height="20px",e.style.backgroundColor="#0a0f1f",e.style.borderRight="2px solid #29adff",e.style.borderBottom="2px solid #29adff",t.insertBefore(e,i))})()})(Q.wrapper,t,e,I);let o=d;o.addEventListener("pointerdown",ts),o.addEventListener("dblclick",t=>{t.preventDefault();let{step:e,pitch:o}=ed(t),a=W(),r=a.core.getNotes().find(t=>t.pitch===o&&e>=t.startStep&&e<t.startStep+t.durationSteps);r&&a.core.deleteNoteById(r.id)}),o.addEventListener("wheel",t=>{t.preventDefault(),T=ez(T+t.deltaY,0,Z()),ec(N=Math.max(0,N+t.deltaX),T),$()},{passive:!1}),o.addEventListener("click",()=>{tt&&(tt=!1)});let a=i;a.addEventListener("click",t=>{if("playing"===K)return;let e=a.getBoundingClientRect();U=Math.max(0,Math.floor(Math.floor((t.clientX-e.left+N)/I.stepWidth)/R)*R),"paused"===K&&(K="stopped",tF()),$()}),ec(N,T),$()},tp=()=>{let t=d,e=(N+t.width/2)/I.stepWidth;I.stepWidth=2*y*.5/100,Q.zoomXLabel.textContent=`${y}%`,ec(N=Math.max(0,e*I.stepWidth-t.width/2),T),$()},th=()=>{let t=d,e=(T+t.height/2)/I.keyHeight;I.keyHeight=15*b/100,Q.zoomYLabel.textContent=`${b}%`,T=ez(e*I.keyHeight-t.height/2,0,Z()),ec(N,T),$()},tE=()=>({zoomX:y,zoomY:b,decomposeChord:Q.decomposeChordToggle.checked,ignoreChordHeavy:Q.ignoreChordHeavyToggle.checked}),tf=()=>e.onViewStateChange?.(tE()),tQ=(t,o,a,r,A,n)=>{let l=a/100*(r/127)*(F/100);e.onPlayNote?.({trackId:t,pitch:o,velocity:r,volume:l,when:A,duration:n})},tI=ey({getTracks:()=>X.map(t=>({id:t.config.id,volume:t.volume,notes:t.core.getNotes()})),getBpm:()=>w,getPlayStartStep:()=>U,getDrumPattern:()=>h[k]??null,getSoloTrackId:()=>J?M:null,getAudioTime:l,onPlayNote:t=>{let o=X.findIndex(e=>e.config.id===t.trackId);o>=0&&P.has(o)&&e.singingVoices||e.onPlayNote?.({...t,volume:t.volume*(F/100)})},onPlayDrum:t=>{let o=t.velocity*(x/100)*(F/100);e.onPlayDrum?.({...t,velocity:o})},onTick:t=>{H=t;let e=d.width/I.stepWidth,o=N/I.stepWidth+e-4;if(H>o){let t=Math.round(e/I.stepsPerBar);ec(N+=t*I.stepsPerBar*I.stepWidth,T)}$()},onEnd:t=>{t?(K="paused",Y=H):(K="stopped",H=0),tF(),$()},stepsPerBar:I.stepsPerBar}),tv=async()=>{let t;if("playing"===K)return;await e.onResumeAudio?.();let o="paused"===K?Y:U;e.singingVoices?.reset();let a=(t=new Map,X.forEach((e,o)=>{let a=e.lyricModel.trim(),r=e.lyrics.trim();if(!a||!r)return;let A=tD(r);0!==A.length&&t.set(o,{trackId:o,model:a.toLowerCase(),volume:e.vocalVolume,gate:e.vocalGate,pan:e.vocalPan,octave:e.vocalOctave,syllables:A})}),t);P=new Set(a.keys());let r=60/w/48,A=e.singingVoices?[...a.values()].map(t=>{let e=X[t.trackId],a=[...e?.core.getNotes()??[]].sort((t,e)=>t.startStep-e.startStep),A=(t.gate??100)/100,n=(t.octave??0)*12,l=Math.min(a.length,t.syllables.length),u=[];for(let e=0;e<l;e++){let l=a[e];l.startStep<o||u.push({syllable:t.syllables[e],pitch:l.pitch+n,startSec:(l.startStep-o)*r,durationSec:l.durationSteps*r*A})}return{id:e?.config.id,model:t.model,volume:tT(t.volume??200)*(F/100),pan:tU(t.pan??64),notes:u}}):[],n=e.singingVoices,l=!!n&&A.some(t=>t.notes.length>0);if(l&&n){let t=ex(Q.rollContainer);eg(!0);try{await n.loadModels(A.map(t=>t.model)),await n.warm(A)}catch(t){console.warn("[dtm] voice preload failed",t)}finally{t.remove(),eg(!1)}}if("paused"!==K){let t=d;ec(N=Math.max(0,U*I.stepWidth-.5*t.width),T)}K="playing",tI.start(o),l&&n&&n.startStream(A,tI.getStartTime(),{isAudible:t=>!J||t.id===M}),tF()},ty=()=>{"playing"===K&&(Y=H,tI.stop(),e.singingVoices?.stopStream(),K="paused",tF())},tw=()=>{tI.stop(),e.singingVoices?.stopStream(),K="stopped",H=0,tF(),$()},tF=()=>{let t="playing"===K,e=t?"停止":"paused"===K?"再開":"試聴";Q.playBtn.innerHTML=`${tm(t?"pause":"play")}<span>${e}</span>`,Q.playBtn.classList.toggle("dtm-play--stop",t)},tx=()=>{let t=W().core;Q.undoBtn.disabled=!t.canUndo(),Q.redoBtn.disabled=!t.canRedo()},tk=()=>{for(let t of(Q.trackTabs.innerHTML="",X)){let[e,o,a]=t.config.color,r=document.createElement("button");r.className=`dtm-pill ${t.config.id===M?"dtm-pill--active":""}`,r.style.setProperty("--dtm-pill-color",`rgb(${e},${o},${a})`),r.innerHTML=`<span class="dtm-dot"></span><span>${t.config.name}</span>`,r.addEventListener("click",()=>tM(t.config.id)),Q.trackTabs.appendChild(r)}let t=W();Q.trackBody.innerHTML=`
      <div class="dtm-row">
        <span class="dtm-label">velocity</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="track-vol" min="0" max="127" value="${t.volume}">
        <span class="dtm-label" data-dtm="track-vol-label">${t.volume}</span>
      </div>`;let e=Q.trackBody.querySelector('[data-dtm="track-vol"]'),a=Q.trackBody.querySelector('[data-dtm="track-vol-label"]');if(e.addEventListener("input",()=>{t.volume=Number.parseInt(e.value,10),t.core.setVolume(t.volume),a.textContent=String(t.volume)}),B||"chord"!==t.config.id){let e=document.createElement("div");e.className="dtm-row",e.style.flexDirection="column",e.style.alignItems="stretch",e.innerHTML=`
      <div class="dtm-row">
        <span class="dtm-label">\u266A \u6B4C\u8A5E</span>
        <select class="dtm-select" data-dtm="lyric-model" aria-label="\u6B4C\u5531\u30E2\u30C7\u30EB"></select>
        <img class="dtm-lyric-icon dtm-hidden" data-dtm="lyric-icon" width="20" height="20" alt="" draggable="false">
        <select class="dtm-select" data-dtm="lyric-octave" aria-label="\u30AA\u30AF\u30BF\u30FC\u30D6\uFF08\u97F3\u6E90\u306E\u5F97\u610F\u97F3\u57DF\u306B\u5408\u308F\u305B\u308B\uFF09" title="\u30AA\u30AF\u30BF\u30FC\u30D6">
          <option value="2">+2 oct</option>
          <option value="1">+1 oct</option>
          <option value="0">\xb10 oct</option>
          <option value="-1">-1 oct</option>
          <option value="-2">-2 oct</option>
        </select>
        <span class="dtm-label dtm-grow" data-dtm="lyric-count" style="text-align:right"></span>
      </div>
      <div class="dtm-row dtm-hidden" data-dtm="lyric-terms" style="font-size:10px;gap:4px;color:var(--dtm-warn)">
        <span>\u4F7F\u7528\u6642\u306B\u306F</span>
        <a data-dtm="lyric-terms-link" target="_blank" rel="noopener" style="color:var(--dtm-primary);text-decoration:underline"></a>
        <span>\u306E\u5229\u7528\u898F\u7D04\u306B\u5F93\u3063\u3066\u304F\u3060\u3055\u3044</span>
      </div>
      <div class="dtm-row" data-dtm="lyric-body" style="flex-direction:column;align-items:stretch">
        <div class="dtm-row">
          <span class="dtm-label">\u58F0\u91CF</span>
          <input type="range" class="dtm-range dtm-grow" data-dtm="lyric-vol" min="0" max="400" aria-label="\u6B4C\u5531\u306E\u58F0\u91CF\uFF08100=\u7B49\u500D\u3001100\u8D85\u3067\u30D6\u30FC\u30B9\u30C8\u3001\u65E2\u5B9A200\uFF09">
          <span class="dtm-label" data-dtm="lyric-vol-label"></span>
        </div>
        <div class="dtm-row">
          <span class="dtm-label">\u5B9A\u4F4D</span>
          <input type="range" class="dtm-range dtm-grow" data-dtm="lyric-pan" min="0" max="127" aria-label="\u6B4C\u5531\u306E\u30B9\u30C6\u30EC\u30AA\u5B9A\u4F4D\uFF08\u5DE6\u53F3\uFF09">
          <span class="dtm-label" data-dtm="lyric-pan-label"></span>
        </div>
        <textarea class="dtm-textarea" data-dtm="lyric-input" rows="2" placeholder="\u3072\u3089\u304C\u306A\u30FB\u30AB\u30BF\u30AB\u30CA\u3067\u6B4C\u8A5E\uFF08\u4F8B: \u3069\u308C\u307F\u3075\u3041\u305D\u3089\u3057\u3069\uFF09"></textarea>
      </div>`,Q.trackBody.appendChild(e);let o=e.querySelector('[data-dtm="lyric-model"]'),a=e.querySelector('[data-dtm="lyric-octave"]'),r=e.querySelector('[data-dtm="lyric-icon"]'),A=e.querySelector('[data-dtm="lyric-body"]'),n=e.querySelector('[data-dtm="lyric-input"]'),l=e.querySelector('[data-dtm="lyric-count"]'),u=e.querySelector('[data-dtm="lyric-vol"]'),i=e.querySelector('[data-dtm="lyric-vol-label"]'),s=e.querySelector('[data-dtm="lyric-pan"]'),d=e.querySelector('[data-dtm="lyric-pan-label"]'),c=e.querySelector('[data-dtm="lyric-terms"]'),g=e.querySelector('[data-dtm="lyric-terms-link"]'),m=t=>64===t?"C":t<64?`L${64-t}`:`R${t-64}`,p=(t,e)=>{let a=document.createElement("option");a.value=t,a.textContent=e,o.appendChild(a)};for(let t of(p("","なし"),eG))p(t,eq(t));t.lyricModel&&!eG.includes(t.lyricModel)&&p(t.lyricModel,eq(t.lyricModel)),o.value=t.lyricModel,a.value=String(t.vocalOctave),n.value=t.lyrics,u.value=String(t.vocalVolume),i.textContent=String(t.vocalVolume),s.value=String(t.vocalPan),d.textContent=m(t.vocalPan);let C=()=>{let e=tD(n.value).length;l.textContent=t.lyricModel&&e>0?`${e}\u97F3\u7BC0`:""},B=()=>{let e,o;A.style.display=t.lyricModel?"":"none",a.style.display=t.lyricModel?"":"none",C();let n=t.lyricModel?tG[t.lyricModel]:void 0;if(n){let e=eq(t.lyricModel);g.textContent=`${e}UTAU\u97F3\u6E90`,g.href=n,c.classList.remove("dtm-hidden")}else c.classList.add("dtm-hidden");(o=(e=t.lyricModel?tO[t.lyricModel.toLowerCase()]:void 0)?eI[e]:void 0)?(r.src=o,r.classList.remove("dtm-hidden")):(r.removeAttribute("src"),r.classList.add("dtm-hidden"))};B(),o.addEventListener("change",()=>{t.lyricModel=o.value,B()}),a.addEventListener("change",()=>{t.vocalOctave=Number.parseInt(a.value,10)}),n.addEventListener("input",()=>{t.lyrics=n.value,C()}),u.addEventListener("input",()=>{t.vocalVolume=Number.parseInt(u.value,10),i.textContent=u.value}),s.addEventListener("input",()=>{t.vocalPan=Number.parseInt(s.value,10),d.textContent=m(t.vocalPan)}),d.style.cursor="pointer",d.title="タップで中央(C)へ",d.addEventListener("click",()=>{t.vocalPan=64,s.value="64",d.textContent=m(64)})}if("chord"===t.config.id&&f){let e=document.createElement("div");e.className="dtm-row",e.style.flexDirection="column",e.style.alignItems="stretch",e.innerHTML=`
        <div class="dtm-row" style="justify-content: space-between; align-items: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="dtm-label">\u548C\u97F3</span>
            <button class="dtm-infobtn" data-dtm="chord-info" title="\u30B3\u30FC\u30C9\u9032\u884C\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${tm("info",12)}</button>
          </div>
          <select class="dtm-select" data-dtm="chord-pattern">
            <option value="block">\u30D6\u30ED\u30C3\u30AF</option>
            <option value="arpeggio">\u30A2\u30EB\u30DA\u30B8\u30AA</option>
            <option value="arpeggio-fast">\u30A2\u30EB\u30DA\u30B8\u30AA\uFF08\u30B8\u30E3\u30E9\u30FC\u30F3\uFF09</option>
            <option value="offbeat">\u88CF\u6253\u3061</option>
            <option value="yatsume">\u30E4\u30C4\u30E1\u7A74</option>
            <option value="alternating">\u4EA4\u4E92\u594F</option>
          </select>
        </div>
        <div class="dtm-row">
          <textarea class="dtm-textarea dtm-grow" data-dtm="chord-input" placeholder="\u4F8B: C|G|Am|Em|F|C|F|G">${t.savedChordInput}</textarea>
          <button class="dtm-btn dtm-btn--primary" data-dtm="chord-apply">\u9069\u7528</button>
        </div>`,Q.trackBody.appendChild(e);let a=e.querySelector('[data-dtm="chord-pattern"]'),r=e.querySelector('[data-dtm="chord-input"]');a.value=t.savedChordPattern;let A=()=>{t.savedChordInput=r.value,t.savedChordPattern=a.value};a.addEventListener("change",A),r.addEventListener("input",A),e.querySelector('[data-dtm="chord-info"]').addEventListener("click",()=>{o("コード進行の自動入力解説",eK)}),e.querySelector('[data-dtm="chord-apply"]').addEventListener("click",()=>{A(),tK()})}},tM=t=>{M=t,tk(),tx(),$()},tS=t=>{for(let[e,o]of(S=t,[[Q.toolPen,"pen"],[Q.toolSelect,"select"],[Q.toolEraser,"eraser"]]))e.classList.toggle("dtm-segbtn--active",o===t);"select"!==t&&(q=null,G=[]),$()},tL=()=>{let t=Number(Q.barLimitSelect.value),e=t>0?t*I.stepsPerBar:1/0,o=t=>e===1/0?t:t.filter(t=>t.startStep<e),a=ef({instrument:D||void 0,drum:"none"!==k?k:void 0,volume:F,drumVolume:x,mode:C}," "),r=ef({instrument:D||void 0,drum:"none"!==k?k:void 0,volume:F,drumVolume:x,mode:C},"");if(Q.decomposeChordToggle.checked){let e=Q.ignoreChordHeavyToggle.checked?X.filter(t=>!((t,e=.6)=>{if(t.length<3)return!1;let o=new Map;for(let e of t)o.set(e.startStep,(o.get(e.startStep)??0)+1);return t.filter(t=>(o.get(t.startStep)??0)>=3).length/t.length>=e})(t.core.getNotes())):X,A=X.length-e.length,n=(t=>{let e=[...t].sort((t,e)=>t.startStep-e.startStep||t.pitch-e.pitch),o=[],a=[];for(let t of e){let e=-1,r=1/0;for(let A=0;A<o.length;A++)a[A]<=t.startStep&&a[A]<r&&(r=a[A],e=A);-1===e?(o.push([t]),a.push(t.startStep+t.durationSteps)):(o[e].push(t),a[e]=t.startStep+t.durationSteps)}return o})(o(e.flatMap(t=>t.core.getNotes()))),l=X[0].core,u=n.map((t,e)=>`@${e} ${l.getMMLFromNotes(t,w,100).trim()}`),i=n.map((t,e)=>`@${e}${l.getMMLFromNotes(t,w,100).trim().replace(/\s+/g,"")}`);return{full:[a,...u,tb].filter(t=>t.length>0).join(";\n"),minified:[r,...i,tb].filter(t=>t.length>0).join(";"),ignoredCount:A,trackCount:n.length,barLimit:t}}let A=[],n=[];X.forEach((t,e)=>{let a=o(t.core.getNotes());if(a.length>0){let o=t.core.getMMLFromNotes(a,w,t.volume).trim();A.push(`@${e} ${o}`),n.push(`@${e}${o.replace(/\s+/g,"")}`)}});let l=X.map((t,e)=>({i:e,notes:o(t.core.getNotes()),text:t.lyrics.replace(/[\r\n]+/g," ").trim(),model:t.lyricModel.trim(),vol:t.vocalVolume,gate:t.vocalGate,pan:t.vocalPan,oct:t.vocalOctave})).filter(t=>t.model.length>0&&t.text.length>0&&t.notes.length>0).map(t=>{let e=[200===t.vol?"":`v${t.vol}`,100===t.gate?"":`q${t.gate}`,64===t.pan?"":`p${t.pan}`,0===t.oct?"":`o${t.oct}`].filter(t=>t.length>0).join(" "),o=e?`${t.model} ${e}`:t.model;return`@@${t.i} ${o} ${t.text}`});return{full:[a,...A,...l,tb].filter(t=>t.length>0).join(";\n"),minified:[r,...n,...l,tb].filter(t=>t.length>0).join(";"),ignoredCount:0,trackCount:A.length,barLimit:t}},tR=()=>{let t=Number.MAX_SAFE_INTEGER,e=[];for(let o of X)for(let a of o.core.getNotes())a.startStep<t?(t=a.startStep,e=[a]):a.startStep===t&&e.push(a);return 0===e.length?null:Math.round(e.reduce((t,e)=>t+e.pitch,0)/e.length)},tN=t=>{let e=d;T=ez((I.keyCount-1-(t-I.pitchRangeStart))*I.keyHeight-(e.height-I.keyHeight)/2,0,Z()),ec(N,T)},tJ=()=>{for(let t of X)t.core.resetHistory(),t.core.clearNotesWithoutHistory();$()},tP=t=>{if(!t)return;for(let t of(tw(),tJ(),X))t.core.setLoadMode(!0);let{placements:o,bpm:a,lyrics:r,meta:A,mergedTrackCount:n}=eQ(t,{stepsPerBar:I.stepsPerBar,collectLyrics:!0,clampTrackCount:X.length});for(let t of(A.instrument&&tB[A.instrument]&&(D=A.instrument,e.onInstrumentChange?.(A.instrument)),A.drum&&h[A.drum]&&(k=A.drum,Q.drumSelect.value=A.drum,e.onDrumChange?.(A.drum)),void 0!==A.volume&&(F=A.volume,Q.masterVolume.value=String(A.volume),Q.masterVolumeLabel.textContent=`${A.volume}%`),void 0!==A.drumVolume&&(x=A.drumVolume,Q.drumVolume.value=String(A.drumVolume),Q.drumVolumeLabel.textContent=`${A.drumVolume}%`),X))t.lyrics="",t.lyricModel="",t.vocalVolume=200,t.vocalGate=100,t.vocalPan=64,t.vocalOctave=0;for(let t of(r?.forEach(t=>{let e=X[t.trackId];e&&(e.lyrics=t.syllables.map(t=>t.kana).join(""),e.lyricModel=t.model,e.vocalVolume=t.volume,e.vocalGate=t.gate,e.vocalPan=t.pan,e.vocalOctave=t.octave??0)}),o)){let e=X[t.trackIndex];e&&e.core.addNote(t.startStep,t.pitch,{noteLengthSteps:t.durationSteps})}for(let t of(a&&tq(a),X))t.core.setLoadMode(!1),t.core.addHistoryOnce();U=0,N=0;let l=tR();null!==l?tN(l):ec(N,T),$(),tk(),tx(),!B&&n>0?(Q.mmlLoadNote.textContent="シンプルモードのため、一部のトラックを合算して読み込みました",Q.mmlLoadNote.classList.remove("dtm-hidden")):(Q.mmlLoadNote.textContent="",Q.mmlLoadNote.classList.add("dtm-hidden"))},tK=()=>{let t=W(),e=X.find(t=>"chord"===t.config.id);if(!e)return;let o=(t=>{let{chordStr:e,patternType:o,rootShift:a,bpm:r,stepsPerBar:A}=t,n=[];if(!e.trim())return n;let l=[];try{l=((t,e=120)=>{let o=[],a=60/e*4,r=new Set("ABCDEFG_=%N"),A=0,n=null;for(let e of t.replace(/[！-～]/g,t=>String.fromCharCode(t.charCodeAt(0)-65248)).replace(/　/g," ").split("\n").map(t=>t.trim()))if(!(!e.length||/^#/.test(e)))for(let t of e.split(/[|lｌ→]/)){if(!t.length)continue;let e=A++*a,l=[];for(let e=0;e<t.length;e++){let o=t[e],a=t[e-1],A=t.slice(e-2,e);r.has(o)&&"/"!==a&&"on"!==A&&("N."!==A||"C"!==o)&&l.push(e)}if(!l.length)continue;let u=2**Math.ceil(Math.log2(l.length)),i=a/u;for(let[a,r]of l.entries()){let A=t.slice(r,a===l.length-1?t.length:l[a+1]).replace(/\s+/g,""),u=A[0];if("_"===u||"N"===u){n=null;continue}if("="===u){n&&(n.duration+=i);continue}let s=e+a*i;if("%"===u){if(null===n)continue;n={...n,when:s,duration:i}}else{let t=A.slice(0,"#"===A[1]?2:1),e=A.slice(t.length).replace(/[\s・]/g,"");n={key:t,chord:e,when:s,duration:i}}o.push(n)}null!==n&&u>l.length&&(n.duration+=i*(u-l.length))}return o})(e,r)}catch{l=[]}if(l.length>0){let t=60/r*4/A,e={};for(let o of l){let a=Math.floor(o.when/t),r=Math.floor(o.duration/t);e[a]||(e[a]=[]),e[a].push({key:o.key,chord:o.chord,whenStep:a,durationSteps:r})}for(let t of Object.values(e))for(let e of t){let t;try{t=[...V(`${e.key}${e.chord}`).notes]}catch{continue}let r=e.durationSteps;if("block"===o)for(let o of t)n.push({startStep:e.whenStep,pitch:48+o+a,durationSteps:r,velocity:100});else if("arpeggio"===o){let o=Math.floor(r/t.length);t.forEach((t,A)=>{n.push({startStep:e.whenStep+A*o,pitch:48+t+a,durationSteps:r-A*o,velocity:100})})}else if("arpeggio-fast"===o)t.forEach((t,o)=>{n.push({startStep:e.whenStep+6*o,pitch:48+t+a,durationSteps:Math.max(12,r-6*o),velocity:100})});else if("offbeat"===o){let o=Math.floor(A/4),l=Math.floor(o/2);for(let A=0;A<4;A++){let u=e.whenStep+A*o+l;if(u<e.whenStep+r)for(let e of t)n.push({startStep:u,pitch:48+e+a,durationSteps:Math.min(l,12),velocity:100})}}else if("yatsume"===o){let o=Math.floor(A/4),l=t=>Math.max(1,Math.round(t*o/480)),u=[0,360,960,1320],i=l(360);for(let o of u){let A=e.whenStep+l(o);if(A<e.whenStep+r)for(let e of t)n.push({startStep:A,pitch:48+e+a,durationSteps:i,velocity:100})}}else"alternating"===o&&t.forEach((t,o)=>{let r=o*Math.floor(A/4);n.push({startStep:e.whenStep+r,pitch:48+t+a,durationSteps:Math.max(12,Math.floor(A/4)),velocity:100})})}}else e.split(/[\s,]+/).filter(t=>t).forEach((t,e)=>{let o;try{o=[...V(t).notes]}catch{return}if(0===o.length)return;let r=e*A;o.forEach((t,e)=>{let o=3*e;n.push({startStep:r+o,pitch:48+t+a,durationSteps:A-o,velocity:100})})});return n})({chordStr:t.savedChordInput,patternType:t.savedChordPattern,rootShift:t.savedChordRoot,bpm:w,stepsPerBar:I.stepsPerBar});for(let t of(e.core.clearNotesWithoutHistory(),e.core.beginBatch(),o))e.core.addNote(t.startStep,t.pitch,{noteLengthSteps:Math.max(1,t.durationSteps),velocity:t.velocity});e.core.endBatch(),e.core.addHistoryOnce(),$()},tY=async t=>{if(!e.parseMidi)return;let o=await e.parseMidi(t),a=t6(o).filter(t=>t.selected).map(t=>t.index);tH(o,a)},tH=(t,e)=>{for(let t of(tw(),tJ(),X))t.core.setLoadMode(!0);let{placements:o,bpm:a}=B?((t,e,o)=>{let{tracks:a,division:r}=t,A=t4(t),n=r/48,l=[];return e.forEach((t,e)=>{if(e>=o.length)return;let r=a[t];if(!r)return;let A=o[e],u=[],i=0;for(let t of r)if(i+=t.delta,9!==t.channel){if(t.noteOn&&t.noteOn.velocity>0){let e=t.noteOn.noteNumber,o=t.noteOn.velocity;u.push({pitch:e,velocity:o,start:i,end:null})}else if(t.noteOff||t.noteOn&&0===t.noteOn.velocity){let e=t.noteOff||t.noteOn;if(e){let t=e.noteNumber;for(let e=u.length-1;e>=0;e--)if(u[e].pitch===t&&null===u[e].end){u[e].end=i;break}}}}for(let t of u){if(null===t.end)continue;let e=Math.round(t.start/n),o=Math.max(1,Math.round((t.end-t.start)/n));l.push({trackId:A,startStep:e,pitch:t.pitch,durationSteps:o,velocity:t.velocity})}}),{placements:l,bpm:A}})(t,e,X.map(t=>t.config.id)):((t,e)=>{let{tracks:o,division:a}=t,r=t4(t),A={};for(let t of e){let e=o[t];if(!e)continue;let a=0;for(let t of e)if(a+=t.delta,9!==t.channel){if(t.noteOn&&t.noteOn.velocity>0){let e=t.noteOn.noteNumber,o=t.noteOn.velocity,r=t.channel??0;A[r]||(A[r]=[]),A[r].push({pitch:e,velocity:o,start:a,end:null})}else if(t.noteOff||t.noteOn&&0===t.noteOn.velocity){let e=t.noteOff||t.noteOn;if(e){let o=e.noteNumber,r=t.channel??0;if(A[r])for(let t=A[r].length-1;t>=0;t--){let e=A[r][t];if(e.pitch===o&&null===e.end){e.end=a;break}}}}}}let n=4*a,l=8*n,u={};for(let[t,e]of Object.entries(A)){let o=Number.parseInt(t,10),a=e.filter(t=>null!==t.end);if(0===a.length){u[o]={avgPitch:60,maxSimultaneous:0,hasSubmelodyPattern:!1};continue}let r=a.reduce((t,e)=>t+e.pitch,0)/a.length,A=0,i=[...a].sort((t,e)=>t.start-e.start);for(let t=0;t<i.length;t++){let e=1;for(let o=t+1;o<i.length;o++)i[o].start<i[t].end&&e++;A=Math.max(A,e)}let s=()=>{if(0===i.length)return!1;let t=[],e=i[0].start,o=i[0].end;for(let a=1;a<i.length;a++)i[a].start-i[a-1].end>=n&&(t.push({start:e,end:o}),e=i[a].start),o=i[a].end;return t.push({start:e,end:o}),t.every(t=>t.end-t.start<l)};u[o]={avgPitch:r,maxSimultaneous:A,hasSubmelodyPattern:s()}}let i=Object.keys(A).map(Number).sort((t,e)=>t-e),s=[...i].sort((t,e)=>u[t].avgPitch-u[e].avgPitch),d=u[s[Math.floor(s.length/4)]]?.avgPitch??60,c=i.filter(t=>u[t].avgPitch<=d&&u[t].maxSimultaneous<=2),g=i.filter(t=>u[t].maxSimultaneous<=1&&!c.includes(t)),m=g.filter(t=>u[t].hasSubmelodyPattern),p=g.filter(t=>!u[t].hasSubmelodyPattern),C=i.filter(t=>!c.includes(t)&&!p.includes(t)&&!m.includes(t)),B={melody:p,submelody:m,bass:c,chord:C},h=[],E=a/48;for(let[t,e]of Object.entries(A)){let o=Number.parseInt(t,10),a=null;for(let[t,e]of Object.entries(B))if(e.includes(o)){a=t;break}if(a)for(let t of e){if(null===t.end)continue;let e=Math.round(t.start/E),o=Math.max(1,Math.round((t.end-t.start)/E));h.push({trackId:a,startStep:e,pitch:t.pitch,durationSteps:o,velocity:t.velocity})}}return{placements:h,bpm:r}})(t,e);for(let t of o){let e=X.find(e=>e.config.id===t.trackId);e&&e.core.addNote(t.startStep,t.pitch,{noteLengthSteps:t.durationSteps,velocity:t.velocity})}for(let t of(tq(Math.round(a)),X))t.core.setLoadMode(!1),t.core.addHistoryOnce();U=0,N=0;let r=tR();null!==r?tN(r):ec(N,T),$(),tx()},tV=()=>(t=>{var e;let{tracks:o,drumPattern:a,drumVolume:r=80,bpm:A,stepsPerBar:n}=t,l=[];if(o.forEach((t,e)=>{if(0===t.notes.length)return;let o=e<9?e:e+1&15,a=[];for(let e of t.notes){let r=Math.round(10*e.startStep),A=Math.round((e.startStep+(e.durationSteps||1))*10),n=Math.round((e.velocity??100)*(t.volume??100)/100);a.push({t:r,m:[144|o,e.pitch,n]}),a.push({t:A,m:[144|o,e.pitch,0]})}a.sort((t,e)=>t.t-e.t),l.push(a)}),a&&a.length>0){let t=Math.max(...o.filter(t=>t.notes.length>0).map(t=>Math.max(...t.notes.map(t=>t.startStep+t.durationSteps))),n),e=[],A=Math.ceil(t/n);for(let o=0;o<A;o++){let A=o*n;for(let o of a){let a=A+o.step;if(a>=t)continue;let n=Math.round((o.velocity??1)*(r/100)*127);e.push({t:Math.round(10*a),m:[153,o.pitch,n]}),e.push({t:Math.round((a+1)*10),m:[153,o.pitch,0]})}}e.sort((t,e)=>t.t-e.t),e.length>0&&l.push(e)}let u=[];for(let t of(e=l.length+1,u.push(77,84,104,100),u.push(...t7(6)),u.push(...t8(1)),u.push(...t8(e)),u.push(...t8(480)),ee(u,t=>{t.push(0,255,81,3,...t9(Math.round(6e7/A)))}),l))ee(u,e=>{let o=0;for(let a of t)e.push(...et(a.t-o),...a.m),o=a.t});return new Blob([new Uint8Array(u).buffer],{type:"audio/midi"})})({tracks:X.map(t=>({notes:t.core.getNotes(),volume:t.volume})),drumPattern:h[k],drumVolume:x,bpm:w,stepsPerBar:I.stepsPerBar}),tq=t=>{for(let e of(w=t,Q.bpmInput.value=String(t),X))e.core.setTempo(t)},tz=0,tX=()=>{let t=Date.now();t-tz<100||(tz=t,W().core.undo(),$(),tx())},tW=()=>{W().core.redo(),$(),tx()},tj=t=>{Q.overlay.hidden=!1,eg(!0),setTimeout(()=>{t(),Q.overlay.hidden=!0,eg(!1)},30)},tZ=null,t$=[],t_=t=>{if(t.ctrlKey||t.metaKey)if("KeyZ"!==t.code||t.shiftKey){if("KeyZ"===t.code&&t.shiftKey||"KeyY"===t.code)t.preventDefault(),tW();else if("KeyC"===t.code&&G.length>0)t.preventDefault(),z=[...G];else if("KeyX"===t.code&&G.length>0){t.preventDefault(),z=[...G];let e=W().core;for(let t of(e.beginBatch(),G))e.deleteNoteById(t.id);e.endBatch(),G=[]}else if("KeyV"===t.code&&z.length>0){t.preventDefault();let e=W().core,o=e.getNotes(),a=Math.min(...z.map(t=>t.startStep));for(let t of(e.beginBatch(),z)){let r=U+(t.startStep-a),A=r+t.durationSteps;o.some(e=>e.pitch===t.pitch&&r<e.startStep+e.durationSteps&&A>e.startStep)||e.addNote(r,t.pitch,{noteLengthSteps:t.durationSteps,velocity:t.velocity})}e.endBatch(),$()}}else t.preventDefault(),tX()};tg(),X=u.map(t=>({config:t,core:new em({onMMLGenerated:()=>{},onNotesChanged:()=>{O&&($(),tx())}},t.volume),volume:t.volume,savedChordInput:"",savedChordPattern:"block",savedChordRoot:0,lyrics:"",lyricModel:"",vocalVolume:200,vocalGate:100,vocalPan:64,vocalOctave:0})),O=!0,a=!1,r=!1,Q.hScroll.addEventListener("pointerdown",t=>{a=!0,t.preventDefault(),Q.hScroll.setPointerCapture(t.pointerId),A(t.clientX)}),Q.vScroll.addEventListener("pointerdown",t=>{r=!0,t.preventDefault(),Q.vScroll.setPointerCapture(t.pointerId),n(t.clientY)}),Q.hScroll.addEventListener("pointermove",t=>{a&&A(t.clientX)}),Q.vScroll.addEventListener("pointermove",t=>{r&&n(t.clientY)}),Q.hScroll.addEventListener("pointerup",()=>{a=!1}),Q.vScroll.addEventListener("pointerup",()=>{r=!1}),document.addEventListener("pointermove",t=>{a&&A(t.clientX),r&&n(t.clientY)}),document.addEventListener("pointerup",()=>{a=!1,r=!1}),A=t=>{let e=d,o=j(),a=v*I.stepWidth,r=o*I.stepWidth-e.width+a;if(r<=0)return;let A=Q.hScroll.getBoundingClientRect(),n=Number.parseFloat(Q.hScrollThumb.style.width)||40,l=ez(t-A.left-n/2,0,A.width-n)/(A.width-n);ec(N=ez(l*r,0,r),T),$()},n=t=>{let e=Z();if(e<=0)return;let o=Q.vScroll.getBoundingClientRect(),a=Number.parseFloat(Q.vScrollThumb.style.height)||40,r=ez(t-o.top-a/2,0,o.height-a)/(o.height-a);T=ez(r*e,0,e),ec(N,T),$()},Q.playBtn.addEventListener("click",()=>{"playing"===K?ty():tv()}),Q.playBtn.disabled=!1,Q.prevBarBtn.addEventListener("click",()=>{eB(Math.max(0,Math.floor((eC()-1)/I.stepsPerBar)*I.stepsPerBar))}),Q.nextBarBtn.addEventListener("click",()=>{eB(Math.floor(eC()/I.stepsPerBar+1)*I.stepsPerBar)}),Q.soloCheckbox.addEventListener("change",()=>{J=Q.soloCheckbox.checked}),Q.toolPen.addEventListener("click",()=>tS("pen")),Q.toolSelect.addEventListener("click",()=>tS("select")),Q.toolEraser.addEventListener("click",()=>tS("eraser")),Q.undoBtn.addEventListener("click",tX),Q.redoBtn.addEventListener("click",tW),Q.noteLengthSelect.addEventListener("change",()=>{L=R=Number.parseInt(Q.noteLengthSelect.value,10),$()}),Q.bpmInput.addEventListener("input",()=>{tq(Number.parseInt(Q.bpmInput.value,10)||120)}),Q.zoomXIn.addEventListener("click",()=>{y=Math.min(200,y+25),tp(),tf()}),Q.zoomXOut.addEventListener("click",()=>{y=Math.max(25,y-25),tp(),tf()}),Q.zoomYIn.addEventListener("click",()=>{b=Math.min(200,b+25),th(),tf()}),Q.zoomYOut.addEventListener("click",()=>{b=Math.max(50,b-25),th(),tf()}),Q.decomposeChordToggle.addEventListener("change",tf),Q.ignoreChordHeavyToggle.addEventListener("change",tf),Q.masterVolume.addEventListener("input",()=>{F=Number.parseInt(Q.masterVolume.value,10)||0,Q.masterVolumeLabel.textContent=`${F}%`}),Q.drumSelect.addEventListener("change",()=>{k=Q.drumSelect.value,e.onDrumChange?.(k)}),Q.drumVolume.addEventListener("input",()=>{x=Number.parseInt(Q.drumVolume.value,10)||0,Q.drumVolumeLabel.textContent=`${x}%`}),Q.macroClear.addEventListener("click",()=>{let t=W();t.core.beginBatch(),t.core.clearNotesWithoutHistory(),t.core.endBatch(),t.core.saveHistory(),$()}),Q.macroRandom.addEventListener("click",()=>{((t,e)=>{let{stepsPerBar:o,startStep:a,pitchRangeStart:r}=e,A=r+60,n=t5[Math.floor(Math.random()*t5.length)],l=Math.floor(12*Math.random()),u=[];for(let t=0;t<12;t++){let e=(t-l+12)%12;n.includes(e)&&u.push(A+t)}t.beginBatch();for(let e=0;e<8;e++){let r=a+e*o,A=Math.floor(4*Math.random())+2,n=new Set;for(let e=0;e<A;e++){let e=r+24*Math.floor(o/24*Math.random());if(n.has(e))continue;n.add(e);let a=u[Math.floor(Math.random()*u.length)];t.addNote(e,a,{noteLengthSteps:24})}}t.endBatch(),t.saveHistory()})(W().core,{stepsPerBar:I.stepsPerBar,startStep:U,pitchRangeStart:I.pitchRangeStart}),$()}),Q.macroHarmonic.addEventListener("click",()=>{let t=X.find(t=>"chord"===t.config.id);t&&"chord"!==M&&(((t,e,o)=>{let a=o.stepsPerBar/2,r=t.getNotes().concat(e.getNotes());if(0===r.length)return;let A=Math.ceil(Math.max(...r.map(t=>t.startStep+t.durationSteps))/a),n=new Set;t.beginBatch();for(let o=0;o<A;o++){let r=o*a,A=r+a,l=o%2==0,u=e.getNotes().filter(t=>t.startStep>=r&&t.startStep<A);if(u.length>0?n=new Set(u.map(t=>t.pitch%12)):l&&(n=new Set),0!==n.size)for(let e of t.getNotes().filter(t=>t.startStep>=r&&t.startStep<A))n.has(e.pitch%12)||t.deleteNoteById(e.id)}t.endBatch(),t.saveHistory()})(W().core,t.core,{stepsPerBar:I.stepsPerBar}),$())}),Q.macroMono.addEventListener("click",()=>{let t=X.find(t=>"chord"===t.config.id);t&&"chord"!==M&&(((t,e,o)=>{let a=o.stepsPerBar/2,r=t.getNotes().concat(e.getNotes());if(0===r.length)return;let A=Math.ceil(Math.max(...r.map(t=>t.startStep+t.durationSteps))/a),n=new Set;t.beginBatch();for(let o=0;o<A;o++){let r=o*a,A=r+a,l=o%2==0,u=e.getNotes().filter(t=>t.startStep>=r&&t.startStep<A);if(u.length>0?n=new Set(u.map(t=>t.pitch%12)):l&&(n=new Set),0===n.size)continue;let i=t.getNotes().filter(t=>t.startStep>=r&&t.startStep<A),s=i.filter(t=>n.has(t.pitch%12)),d=new Set(s.map(t=>t.id));for(let e of i)d.has(e.id)||t.deleteNoteById(e.id);let c=new Map;for(let t of s)c.has(t.startStep)||c.set(t.startStep,[]),c.get(t.startStep)?.push(t);for(let e of c.values())if(e.length>1){e.sort((t,e)=>e.pitch-t.pitch);let[,...o]=e;for(let e of o)t.deleteNoteById(e.id)}}t.endBatch(),t.saveHistory()})(W().core,t.core,{stepsPerBar:I.stepsPerBar}),$())}),Q.generateMmlBtn.addEventListener("click",()=>{let{full:t,minified:e,ignoredCount:o,trackCount:a,barLimit:r}=tL();Q.outputFull.textContent=t,Q.outputMini.textContent=e;let A=Q.decomposeChordToggle.checked,n=o>0?` / \u4F34\u594F${o}\u30C8\u30E9\u30C3\u30AF\u9664\u5916`:"",l=r>0?` / \u301C${r}\u5C0F\u7BC0`:"";Q.outputStatus.textContent=`[${A?"和音分解":"通常"}] (${a}\u30C8\u30E9\u30C3\u30AF${n}${l}) \u901A\u5E38: ${t.length}\u6587\u5B57 / minify: ${e.length}\u6587\u5B57`,Q.outputContainer.classList.remove("dtm-hidden"),tx()}),Q.exportMidiBtn.addEventListener("click",()=>{let t=tV(),e=URL.createObjectURL(t),o=document.createElement("a");o.href=e,o.download="dtm.mid",o.click(),URL.revokeObjectURL(e)});let t0=(t,e)=>{navigator.clipboard?.writeText(t),e.classList.add("dtm-btn--success"),setTimeout(()=>e.classList.remove("dtm-btn--success"),1200)};Q.copyFullBtn.addEventListener("click",()=>t0(Q.outputFull.textContent??"",Q.copyFullBtn)),Q.copyMiniBtn.addEventListener("click",()=>t0(Q.outputMini.textContent??"",Q.copyMiniBtn)),Q.mmlLoadBtn.addEventListener("click",()=>tj(()=>tP(Q.mmlInput.value)));let t3=null,t1=null,t2=()=>{if(t3&&(t3.stop(),t3.destroy(),t3=null),t1){t1.textContent="▶ 試聴",t1.classList.remove("dtm-btn--danger"),t1.classList.add("dtm-btn--primary");let t=t1.closest(".dtm-modal-sample-box"),e=t?.querySelector(".dtm-modal-sample-player-container");e&&(e.innerHTML=""),t1=null}};for(let t of(o=(t,o)=>{for(let e of(t2(),Q.modalTitle.textContent=t,Q.modalBody.innerHTML=o,Q.modalOverlay.removeAttribute("hidden"),Q.modalBody.querySelectorAll(".dtm-modal-sample-copy-btn")))e.addEventListener("click",()=>{let t=e.getAttribute("data-mml")||"";navigator.clipboard.writeText(t).then(()=>{let t=e.textContent;e.textContent="✓ コピー完了",e.classList.add("dtm-btn--success"),setTimeout(()=>{e.textContent=t,e.classList.remove("dtm-btn--success")},1200)})});for(let t of Q.modalBody.querySelectorAll(".dtm-modal-sample-play-btn")){let o=t;o.addEventListener("click",()=>{let t=o.closest(".dtm-modal-sample-box"),a=t?.querySelector(".dtm-modal-sample-player-container"),r=o.getAttribute("data-mml")||"";if(t1===o)t3&&t3.isPlaying()?t3.stop():(tw(),t3&&(t3.play(),o.textContent="■ 停止",o.classList.remove("dtm-btn--primary"),o.classList.add("dtm-btn--danger")));else if(t2(),tw(),t1=o,o.textContent="■ 停止",o.classList.remove("dtm-btn--primary"),o.classList.add("dtm-btn--danger"),a){a.innerHTML="";let t=eP(a,r,{onPlayNote:t=>{if(e.onPlayNote){let o=u[Number(t.trackId)],a=o?o.id:t.trackId;e.onPlayNote({...t,trackId:a})}},onPlayDrum:e.onPlayDrum,onResumeAudio:e.onResumeAudio,getAudioTime:e.getAudioTime,singingVoices:e.singingVoices,drumPatterns:e.drumPatterns,volume:F,onStop:()=>{t1===o&&(o.textContent="▶ 試聴",o.classList.remove("dtm-btn--danger"),o.classList.add("dtm-btn--primary"))}});t3=t,t.play()}})}},Q.modalClose.addEventListener("click",()=>{t2(),Q.modalOverlay.setAttribute("hidden","")}),Q.modalOverlay.addEventListener("click",t=>{t.target===Q.modalOverlay&&(t2(),Q.modalOverlay.setAttribute("hidden",""))}),Q.mmlInfoBtn.addEventListener("click",()=>{o("MMLの書き方解説",ep)}),Q.midiInfoBtn.addEventListener("click",()=>{o("MIDIの読み込み解説",eY)}),Q.shiftApplyBtn.addEventListener("click",()=>tj(()=>{((t,e)=>{if(0!==e)for(let o of t)for(let t of[...o.getNotes()]){let a=t.startStep+e;a<0?o.deleteNoteById(t.id):o.moveNote(t.id,a,t.pitch)}})(X.map(t=>t.core),Number.parseInt(Q.shiftSelect.value,10)||0),$()})),E&&(Q.midiInput.addEventListener("change",async()=>{let t=Q.midiInput.files?.[0];if(!t||!e.parseMidi)return;Q.overlay.hidden=!1,eg(!0);let o=new Uint8Array(await t.arrayBuffer());t$=t6(tZ=await e.parseMidi(o)),Q.midiTrackSelection.innerHTML='<span class="dtm-label">トラック</span>',t$.forEach((t,e)=>{let o=document.createElement("button");o.className=`dtm-btn ${t.selected?"dtm-btn--primary":"dtm-btn--ghost"}`,o.dataset.selected=String(t.selected),o.textContent=`${t.name} (${t.noteCount})`,o.addEventListener("click",()=>{let t="true"!==o.dataset.selected;o.dataset.selected=String(t),o.classList.toggle("dtm-btn--primary",t),o.classList.toggle("dtm-btn--ghost",!t)}),Q.midiTrackSelection.appendChild(o),0===e&&(Q.midiTrackSelection.dataset.ready="1")}),Q.midiTrackSelection.classList.remove("dtm-hidden"),Q.overlay.hidden=!0,eg(!1)}),Q.midiLoadBtn.addEventListener("click",()=>{if(!tZ)return;let t=[];Q.midiTrackSelection.querySelectorAll("button").forEach((e,o)=>{"true"===e.dataset.selected&&t.push(t$[o].index)}),0!==t.length&&tj(()=>tH(tZ,t))})),document.addEventListener("keydown",t_),Q.root.querySelectorAll("textarea, input")))t.addEventListener("keydown",t=>{(t.ctrlKey||t.metaKey)&&["KeyZ","KeyY","KeyV","KeyC","KeyX"].includes(t.code)&&t.stopPropagation()});tq(w),tk(),tF(),tx(),$(),e.initialMML&&tP(e.initialMML);let eo=null,el=new ResizeObserver(()=>{eo&&clearTimeout(eo),eo=setTimeout(()=>tg(),150)});el.observe(Q.rollContainer),document.addEventListener("pointermove",td),document.addEventListener("pointerup",tc);let eg=t=>{Q.topbar.classList.toggle("is-loading",t)},eC=()=>"playing"===K?H:"paused"===K?Y:U,eB=async t=>{"playing"===K?(tI.stop(),e.singingVoices?.stopStream(),U=t,Y=t,H=t,K="paused",await tv()):eh(t)},eh=t=>{U=t,Y=t,H=t,K="paused";let e=d;ec(N=Math.max(0,t*I.stepWidth-.5*e.width),T),tF(),$()};return{play:tv,pause:ty,stop:tw,getMML:tL,setInstrument:t=>{D=t},getDrum:()=>k,setDrum:t=>{("none"===t||h[t])&&(k=t,Q.drumSelect.value=t,e.onDrumChange?.(t))},getViewState:tE,setViewState:t=>{"number"==typeof t.zoomX&&(y=ez(t.zoomX,25,200),tp()),"number"==typeof t.zoomY&&(b=ez(t.zoomY,50,200),th()),"boolean"==typeof t.decomposeChord&&(Q.decomposeChordToggle.checked=t.decomposeChord),"boolean"==typeof t.ignoreChordHeavy&&(Q.ignoreChordHeavyToggle.checked=t.ignoreChordHeavy)},loadMML:tP,loadMIDI:tY,exportMIDI:tV,setBpm:tq,getPlaybackState:()=>K,getCurrentPlayStep:eC,forcePauseAt:eh,setLoading:eg,destroy:()=>{tI.stop(),e.singingVoices?.stopStream(),el.disconnect(),document.removeEventListener("pointermove",td),document.removeEventListener("pointerup",tc),document.removeEventListener("keydown",t_),t.innerHTML=""}}})(t,{getAudioTime:()=>A.currentTime,onResumeAudio:C,onPlayNote:t=>{let e=M(v,t.trackId,y?"advanced":"simple");e&&e.play({ctx:A,destination:n,pitch:t.pitch,volume:t.volume,when:t.when,duration:t.duration})},onPlayDrum:N,singingVoices:Q,parseMidi:o,onInstrumentChange:t=>{v=t,b&&b.setValue(t),u?.(t)},...B});if(U.push(w),l??r.presetUI){T.get(t)?.destroy();let e=t.querySelector('[data-dtm="roll"]');b=R(t,{getDaw:()=>w,getTrackIds:()=>h,value:I,loadingTarget:e??t,position:"prepend",onChange:t=>{v=t}}),T.set(t,b)}return w.setInstrument(I),w.setLoading?.(!0),S(I,h,y?"advanced":"simple").finally(()=>{w.setLoading?.(!1)}),{...w,setInstrument:t=>{w.setInstrument(t),v=t,b&&b.setValue(t)},destroy:()=>{w.destroy(),b?.destroy(),T.get(t)===b&&T.delete(t);let e=U.indexOf(w);e>=0&&U.splice(e,1)}}};return{audioContext:A,singingVoices:Q,mountEditor:K,mountPlayer:(t,e,o={})=>{let a=eQ(e,{}),r=a.meta??{},l=r.instrument&&tB[r.instrument]?r.instrument:F,u="advanced"===r.mode,i=[...new Set(a.placements.map(t=>t.trackIndex))].map(t=>x(t,u?"advanced":"simple"));S(l,i.length>0?i:[...e2],u?"advanced":"simple");let s=eP(t,e,{getAudioTime:()=>A.currentTime,onResumeAudio:C,onPlayNote:t=>{let e=M(l,x(Number(t.trackId),u?"advanced":"simple"),u?"advanced":"simple");e&&e.play({ctx:A,destination:n,pitch:t.pitch,volume:t.volume,when:t.when,duration:t.duration})},onPlayDrum:N,singingVoices:Q,...o});return J.push(s),{...s,destroy:()=>{s.destroy();let t=J.indexOf(s);t>=0&&J.splice(t,1)}}},loadPreset:S,defaultPreset:F,mountPresetSelect:R,mountModeSwitch:(t,e)=>{let o=t.ownerDocument,a=e.tracksFor??(t=>"advanced"===t?eO:eH),r={simple:e.labels?.simple??"シンプル",advanced:e.labels?.advanced??"アドバンス"},A=t=>"function"==typeof e.editorOptions?e.editorOptions(t):e.editorOptions??{},n=e.mode??"simple",l=null,u=o.createElement("div");if(u.className=e.className??"dtm-controlbar",null!==e.label){let t=o.createElement("span");t.className="dtm-controlbar-label",t.textContent=e.label??"MODE",u.appendChild(t)}let i=o.createElement("div");i.className="dtm-modeseg";let s=new Map,d=()=>{for(let[t,e]of s)e.classList.toggle("dtm-modebtn--active",t===n)};for(let t of["simple","advanced"]){let e=o.createElement("button");e.type="button",e.className="dtm-modebtn",e.textContent=r[t],e.addEventListener("click",()=>m(t)),i.appendChild(e),s.set(t,e)}u.appendChild(i);let c=(o,r)=>{let n=A(o);l=K(e.editorTarget,{...n,mode:o,tracks:a(o),initialMML:r??n.initialMML}),"prepend"===e.position?t.insertBefore(u,t.firstChild):t.appendChild(u),e.onMount?.(l,o)},g=()=>{if(!l)return;let t=l.getMML().full;return e.onUnmount?.(l,n),l.destroy(),l=null,t};function m(t){if(t===n&&l)return;let o=g();n=t,d(),e.onChange?.(t),c(t,o)}d(),c(n,A(n).initialMML);let p={element:u,getDaw:()=>l,getMode:()=>n,setMode:m,destroy:()=>{g(),u.remove();let t=P.indexOf(p);t>=0&&P.splice(t,1)}};return P.push(p),p},dispose:()=>{for(let t of[...P])t.destroy();for(let t of J)t.destroy();for(let t of U)t.destroy();P.length=0,J.length=0,U.length=0,A.close()}}};t.s(["createDtmStudio",0,e6,"mountMmlPlayer",0,eP])}]);