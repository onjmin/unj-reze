(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,38715,e=>{e.q("/unj-reze/_next/static/media/voice-worker.0-2eet5p8gboy.js")},81927,e=>{"use strict";let t,o,A,a,r,l;async function u(e){let t=await fetch(`https://rpgen3.github.io/soundfont/list/${e}.txt`);return(await t.text()).trim().split("\n")}async function n(){let e={};try{(await u("fontName_surikov")).forEach(t=>{let[o,...A]=t.split(" ");e[A.join(" ")]=o})}catch(e){console.error("Failed to build name-to-key mapping:",e)}return e}var i,s,d,c,g,m,p,C=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],B=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],h=e=>(e%12+12)%12,E=(e,t=!1)=>(t?B:C)[h(e)],Q=class extends Error{constructor(e,t){super(`SyntaxError: ${t}
input.idx: ${e.idx}
input.str: ${e.str}`),this.name="ChordSyntaxError"}},f=(e,t)=>{throw new Q(e,t)},I=class e{static nums=new Set("0123456789");str;nest;idx;constructor(e,t=0){this.str=e,this.nest=t,this.idx=0}get isEOF(){return this.str.length<=this.idx}get char(){return this.str[this.idx]}get num(){let t="";for(;!this.isEOF;){let o=this.char;if(!e.nums.has(o))break;t+=o,this.idx++}return t.length?Number(t):null}slice(e){return this.str.slice(this.idx,this.idx+e)}},v=class{pitch=null;chord=null;isChord=!1;pending=null;nest=-1;get value(){let{pitch:e,chord:t}=this;return new Set([...t].map(t=>t+e))}set value(e){let t=this.pitch;this.chord=new Set([...e].map(e=>e-t))}},y=class{map=new Map;lengths=[];_set(e,t){this.map.set(e,t),this.lengths.includes(e.length)||(this.lengths.push(e.length),this.lengths.sort((e,t)=>t-e))}set(e,t){if(Array.isArray(e))for(let o of e)this._set(o,t);else this._set(e,t)}parse(e){for(let t of this.lengths){let o=e.slice(t);if(this.map.has(o))return e.idx+=o.length,this.map.get(o)}return null}},w=new y;w.set("(",0),w.set(")",1),w.set(",",2),w.set(["/","on"],3);var b=(e,t=new v,o=0)=>{let A=e.idx,a=a=>{let r=e.str.slice(A,a);r.length&&F(new I(r,o),t)};for(;;){let{idx:r}=e;if(e.isEOF)return o&&f(e,`Unclosed ${o} brackets`),a(r),t;let l=w.parse(e);if(null===l){e.idx++;continue}let{pending:u}=t;switch(a(r),l){case 0:b(e,t,o+1);break;case 1:return o-1<0&&f(e,"Unable to close brackets"),t;case 2:t.pending=u;break;case 3:{let A=b(e,new v,o),a=[...t.value];if(A.isChord)t.value=[...A.value].concat(a);else{let e=a.sort((e,t)=>e-t),o=(A.pitch+3)%12-3;if(e[0]<o)for(;e[0]<o;)e.push(e.shift()+12);else for(;;){let t=e[e.length-1]-12;if(t<o)break;e.pop(),e.unshift(t)}e.push(o),t.value=e}}}A=e.idx}},F=(e,t)=>e.isEOF?t:null===t.pitch?R(e,t):null===t.pending?O(e,t):G(e,t),D=new y,k=new y;for(let e of[D,k])e.set(["#","♯"],1),e.set(["b","♭"],-1);D.set("+",1),D.set("-",-1);var x=(e,t=!1)=>(t?k:D).parse(e),M=[0,2,4,5,7,9,11];for(let e of[...M.keys()])M.push(M[e]+12);var S=e=>M[e-1],L=new y;for(let[e,t]of[..."CDEFGAB"].entries())L.set(t,M[e]);var R=(e,t)=>{let o=L.parse(e);null===o&&f(e,"Not found pitch"),t.pitch=o;let A=x(e,!0);return null!==A&&(t.pitch+=A),J(e,t)},U=[0,4,7],T=[0,3,6],N=new y;N.set(["m","min","Min","minor","Minor","-"],[0,3,7]),N.set(["dim","〇"],T),N.set("+",[0,4,8]),N.set(["Φ","φ","ø"],[0,3,6,10]);var J=(e,t)=>{let o=/^maj/i.test(e.str.slice(e.idx))?null:N.parse(e);if(null!==o&&(t.isChord=!0),t.chord=new Set(o||U),o===T){let{num:o}=e,A=t.chord;null!==o&&A.add(S(o)-2)}return t.nest=e.nest,F(e,t)},K=(e,t,o)=>{e.add(S(t)+o)},P=e=>{e.delete(S(5)),e.add(S(5)+1)},Y=(e,t,o,A=!1)=>{5===t?e.delete(S(3)):6===t?e.add(S(6)):69===t?e.add(S(6)).add(S(9)):(t>=7&&e.add(S(7)+(A?-1:0)),t>=9&&e.add(S(9)),t>=11&&e.add(S(11)),t>=13&&e.add(S(13)))},H=new y;H.set("add",K),H.set(["omit","no"],(e,t,o)=>{e.delete(S(t)+o)}),H.set("sus",(e,t,o)=>{e.delete(S(3)),e.add(S(t)+o)}),H.set(["M","maj","Maj","major","Major","△","Δ"],Y),H.set("aug",P);var O=(e,t)=>{t.isChord||(t.isChord=!0);let o=H.parse(e),A=t.chord;if(null===o){let o="+"===e.char,a=x(e),{num:r}=e;if(null===r&&(o?P(A):f(e,"Not found number")),null===a)e.nest===t.nest?Y(A,r,0,!0):K(A,r,0);else A.delete(S(r)),A.add(S(r)+a)}else o===P?P(A):t.pending=o;return F(e,t)},G=(e,t)=>{let o=x(e),{num:A}=e,{pending:a,chord:r}=t;return null===A&&f(e,"Not found number"),a(r,A,null===o?0:o),t.pending=null,F(e,t)},V=e=>{let t=b(new I(e)),o=[...t.value].sort((e,t)=>e-t),A=[...t.chord].sort((e,t)=>e-t),a=[...new Set(o.map(h))].sort((e,t)=>e-t);return{symbol:e,root:h(t.pitch),notes:o,pitchClasses:a,intervals:A}},q=["","m","7","M7","m7","dim","m7b5","aug","6","m6","sus4","sus2","mM7","dim7","7sus4","7#5","add9","madd9","9","M9","m9","69","m69","5"].map((e,t)=>({quality:e,pitchClasses:V(`C${e}`).pitchClasses,priority:t}));let X=new Map;for(let e of q){let t=e.pitchClasses.join(",");X.has(t)||X.set(t,e)}var z=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],W=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17],j=e=>e.reduce((e,t)=>e+t,0)/e.length,Z=(e,t)=>{let o=j(e),A=j(t),a=0,r=0,l=0;for(let u=0;u<e.length;u++){let n=e[u]-o,i=t[u]-A;a+=n*i,r+=n*n,l+=i*i}let u=Math.sqrt(r*l);return 0===u?0:a/u},$=(e,t,o)=>`${E(e,o)} ${t}`,_=e=>({tonic:e.tonic,mode:e.mode,name:e.name}),ee=(e,t)=>e.tonic===t.tonic&&e.mode===t.mode,et=(e,t,o)=>{let A=Array(12).fill(0);for(let a of e){if(a.duration<=0){a.when>=t&&a.when<o&&(A[h(a.pitch)]+=1);continue}let e=Math.max(a.when,t),r=Math.min(a.when+a.duration,o)-e;r>0&&(A[h(a.pitch)]+=r)}return A},eo=(e,t)=>{let o=[];for(let A=0;A<12;A++)for(let a of["major","minor"]){let r="major"===a?z:W,l=e.map((e,t)=>r[h(t-A)]);o.push({tonic:A,mode:a,name:$(A,a,t),score:Z(e,l)})}return o.sort((e,t)=>t.score-e.score),o},eA=e=>{let t=[];for(let o of e){let e=t[t.length-1];e&&ee(e.key,o.key)?e.duration=o.when+o.duration-e.when:t.push({...o})}return t},ea=e=>0===e?1.3:3===e||4===e?1.2:10===e||11===e?.95:6===e||7===e||8===e?.7:.85,er=(()=>{let e=[];for(let t=0;t<12;t++)for(let o of q){let A=new Set,a=Array(12).fill(0),r=new Set;for(let e of o.pitchClasses){r.add(e);let o=h(e+t);A.add(o),a[o]=ea(e)}e.push({root:t,quality:o.quality,priority:o.priority,pcs:A,weights:a,rel:r})}return e})(),el=[0,2,4,5,7,9,11],eu=[0,2,3,5,7,8,10],en=(e,t,o)=>{let A=Array(12).fill(0),a=0,r=1/0,l=-1;for(let u of e){let e=Math.max(u.when,t),n=Math.min(u.when+Math.max(u.duration,0),o),i=u.duration<=0?+(u.when>=t&&u.when<o):Math.max(n-e,0);!(i<=0)&&(A[h(u.pitch)]+=i,a+=i,u.pitch<r&&(r=u.pitch,l=h(u.pitch)))}return{when:t,duration:o-t,profile:a>0?A.map(e=>e/a):A,bass:l,empty:0===a}},ei=["I","II","III","IV","V","VI","VII"],es=(e,t)=>{let o="major"===e.mode?el:eu,A=h(t.root-e.tonic),a=o.indexOf(A),r="";if(-1===a){let e=o.indexOf(h(A-1)),t=o.indexOf(h(A+1));-1!==e?(a=e,r="#"):-1!==t?(a=t,r="b"):(a=0,r="?")}let l=t.rel.has(4),u=t.rel.has(3),n=t.rel.has(6),i=t.rel.has(8),s=t.rel.has(10),d=ei[a],c="";return u&&n?(d=d.toLowerCase(),c=s?"ø7":"°",t.rel.has(9)&&(c="°7")):l&&i?c="+":u&&(d=d.toLowerCase()),c||(t.rel.has(11)?c="M7":s?c="7":t.rel.has(9)&&!t.rel.has(10)&&(c="6")),r+d+c},ed=(e,t)=>{for(let o of e)if(t>=o.when&&t<o.when+o.duration)return o.key;return e.length?e[e.length-1].key:null},ec=(e,t,o)=>{let A=E(e.root,o)+e.quality,a=-1!==t&&t!==e.root&&e.pcs.has(t);return{symbol:a?`${A}/${E(t,o)}`:A,rootSymbol:A,inversion:a,bass:-1===t?e.root:t}},eg={play:{d:"M8 5v14l11-7z"},pause:{d:"M6 5h4v14H6zm8 0h4v14h-4z"},stop:{d:"M6 6h12v12H6z"},record:{d:"M12 6a6 6 0 100 12 6 6 0 000-12z"},undo:{d:"M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",stroke:!0},redo:{d:"M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6",stroke:!0},chevronUp:{d:"M5 15l7-7 7 7",stroke:!0},chevronDown:{d:"M19 9l-7 7-7-7",stroke:!0},chevronLeft:{d:"M15 19l-7-7 7-7",stroke:!0},chevronRight:{d:"M9 5l7 7-7 7",stroke:!0},first:{d:"M18 18l-6-6 6-6M11 18l-6-6 6-6",stroke:!0},copy:{d:"M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",stroke:!0},pen:{d:"M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"},eraser:{d:"M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"},select:{d:"M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2M20 7V5a1 1 0 00-1-1h-2M20 17v2a1 1 0 01-1 1h-2M4 11v2M20 11v2M11 4h2M11 20h2",stroke:!0},settings:{d:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",stroke:!0},info:{d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"}},em=(e,t=20)=>{let o=eg[e];if(!o)return"";let A=o.stroke?'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"':'fill="currentColor"';return`<svg viewBox="0 0 24 24" width="${t}" height="${t}" ${A} aria-hidden="true"><path d="${o.d}"/></svg>`},ep={kick:36,snare:38,clap:39,rimshot:37,hihatClosed:42,hihatPedal:44,hihatOpen:46,tomLow:45,tomMid:47,tomHigh:50,crash:49,ride:51,splash:55,tambourine:54},eC={"4beat":[{step:0,pitch:ep.kick,velocity:1},{step:48,pitch:ep.kick,velocity:.9},{step:96,pitch:ep.kick,velocity:1},{step:144,pitch:ep.kick,velocity:.9}],"8beat":[{step:0,pitch:ep.kick,velocity:1},{step:0,pitch:ep.hihatClosed,velocity:.8},{step:24,pitch:ep.hihatClosed,velocity:.5},{step:48,pitch:ep.snare,velocity:1},{step:48,pitch:ep.clap,velocity:.6},{step:48,pitch:ep.hihatClosed,velocity:.8},{step:72,pitch:ep.hihatClosed,velocity:.5},{step:96,pitch:ep.kick,velocity:.9},{step:96,pitch:ep.hihatClosed,velocity:.8},{step:120,pitch:ep.hihatClosed,velocity:.5},{step:144,pitch:ep.snare,velocity:1},{step:144,pitch:ep.hihatClosed,velocity:.8},{step:168,pitch:ep.hihatClosed,velocity:.5}],"16beat":[{step:0,pitch:ep.kick,velocity:1},{step:0,pitch:ep.hihatClosed,velocity:.8},{step:12,pitch:ep.hihatClosed,velocity:.4},{step:24,pitch:ep.hihatClosed,velocity:.6},{step:36,pitch:ep.hihatClosed,velocity:.4},{step:48,pitch:ep.snare,velocity:1},{step:48,pitch:ep.hihatClosed,velocity:.8},{step:60,pitch:ep.hihatClosed,velocity:.4},{step:72,pitch:ep.hihatClosed,velocity:.6},{step:84,pitch:ep.hihatClosed,velocity:.4},{step:96,pitch:ep.kick,velocity:.9},{step:96,pitch:ep.hihatClosed,velocity:.8},{step:108,pitch:ep.kick,velocity:.7},{step:108,pitch:ep.hihatClosed,velocity:.4},{step:120,pitch:ep.hihatClosed,velocity:.6},{step:132,pitch:ep.hihatClosed,velocity:.4},{step:144,pitch:ep.snare,velocity:1},{step:144,pitch:ep.hihatClosed,velocity:.8},{step:156,pitch:ep.hihatClosed,velocity:.4},{step:168,pitch:ep.hihatClosed,velocity:.6},{step:180,pitch:ep.hihatClosed,velocity:.4}],shuffle:[{step:0,pitch:ep.kick,velocity:1},{step:0,pitch:ep.hihatClosed,velocity:.8},{step:32,pitch:ep.hihatClosed,velocity:.5},{step:48,pitch:ep.snare,velocity:1},{step:48,pitch:ep.hihatClosed,velocity:.8},{step:80,pitch:ep.hihatClosed,velocity:.5},{step:96,pitch:ep.kick,velocity:.9},{step:96,pitch:ep.hihatClosed,velocity:.8},{step:128,pitch:ep.hihatClosed,velocity:.5},{step:144,pitch:ep.snare,velocity:1},{step:144,pitch:ep.hihatClosed,velocity:.8},{step:176,pitch:ep.hihatClosed,velocity:.5}],dance:[{step:0,pitch:ep.kick,velocity:1},{step:24,pitch:ep.hihatOpen,velocity:.7},{step:48,pitch:ep.kick,velocity:1},{step:48,pitch:ep.clap,velocity:1},{step:72,pitch:ep.hihatOpen,velocity:.7},{step:96,pitch:ep.kick,velocity:1},{step:120,pitch:ep.hihatOpen,velocity:.7},{step:144,pitch:ep.kick,velocity:1},{step:144,pitch:ep.clap,velocity:1},{step:168,pitch:ep.hihatOpen,velocity:.7}],bossa:[{step:0,pitch:ep.kick,velocity:.9},{step:0,pitch:ep.hihatClosed,velocity:.6},{step:24,pitch:ep.hihatClosed,velocity:.4},{step:48,pitch:ep.rimshot,velocity:.8},{step:48,pitch:ep.hihatClosed,velocity:.6},{step:72,pitch:ep.kick,velocity:.7},{step:72,pitch:ep.hihatClosed,velocity:.4},{step:96,pitch:ep.kick,velocity:.9},{step:96,pitch:ep.hihatClosed,velocity:.6},{step:120,pitch:ep.hihatClosed,velocity:.4},{step:144,pitch:ep.rimshot,velocity:.8},{step:144,pitch:ep.hihatClosed,velocity:.6},{step:168,pitch:ep.hihatClosed,velocity:.4}],disco:[{step:0,pitch:ep.kick,velocity:1},{step:0,pitch:ep.hihatClosed,velocity:.7},{step:24,pitch:ep.tambourine,velocity:.8},{step:48,pitch:ep.snare,velocity:1},{step:48,pitch:ep.hihatClosed,velocity:.7},{step:72,pitch:ep.tambourine,velocity:.8},{step:96,pitch:ep.kick,velocity:1},{step:96,pitch:ep.hihatClosed,velocity:.7},{step:120,pitch:ep.tambourine,velocity:.8},{step:144,pitch:ep.snare,velocity:1},{step:144,pitch:ep.hihatClosed,velocity:.7},{step:168,pitch:ep.tambourine,velocity:.8}]};function eB(e){let t=new DataView(e);if(t.byteLength<8||0x4b4f4500!==t.getUint32(0,!1))throw Error("Not a .koe file (bad magic)");return{jsonLength:t.getUint32(4,!0)}}var eh=class{constructor(e,t){this.blob=e,this.base=t}blob;base;readBytes(e,t){let o=this.base+e;return this.blob.slice(o,o+t).arrayBuffer()}},eE=class{constructor(e,t){this.url=e,this.base=t}url;base;async readBytes(e,t){let o=this.base+e,A=await fetch(this.url,{headers:{Range:`bytes=${o}-${o+t-1}`}});if(!A.ok&&206!==A.status)throw Error(`.koe range request failed: ${A.status}`);return A.arrayBuffer()}};async function eQ(e,t,o){let A=await fetch(e,{headers:{Range:`bytes=${t}-${t+o-1}`}});if(!A.ok&&206!==A.status)throw Error(`.koe fetch failed: ${A.status}`);return A.arrayBuffer()}var ef=class e{constructor(e,t){this.manifest=e,this.source=t}manifest;source;static async load(t){if("string"==typeof t){let{jsonLength:o}=eB(await eQ(t,0,8)),A=await eQ(t,8,o);return new e(JSON.parse(new TextDecoder().decode(A)),new eE(t,8+o))}let{jsonLength:o}=eB(await t.slice(0,8).arrayBuffer()),A=await t.slice(8,8+o).arrayBuffer();return new e(JSON.parse(new TextDecoder().decode(A)),new eh(t,8+o))}has(e){return void 0!==this.manifest.phonemes[e]}async readPcmBytes(e){let t=this.manifest.phonemes[e];return t?this.source.readBytes(t.offset,2*t.length):null}async getPcm(e){let t=await this.readPcmBytes(e);if(!t)return null;let o=new Int16Array(t),A=new Float64Array(o.length);for(let e=0;e<o.length;e++)A[e]=o[e]/32768;return A}},eI=new Map,ev=class e{constructor(e){this.wasm=e}wasm;sampleRate=48e3;static async load(t){return new e(await function(e){let t,o=eI.get(e);if(o)return o;let A=e.slice(0,e.lastIndexOf("/")+1),a=()=>{let e=globalThis.WorldlineModule;if(!e)throw Error("worldline: WorldlineModule global was not defined by the script");return e({locateFile:e=>A+e})};if("u">typeof document)t=new Promise((t,o)=>{if(document.querySelector(`script[data-koe-worldline="${e}"]`))return void t();let A=document.createElement("script");A.src=e,A.dataset.koeWorldline=e,A.onload=()=>t(),A.onerror=()=>o(Error(`worldline: failed to load ${e}`)),document.head.appendChild(A)}).then(a);else{if("function"!=typeof globalThis.importScripts)return Promise.reject(Error("Worldline.load requires a DOM or a classic Web Worker (importScripts) to load worldline.js"));t=Promise.resolve().then(()=>(globalThis.importScripts(e),a()))}return eI.set(e,t),t}(t.scriptUrl))}renderNote(e){let{pcm:t,pitch:o,durationMs:A,preMs:a,consonantMs:r,tempo:l=120}=e;if(!t||t.length<4096)return null;let u=this.wasm,n=Math.round(69+12*Math.log2(o/440)),i=a+A,s=u._PhraseSynthNew();if(!s)return null;let d=u._malloc(120);if(!d)return u._PhraseSynthDelete(s),null;let c=u._malloc(8*t.length);if(!c)return u._free(d),u._PhraseSynthDelete(s),null;u.HEAPF64.set(t,c>>3);let g=(e,t,o)=>u.setValue(d+e,t,o);g(0,48e3,"i32"),g(4,t.length,"i32"),g(8,c,"*"),g(12,0,"i32"),g(16,0,"*"),g(20,n,"i32"),g(24,100,"double"),g(32,0,"double"),g(40,i,"double"),g(48,r,"double"),g(56,20,"double"),g(64,100,"double"),g(72,0,"double"),g(80,l,"double"),g(88,0,"i32"),g(92,0,"*"),g(96,0,"i32"),g(100,0,"i32"),g(104,100,"i32"),g(108,0,"i32"),g(112,0,"i32"),g(116,100,"i32"),u._PhraseSynthAddRequest(s,d,0,0,i,0,0,0),u._free(c),u._free(d);let m=Math.ceil((0+i+20)/10)+4,p=new Float64Array(m).fill(o),C=new Float64Array(m).fill(.5),B=new Float64Array(m).fill(.5),h=new Float64Array(m).fill(.5),E=new Float64Array(m).fill(1),Q=u._malloc(8*m),f=u._malloc(8*m),I=u._malloc(8*m),v=u._malloc(8*m),y=u._malloc(8*m);if(!Q||!f||!I||!v||!y)return Q&&u._free(Q),f&&u._free(f),I&&u._free(I),v&&u._free(v),y&&u._free(y),u._PhraseSynthDelete(s),null;u.HEAPF64.set(p,Q>>3),u.HEAPF64.set(C,f>>3),u.HEAPF64.set(B,I>>3),u.HEAPF64.set(h,v>>3),u.HEAPF64.set(E,y>>3),u._PhraseSynthSetCurves(s,Q,f,I,v,y,m,10),u._free(Q),u._free(f),u._free(I),u._free(v),u._free(y);let w=u._malloc(4);if(!w)return u._PhraseSynthDelete(s),null;let b=u._PhraseSynthSynth(s,w,0),F=u.getValue(w,"*"),D=b>0?new Float32Array(u.HEAPF32.buffer,F,b).slice():null;return u._free(w),u._PhraseSynthDelete(s),D}},ey="#end;",ew={あ:["","a"],い:["","i"],う:["","u"],え:["","e"],お:["","o"],か:["k","a"],き:["k","i"],く:["k","u"],け:["k","e"],こ:["k","o"],さ:["s","a"],し:["sh","i"],す:["s","u"],せ:["s","e"],そ:["s","o"],た:["t","a"],ち:["ch","i"],つ:["ts","u"],て:["t","e"],と:["t","o"],な:["n","a"],に:["n","i"],ぬ:["n","u"],ね:["n","e"],の:["n","o"],は:["h","a"],ひ:["h","i"],ふ:["f","u"],へ:["h","e"],ほ:["h","o"],ま:["m","a"],み:["m","i"],む:["m","u"],め:["m","e"],も:["m","o"],や:["y","a"],ゆ:["y","u"],よ:["y","o"],ら:["r","a"],り:["r","i"],る:["r","u"],れ:["r","e"],ろ:["r","o"],わ:["w","a"],を:["w","o"],が:["g","a"],ぎ:["g","i"],ぐ:["g","u"],げ:["g","e"],ご:["g","o"],ざ:["z","a"],じ:["j","i"],ず:["z","u"],ぜ:["z","e"],ぞ:["z","o"],だ:["d","a"],ぢ:["j","i"],づ:["z","u"],で:["d","e"],ど:["d","o"],ば:["b","a"],び:["b","i"],ぶ:["b","u"],べ:["b","e"],ぼ:["b","o"],ぱ:["p","a"],ぴ:["p","i"],ぷ:["p","u"],ぺ:["p","e"],ぽ:["p","o"],ん:["N","N"]},eb={a:"あ",i:"い",u:"う",e:"え",o:"お"},eF=e=>/[ぁゃ]/.test(e)?"a":/[ぃ]/.test(e)?"i":/[ぅゅ]/.test(e)?"u":/[ぇ]/.test(e)?"e":/[ぉょ]/.test(e)?"o":/[あかさたなはまやらわがざだばぱ]/.test(e)?"a":/[いきしちにひみりぎじぢびぴ]/.test(e)?"i":/[うくすつぬふむゆるぐずづぶぷ]/.test(e)?"u":/[えけせてねへめれげぜでべぺ]/.test(e)?"e":/[おこそとのほもよろごぞどぼぽ]/.test(e)?"o":"",eD=e=>{if("ー"===e)return{kana:e,consonant:"-",vowel:"-"};if("っ"===e)return{kana:e,consonant:"Q",vowel:""};let t=e[0],o=ew[t],A=o?o[0]:"",a=o?o[1]:eF(t);if(2===e.length&&"っ"!==e[1]){let t=eF(e[1]);t&&(a=t)}return{kana:e,consonant:A,vowel:a}},ek=e=>(e=>{let t=[],o="";for(let A of e){if("-"===A.consonant){if(!o)continue;t.push({kana:eb[o]??A.kana,consonant:"",vowel:o});continue}A.vowel&&"N"!==A.vowel&&(o=A.vowel),t.push(A)}return t})((e=>{let t=[];for(let o of e)t.length>0&&"ぁぃぅぇぉゃゅょっ".includes(o)?t[t.length-1]+=o:t.push(o);return t})(e.normalize("NFKC").replace(/[ァ-ヶ]/g,e=>String.fromCharCode(e.charCodeAt(0)-96)).replace(/[^ぁ-ゖー]/g,"")).map(eD)),ex=e=>{let t=[],o=[];for(let A of e){let e=ek(A);0!==e.length&&(t.length>0&&o.push(t.length),t.push(...e))}return{syllables:t,lineBreaks:o}},eM=/^@@(\d+)\s+(.*)$/,eS=e=>!/^[@#]/.test(e),eL=e=>e.split(/[;\n\r]+/).map(e=>e.trim()).filter(e=>e.length>0),eR=(e,t,o)=>Math.min(o,Math.max(t,e)),eU=e=>e<=0?0:e<=100?e/100:10**((e-100)*.08/20),eT=e=>Math.max(-1,Math.min(1,(e-64)/64)),eN={a:[800,1200],i:[300,2300],u:[350,800],e:[500,1900],o:[500,900],N:[250,1e3]},eJ=e=>440*2**((e-69)/12),eK="https://pub-12482a6b5cbc4c9e906b2e1904cabae5.r2.dev",eP={tsukuyomi:"つくよみちゃん.koe",rino:"春音リノver0.3.koe",roze:"束音ロゼver0.５1(多音階).koe",ruko_male:"欲音ルコ♂連続音Ver.1.03.koe",ruko_female:"欲音ルコ♀歌連続音普1.00.koe",teto:"重音テト単独音.koe",shiyo:"革命シヨ.koe"},eY={tsukuyomi:"つくよみちゃん",rino:"春音リノ",roze:"束音ロゼ",ruko_male:"欲音ルコ♂",ruko_female:"欲音ルコ♀",teto:"重音テト",shiyo:"革命シヨ"},eH={klatt:"puyuyu",tsukuyomi:"tsukuyomi",rino:"rino",roze:"roze",ruko_male:"ruko",ruko_female:"ruko",teto:"teto",shiyo:"shiyo"},eO={tsukuyomi:"https://tyc.rei-yumesaki.net/material/utau/terms/",rino:"https://hatenakun1.github.io/halunelino/",roze:"https://tabaneroze.ninja-web.net/terms-of-use.html",ruko_male:"https://long-sleeper.net/index.php?id=22",ruko_female:"https://long-sleeper.net/index.php?id=22",teto:"https://kasaneteto.jp/guidelines/voice.html",shiyo:"https://kakumeisiyo.my.canva.site/dagkuyjwycs"},eG=(e,t=eK)=>`${t}/${encodeURIComponent(e)}`,eV="https://onjmin.github.io/koe/demo/world/worldline.js",eq=/_([A-G][#b]?-?\d+)$/,eX={c:0,d:2,e:4,f:5,g:7,a:9,b:11},ez=e=>{let t=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(e);if(!t)return null;let o=eX[t[1].toLowerCase()];return"#"===t[2]?o++:"b"===t[2]&&o--,(Number.parseInt(t[3],10)+1)*12+o},eW=e=>{let t=new Map;for(let o of e){let e=eq.exec(o);if(!e||t.has(e[1]))continue;let A=ez(e[1]);null!=A&&t.set(e[1],A)}return[...t].map(([e,t])=>({token:e,midi:t}))},ej=(e,t,o,A,a)=>{let r=o.kana,l="N"===o.consonant?"n":o.consonant,u="N"===o.vowel?"":o.vowel,n=`${l}${u}`||u,i=A||"-",s=[`${i} ${r}`,`${i} ${n}`,r,n],d=eb[o.vowel];d&&s.push(`${i} ${d}`,d,o.vowel),"N"===o.vowel&&s.push("ん","n","N",`${i} \u3093`);let c=new Set,g=t=>{for(let o of t.includes(" ")?[t,t.replace(/ /g,"　"),t.replace(/ /g,"")]:[t])if(!c.has(o)&&(c.add(o),e(o)))return o;return null};if(t.length)for(let{token:e}of t.slice().sort((e,t)=>Math.abs(e.midi-a)-Math.abs(t.midi-a)))for(let t of s){let o=g(`${t}_${e}`);if(o)return o}for(let e of s){let t=g(e);if(t)return t}return null},eZ=async e=>{let t=await ef.load(e.koe),o=e.lightweight?null:await ev.load({scriptUrl:e.worldlineScriptUrl??eV}).catch(()=>null),A=new Map,a=async(e,a,r)=>{var l;let u,n=await (!(u=A.get(e))&&(u=t.getPcm(e),A.set(e,u)),u);if(!n||0===n.length)return null;let i=t.manifest.phonemes[e],s={preMs:((l=i).pre||0)/48e3*1e3,consonantMs:(l.consonant||0)/48e3*1e3},d=eJ(a);if(o){let e=o.renderNote({pcm:n,pitch:d,durationMs:r,...s});if(e)return{pcm:e,preSec:s.preMs/1e3,rate:1}}let c=i.pitch>0?d/i.pitch:1;return{pcm:Float32Array.from(n),preSec:i.pre/48e3/c,rate:c}};return{hasAlias:e=>t.has(e),pitchTokens:eW(Object.keys(t.manifest.phonemes)),renderAlias:a,dispose:()=>{}}},e$=async e=>{if(new URL(e,location.href).origin===location.origin)return new Worker(e);let t=await fetch(e).then(e=>e.text());return new Worker(URL.createObjectURL(new Blob([t],{type:"text/javascript"})))},e_=async(e,t)=>{let o=await e$(e),A=new Set,a=new Map,r=0,l=null,u=null;return o.onmessage=e=>{let t=e.data;if("ready"===t.type){for(let e of t.aliases)A.add(e);l?.()}else if("error"===t.type)u?.(Error(t.message));else if("rendered"===t.type){let e=a.get(t.id);e&&(a.delete(t.id),e(t))}},o.onerror=e=>{u?.(Error(e.message||e.error||`Event: ${e.type}`))},await new Promise((e,A)=>{l=e,u=A,o.postMessage({type:"init",koe:t.koe,worldlineScriptUrl:t.worldlineScriptUrl??eV,lightweight:!!t.lightweight})}),l=null,u=null,{hasAlias:e=>A.has(e),pitchTokens:eW(A),renderAlias:(e,t,A)=>new Promise(l=>{let u=++r;a.set(u,e=>l(e.pcm?{pcm:e.pcm,preSec:e.preSec??0,rate:e.rate??1}:null)),o.postMessage({type:"render",id:u,alias:e,pitch:t,durationMs:A})}),dispose:()=>o.terminate()}},e0=async(e,t,o)=>{let A=o.voiceWorkerUrl?await e_(o.voiceWorkerUrl,o):await eZ(o),a=new Map,r=new Map,l=new Set,u="",n=(e,t,o)=>`${e}|${t}|${10*Math.round(o/10)}`,i=(t,o,l)=>{let u=n(t,o,l),i=a.get(u);if(void 0!==i)return Promise.resolve(i);let s=r.get(u);if(s)return s;let d=(async()=>{let n=await A.renderAlias(t,o,l),i=null;if(n){let t=e.createBuffer(1,n.pcm.length,48e3);t.copyToChannel(n.pcm,0),i={audio:t,preSec:n.preSec,rate:n.rate}}return a.set(u,i),r.delete(u),i})();return r.set(u,d),d},s=(o,A,a,r)=>{let u=t,n=null;"function"==typeof e.createStereoPanner&&((n=e.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,r)),n.connect(t),u=n);let i=e.createBufferSource();i.buffer=o.audio,i.playbackRate.value=o.rate;let s=Math.min(o.preSec,.09),d=o.preSec-s,c=Math.max(e.currentTime+.001,A-s),g=c+(o.audio.duration/o.rate-d),m=e.createGain();m.gain.setValueAtTime(1e-4,c),m.gain.exponentialRampToValueAtTime(a,c+.01);let p=Math.max(c+.01,g-.04);m.gain.setValueAtTime(a,p),m.gain.exponentialRampToValueAtTime(1e-4,g),i.connect(m).connect(u),i.start(c,d),i.stop(g+.02),l.add(i),i.onended=()=>{l.delete(i),i.disconnect(),m.disconnect(),n?.disconnect()}},d=(t,o)=>{if("Q"===t.consonant||""===t.vowel)return;let a=ej(A.hasAlias,A.pitchTokens,t,u,o.pitch);if(t.vowel&&"N"!==t.vowel&&(u=t.vowel),!a)return;let r=e.currentTime+o.when,l=Math.max(1e-4,o.volume),n=o.pan??0,d=Math.max(60,1e3*o.duration);i(a,o.pitch,d).then(e=>{e&&s(e,r,l,n)})};return d.renderToCache=async(e,t,o,a)=>{if("Q"===e.consonant||""===e.vowel)return null;let r=ej(A.hasAlias,A.pitchTokens,e,t,o);if(!r)return null;let l=Math.max(60,a);return await i(r,o,l)?n(r,o,l):null},d.scheduleCached=(e,t,o,A)=>{let r=a.get(e);r&&s(r,t,o,A)},d.stopAll=()=>{for(let e of l){try{e.stop()}catch{}e.disconnect()}l.clear()},d.reset=()=>{u=""},d},e3=3,e1=(e,t,o={})=>{let A,a,r={};for(let[e,t]of Object.entries(eP))r[e]=eG(t);for(let[e,t]of Object.entries(o.voicebanks??{}))r[e.toLowerCase()]=t;let l=0,u=new Map([["klatt",(A=new Set,(a=(o,a)=>{let r=e.currentTime+a.when,l=Math.max(1e-4,a.volume);if(""===o.vowel||"Q"===o.consonant)return;let[u,n]=eN[o.vowel]??eN.a,i=r+Math.max(.04,a.duration),s=null,d=t;"function"==typeof e.createStereoPanner&&((s=e.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,a.pan??0)),s.connect(t),d=s);let c=e.createOscillator();c.type="sawtooth",c.frequency.value=eJ(a.pitch);let g=(t,o,A)=>{let a=e.createBiquadFilter();a.type="bandpass",a.frequency.value=t,a.Q.value=o;let r=e.createGain();return r.gain.value=A,c.connect(a).connect(r),r},m=e.createGain();if(m.gain.setValueAtTime(1e-4,r),m.gain.exponentialRampToValueAtTime(l,r+.02),m.gain.setValueAtTime(l,i),m.gain.exponentialRampToValueAtTime(1e-4,i+.06),g(u,6,4).connect(m),g(n,9,2.8).connect(m),m.connect(d),new Set(["s","sh","ch","ts","h","f"]).has(o.consonant)){let t=Math.max(1,Math.floor(.05*e.sampleRate)),a=e.createBuffer(1,t,e.sampleRate),u=a.getChannelData(0);for(let e=0;e<t;e++)u[e]=2*Math.random()-1;let n=e.createBufferSource();n.buffer=a;let i=e.createBiquadFilter();i.type="highpass",i.frequency.value="sh"===o.consonant?3e3:4500;let s=e.createGain();s.gain.setValueAtTime(.5*l,r),s.gain.exponentialRampToValueAtTime(1e-4,r+.05),n.connect(i).connect(s).connect(d),n.start(r),n.stop(r+.05),A.add(n),n.onended=()=>{A.delete(n),n.disconnect(),i.disconnect(),s.disconnect()}}c.start(r),c.stop(i+.06+.02),A.add(c),c.onended=()=>{A.delete(c),c.disconnect(),s?.disconnect()}}).stopAll=()=>{for(let e of A){try{e.stop()}catch{}e.disconnect()}A.clear()},a)]]),n=new Map,i=(e,t)=>{let o="";for(let A of e.notes){let e=A.syllable;"Q"!==e.consonant&&""!==e.vowel&&(t(A,o),e.vowel&&"N"!==e.vowel&&(o=e.vowel))}},s=()=>{for(let e of(l++,u.values()))e.stopAll?.()};return{loadModels:async A=>{let a=new Set;for(let e of A)e&&a.add(e.toLowerCase());await Promise.all([...a].map(A=>(A=>{let a=A.toLowerCase(),l=u.get(a);if(l)return Promise.resolve(l);let i=n.get(a);if(i)return i;let s=r[a];if(!s)return Promise.resolve(null);let d=(async()=>e0(e,t,{koe:s,worldlineScriptUrl:o.worldlineScriptUrl,lightweight:o.lightweight,voiceWorkerUrl:o.voiceWorkerUrl}))().then(e=>(u.set(a,e),e)).catch(e=>(console.warn(`[dtm] koe\u97F3\u6E90 "${a}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F`,e),null));return n.set(a,d),d})(A)))},warm:async(e,t=e3)=>{let o=[];for(let A of e){let e=u.get(A.model.toLowerCase());if(!e?.renderToCache)continue;let a=0;i(A,(A,r)=>{a>=t||(a++,o.push(e.renderToCache?.(A.syllable,r,A.pitch,1e3*A.durationSec)??Promise.resolve(null)))})}await Promise.all(o)},startStream:(t,o,A)=>{let a=++l,r=async t=>{let r=u.get(t.model.toLowerCase());if(!r)return;let n=[];i(t,(e,t)=>{n.push({note:e,prevVowel:t})});let s=Math.max(1e-4,t.volume);for(let{note:u,prevVowel:i}of n){if(a!==l)return;for(;u.startSec-(e.currentTime-o)>1.5;)if(await new Promise(e=>setTimeout(e,100)),a!==l)return;if(A?.isAudible&&!A.isAudible(t))continue;let n=o+u.startSec;if(r.renderToCache&&r.scheduleCached){let e=await r.renderToCache(u.syllable,i,u.pitch,1e3*u.durationSec);if(a!==l)return;e&&r.scheduleCached(e,n,s,t.pan)}else{let o=n-e.currentTime;r(u.syllable,{trackId:"",pitch:u.pitch,velocity:100,volume:s,when:o,duration:u.durationSec,pan:t.pan}),await new Promise(e=>setTimeout(e,0))}}};for(let e of t)r(e)},stopStream:s,reset:()=>{for(let e of(s(),u.values()))e.reset?.()}}},e2=[[0,2,4,5,7,9,11],[0,2,3,5,7,8,10],[0,2,4,7,9]],e5=e=>{let{tracks:t}=e,o=[];for(let e=0;e<t.length;e++){let A=[],a=0;for(let o of t[e])if(a+=o.delta,o.noteOn&&o.noteOn.velocity>0)A.push({pitch:o.noteOn.noteNumber,channel:o.channel??0});else if(o.noteOff||o.noteOn&&0===o.noteOn.velocity){let e=o.noteOff||o.noteOn;if(e){for(let t=A.length-1;t>=0;t--)if(A[t].pitch===e.noteNumber&&void 0===A[t].end){A[t].end=a;break}}}let r=A.filter(e=>void 0!==e.end),l=r.filter(e=>9!==e.channel);r.length>0&&0===l.length||o.push({index:e,name:`Ch${e+1}`,noteCount:l.length,selected:l.length>0})}return o},e6=e=>{let{tracks:t}=e;for(let e of t)for(let t of e)if(t.setTempo&&"number"==typeof t.setTempo.microsecondsPerQuarter)return 6e7/t.setTempo.microsecondsPerQuarter;return 120},e4=e=>[(65280&e)>>8,255&e],e8=e=>[(0xff0000&e)>>16,...e4(e)],e9=e=>[(0xff000000&e)>>24,...e8(e)],e7=e=>{let t=[127&e],o=e>>7;for(;o>0;)t.push(127&o|128),o>>=7;return t.reverse()},te=(e,t)=>{e.push(77,84,114,107);let o=[];t(o),o.push(...e7(0)),o.push(255,47,0),e.push(...e9(o.length)),e.push(...o)},tt=class{#e;constructor(){this.#e={value:null,prev:null,next:null}}add(e){let t={value:e,prev:this.#e,next:null};this.#e.next=t,this.#e=t}undo(){let{prev:e}=this.#e;return null===e||null===e.value?null:(this.#e=e,this.#e.value)}redo(){let{next:e}=this.#e;return null===e||null===e.value?null:(this.#e=e,this.#e.value)}canUndo(){return this.#e.prev?.value!==null}canRedo(){let{next:e}=this.#e;return null!==e&&null!==e.value}},to=0,tA=0,ta=()=>({x:to,y:tA}),tr=new Set([1,3,6,8,10]),tl=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],tu=()=>{g.clearRect(0,0,s.width,s.height);let{keyHeight:e,keyCount:t,pitchRangeStart:o}=p,A=Math.floor(tA/e)*e,a=tA+s.height,r="#ccc8b4";for(let l=A;l<a;l+=e){let A=t-1-l/e+o,a=A%12,u=tr.has(a),n=l-tA,i=Math.floor(37.2);if(u?(g.fillStyle=r,g.fillRect(0,n,60,e),g.fillStyle="#111111",g.fillRect(0,n,i,e),g.strokeStyle="#383838",g.lineWidth=1,g.beginPath(),g.moveTo(i,n),g.lineTo(i,n+e),g.stroke()):(g.fillStyle=r,g.fillRect(0,n,60,e),(5===a||0===a)&&(g.strokeStyle="#807a6a",g.lineWidth=1,g.beginPath(),g.moveTo(0,n+e-.5),g.lineTo(60,n+e-.5),g.stroke())),0===a){let t=Math.floor(A/12)-1;g.fillStyle="#555040",g.font="10px 'k8x12',monospace",g.textAlign="right",g.textBaseline="bottom",g.fillText(`${tl[a]}${t}`,56,n+e-2)}}g.beginPath(),g.strokeStyle="#29adff",g.lineWidth=2,g.moveTo(60,0),g.lineTo(60,s.height),g.stroke()},tn=()=>{c.clearRect(0,0,i.width,i.height);let{stepWidth:e,stepsPerBar:t}=p;c.save(),c.translate(-to,0),c.fillStyle="#0a0f1f",c.fillRect(to,0,i.width,20),c.strokeStyle="#3d405b",c.lineWidth=1,c.font="11px 'k8x12',monospace",c.fillStyle="#83769c";let o=Math.floor(to/(t*e)),A=Math.ceil((to+i.width)/(t*e));for(let a=o;a<=A+1;a++){let o=a*t*e;c.beginPath(),c.moveTo(o,0),c.lineTo(o,20),c.stroke(),a>=0&&(c.textAlign="left",c.textBaseline="middle",c.fillText(`${a+1}`,o+5,10))}c.restore()},ti=(e,t=[59,130,246,1])=>{let{keyHeight:o,stepWidth:A,keyCount:a,pitchRangeStart:r}=p;for(let l of e){let e=l.startStep*A,u=(a-1-(l.pitch-r))*o,n=l.durationSteps*A,i=e-to,s=u-tA,d=void 0!==l.velocity?.5+l.velocity/127*.5:1,[c,g,p,C]=t,B=C*d;m.fillStyle=`rgba(${c},${g},${p},${B})`,m.fillRect(i+1,s+1,n-2,o-2)}},ts=e=>{let[t,o]=(e=>{let{clientX:t,clientY:o}=e,A=d.getBoundingClientRect();return[Math.floor(t-A.left),Math.floor(o-A.top),e.buttons]})(e),{keyCount:A,pitchRangeStart:a,keyHeight:r,stepWidth:l}=p;return{step:Math.floor((t+to)/l),pitch:A-1-Math.floor((o+tA)/r)+a,x:t,y:o}},td=(e,t)=>{to=e,tA=t,tu(),tn()},tc=["c","c+","d","d+","e","f","f+","g","g+","a","a+","b"],tg=class e{notes=[];nextNoteId=0;handlers;volume=80;tempo=120;history=new tt;isUndoRedo=!1;isBatchOperation=!1;lastHistorySnapshot="[]";lastUndoTime=0;static UNDO_DEBOUNCE_MS=100;toolMode="pen";constructor(e,t=80){this.handlers=e,this.volume=t,this.lastHistorySnapshot=JSON.stringify(this.notes),this.history.add([]),this.generateAndNotify()}beginBatch(){this.isBatchOperation=!0}endBatch(){this.isBatchOperation=!1,this.saveHistory()}saveHistory(){if(this.isUndoRedo||this.isBatchOperation)return;let e=JSON.stringify(this.notes);e!==this.lastHistorySnapshot&&(this.lastHistorySnapshot=e,this.history.add(JSON.parse(e)))}restoreHistory(e){return null!==e&&(this.isUndoRedo=!0,this.notes=JSON.parse(JSON.stringify(e)),this.nextNoteId=this.notes.length>0?Math.max(...this.notes.map(e=>e.id))+1:0,this.lastHistorySnapshot=JSON.stringify(this.notes),this.generateAndNotify(),this.isUndoRedo=!1,!0)}undo(){let t=Date.now();return!(t-this.lastUndoTime<e.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=t,this.restoreHistory(this.history.undo()))}redo(){let t=Date.now();return!(t-this.lastUndoTime<e.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=t,this.restoreHistory(this.history.redo()))}canUndo(){return this.history.canUndo()}canRedo(){return this.history.canRedo()}setToolMode(e){this.toolMode=e}getToolMode(){return this.toolMode}resetHistory(){this.history=new tt,this.history.add([]),this.lastHistorySnapshot=JSON.stringify(this.notes)}addHistoryOnce(){this.lastHistorySnapshot="[]",this.saveHistory()}clearNotesWithoutHistory(){this.notes=[],this.nextNoteId=0,this.lastHistorySnapshot="[]"}setLoadMode(e){this.isUndoRedo=e}addNote(e,t,o){if(-1===this.notes.findIndex(o=>o.startStep===e&&o.pitch===t)){let A={id:this.nextNoteId++,startStep:e,durationSteps:o.noteLengthSteps,pitch:t,velocity:o.velocity??100};this.notes.push(A)}this.notes.sort((e,t)=>e.startStep-t.startStep),this.saveHistory(),this.generateAndNotify()}deleteNoteById(e){let t=this.notes.findIndex(t=>t.id===e);-1!==t&&(this.notes.splice(t,1),this.saveHistory(),this.generateAndNotify())}getMaxStep(){return 0===this.notes.length?0:12*Math.ceil(Math.max(...this.notes.map(e=>e.startStep+e.durationSteps))/12)}moveNote(e,t,o){let A=this.notes.find(t=>t.id===e);if(!A)return;let a=this.getMaxStep()+p.stepsPerBar,r=p.pitchRangeStart,l=r+p.keyCount-1,u=Math.min(Math.max(o,r),l),n=Math.min(Math.max(t,0),a-A.durationSteps);A.startStep=n,A.pitch=u,this.notes.sort((e,t)=>e.startStep-t.startStep),this.generateAndNotify()}moveNoteEnd(e){this.saveHistory()}resizeNote(e,t){let o=this.notes.find(t=>t.id===e);o&&(o.durationSteps=Math.max(1,t),this.notes.sort((e,t)=>e.startStep-t.startStep),this.generateAndNotify())}resizeNoteEnd(e){this.saveHistory()}getNotes(){return this.notes}getMML(e){return this.generateMML(e)}setVolume(e){this.volume=e,this.generateAndNotify()}setTempo(e){this.tempo=e,this.generateAndNotify()}generateAndNotify(){this.handlers.onNotesChanged([...this.notes]);let e=this.generateMML();this.handlers.onMMLGenerated(e)}stepsToMMLDuration(e,t){let o=p.stepsPerBar,A="64",a=1/0;for(let r of[{dur:"1.",s:1.5*o},{dur:"1",s:o/1},{dur:"2.",s:o/2*1.5},{dur:"2",s:o/2},{dur:"4.",s:o/4*1.5},{dur:"4",s:o/4},{dur:"8.",s:o/8*1.5},{dur:"8",s:o/8},{dur:"12",s:o/12},{dur:"16.",s:o/16*1.5},{dur:"16",s:o/16},{dur:"24",s:o/24},{dur:"32",s:o/32},{dur:"64",s:o/64}]){if(r.s>t)continue;let o=Math.abs(e-r.s);o<a&&(a=o,A=r.dur)}return A}findBestFitDuration(e){let t=p;for(let o of[1,2,4,8,12,16,24,32,48,64]){let A=t.stepsPerBar/o;if(e>=A)return{dur:o,steps:A}}return{dur:64,steps:t.stepsPerBar/64}}getNoteWithOctave(e,t){let o=Math.floor(e/12)-1,A=tc[e%12];return -1===t||Math.abs(o-t)>=2?{text:`o${o}${A}`,currentOctave:o}:o===t?{text:A,currentOctave:o}:o===t+1?{text:`>${A}`,currentOctave:o}:o===t-1?{text:`<${A}`,currentOctave:o}:{text:`o${o}${A}`,currentOctave:o}}generateMML=e=>{let t=p,o=e??this.volume,A=`t${this.tempo} v${o}`,a=[],r=-1,l=0;if(0===this.notes.length)return A;let u=Math.max(...this.notes.map(e=>e.startStep+e.durationSteps)),n=new Map;for(let e of this.notes){let t=n.get(e.startStep)??[];t.push(e),n.set(e.startStep,t)}let i=Array.from(n.keys()).sort((e,t)=>e-t),s=t.stepsPerBar/64,d=e=>{for(;e-l>=s;){let t=e-l,{dur:o,steps:A}=this.findBestFitDuration(t);a.push(`r${o}`),l+=A}};for(let e=0;e<i.length;e++){let t=i[e],o=n.get(t);if(!o)continue;d(t);let A=(i[e+1]??u)-l;if(A<s)continue;let c=o[0].durationSteps,g=this.stepsToMMLDuration(c,A),m=this.getStepFromDottedMML(g);if(o.length>1){let e=o.map(e=>{let t=Math.floor(e.pitch/12)-1,o=tc[e.pitch%12];return`o${t}${o}`});a.push(`[${e.join("")}]${g}`)}else{let{text:e,currentOctave:t}=this.getNoteWithOctave(o[0].pitch,r);a.push(`${e}${g}`),r=t}l+=m}return d(u),`${A} ${a.join(" ")}`};getMMLFromNotes(e,t,o){let A=this.notes,a=this.tempo,r=this.volume;this.notes=[...e].sort((e,t)=>e.startStep-t.startStep),void 0!==t&&(this.tempo=t),void 0!==o&&(this.volume=o);let l=this.generateMML();return this.notes=A,this.tempo=a,this.volume=r,l}getStepFromDottedMML(e){let t=p.stepsPerBar,o=e.endsWith("."),A=t/parseInt(o?e.slice(0,-1):e,10);return o?1.5*A:A}},tm={c:0,d:2,e:4,f:5,g:7,a:9,b:11},tp=(e,t,o)=>Math.min(o,Math.max(t,e)),tC=/#(inst|drum|volume|mode)=([\w-]+)/gi,tB=(e,t={})=>{let o=t.stepsPerBar??192,A=t.collectTokens??!1,a=t.collectLyrics??!1,r=t.clampTrackCount,l=[],u=new Map,n=null;if(!e)return{placements:l,bpm:n,tokenTracks:A?u:void 0,lyrics:a?new Map:void 0,meta:{}};let i=e.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,""),s=(e=>{let t={};for(let o of e.matchAll(tC)){let e=o[1].toLowerCase();if("inst"===e)t.instrument=o[2];else if("drum"===e)t.drum=o[2];else if("volume"===e){let e=Number.parseInt(o[2],10);Number.isNaN(e)||(t.volume=e)}else"mode"===e&&("simple"===o[2]||"advanced"===o[2])&&(t.mode=o[2])}return t})(i),d=i.replace(tC,""),c=a?(e=>{let t=new Map,o=eL(e);for(let e=0;e<o.length;e++){let A=o[e].match(eM);if(!A)continue;let a=Number.parseInt(A[1],10),r=A[2].trim().split(/\s+/),l=r.shift()??"",u=200,n=100,i=64,s=0,d=l.indexOf(":"),c=(-1===d?l:l.slice(0,d)).toLowerCase();if(-1!==d){let e=Number.parseInt(l.slice(d+1),10);Number.isFinite(e)&&(u=eR(e,0,400))}let g=[l];for(;r.length>0;){let e=/^v(\d+)$/.exec(r[0]),t=/^q(\d+)$/.exec(r[0]),o=/^p(\d+)$/.exec(r[0]),A=/^o(-?\d+)$/.exec(r[0]);if(e)u=eR(Number.parseInt(e[1],10),0,400);else if(t)n=eR(Number.parseInt(t[1],10),0,100);else if(o)i=eR(Number.parseInt(o[1],10),0,127);else if(A)s=eR(Number.parseInt(A[1],10),-2,2);else break;g.push(r.shift())}let m=[r.join(" ")];for(;e+1<o.length&&eS(o[e+1]);)m.push(o[++e]);let{syllables:p,lineBreaks:C}=ex(m);t.set(a,{trackId:a,model:c,volume:u,gate:n,pan:i,octave:s,syllables:p,metaText:g.join(" "),...C.length>0?{lineBreaks:C}:{}})}return t})(d):void 0,g=ey.replace(/;+$/,""),m=RegExp(`(?<![cdafgCDAFG])${g}\\b;?`,"gi"),p=(e=>{let t=eL(e),o=[];for(let e=0;e<t.length;e++){if(eM.test(t[e])){for(;e+1<t.length&&eS(t[e+1]);)e++;continue}o.push(t[e])}return o.join("\n")})(d).replace(m,"").replace(/[\n\r]+/g," ").trim().split(/(@\d+)/).filter(e=>e.trim().length>0),C=0,B=4,h=0,E=16;for(let e of p){let t=e.trim();if(t.startsWith("@")){let e=Number.parseInt(t.substring(1),10);void 0!==r&&e>=r&&(e=r-1),C=e,B=4,h=0,E=16;continue}let a=t.replace(/\s+/g,"").toLowerCase(),i=0,s=(e,t,o,r)=>{if(!A)return;let l=u.get(C);l||(l=[],u.set(C,l)),l.push({text:a.slice(r,i),startStep:t,durationSteps:o,type:e})},d=()=>{let e="";for(;i<a.length&&/\d/.test(a[i]);)e+=a[i],i++;let t=Math.round(o/(e?tp(Number.parseInt(e,10),1,64):E));for(;i<a.length&&"."===a[i];)t=Math.round(1.5*t),i++;return t};for(;i<a.length;){let e=a[i],t=i;if("o"===e){i++;let e="";for(;i<a.length&&/\d/.test(a[i]);)e+=a[i],i++;B=e?tp(Number.parseInt(e,10),0,8):4,s("octave",h,0,t)}else if(">"===e)B=Math.min(8,B+1),i++,s("shift",h,0,t);else if("<"===e)B=Math.max(0,B-1),i++,s("shift",h,0,t);else if("l"===e){i++;let e="";for(;i<a.length&&/\d/.test(a[i]);)e+=a[i],i++;E=tp(Number.parseInt(e,10)||16,1,64),s("length",h,0,t)}else if("r"===e){i++;let e=h,o=d();s("rest",e,o,t),h+=o}else if("t"===e||"v"===e||"q"===e||"p"===e){i++;let o="";for(;i<a.length&&/\d/.test(a[i]);)o+=a[i],i++;"t"===e&&o&&null===n&&(n=tp(Number.parseInt(o,10),1,255)),s("ctrl",h,0,t)}else if("["===e){i++;let e=[],o=B;for(;i<a.length&&"]"!==a[i];){let t=a[i];if(Object.hasOwn(tm,t)){let o=tm[t];++i<a.length&&("#"===a[i]||"+"===a[i])?(o++,i++):i<a.length&&"-"===a[i]&&(o--,i++),e.push((B+1)*12+o)}else if(">"===t)B=Math.min(8,B+1),i++;else if("<"===t)B=Math.max(0,B-1),i++;else if("o"===t){i++;let e="";for(;i<a.length&&/\d/.test(a[i]);)e+=a[i],i++;B=e?tp(Number.parseInt(e,10),0,8):4}else i++}i<a.length&&"]"===a[i]&&i++;let A=d();for(let t of e)l.push({trackIndex:C,startStep:h,pitch:t,durationSteps:Math.max(1,A)});s("chord",h,Math.max(1,A),t),h+=A,B=o}else if(Object.hasOwn(tm,e)){let o=tm[e];++i<a.length&&("#"===a[i]||"+"===a[i])?(o++,i++):i<a.length&&"-"===a[i]&&(o--,i++);let A=(B+1)*12+o,r=d();l.push({trackIndex:C,startStep:h,pitch:A,durationSteps:Math.max(1,r)}),s("note",h,Math.max(1,r),t),h+=r}else i++}}return{placements:l,bpm:n,tokenTracks:A?u:void 0,lyrics:c,meta:s}},th={puyuyu:"data:image/png;base64,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",rino:"data:image/png;base64,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",roze:"data:image/png;base64,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",ruko:"data:image/png;base64,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",shiyo:"data:image/png;base64,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",teto:"data:image/png;base64,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",tsukuyomi:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYAAAAGACAYAAACkx7W/AAAQAElEQVR4AezXv4teVRoH8DPDYpoNLAsWYjawAYkQVBBBMGyxnRoxXbrtQmCLtEHSLoibbrFSUm6VLmDM/gNuZWNCQBGEDVjZuNWihbO+mUSdcd55f9z73HvOeT6BMzPv+957zvN8njvzJbvFv1kFbty8tWcxyPoMzPrL5/AiADwEBAgQSCogAJIOXtsECoL0AgIg/SMAgACBrAICIOvk9U2AQHoBAZD2EdA4AQLZBQRA9idA/wQIpBUQAGlHr3ECBLIKPOlbADyR8J0AAQLJBARAsoFrlwABAk8EBMATCd8JZBHQJ4HHAgLgMYRvBAgQyCYgALJNXL8ECBB4LCAAHkPk+aZTAgQI7AsIgH0HXwkQIJBOQACkG7mGCRDIKnC4bwFwWMRrAgQIJBEQAEkGrU0CBAgcFhAAh0W8JtCrgL4IHBIQAIdAvCRAgEAWAQGQZdL6JECAwCEBAXAIpN+XOiNAgMBBAQFw0MMrAgQIpBEQAGlGrVECBLIKLOtbACyTefz+jZu39iLXxQtvFItB1mcg8ndrsffjX2PflggIgCUw3iZAgEDvAgKg9wnrjwABAksEBMASGG8TIECgdwEB0PuE9UeAAIElAgJgCUw/b+uEAAECRwsIgKNdvEuAAIHuBQRA9yPWIAECWQVW9S0AVgn5nAABAp0KCIBOB6stAgQIrBIQAKuEfE6gVQF1E1ghIABWAPmYAAECvQoIgF4nqy8CBAisEBAAK4Da/VjlBAgQOF5AABzv41MCBAh0KyAAuh2txggQyCqwbt8CYF0p1xEgQKAzAQHQ2UC1Q4AAgXUFBMC6Uq4j0IqAOgmsKSAA1oRyGQECBHoTEAC9TVQ/BAgQWFNAAKwJ1c5lKiVAgMB6AgJgPSdXESBAoDsBAdDdSDVEgEBWgU37bj4Abty8tRe5zr7wSolcmw5s0+tv37lbItem9biewC8FLl54o0SuyL8Ni71/2UuLPzcfAC2iq5kAAQI1CAiAGqagBgJjCNiDwIYCAmBDMJcTIECgFwEB0Msk9UGAAIENBQTAhmD1Xq4yAgQIbCYgADbzcjUBAgS6ERAA3YxSIwQIZBXYtm8BsK2c+wgQINC4gABofIDKJ0CAwLYCAmBbOfcRqEVAHQS2FBAAW8K5jQABAq0LCIDWJ6h+AgQIbCkgALaEq+c2lRAgQGA7AQGwnZu7CBAg0LyAAGh+hBogQCCrwNC+BcBQQfcTIECgUQEB0OjglE2AAIGhAgJgqKD7Ccwl4FwCAwUEwEBAtxMgQKBVAQHQ6uTUTYAAgYECAmAg4Hy3O5kAAQLDBATAMD93EyBAoFkBAdDs6BROgEBWgbH6Dg+AGzdv7UWusy+8UiLXWND2qVPg9p27JXLV2bWqCOwLhAfA/jG+EiBAgEBtAgKgtomoh8AqAZ8TGElAAIwEaRsCBAi0JiAAWpuYegkQIDCSgAAYCXK6bZxEgACBcQQEwDiOdiFAgEBzAgKguZEpmACBrAJj9y0Axha1HwECBBoREACNDEqZBAgQGFtAAIwtaj8CUQL2JTCygAAYGdR2BAgQaEVAALQyKXUSIEBgZAEBMDJo3HZ2JkCAwLgCAmBcT7sRIECgGQEB0MyoFEqAQFaBqL4FQJSsfQkQIFC5gACofEDKI0CAQJSAAIiStS+BsQTsQyBIQAAEwdqWAAECtQsIgNonpD4CBAgECQiAINjxtrUTAQIEYgQEQIyrXQkQIFC9gACofkQKJEAgq0B03wIgWnjF/p8//KZErvM/fFsiV2TtU+x99oVXSuS6feduiVwrHq/BH0fPYHCBNhgkIAAG8bmZAAEC7QoIgHZnp/LeBfRHIFhAAAQD254AAQK1CgiAWiejLgIECAQLCIBg4O23dycBAgRiBQRArK/dCRAgUK2AAKh2NAojQCCrwFR9C4CppJ1DgACBygQEQGUDUQ4BAgSmEhAAU0k7h8C6Aq4jMJGAAJgI2jEECBCoTUAA1DYR9RAgQGAiAQEwEfT6x7iSAAEC0wgIgGmcnUKAAIHqBARAdSNREAECWQWm7lsATC3uPAIECFQiIAAqGYQyCBAgMLWAAJha3HkElgl4n8DEAgJgYnDHESBAoBYBAVDLJNRBgACBiQUEwMTgy4/zCQECBKYVEADTejuNAAEC1QgIgGpGoRACBLIKzNV3eAC8/tm5Ern++M//lcj1/OmnS+R6+9mnSuR67c03S+Sa68Ed69wv7n9aItf5H74tkevzh9+UyDWWs33qFAgPgDrbVhUBAgQICADPAIG5BZxPYCYBATATvGMJECAwt4AAmHsCzidAgMBMAgJgJvifj/UTAQIE5hEQAPO4O5UAAQKzCwiA2UegAAIEsgrM3bcAmHsCzidAgMBMAgJgJnjHEiBAYG4BATD3BJyfV0DnBGYWEAAzD8DxBAgQmEtAAMwl71wCBAjMLCAAZhuAgwkQIDCvgACY19/pBAgQmE1AAMxG72ACBLIK1NK3AKhlEuogQIDAxAICYGJwxxEgQKAWAQFQyyTUkUdApwQqERAAlQxCGQQIEJhaQABMLe48AgQIVCIgACYfhAMJECBQh4AAqGMOqiBAgMDkAgJgcnIHEiCQVaC2vpsPgBPXT5fIdfaZkyVy7Zw6VVpebz/7VGl5Xbt8qUSu81eulMh18dUzJXI9f/rpErmi/yC+/tm5ErnuXX2wF7mifZoPgGgg+xMgQKBXAQHQ62T1VZ+AighUJiAAKhuIcggQIDCVgACYSto5BAgQqExAAEw2EAcRIECgLgEBUNc8VEOAAIHJBATAZNQOIkAgq0CtfQuAWiejLgIECAQLCIBgYNsTIECgVgEBUOtk1NWPgE4IVCogACodjLIIECAQLSAAooXtT4AAgUoFBED4YBxAgACBOgUEQJ1zURUBAgTCBQRAOLEDCBDIKlB73wKg9gmpjwABAkECAiAI1rYECBCoXUAA1D4h9bUroHIClQsIgMoHpDwCBAhECQiAKFn7EiBAoHIBARA2IBsTIECgbgEBUPd8VEeAAIEwAQEQRmtjAgSyCrTSd/MBcPaZkyVy7e3tlcj1+5deKy2vVh70ZXVGznaxd8uzXdQe+bu12HvZXFp5/8X3z+1ErntXH+xFruYDoJUHRZ0ECBCoTUAA1DYR9bQvoAMCjQgIgEYGpUwCBAiMLSAAxha1HwECBBoREACjD8qGBAgQaENAALQxJ1USIEBgdAEBMDqpDQkQyCrQWt8CoLWJqZcAAQIjCQiAkSBtQ4AAgdYEBEBrE1NvvQIqI9CYgABobGDKJUCAwFgCAmAsSfsQIECgMQEBMNrAbESAAIG2BARAW/NSLQECBEYTEACjUdqIAIGsAq32LQBanZy6CRAgMFBAAAwEdDsBAgRaFRAArU5O3fUIqIRAowICoNHBKZsAAQJDBQTAUEH3EyBAoFEBATB4cDYgQIBAmwICoM25qZoAAQKDBQTAYEIbECCQVaD1vnfvXX2wF7lOXD9dItePtZfIFT3g377859LyivZpff+WZ7uo/ZMPPyyR67t3H5bIFf38/Pi3J/Tv54vvn9uJXP4HEP2E2J8AAQKVCgiASgejrAYElEigcQEB0PgAlU+AAIFtBQTAtnLuI0CAQOMCAmDrAbqRAAECbQsIgLbnp3oCBAhsLSAAtqZzIwECWQV66VsA9DJJfRAgQGBDAQGwIZjLCRAg0IuAAOhlkvqYTsBJBDoREACdDFIbBAgQ2FRAAGwq5noCBAh0IiAANh6kGwgQINCHgADoY466IECAwMYCAmBjMjcQIJBVoLe+BUBvE9UPAQIE1hQQAGtCuYwAAQK9CQiA3iaqnzgBOxPoTEAAdDZQ7RAgQGBdAQGwrpTrCBAg0JmAAFh7oC4kQIBAXwICoK956oYAAQJrCwiAtalcSIBAVoFe+97910sPSuT67t2HJXJF1r7Y+/sPPiiR68tX/1Ai13/+9tcSuZr/xfj661ICV+Rsp9i79fmeuH66RK7WffwPoPUJqp8AAQJbCgiALeHclkhAqwQ6FRAAnQ5WWwQIEFglIABWCfmcAAECnQoIgJWDdQEBAgT6FBAAfc5VVwQIEFgpIABWErmAAIGsAr33LQB6n7D+CBAgsERAACyB8TYBAgR6FxAAvU9Yf9sLuJNA5wICoPMBa48AAQLLBATAMhnvEyBAoHMBAbB0wD4gQIBA3wICoO/56o4AAQJLBQTAUhofECCQVSBL3wIgy6T1SYAAgUMCAuAQiJcECBDIIiAAskxan+sLuJJAEgEBkGTQ2iRAgMBhAQFwWMRrAgQIJBEQAL8atDcIECCQQ0AA5JizLgkQIPArAQHwKxJvECCQVSBb3+EBcOL66RK5ogf2j9/8vkSup956q0SuaB/7Hy8QOdvF3p/u7pbI9cnu70rkivzbsNj7u3cflsi1OCNy3bh5ay9y7R7/+PqUAAECBHoVEAC9TlZfmwu4g0AyAQGQbODaJUCAwBMBAfBEwncCBAgkExAAPw3cDwQIEMglIAByzVu3BAgQ+ElAAPxE4QcCBLIKZO1bAGSdvL4JEEgvIADSPwIACBDIKiAAsk5e3z8L+IlAUgEBkHTw2iZAgIAA8AwQIEAgqYAAKEknr20CBNILCID0jwAAAgSyCgiArJPXNwECJTuBAMj+BOifAIG0AgIg7eg1ToBAdgEBkP0JyNy/3gkkFxAAyR8A7RMgkFdAAOSdvc4JEEgukDgAkk9e+wQIpBcQAOkfAQAECGQVEABZJ69vAokFtL4vsHvxwhslcu0f0+7Xa5cv7USunVOndiLXvz/+uESu7z/6qLS8Im0We9//+39L5Dp/5cpO5Gr3N3e/8hPXT5fItX9Ku1/9D6Dd2amcAAECgwQEwCA+NzcpoGgCBB4JCIBHDL4QIEAgn4AAyDdzHRMgQOCRQMIAeNS3LwQIEEgvIADSPwIACBDIKiAAsk5e3wQSCmj5oIAAOOjhFQECBNIICIA0o9YoAQIEDgoIgIMeXvUsoDcCBA4ICIADHF4QIEAgj4AAyDNrnRIgQOCAQKIAONC3FwQIEEgvIADSPwIACBDIKiAAsk5e3wQSCWj1aAEBcLSLdwkQINC9gADofsQaJECAwNECAuBoF+/2JKAXAgSOFBAAR7J4kwABAv0LCID+Z6xDAgQIHCmQIACO7NubBAgQSC8gANI/AgAIEMgqIACyTl7fBBIIaPF4AQFwvE/4p/euPtiLXC9f+EuJXF88+FOJXJ/u7pbIdfL++RK5nnvnTIlckc/OYu9rly/tRK7bd+6WyBX+C9z4AQKg8QEqnwABAtsKCIBt5dxXv4AKCRA4VkAAHMvjQwIECPQrIAD6na3OCBAgcKxAxwFwbN8+JECAQHoBAZD+EQBAgEBWAQGQdfL6JtCxgNbWExAA6zm5igABAt0JCIDuRqohAgQIrCcgANZzclVLAmolQGAtAQGwFpOLCBAg0J+AAOhvpjoiQIDAWgIdBsBafbuIAAEC6QUEGfxSpwAABC5JREFUQPpHAAABAlkFBEDWyeubQIcCWtpMQABs5uVqAgQIdCMgALoZpUYIECCwmYAA2MzL1TULqI0AgY0EBMBGXC4mQIBAPwICoJ9Z6oQAAQIbCXQUABv17WICBAikFxAA6R8BAAQIZBUQAFknr28CHQloZTuB8AC4feduiVzXLl/aiVz3rj7Yi1zPvXOmRK7tHov174qsfbH3yfvnS+RanBG51pfc7srI2hd7Rz77i72369pdYwmEB8BYhdqHAAECBMYVEADjetptDgFnEiCwlYAA2IrNTQQIEGhfQAC0P0MdECBAYCuBDgJgq77dRIAAgfQCAiD9IwCAAIGsAgIg6+T1TaADAS0MExAAw/zcTYAAgWYFBECzo1M4AQIEhgkIgGF+7p5TwNkECAwSEACD+NxMgACBdgUEQLuzUzkBAgQGCTQcAIP6djMBAgTSCwiA9I8AAAIEsgoIgKyT1zeBhgWUPo6AABjH0S4ECBBoTkAANDcyBRMgQGAcAQEwjqNdphRwFgECowgIgFEYbUKAAIH2BARAezNTMQECBEYRaDAARunbJgQIEEgvIADSPwIACBDIKiAAsk5e3wQaFFDyuAK7t+/cLZHr2uVLO5FrXA67bSrw5Xtflcj13DtnSuTatF/XE5hSIPJv52Jv/wOYcprOIkCAQEUCAqCiYShlhYCPCRAYVUAAjMppMwIECLQjIADamZVKCRAgMKpAQwEwat82I0CAQHoBAZD+EQBAgEBWAQGQdfL6JtCQgFJjBARAjKtdCRAgUL2AAKh+RAokQIBAjIAAiHG165gC9iJAIERAAISw2pQAAQL1CwiA+mekQgIECIQINBAAIX3blAABAukFBED6RwAAAQJZBQRA1snrm0ADAkqMFRAAsb52J0CAQLUCAqDa0SiMAAECsQICINbX7kME3EuAQKiAAAjltTkBAgTqFRAA9c5GZQQIEAgVqDgAQvu2OQECBNILCID0jwAAAgSyCgiArJPXN4GKBZQ2jcDutcuXdiLXNG04ZZnAl+99VSLXsnPHej+y9in2Hsuh130i//Ys9r59525peUXP3f8AooXtT4AAgUoFBEClg0ldluYJEJhEQABMwuwQAgQI1CcgAOqbiYoIECAwiUCFATBJ3w4hQIBAegEBkP4RAECAQFYBAZB18vomUKGAkqYVEADTejuNAAEC1QgIgGpGoRACBAhMKyAApvV22nECPiNAYFIBATApt8MIECBQj4AAqGcWKiFAgMCkAhUFwKR9O4wAAQLpBQRA+kcAAAECWQUEQNbJ65tARQJKmUdAAMzj7lQCBAjMLiAAZh+BAggQIDCPgACYx92pvxTwMwECswgIgFnYHUqAAIH5BQTA/DNQAQECBGYRqCAAZunboQQIEEgvIADSPwIACBDIKiAAsk5e3wQqEFDCvAL/BwAA//9nWyWoAAAABklEQVQDAH64YK6iXPYhAAAAAElFTkSuQmCC"},tE=(e,t,o,A)=>"step"in e?e.step:"bar"in e?Math.max(0,e.bar-1)*o:"seconds"in e?e.seconds/A:0,tQ=e=>{let t=[],o=0,A=0,a=null,r=null,l=!1,u=0,n=new Map,i=!1,s=0,d=0,c=0,g=0,m=0,p=0,C=0,B=0,h=()=>60/e.getBpm()/48,E=(e,t)=>!i||m<=0||e<g?u+e/t:s+(e-g)%m/t,Q=()=>{let a=h(),r=e.getAudioTime()-o,l=e.getSoloTrackId();for(let t of e.getTracks())n.set(t.id,t.volume);for(;;){let o=t[A];if(A>=t.length||i&&o&&o.when>=g){if(!i||m<=0)break;A=p,C+=m,o=t[A]}if(!o)break;let a=o.when+C-r;if(a>.5)break;if(A++,l&&o.trackId!==l)continue;let u=o.velocity/127,s=(n.get(o.trackId)??100*o.volume)/100;e.onPlayNote({trackId:o.trackId,pitch:o.pitch,velocity:o.velocity,volume:s*u,when:Math.max(0,a),duration:o.duration})}let u=e.getDrumPattern();if(u&&u.length>0){let{stepsPerBar:t}=e,o=E(r,a)%t,A=o+4,l=o<4;for(let t of u){if(!(l&&0===t.step||t.step>=o&&t.step<A))continue;let r=(t.step-o)*a;r<-.1||r>.5||e.onPlayDrum({pitch:t.pitch,velocity:t.velocity??1,when:Math.max(0,r),duration:.1})}}if(r>=0){let t=E(r,a);if(e.cues&&e.cues.length>0&&e.onCue){let o=e.getBpm(),A=e.stepsPerBar,r=(e,t,o)=>{if(o>=t)return e>t&&e<=o;{let A=e>t&&e<=d,a=e>=s&&e<=o;return A||a}};for(let l of e.cues)r(tE(l.time,o,A,a),B,t)&&e.onCue(l.id)}B=t}if(!i){let o=t[t.length-1],a=o?.when??0,l=o?.duration??0;A>=t.length&&r>a+l+.1&&(I(),e.onEnd())}},f=()=>{if(!l)return;let t=h(),A=e.getAudioTime()-o;e.onTick(E(A,t)),r=requestAnimationFrame(f)},I=()=>{null!==a&&(clearInterval(a),a=null),null!==r&&(cancelAnimationFrame(r),r=null),l=!1};return{start:E=>{if(I(),(o=>{t=[],n=new Map;let A=h(),a=e.getBpm(),r=e.stepsPerBar,l=e.getLoop?.()??!1;if(i=!!l,"object"==typeof l){s=l.start?tE(l.start,a,r,A):0;let e=l.end?tE(l.end,a,r,A):null;d=null!==e?e:-1}else s=0,d=-1;let u=i?Math.min(o,s):o,C=0;for(let a of e.getTracks())for(let e of(n.set(a.id,a.volume),a.notes)){if(e.startStep<u)continue;let r=(e.startStep-o)*A,l=e.durationSteps*A;C=Math.max(C,e.startStep+e.durationSteps),t.push({trackId:a.id,pitch:e.pitch,volume:a.volume/100,velocity:e.velocity??127,when:r,duration:l})}for(t.sort((e,t)=>e.when-t.when),-1===d&&(d=C),c=(s-o)*A,m=(g=(d-o)*A)-c,p=0;p<t.length&&!(o+t[p].when/A>=s-1e-4);)p++})(u=E??e.getPlayStartStep()),0===t.length&&!e.getDrumPattern()?.length)return;l=!0,o=e.getAudioTime()+.1;let v=h();for(A=0;A<t.length&&!(u+t[A].when/v>=u-1e-4);)A++;C=0,B=u-1e-4,a=setInterval(Q,20),r=requestAnimationFrame(f)},stop:I,isActive:()=>l,getStartTime:()=>o}},tf="dtm-daw-styles",tI=`
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
   var(--dtm-*) \u304C\u89E3\u6C7A\u3067\u304D\u305A\u7121\u88C5\u98FE\uFF08\u767D\u5730\u30FB\u65E2\u5B9A\u30D5\u30A9\u30F3\u30C8\uFF09\u306B\u306A\u3063\u3066\u3057\u307E\u3046\u3002 */
.dtm-daw,
.dtm-controlbar {
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
.dtm-btn--primary { border-color: var(--dtm-primary); background: var(--dtm-primary); color: var(--dtm-pfg); }
.dtm-btn--success { border-color: var(--dtm-success); background: var(--dtm-success); color: var(--c-black); }
.dtm-btn--danger  { border-color: var(--dtm-danger);  background: var(--dtm-danger);  color: var(--c-white); }
.dtm-btn--accent  { border-color: var(--dtm-accent);  background: var(--dtm-accent);  color: var(--c-black); }
.dtm-btn--ghost   { background: transparent; border-color: var(--dtm-border2); }
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
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dtm-gap);
  padding: 6px;
  background: var(--dtm-deep);
  border: 2px solid var(--c-black);
  box-shadow:
    inset 0 0 0 2px var(--c-black),
    0 0 0 2px var(--dtm-success),
    4px 4px 0 var(--c-black);
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
}
.dtm-modal-overlay[hidden] {
  display: none !important;
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
`,tv=(e=document)=>{if(e.getElementById(tf))return;let t=e.createElement("style");t.id=tf,t.textContent=tI,e.head.appendChild(t)},ty=e=>{let t=e.style.position;"static"===window.getComputedStyle(e).position&&(e.style.position="relative");let o=e.ownerDocument??document,A=o.createElement("div");A.className="dtm-overlay";let a=o.createElement("div");a.className="dtm-spinner";let r=o.createElement("i");r.className="dtm-spinner-fill",a.appendChild(r),A.appendChild(a);let l=o.createElement("div");return l.className="dtm-loading-label",A.appendChild(l),e.appendChild(A),{remove:()=>{A.remove(),e.style.position=t},setProgress:(e,t)=>{if(t>0){let o=Math.max(0,Math.min(100,Math.round(e/t*100)));a.classList.add("dtm-spinner--determinate"),r.style.width=`${o}%`,l.textContent=`${e} / ${t} (${o}%)`}else a.classList.remove("dtm-spinner--determinate"),r.style.width="0",l.textContent=""}}},tw=["#00e436","#29adff","#ff77a8","#ffec27"],tb=null,tF={klatt:"軽量ロボ声",...eY},tD=null,tk=null,tx=()=>{tD&&(tD.classList.remove("dtm-player-balloon--visible"),tD=null),tk&&(clearTimeout(tk),tk=null)},tM=e=>{tD===e?tk&&clearTimeout(tk):(tx(),tD=e,e.classList.add("dtm-player-balloon--visible")),tk=setTimeout(()=>{tx()},3e3)},tS=(e,t,o={})=>{tv(e.ownerDocument??document);let{placements:A,bpm:a,tokenTracks:r,lyrics:l,meta:u}=tB(t,{collectTokens:!0,collectLyrics:!0}),n=l??new Map,i=a??o.defaultBpm??120,s=o.drumPatterns??eC,d=u.drum?s[u.drum]??null:null,c=u.volume??o.volume??100,g=o.trackColors??tw,m=o.synth??!o.onPlayNote,p=60/i/48,C=[...new Set(A.map(e=>e.trackIndex))].sort((e,t)=>e-t),B=A.reduce((e,t)=>Math.max(e,t.startStep+t.durationSteps),0),E=A.map(e=>({pitch:e.pitch,when:e.startStep*p,duration:e.durationSteps*p})),Q=[];if(E.length>0){let e=[];try{e=((e,t={})=>{if(!e.length)return{keys:[],chords:[]};let{flat:o=!1,bpm:A,frameSize:a=.5,changePenalty:r=.4,nonChordTonePenalty:l=.55,useKey:u=!0}=t,n=((e,t={})=>{if(!e.length)return[];let{flat:o=!1}=t,A=e.reduce((e,t)=>Math.min(e,t.when),1/0),a=e.reduce((e,t)=>Math.max(e,t.when+Math.max(t.duration,0)),-1/0),r=a-A;if(r<=0){let t=((e,t={})=>{if(!e.length)return[];let{flat:o=!1}=t,A=(e=>{let t=Array(12).fill(0);for(let o of e)"number"==typeof o?t[h(o)]+=1:t[h(o.pitch)]+=o.duration??1;return t})(e);return A.every(e=>0===e)?[]:eo(A,o)})(e.map(e=>({pitch:e.pitch,duration:Math.max(e.duration,1)})),{flat:o})[0];return t?[{key:_(t),when:A,duration:0}]:[]}let l=t.windowSize??r/4,u=t.hopSize??l/2,n=t.minSegmentDuration??0,i=t.switchMargin??.08,s=[];for(let t=A;t<a-1e-9;t+=u){let r=Math.min(t+u,a),n=Math.min(t+l,a),d=et(e,Math.max(A,n-l),n),c=s[s.length-1];if(d.every(e=>0===e)){c&&(c.duration=r-c.when);continue}let g=eo(d,o),m=g[0];if(c){let e=g.find(e=>ee(e,c.key));e&&m.score-e.score<=i&&(m=e)}c&&ee(c.key,m)?c.duration=r-c.when:s.push({key:_(m),when:t,duration:r-t})}var d=eA(s);if(n<=0)return d;let c=d.map(e=>({...e})),g=0;for(;g<c.length&&c.length>1;){if(c[g].duration>=n){g++;continue}g>0?c[g-1].duration+=c[g].duration:(c[g+1].when=c[g].when,c[g+1].duration+=c[g].duration),c.splice(g,1)}return eA(c)})(e,t),i=e.reduce((e,t)=>Math.min(e,t.when),1/0),s=e.reduce((e,t)=>Math.max(e,t.when+Math.max(t.duration,0)),-1/0);if(s<=i)return{keys:n,chords:[]};let d=A?60/A:Math.max(a,.001),c=[];for(let t=i;t<s-1e-9;t+=d)c.push(en(e,t,Math.min(t+d,s)));let g=((e,t)=>{let o=e.length,A=er.length;if(0===o)return[];let a=Array.from({length:o},()=>Array(A).fill(-1)),r=e[0].slice();for(let l=1;l<o;l++){let o=-1/0,u=0;for(let e=0;e<A;e++)r[e]>o&&(o=r[e],u=e);let n=Array(A).fill(0),i=e[l],s=o-t;for(let e=0;e<A;e++)r[e]>=s?(n[e]=i[e]+r[e],a[l][e]=e):(n[e]=i[e]+s,a[l][e]=u);r=n}let l=0;for(let e=1;e<A;e++)r[e]>r[l]&&(l=e);let u=Array(o).fill(0);u[o-1]=l;for(let e=o-1;e>0;e--)u[e-1]=a[e][u[e]];return u})(c.map(e=>{if(e.empty)return Array(er.length).fill(0);let t=u?ed(n,e.when+e.duration/2):null;return er.map(o=>((e,t,o,A)=>{let a=0,r=0;for(let o=0;o<12;o++){let A=e.profile[o];0!==A&&(t.pcs.has(o)?a+=A*t.weights[o]:r+=A)}let l=a-A*r;return 0===e.profile[t.root]&&(l-=.3),-1!==e.bass&&t.root===e.bass&&(l+=.3),o&&(l+=((e,t)=>{let o=new Set(("major"===t.mode?el:eu).map(e=>h(e+t.tonic))),A=o.has(e.root),a=!0;for(let t of e.pcs)if(!o.has(t)){a=!1;break}let r=0;a?r+=.25:A&&(r+=.1);let l=h(e.root-t.tonic);return(0===l||5===l||7===l)&&(r+=.05),r})(t,o)),l-=.002*t.priority})(e,o,t,l))}),r),m=[];for(let e=0;e<c.length;e++){let t=c[e],A=er[g[e]],a=m[m.length-1];if(a&&a.root===A.root&&a.quality===A.quality){a.duration=t.when+t.duration-a.when;continue}let r=ed(n,t.when+t.duration/2),{symbol:l,rootSymbol:u,inversion:i,bass:s}=ec(A,t.bass,o);m.push({symbol:l,rootSymbol:u,root:A.root,quality:A.quality,bass:s,inversion:i,when:t.when,duration:t.duration,key:r,degree:r?es(r,A):null})}return{keys:n,chords:m}})(E,{bpm:i}).chords}catch{e=[]}for(let t of e){let e=Math.max(0,Math.round(t.when/p)),o=Math.round((t.when+t.duration)/p);for(let A=e;A<o&&A<=B;A++)Q[A]=t.symbol}let t="";for(let e=0;e<=B;e++)Q[e]?t=Q[e]:Q[e]=t}let f=C.map(e=>{let t=0,o=A.filter(t=>t.trackIndex===e).map(e=>({id:t++,startStep:e.startStep,durationSteps:e.durationSteps,pitch:e.pitch,velocity:100}));return{id:String(e),volume:c,notes:o}}),I=e=>g[e%g.length]??tw[0],v=null,y=()=>(v||(v=new AudioContext),v),w=null,b=()=>(w||(w=((e,t=e.destination)=>({playNote:o=>{let A,a=e.createOscillator(),r=e.createGain();a.type="square",a.frequency.value=(A=o.pitch,440*2**((A-69)/12));let l=e.currentTime+o.when,u=Math.max(1e-4,.06*o.volume*1.5);if(r.gain.setValueAtTime(u,l),r.gain.exponentialRampToValueAtTime(.001,l+o.duration),a.connect(r),"function"==typeof e.createStereoPanner&&o.pan){let A=e.createStereoPanner();A.pan.value=Math.max(-1,Math.min(1,o.pan)),r.connect(A),A.connect(t)}else r.connect(t);a.start(l),a.stop(l+o.duration+.02)},playDrum:o=>{let A=e.currentTime+o.when,a=Math.max(1e-4,Math.min(1,o.velocity)),r=35===o.pitch||36===o.pitch,l=38===o.pitch||39===o.pitch||40===o.pitch;if(r){let o=e.createOscillator(),r=e.createGain();o.frequency.setValueAtTime(150,A),o.frequency.exponentialRampToValueAtTime(50,A+.12),r.gain.setValueAtTime(.9*a,A),r.gain.exponentialRampToValueAtTime(.001,A+.18),o.connect(r).connect(t),o.start(A),o.stop(A+.2),o.onended=()=>o.disconnect();return}let u=l?.18:.05,n=Math.max(1,Math.floor(e.sampleRate*u)),i=e.createBuffer(1,n,e.sampleRate),s=i.getChannelData(0);for(let e=0;e<n;e++)s[e]=2*Math.random()-1;let d=e.createBufferSource();d.buffer=i;let c=e.createBiquadFilter();c.type=l?"bandpass":"highpass",c.frequency.value=l?2e3:8e3;let g=e.createGain();g.gain.setValueAtTime(a*(l?.7:.4),A),g.gain.exponentialRampToValueAtTime(.001,A+u),d.connect(c).connect(g).connect(t),d.start(A),d.stop(A+u),d.onended=()=>{d.disconnect(),c.disconnect(),g.disconnect()}}}))(y())),w),F=null,D=()=>{if(o.singingVoices)return o.singingVoices;if(!F){let e=y();F=e1(e,e.destination)}return F},k=m||!!o.singingVoices,x=e.ownerDocument??document,M=x.createElement("div");M.className="dtm-daw dtm-player";let S=x.createElement("div");S.className="dtm-player-head";let L=x.createElement("button");L.type="button",L.className="dtm-player-play",L.innerHTML=em("play",12),L.disabled=0===C.length;let R=new Set,U=new Map,T=new Map,N=new Map,J=e=>{R.has(e)?R.delete(e):R.add(e),K(e)},K=e=>{let t=R.has(e),o=N.get(e);o&&o.classList.toggle("is-muted",t);let A=U.get(e);A&&A.classList.toggle("is-muted",t);let a=T.get(e);a&&a.classList.toggle("is-muted",t)},P=x.createElement("div");P.className="dtm-player-mml-header";let Y=[];for(let e of C){let t=x.createElement("span");t.className="dtm-player-emoji",t.style.backgroundColor=I(e);let o=x.createElement("span");o.textContent="🥺",t.appendChild(o),t.addEventListener("click",t=>{t.stopPropagation(),J(e)}),P.appendChild(t),Y.push(t),T.set(e,t)}let H=new Set;for(let[e,t]of n){let o=T.get(e);if(!o)continue;let A=eH[t.model.toLowerCase()],a=A?th[A]:void 0;if(!a)continue;let r=x.createElement("img");r.src=a,r.width=20,r.height=20,r.style.borderRadius="50%",r.style.objectFit="cover",r.draggable=!1,H.add(o),o.textContent="",o.appendChild(r);let l=x.createElement("div");l.className="dtm-player-balloon",l.textContent=tF[t.model.toLowerCase()]??t.model,o.appendChild(l),o.addEventListener("mouseenter",()=>{tM(l)}),o.addEventListener("mouseleave",()=>{tD===l&&tx()}),o.addEventListener("click",e=>{e.stopPropagation(),tM(l)})}let O=new WeakMap,G=e=>{let t=performance.now(),o=O.get(e);void 0!==o&&t-o<50||(O.set(e,t),e.classList.remove("dtm-player-emoji--jump"),e.offsetWidth,e.classList.add("dtm-player-emoji--jump"))},V=[],q=()=>{for(let e of V)clearTimeout(e);V.length=0},X=[],z=e=>{let t=setTimeout(()=>{if(H.has(e))return;let t=e.querySelector("span");t?t.textContent="😌":e.textContent="😌";let o=setTimeout(()=>{if(H.has(e))return;let t=e.querySelector("span");t?t.textContent="🥺":e.textContent="🥺",z(e)},100+50*Math.random());X.push(o)},2e3+5e3*Math.random());X.push(t)};for(let e of Y)z(e);let W=x.createElement("div");for(let e of(W.className="dtm-player-dots",W.style.display="none",C)){let t=x.createElement("span");t.className="dtm-player-dot",t.style.backgroundColor=I(e),W.appendChild(t)}let j=x.createElement("div");j.className="dtm-player-beat-row";let Z=[];for(let e=0;e<4;e++){let e=x.createElement("span");e.className="dtm-player-beat-dot",j.appendChild(e),Z.push(e)}let $=x.createElement("span");$.className="dtm-player-bar",$.textContent="-",j.appendChild($);let ea=x.createElement("span");ea.className="dtm-player-chord",ea.textContent="",j.appendChild(ea);let ei=[],eg=e=>{let t=x.createElement("span");return t.className="dtm-player-chip",t.textContent=e,ei.push(t),t};u.instrument&&eg(`\u266A ${u.instrument}`),u.drum&&eg(`\u{1F941} ${u.drum}${d?"":" (?)"}`),void 0!==u.volume&&eg(`\u{1F50A} ${u.volume}%`),S.append(L,j,...ei,W,P),M.appendChild(S);let ep=x.createElement("div");ep.className="dtm-player-body",M.appendChild(ep);let eB=[];for(let e of C){let t=n.get(e),o=!!t&&t.syllables.length>0,a=x.createElement("div");a.className="dtm-player-lane-row",N.set(e,a);let l=x.createElement("div");l.className="dtm-player-lane-label dtm-player-lane-label--btn";let u=x.createElement("span");u.className="dtm-player-dot",u.style.backgroundColor=I(e);let i=x.createElement("span");i.className="dtm-player-lane-no",i.textContent=`@${e}`,l.append(u,i),U.set(e,l),l.addEventListener("click",()=>{J(e)});let s=x.createElement("div");s.className="dtm-player-lane",s.style.setProperty("--tk",I(e));let d=[];if(o){let o=A.filter(t=>t.trackIndex===e).sort((e,t)=>e.startStep-t.startStep),a=(t.gate??100)/100,r=new Set(t.lineBreaks??[]);if(t.metaText){let e=x.createElement("span");e.className="dtm-tk dtm-tk--meta",e.textContent=t.metaText,s.appendChild(e)}let l=Math.min(o.length,t.syllables.length);for(let e=0;e<l;e++){let A=o[e];if(r.has(e)){let e=x.createElement("span");e.className="dtm-tk dtm-tk--break",e.textContent="\\n",s.appendChild(e)}let l=x.createElement("span");l.className="dtm-tk dtm-tk--lyric",l.textContent=t.syllables[e].kana,s.appendChild(l),d.push({el:l,startStep:A.startStep,durationSteps:Math.max(1,Math.round(A.durationSteps*a))})}}else for(let t of r?.get(e)??[]){let e=x.createElement("span");e.className=`dtm-tk dtm-tk--${t.type}`,e.textContent=t.text,s.appendChild(e),t.durationSteps>0&&d.push({el:e,startStep:t.startStep,durationSteps:t.durationSteps})}a.append(l,s),ep.appendChild(a),eB.push({lane:s,tokens:d})}let eh=[...new Set([...n.values()].map(e=>e.model))].filter(e=>eO[e]);if(eh.length>0){let e=x.createElement("div");for(let t of(e.className="dtm-player-terms",e.style.fontSize="10px",e.style.color="var(--dtm-warn)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="4px",e.style.marginTop="4px",e.style.padding="0 4px",eh)){let o=x.createElement("div");o.style.display="flex",o.style.alignItems="center",o.style.gap="4px",o.style.flexWrap="wrap";let A=eY[t]??t,a=eO[t],r=x.createElement("span");r.textContent="使用時には";let l=x.createElement("a");l.textContent=`${A}UTAU\u97F3\u6E90`,l.href=a,l.target="_blank",l.rel="noopener",l.style.color="var(--dtm-primary)",l.style.textDecoration="underline";let u=x.createElement("span");u.textContent="の利用規約に従ってください",o.append(r,l,u),e.appendChild(o)}M.appendChild(e)}e.appendChild(M);let eE=(e,t)=>{if(0===t.offsetWidth||0===e.clientWidth)return;let o=t.offsetLeft+t.offsetWidth/2,A=Math.max(0,e.scrollWidth-e.clientWidth),a=o-e.clientWidth/2;e.scrollLeft=Math.max(0,Math.min(a,A))},eQ=tQ({getTracks:()=>f,getBpm:()=>i,getPlayStartStep:()=>0,getDrumPattern:()=>d,getSoloTrackId:()=>null,getAudioTime:()=>m?y().currentTime:o.getAudioTime?.()??performance.now()/1e3,onPlayNote:e=>{var t;let A=Number(e.trackId);if(R.has(A))return;let a=T.get(A);a&&((t=e.when)<=0?G(a):V.push(setTimeout(()=>G(a),1e3*t))),!n.has(A)&&(o.onPlayNote?.(e),m&&b().playNote(e))},onPlayDrum:e=>{let t=e.velocity*(c/100);o.onPlayDrum?.({...e,velocity:t}),m&&b().playDrum({...e,velocity:t})},onTick:e=>{(e=>{let t=Math.floor(e),o=Math.floor(e/48)%4;for(let e=0;e<4;e++)Z[e].classList.toggle("dtm-player-beat-dot--on",e===o);$.textContent=String(Math.floor(e/192)+1);let A=Q[t]??"";for(let o of(ea.textContent!==A&&(ea.textContent=A,A&&console.log(`[dtm-player-chord] Active Chord: ${A} (step: ${t})`)),eB)){let t=null;for(let A of o.tokens){let o=e>=A.startStep&&e<A.startStep+A.durationSteps;A.el.classList.toggle("is-active",o),o&&!t&&(t=A)}t&&eE(o.lane,t.el)}})(e)},onEnd:()=>ev(),stepsPerBar:192}),ef=!1,eI=e=>{ef=e,L.innerHTML=em(e?"stop":"play",12),L.classList.toggle("dtm-player-play--stop",e)},ev=()=>{for(let e of(eI(!1),q(),Z))e.classList.remove("dtm-player-beat-dot--on");for(let e of($.textContent="-",ea.textContent="",eB)){for(let t of e.tokens)t.el.classList.remove("is-active");e.lane.scrollLeft=0}tb===eF&&(tb=null),o.onStop?.()},ey=async()=>{let e=k&&n.size>0,t=e?[...n.entries()].map(([e,t])=>{let o=f.find(t=>Number(t.id)===e),A=[...o?.notes??[]].sort((e,t)=>e.startStep-t.startStep),a=(t.gate??100)/100,r=(t.octave??0)*12,l=Math.min(A.length,t.syllables.length),u=[];for(let e=0;e<l;e++){let o=A[e];u.push({syllable:t.syllables[e],pitch:o.pitch+r,startSec:o.startStep*p,durationSec:o.durationSteps*p*a})}return{id:String(e),model:t.model,volume:eU(t.volume??200)*(c/100),pan:eT(t.pan??64),notes:u}}):[];if(e){let e=D(),o=ty(ep);try{await e.loadModels(t.map(e=>e.model)),await e.warm(t)}catch(e){console.warn("[dtm] voice preload failed",e)}finally{o.remove()}if(!ef||tb!==eF)return}eQ.start(0),e&&D().startStream(t,eQ.getStartTime(),{isAudible:e=>!R.has(Number(e.id))})},ew=()=>{ef||0===C.length||(tb&&tb!==eF&&tb.stop(),tb=eF,eI(!0),(async()=>{let e=[],t=o.onResumeAudio?.();if(t&&e.push(t),m){let t=y();"suspended"===t.state&&e.push(t.resume())}e.length>0&&await Promise.all(e),ef&&tb===eF&&(k&&n.size>0&&D().reset(),await ey())})())},eb=()=>{ef&&(eQ.stop(),(o.singingVoices??F)?.stopStream(),ev())};L.addEventListener("click",()=>{ef?eb():ew()});let eF={play:ew,stop:eb,isPlaying:()=>ef,destroy:()=>{for(let e of(eQ.stop(),(o.singingVoices??F)?.stopStream(),tb===eF&&(tb=null),v&&(v.close(),v=null),X))clearTimeout(e);q(),tD&&M.contains(tD)&&tx(),M.remove()}};return eF},tL=`
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
`,tR=`
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
`,tU=`
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
`,tT=[{id:"melody",name:"メロディー",color:[41,173,255],instrument:0,volume:100},{id:"submelody",name:"サブメロ",color:[255,119,168],instrument:1,volume:95},{id:"bass",name:"ベース",color:[0,228,54],instrument:2,volume:88},{id:"chord",name:"伴奏",color:[255,163,0],instrument:3,volume:76}],tN=[{id:"t0",name:"TRACK 01",color:[41,173,255],instrument:0,volume:100},{id:"t1",name:"TRACK 02",color:[0,228,54],instrument:1,volume:100},{id:"t2",name:"TRACK 03",color:[255,119,168],instrument:2,volume:100},{id:"t3",name:"TRACK 04",color:[255,163,0],instrument:3,volume:100},{id:"t4",name:"TRACK 05",color:[255,236,39],instrument:4,volume:100},{id:"t5",name:"TRACK 06",color:[131,118,156],instrument:5,volume:100},{id:"t6",name:"TRACK 07",color:[255,0,77],instrument:6,volume:100},{id:"t7",name:"TRACK 08",color:[255,204,170],instrument:7,volume:100},{id:"t8",name:"TRACK 09",color:[194,195,199],instrument:8,volume:100},{id:"t9",name:"TRACK 10",color:[0,135,81],instrument:9,volume:100},{id:"t10",name:"TRACK 11",color:[171,82,54],instrument:10,volume:100},{id:"t11",name:"TRACK 12",color:[126,37,83],instrument:11,volume:100},{id:"t12",name:"TRACK 13",color:[255,241,232],instrument:12,volume:100},{id:"t13",name:"TRACK 14",color:[120,200,255],instrument:13,volume:100},{id:"t14",name:"TRACK 15",color:[100,255,160],instrument:14,volume:100}],tJ=["klatt",...Object.keys(eP)],tK={klatt:"軽量ロボ声",...eY},tP=e=>tK[e]??e,tY=(e,t,o)=>Math.min(Math.max(e,t),o),tH={piano:{displayName:"グランドピアノ",description:"最も破綻しにくい構成。楽曲制作のスケッチにも最適。",melody:"Acoustic Grand Piano",submelody:"Vibraphone",bass:"Electric Bass (finger)",chord:"Pad 2 (warm)"},acoustic:{displayName:"アコースティック",description:"生楽器の温かみを重視。フォークやポップスに。",melody:"Acoustic Guitar (steel)",submelody:"Harmonica",bass:"Acoustic Bass",chord:"Acoustic Guitar (nylon)"},jazz_night:{displayName:"ジャズ・ナイト",description:"Rhodes風のEPとウッドベースによる、大人びたアンサンブル。",melody:"Electric Piano 1",submelody:"Flute",bass:"Acoustic Bass",chord:"Electric Guitar (jazz)"},synth_pop:{displayName:"シンセポップ",description:"80s〜現代まで。抜けるリードと太いベースの王道。",melody:"Lead 2 (sawtooth)",submelody:"Lead 4 (chiff)",bass:"Synth Bass 2",chord:"Pad 3 (polysynth)"},cyber_punk:{displayName:"サイバーパンク",description:"デジタルな冷たさと歪みが混ざり合う、未来的な響き。",melody:"Lead 8 (bass + lead)",submelody:"Lead 5 (charang)",bass:"Synth Bass 2",chord:"Pad 8 (sweep)"},rock:{displayName:"ハードロック",description:"歪みギターと重厚なベースで、パワーを前面に。",melody:"Distortion Guitar",submelody:"Rock Organ",bass:"Electric Bass (pick)",chord:"Overdriven Guitar"},orchestra:{displayName:"オーケストラ",description:"壮大な物語を予感させる、管弦楽器の重厚な響き。",melody:"French Horn",submelody:"Pizzicato Strings",bass:"Cello",chord:"Tremolo Strings"},japanese_wa:{displayName:"和風・雅",description:"琴と三味線の繊細な調べに、尺八の情緒を添えて。",melody:"Koto",submelody:"Shamisen",bass:"Taiko Drum",chord:"Shakuhachi"},arabic_exotic:{displayName:"エキゾチック",description:"シタールやバグパイプによる、異国情緒溢れるサウンド。",melody:"Sitar",submelody:"Bagpipe",bass:"Fretless Bass",chord:"Kalimba"},fantasy_rpg:{displayName:"ファンタジーRPG",description:"オカリナとハープが紡ぐ、冒険と魔法の世界観。",melody:"Ocarina",submelody:"Celesta",bass:"Timpani",chord:"Orchestral Harp"},ambient_cloud:{displayName:"アンビエント",description:"輪郭をぼかした音色で、深い没入感と余韻を演出。",melody:"Lead 6 (voice)",submelody:"Music Box",bass:"Synth Bass 1",chord:"Pad 7 (halo)"},retro_game:{displayName:"8-bit レトロ",description:"矩形波を想起させる、初期ゲーム機のような懐かしい響き。",melody:"Lead 1 (square)",submelody:"Lead 2 (sawtooth)",bass:"Synth Bass 1",chord:"Clavinet"}},tO=void 0===Number.MAX_SAFE_INTEGER?0x1fffffffffffff:Number.MAX_SAFE_INTEGER,tG=new WeakMap,tV=(t=(e,t)=>(tG.set(e,t),t),e=>{let o=tG.get(e),A=void 0===o?e.size:o<0x40000000?o+1:0;if(!e.has(A))return t(e,A);if(e.size<0x20000000){for(;e.has(A);)A=Math.floor(0x40000000*Math.random());return t(e,A)}if(e.size>tO)throw Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;e.has(A);)A=Math.floor(Math.random()*tO);return t(e,A)}),tq=(o=new WeakMap,a=e=>{if(o.has(e))return o.get(e);let t=new Map;return o.set(e,t),t},A=new WeakMap,r=e=>({...e,connect:({call:e})=>async()=>{let{port1:t,port2:o}=new MessageChannel,a=await e("connect",{port:t},[t]);return A.set(o,a),o},disconnect:({call:e})=>async t=>{let o=A.get(t);if(void 0===o)throw Error("The given port is not connected.");await e("disconnect",{portId:o})},isSupported:({call:e})=>()=>e("isSupported")}),l=e=>"function"==typeof e.start,e=>{let t=r(e);return e=>{let o=a(e);e.addEventListener("message",({data:e})=>{let{id:t}=e;if(null!==t&&o.has(t)){let{reject:A,resolve:a}=o.get(t);o.delete(t),void 0===e.error?a(e.result):A(Error(e.error.message))}}),l(e)&&e.start();let A=(t,A=null,a=[])=>new Promise((r,l)=>{let u=tV(o);o.set(u,{reject:l,resolve:r}),null===A?e.postMessage({id:u,method:t},a):e.postMessage({id:u,method:t,params:A},a)}),r=(t,o,A=[])=>{e.postMessage({id:null,method:t,params:o},A)},u={};for(let[e,o]of Object.entries(t))u={...u,[e]:o({call:A,notify:r})};return{...u}}})({parseArrayBuffer:({call:e})=>async t=>e("parse",{arrayBuffer:t},[t])}),tX=new Blob(['(()=>{var e={455(e,t){!function(e){"use strict";var t=function(e){return function(t){var n=e(t);return t.add(n),n}},n=function(e){return function(t,n){return e.set(t,n),n}},r=void 0===Number.MAX_SAFE_INTEGER?9007199254740991:Number.MAX_SAFE_INTEGER,o=536870912,s=2*o,i=function(e,t){return function(n){var i=t.get(n),a=void 0===i?n.size:i<s?i+1:0;if(!n.has(a))return e(n,a);if(n.size<o){for(;n.has(a);)a=Math.floor(Math.random()*s);return e(n,a)}if(n.size>r)throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;n.has(a);)a=Math.floor(Math.random()*r);return e(n,a)}},a=new WeakMap,f=n(a),c=i(f,a),u=t(c);e.addUniqueNumber=u,e.generateUniqueNumber=c}(t)}},t={};function n(r){var o=t[r];if(void 0!==o)return o.exports;var s=t[r]={exports:{}};return e[r].call(s.exports,s,s.exports,n),s.exports}(()=>{"use strict";const e=-32603,t=-32602,r=-32601,o=(e,t)=>Object.assign(new Error(e),{status:t}),s=t=>o(\'The handler of the method called "\'.concat(t,\'" returned an unexpected result.\'),e),i=(t,n)=>async({data:{id:i,method:a,params:f}})=>{const c=n[a];try{if(void 0===c)throw(e=>o(\'The requested method called "\'.concat(e,\'" is not supported.\'),r))(a);const n=void 0===f?c():c(f);if(void 0===n)throw(t=>o(\'The handler of the method called "\'.concat(t,\'" returned no required result.\'),e))(a);const u=n instanceof Promise?await n:n;if(null===i){if(void 0!==u.result)throw s(a)}else{if(void 0===u.result)throw s(a);const{result:e,transferables:n=[]}=u;t.postMessage({id:i,result:e},n)}}catch(e){const{message:n,status:r=-32603}=e;t.postMessage({error:{code:r,message:n},id:i})}};var a=n(455);const f=new Map,c=(e,n,r)=>({...n,connect:({port:t})=>{t.start();const r=e(t,n),o=(0,a.generateUniqueNumber)(f);return f.set(o,()=>{r(),t.close(),f.delete(o)}),{result:o}},disconnect:({portId:e})=>{const n=f.get(e);if(void 0===n)throw(e=>o(\'The specified parameter called "portId" with the given value "\'.concat(e,\'" does not identify a port connected to this worker.\'),t))(e);return n(),{result:null}},isSupported:async()=>{if(await new Promise(e=>{const t=new ArrayBuffer(0),{port1:n,port2:r}=new MessageChannel;n.onmessage=({data:t})=>e(null!==t),r.postMessage(t,[t])})){const e=r();return{result:e instanceof Promise?await e:e}}return{result:!1}}}),u=(e,t,n=()=>!0)=>{const r=c(u,t,n),o=i(e,r);return e.addEventListener("message",o),()=>e.removeEventListener("message",o)},l=e=>void 0!==e.channel,d=e=>e.toString(16).toUpperCase().padStart(2,"0"),g=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=[],s=new Uint8Array(e.buffer,r,n);for(let e=0;e<n;e+=1)o[e]=d(s[e]);return o.join("")},h=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=new Uint8Array(e.buffer,r,n);return String.fromCharCode.apply(null,o)},m=e=>{const t=new DataView(e),n=v(t);let r=14;const o=[];for(let e=0,s=n.numberOfTracks;e<s;e+=1){let e;({offset:r,track:e}=b(t,r)),o.push(e)}return{division:n.division,format:n.format,tracks:o}},p=(e,t,n)=>{let r;const{offset:o,value:s}=T(e,t),i=e.getUint8(o);return r=240===i?y(e,o+1):255===i?U(e,o+1):w(i,e,o+1,n),{...r,event:{...r.event,delta:s},eventTypeByte:i}},v=e=>{if(e.byteLength<14)throw new Error("Expected at least 14 bytes instead of ".concat(e.byteLength));if("MThd"!==h(e,0,4))throw new Error(\'Unexpected characters "\'.concat(h(e,0,4),\'" found instead of "MThd"\'));if(6!==e.getUint32(4))throw new Error("The header has an unexpected length of ".concat(e.getUint32(4)," instead of 6"));const t=e.getUint16(8),n=e.getUint16(10);return{division:e.getUint16(12),format:t,numberOfTracks:n}},U=(e,t)=>{let n;const r=e.getUint8(t),{offset:o,value:s}=T(e,t+1);if(1===r)n={text:h(e,o,s)};else if(2===r)n={copyrightNotice:h(e,o,s)};else if(3===r)n={trackName:h(e,o,s)};else if(4===r)n={instrumentName:h(e,o,s)};else if(5===r)n={lyric:h(e,o,s)};else if(6===r)n={marker:h(e,o,s)};else if(7===r)n={cuePoint:h(e,o,s)};else if(8===r)n={programName:h(e,o,s)};else if(9===r)n={deviceName:h(e,o,s)};else if(10===r||11===r||12===r||13===r||14===r||15===r)n={metaTypeByte:d(r),text:h(e,o,s)};else if(32===r)n={channelPrefix:e.getUint8(o)};else if(33===r)n={midiPort:e.getUint8(o)};else if(47===r)n={endOfTrack:!0};else if(81===r)n={setTempo:{microsecondsPerQuarter:(e.getUint8(o)<<16)+(e.getUint8(o+1)<<8)+e.getUint8(o+2)}};else if(84===r){let t;const r=e.getUint8(o);96&r?32==(96&r)?t=25:64==(96&r)?t=29:96&~r||(t=30):t=24,n={smpteOffset:{frame:e.getUint8(o+3),frameRate:t,hour:31&r,minutes:e.getUint8(o+1),seconds:e.getUint8(o+2),subFrame:e.getUint8(o+4)}}}else if(88===r)n={timeSignature:{denominator:Math.pow(2,e.getUint8(o+1)),metronome:e.getUint8(o+2),numerator:e.getUint8(o),thirtyseconds:e.getUint8(o+3)}};else if(89===r)n={keySignature:{key:e.getInt8(o),scale:e.getInt8(o+1)}};else{if(127!==r)throw new Error(\'Cannot parse a meta event with a type of "\'.concat(d(r),\'"\'));n={sequencerSpecificData:g(e,o,s)}}return{event:n,offset:o+s}},w=(e,t,n,r)=>{const o=128&e?null:r,s=(null===o?e:o)>>4;let i,a=null===o?n:n-1;if(8===s)i={noteOff:{noteNumber:t.getUint8(a),velocity:t.getUint8(a+1)}},a+=2;else if(9===s){const e=t.getUint8(a),n=t.getUint8(a+1);i=0===n?{noteOff:{noteNumber:e,velocity:n}}:{noteOn:{noteNumber:e,velocity:n}},a+=2}else if(10===s)i={keyPressure:{noteNumber:t.getUint8(a),pressure:t.getUint8(a+1)}},a+=2;else if(11===s)i={controlChange:{type:t.getUint8(a),value:t.getUint8(a+1)}},a+=2;else if(12===s)i={programChange:{programNumber:t.getUint8(a)}},a+=1;else if(13===s)i={channelPressure:{pressure:t.getUint8(a)}},a+=1;else{if(14!==s)throw new Error(\'Cannot parse a midi event with a type of "\'.concat(d(s),\'"\'));i={pitchBend:t.getUint8(a)|t.getUint8(a+1)<<7},a+=2}return i.channel=15&(null===o?e:o),{event:i,offset:a}},y=(e,t)=>{const{offset:n,value:r}=T(e,t);return{event:{sysex:g(e,n,r)},offset:n+r}},b=(e,t)=>{if("MTrk"!==h(e,t,4))throw new Error(\'Unexpected characters "\'.concat(h(e,t,4),\'" found instead of "MTrk"\'));const n=[],r=e.getUint32(t+4)+t+8;let o=null,s=t+8;for(;s<r;){const t=p(e,s,o),{event:r,eventTypeByte:i}=t;n.push(r),s=t.offset,l(r)&&(128&i)>0&&(o=i)}return{offset:s,track:n}},T=(e,t)=>{let n=t,r=0;for(;;){const t=e.getUint8(n);if(n+=1,!(t>127))return r+=t,{offset:n,value:r};r+=127&t,r<<=7}};u(self,{parse:({arrayBuffer:e})=>({result:m(e)})})})()})();'],{type:"application/javascript; charset=utf-8"}),tz=URL.createObjectURL(tX),tW=tq(new Worker(tz));tW.connect,tW.disconnect,tW.isSupported;var tj=tW.parseArrayBuffer;URL.revokeObjectURL(tz);var tZ={soundFont:"https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont.mjs",soundFontDrum:"https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_drum.mjs",soundFontList:"https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_list.mjs"},t$=["melody","submelody","bass","chord","t4","t5","t6","t7","t8","t9","t10","t11","t12","t13","t14"],t_=async(e,t)=>{let o=await Promise.resolve().then(()=>{let e=Error("Cannot find module as expression is too dynamic");throw e.code="MODULE_NOT_FOUND",e});return o[t]??o.default},t0=async(t={})=>{let o,A,a,r,l={...tZ,...t.cdn},u={recorder:!0,midi:!0,chord:!0,presetUI:!0,...t.features},C=t.audioContext??new AudioContext,B=C.createGain();B.gain.value=t.masterVolume??1,B.connect(C.destination);let h=C.createGain();h.gain.value=t.drumVolume??1,h.connect(C.destination);let E=()=>"suspended"===C.state?C.resume():Promise.resolve(),Q=t.engines??{},[f,I,v]=await Promise.all([Q.SoundFont??t_(l.soundFont,"SoundFont"),Q.SoundFont_drum??t_(l.soundFontDrum,"SoundFont_drum"),Q.SoundFont_list??t_(l.soundFontList,"SoundFont_list")]);u.midi&&(o=Q.parseMidi||(e=>{let t=e.buffer;if(t instanceof ArrayBuffer)return tj(t.slice(e.byteOffset,e.byteOffset+e.byteLength));throw Error("SharedArrayBuffer is not supported for MIDI parsing")}));let y=e1(C,B,{voiceWorkerUrl:null===t.voiceWorkerUrl?void 0:t.voiceWorkerUrl??(()=>{try{return new e.U(e.r(38715)).href}catch{return}})()}),w=u.recorder?(A=!1,a=[[],[]],(r=C.createScriptProcessor(4096,2,2)).onaudioprocess=e=>{if(!A)return;let t=e.inputBuffer.getChannelData(0),o=e.inputBuffer.getChannelData(1);a[0].push(t.slice()),a[1].push(o.slice())},B.connect(r),h.connect(r),r.connect(C.destination),{startRecording:()=>{A=!0},stopRecording:()=>{A=!1},getRecordedData:()=>a,isRecording:()=>A,clearRecordedData:()=>{a=[[],[]]}}):null,b=w?()=>{w.isRecording()?(w.stopRecording(),(()=>{if(!w)return;let e=w.getRecordedData(),t=e.length,o=e[0].length;if(0===o)return;let A=e[0][0].length,a=new Float32Array(t*o*A),r=0;for(let l=0;l<o;l++)for(let o=0;o<A;o++)for(let A=0;A<t;A++)a[r++]=e[A][l][o];let l=C.sampleRate,u=2*a.length,n=new DataView(new ArrayBuffer(44+u)),i=(e,t)=>{for(let o=0;o<t.length;o++)n.setUint8(e+o,t.charCodeAt(o))};i(0,"RIFF"),n.setUint32(4,32+u,!0),i(8,"WAVE"),i(12,"fmt "),n.setUint32(16,16,!0),n.setUint16(20,1,!0),n.setUint16(22,2,!0),n.setUint32(24,l,!0),n.setUint32(28,4*l,!0),n.setUint16(32,4,!0),n.setUint16(34,16,!0),i(36,"data"),n.setUint32(40,u,!0);let s=(e,t,o)=>Math.max(t,Math.min(o,e)),d=44;for(let e=0;e<a.length;e++,d+=2)n.setInt16(d,s(Math.round(32768*a[e]),-32768,32767),!0);let c=new Blob([n],{type:"audio/wav"}),g=URL.createObjectURL(c),m=document.createElement("a");m.href=g,m.download="record.wav",m.click(),URL.revokeObjectURL(g)})()):(w.clearRecordedData(),w.startRecording())}:void 0,F=new Promise(e=>{v.init(),v.onload(()=>e())}),D=(async()=>{try{await I.load({ctx:C,font:"FluidR3_GM_sf2_file",id:"0",keys:Object.values(ep)})}catch(e){console.error("[dtm] ドラム音源の読み込みに失敗",e)}})(),k={},x=new Map,M=new Map,S=t.defaultPreset??"retro_game",L=(e,t="simple")=>"simple"!==t?t$[e]??`t${e}`:0===e?"melody":1===e?"submelody":2===e?"bass":"chord",R=(e,t="simple")=>{if("melody"===e||"submelody"===e||"bass"===e||"chord"===e)return e;if(e.startsWith("t")){let o=Number(e.substring(1));if(!isNaN(o))return L(o,t)}return e},U=(e,t)=>e[t]??e.melody,T=(e,t,o="simple")=>{let A=tH[e];if(!A)return;let a=k[U(A,R(t,o))];return a?x.get(a):void 0},N=async(e,t=[...t$],o="simple")=>{let A=tH[e];if(!A)return;await F;let a=new Set;for(let e of t){let t=k[U(A,R(e,o))];t&&a.add(t)}await Promise.all([...a].map(e=>(e=>{if(x.has(e))return Promise.resolve();let t=M.get(e);if(t)return t;let o=`${e}_FluidR3_GM_sf2_file`,A=f.load({ctx:C,fontName:`_tone_${o}`,url:f.toURL(o)}).then(t=>{x.set(e,t)}).catch(t=>{console.error(`[dtm] \u697D\u5668 "${e}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557`,t)}).finally(()=>{M.delete(e)});return M.set(e,A),A})(e)))},J=async(e,t,o,A,a="simple")=>{let r="playing"===e.getPlaybackState();r&&e.pause();let l=A?ty(A):null;e.setLoading?.(!0);try{e.setInstrument(t),await N(t,o,a)}finally{l?.remove(),e.setLoading?.(!1),r&&e.play()}},K=(e,t)=>{let o=e.ownerDocument,A=o.createElement("div");if(A.className=t.className??"dtm-controlbar",null!==t.label){let e=o.createElement("span");e.className="dtm-controlbar-label",e.textContent=t.label??"INSTRUMENT",A.appendChild(e)}let a=o.createElement("select");for(let[e,t]of(a.className="dtm-select dtm-grow",Object.entries(tH))){let A=o.createElement("option");A.value=e,A.textContent=t.displayName,a.appendChild(A)}a.value=t.value&&tH[t.value]?t.value:S,A.appendChild(a);let r=!1,l=async()=>{let e=t.getDaw();if(!e||r)return;r=!0;let o=a.value;t.onChange?.(o);let A=t.getTrackIds?.()??[...t$],l=A.includes("t0");try{await J(e,o,A,t.loadingTarget,l?"advanced":"simple")}finally{r=!1}};return a.addEventListener("change",l),"prepend"===t.position?e.insertBefore(A,e.firstChild):e.appendChild(A),{element:A,select:a,setValue:e=>{tH[e]&&(a.value=e)},getValue:()=>a.value,destroy:()=>{a.removeEventListener("change",l),A.remove()}}};await F,k=await n(),await Promise.all([D,N(S)]);let P=e=>{I.font&&I.play({ctx:C,destination:h,pitch:e.pitch,volume:e.velocity,when:e.when,duration:e.duration})},Y=new WeakMap,H=[],O=[],G=[],q=(e,t={})=>{let{preset:A,presetUI:a,...r}=t,l=(r.tracks??tT).map(e=>e.id),n=A&&tH[A]?A:S,h=n,Q="advanced"===r.mode,f={getAudioTime:()=>C.currentTime,onResumeAudio:E,onPlayNote:e=>{let t=T(h,e.trackId,Q?"advanced":"simple");t&&t.play({ctx:C,destination:B,pitch:e.pitch,volume:e.volume,when:e.when,duration:e.duration})},onPlayDrum:P,singingVoices:y,parseMidi:o,onToggleRecord:b,...r},I=((e,t={})=>{let o,A,a,r,l;tv();let u=t.getAudioTime??(()=>performance.now()/1e3),n=t.tracks??tT,C=t.mode??(n.length>tT.length?"advanced":"simple"),B="advanced"===C,h=t.drumPatterns??eC,E=!!t.parseMidi,Q=!B,f=((e,t)=>{let{drumPatternNames:o,defaultDrumPattern:A,defaultBpm:a,showMidi:r}=t,l=['<option value="none">なし</option>'].concat(o.map(e=>`<option value="${e}" ${e===A?"selected":""}>${e}</option>`)).join("");e.innerHTML=`
<div class="dtm-daw" data-dtm="root">
  <div class="dtm-topbar" data-dtm="transport">
    <button class="dtm-play" data-dtm="play" disabled>${em("play")}<span>\u8A66\u8074</span></button>
    <button class="dtm-iconbtn dtm-rec" data-dtm="rec" title="\u9332\u97F3">${em("record")}</button>
    <label class="dtm-toggle"><input type="checkbox" data-dtm="solo"><span>\u30BD\u30ED</span></label>
    <span class="dtm-topbar-loading dtm-blink" data-dtm="topbar-loading">... LOADING ...</span>
    <span class="dtm-grow"></span>
    <span class="dtm-label">BPM</span>
    <input type="number" class="dtm-input dtm-input--num" data-dtm="bpm" value="${a}" min="20" max="300">
  </div>

  <div class="dtm-tooldock">
    <div class="dtm-seg">
      <button class="dtm-segbtn dtm-segbtn--active" data-dtm="tool-pen" title="\u30DA\u30F3">${em("pen")}</button>
      <button class="dtm-segbtn" data-dtm="tool-select" title="\u9078\u629E">${em("select")}</button>
      <button class="dtm-segbtn" data-dtm="tool-eraser" title="\u6D88\u3057\u30B4\u30E0">${em("eraser")}</button>
    </div>
    <button class="dtm-iconbtn" data-dtm="undo" title="\u5143\u306B\u623B\u3059" disabled>${em("undo")}</button>
    <button class="dtm-iconbtn" data-dtm="redo" title="\u3084\u308A\u76F4\u3057" disabled>${em("redo")}</button>
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
        <select class="dtm-select" data-dtm="drum-select">${l}</select>
      </div>
      <div class="dtm-row">
        <span class="dtm-label">\u97F3\u91CF</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="drum-volume" value="80" min="0" max="100">
        <span class="dtm-label" data-dtm="drum-volume-label">80%</span>
      </div>
    </div>
  </details>

  <details class="dtm-panel ${r?"":"dtm-hidden"}" data-dtm="midi-panel">
    <summary>MIDI / MML \u5165\u529B</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; min-width: 48px;">
          <span class="dtm-label" style="line-height: 1;">MIDI</span>
          <button class="dtm-infobtn" data-dtm="midi-info" title="MIDI\u306E\u8AAD\u307F\u8FBC\u307F\u89E3\u8AAC">${em("info",12)}</button>
        </div>
        <input type="file" class="dtm-input dtm-grow" accept=".mid,.midi" data-dtm="midi-input">
        <button class="dtm-btn dtm-btn--success" data-dtm="midi-load">\u8AAD\u8FBC</button>
      </div>
      <div class="dtm-row dtm-hidden" data-dtm="midi-track-selection"></div>
      <div class="dtm-row">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; min-width: 48px;">
          <span class="dtm-label" style="line-height: 1;">MML</span>
          <button class="dtm-infobtn" data-dtm="mml-info" title="MML\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${em("info",12)}</button>
        </div>
        <textarea class="dtm-textarea dtm-grow" data-dtm="mml-input" placeholder="MML\u3092\u5165\u529B"></textarea>
        <button class="dtm-btn dtm-btn--primary" data-dtm="mml-load">\u8AAD\u8FBC</button>
      </div>
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
        <div class="dtm-output-row">
          <pre><code data-dtm="output-full"></code></pre>
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-full" title="\u30B3\u30D4\u30FC">${em("copy")}</button>
        </div>
        <div class="dtm-output-row">
          <pre><code data-dtm="output-mini"></code></pre>
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-mini" title="\u30B3\u30D4\u30FC">${em("copy")}</button>
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
</div>`;let u=e.querySelector('[data-dtm="root"]'),n=e=>{let t;return t=`[data-dtm="${e}"]`,u.querySelector(t)};return{root:u,topbar:n("transport"),topbarLoading:n("topbar-loading"),playBtn:n("play"),recBtn:n("rec"),soloCheckbox:n("solo"),toolPen:n("tool-pen"),toolSelect:n("tool-select"),toolEraser:n("tool-eraser"),undoBtn:n("undo"),redoBtn:n("redo"),noteLengthSelect:n("note-length"),bpmInput:n("bpm"),zoomXLabel:n("zoomx-label"),zoomYLabel:n("zoomy-label"),zoomXIn:n("zoomx-in"),zoomXOut:n("zoomx-out"),zoomYIn:n("zoomy-in"),zoomYOut:n("zoomy-out"),rollContainer:n("roll"),wrapper:n("wrapper"),vScroll:n("vscroll"),vScrollThumb:n("vscroll-thumb"),hScroll:n("hscroll"),hScrollThumb:n("hscroll-thumb"),masterVolume:n("master-volume"),masterVolumeLabel:n("master-volume-label"),trackTabs:n("track-tabs"),trackBody:n("track-body"),drumSelect:n("drum-select"),drumVolume:n("drum-volume"),drumVolumeLabel:n("drum-volume-label"),midiInput:n("midi-input"),midiLoadBtn:n("midi-load"),midiInfoBtn:n("midi-info"),midiTrackSelection:n("midi-track-selection"),midiPanel:n("midi-panel"),mmlInput:n("mml-input"),mmlLoadBtn:n("mml-load"),shiftSelect:n("shift-select"),shiftApplyBtn:n("shift-apply"),macroClear:n("macro-clear"),macroRandom:n("macro-random"),macroHarmonic:n("macro-harmonic"),macroMono:n("macro-mono"),exportMidiBtn:n("export-midi"),generateMmlBtn:n("generate-mml"),decomposeChordToggle:n("decompose-chord"),ignoreChordHeavyToggle:n("ignore-chord-heavy"),barLimitSelect:n("bar-limit"),outputContainer:n("output-container"),outputStatus:n("output-status"),outputFull:n("output-full"),outputMini:n("output-mini"),copyFullBtn:n("copy-full"),copyMiniBtn:n("copy-mini"),overlay:n("overlay"),mmlInfoBtn:n("mml-info"),modalOverlay:n("modal-overlay"),modalTitle:n("modal-title"),modalBody:n("modal-body"),modalClose:n("modal-close")}})(e,{tracks:n,drumPatternNames:Object.keys(h),defaultDrumPattern:h.dance?"dance":Object.keys(h)[0]??"none",defaultBpm:t.defaultBpm??120,showMidi:E,showChord:Q}),I={stepsPerBar:192,keyCount:128,pitchRangeStart:0,keyHeight:15,stepWidth:1},v=16*I.stepsPerBar,y=100,w=100,b=t.defaultBpm??120,F=50,D=80,k=f.drumSelect.value,x="",M=n[0].id,S="pen",L=48,R=12,U=0,T=43*I.keyHeight-215,N=0,J=!1,K=new Set,P="stopped",Y=0,H=0,O=!1,G=[],q=null,X=[],z=[],W=()=>z.find(e=>e.config.id===M)??z[0],j=()=>{let e=4*I.stepsPerBar;for(let t of z)for(let o of t.core.getNotes()){let t=o.startStep+o.durationSteps;t>e&&(e=t)}return e},Z=()=>Math.max(0,I.keyCount*I.keyHeight-d.height),$=()=>{for(let e of(((e=1)=>{tu(),tn(),m.clearRect(0,0,d.width,d.height);let{keyHeight:t,keyCount:o,stepWidth:A,stepsPerBar:a}=p,r=Math.floor(tA/t)*t,l=tA+d.height;for(let e=r;e<l;e+=t){let A=(o-1-e/t)%12,a=tr.has(A),r=0===A,l=e-tA;a&&(m.fillStyle="#0d1020",m.fillRect(0,l,d.width,t)),m.beginPath(),m.strokeStyle=r?"#3d405b":"#1a1d30",m.lineWidth=1;let u=l+t;m.moveTo(0,u),m.lineTo(d.width,u),m.stroke()}let u=e||48,n=Math.floor(to/(A*u))*A*u,i=to+d.width,s=A*u;for(let e=n;e<=i;e+=s){let t=e/A,o=t%a==0,r=t%u==0,l=e-to;m.beginPath(),m.strokeStyle=o?"#3d405b":r?"#242840":"#1a1d30",m.lineWidth=o?2:1,m.moveTo(l,0),m.lineTo(l,d.height),m.stroke()}})(48),z)){let[t,o,A]=e.config.color,a=e.config.id===M?1:.3;ti(e.core.getNotes(),[t,o,A,a])}if("select"===S&&q){let e=m;e.save(),e.strokeStyle="#ffec27",e.lineWidth=2,e.setLineDash([4,4]),e.strokeRect(q.x,q.y,q.width,q.height),e.fillStyle="rgba(255,236,39,0.08)",e.fillRect(q.x,q.y,q.width,q.height),e.restore()}if("select"===S&&G.length>0){let e=new Set(G.map(e=>e.id)),t=W();((e,t,o=[59,130,246,1])=>{let{keyHeight:A,stepWidth:a,keyCount:r,pitchRangeStart:l}=p;for(let u of e){if(!t.has(u.id))continue;let e=u.startStep*a,n=(r-1-(u.pitch-l))*A,i=u.durationSteps*a,s=e-to,d=n-tA,c=void 0!==u.velocity?.5+u.velocity/127*.5:1,[g,p,C,B]=o,h=Math.min(255,1.3*g),E=Math.min(255,1.3*p),Q=Math.min(255,1.3*C),f=B*c;m.fillStyle=`rgba(${h},${E},${Q},${f})`,m.fillRect(s+1,d+1,i-2,A-2)}})(t.core.getNotes(),e,[...t.config.color,1])}(()=>{let e=m,t=d;if(!e)return;let o=N*I.stepWidth-U;o<-10||o>t.width+10||(e.save(),e.strokeStyle="#ffec27",e.lineWidth=2,e.setLineDash([4,4]),e.beginPath(),e.moveTo(o,0),e.lineTo(o,t.height),e.stroke(),e.restore())})(),"playing"===P&&(()=>{let e=m,t=d;if(!e)return;let o=H*I.stepWidth-U;o<0||o>t.width||(e.save(),e.strokeStyle="#ff004d",e.lineWidth=2,e.beginPath(),e.moveTo(o,0),e.lineTo(o,t.height),e.stroke(),e.restore())})(),_()},_=()=>{let e=d,t=j(),o=v*I.stepWidth,A=t*I.stepWidth,a=A-e.width+o,r=f.hScroll.clientWidth;if(a<=0)f.hScrollThumb.style.width="100%",f.hScrollThumb.style.left="0";else{let t=Math.max(40,e.width/(A+o)*r),l=U/a;f.hScrollThumb.style.width=`${t}px`,f.hScrollThumb.style.left=`${tY(l*(r-t),0,r-t)}px`}let l=I.keyCount*I.keyHeight,u=f.vScroll.clientHeight;if(l<=e.height)f.vScrollThumb.style.height="100%",f.vScrollThumb.style.top="0";else{let t=Math.max(40,e.height/l*u),o=Z(),A=T/o;f.vScrollThumb.style.height=`${t}px`,f.vScrollThumb.style.top=`${A*(u-t)}px`}},ee=!1,et=!1,eo=null,eA=!1,ea="rect",er=null,el=[],eu=null,en=e=>{t.onResumeAudio?.();let o=W();eQ(o.config.id,e,o.volume,100,0,.1)},ei=(e,t,o=0)=>{let A=W(),{stepWidth:a,keyHeight:r,keyCount:l,pitchRangeStart:u}=I,n=ta();for(let i of A.core.getNotes()){let A=i.startStep*a,s=(l-1-(i.pitch-u))*r,d=i.durationSteps*a,c=A-n.x,g=s-n.y;if(e>=c-o&&e<=c+d+o&&t>=g-o&&t<=g+r+o)return i}return null},es=e=>{e.preventDefault(),t.onResumeAudio?.();let{x:o,y:A,step:a,pitch:r}=ts(e),l=W();if("eraser"===S){let e=ei(o,A);e&&l.core.deleteNoteById(e.id);return}if("select"===S){if(G.length>0){let e=ei(o,A);if(e&&G.some(t=>t.id===e.id)){el=G.map(e=>({id:e.id,startStep:e.startStep,pitch:e.pitch})),eA=!0,ea="move",er={x:o,y:A,step:a,pitch:r},et=!1,eu=null;return}G=[],q=null}let e=ei(o,A);e?(G=[e],el=[{id:e.id,startStep:e.startStep,pitch:e.pitch}],eA=!0,ea="move"):(G=[],q=null,eA=!0,ea="rect"),er={x:o,y:A,step:a,pitch:r},et=!1;return}et=!1;let u=ei(o,A,6);if(u){en(u.pitch);let{stepWidth:e}=I,t=ta(),A=u.startStep*e-t.x,l=u.durationSteps*e;eo=o>=A+l-10&&o<=A+l?{noteId:u.id,mode:"resize",dragOffsetStep:0,dragOffsetPitch:0,startStep:u.startStep,durationSteps:u.durationSteps,lastPreviewPitch:u.pitch}:{noteId:u.id,mode:"move",dragOffsetStep:a-u.startStep,dragOffsetPitch:r-u.pitch,startStep:u.startStep,durationSteps:u.durationSteps,lastPreviewPitch:u.pitch},ee=!0;return}let n=Math.floor(a/L)*L,i=n+L;if(!l.core.getNotes().some(e=>e.pitch===r&&n<e.startStep+e.durationSteps&&i>e.startStep)){l.core.addNote(n,r,{noteLengthSteps:L}),en(r);let e=l.core.getNotes().find(e=>e.startStep===n&&e.pitch===r);e&&(eo={noteId:e.id,mode:"move",dragOffsetStep:0,dragOffsetPitch:0,startStep:e.startStep,durationSteps:e.durationSteps,lastPreviewPitch:e.pitch},et=!0),ee=!0}},ed=e=>{let t=W();if("pen"===S){if(!eo)return;let{step:A,pitch:a}=ts(e);if(et=!0,"move"===eo.mode){var o;let e=Math.round((A-eo.dragOffsetStep)/R)*R,r=a-eo.dragOffsetPitch;if(o=eo.noteId,W().core.getNotes().some(t=>t.id!==o&&t.pitch===r&&e>=t.startStep&&e<t.startStep+t.durationSteps))return;t.core.moveNote(eo.noteId,e,r),r!==eo.lastPreviewPitch&&(eo.lastPreviewPitch=r,en(r));return}let r=Math.max(Math.round((A-eo.startStep+1)/R)*R,R);t.core.resizeNote(eo.noteId,r),eo.durationSteps=r,L=r,$();return}if("select"===S&&eA&&er){let{x:o,y:A,step:a,pitch:r}=ts(e);if("rect"===ea){let e={x:Math.min(o,er.x),y:Math.min(A,er.y),width:Math.abs(o-er.x),height:Math.abs(A-er.y)};q=e;let{stepWidth:a,keyHeight:r,keyCount:l,pitchRangeStart:u}=I,n=ta();G=t.core.getNotes().filter(t=>{let o=t.startStep*a,A=l-1-(t.pitch-u),i=o-n.x,s=A*r-n.y,d=t.durationSteps*a;return e.x<i+d&&e.x+e.width>i&&e.y<s+r&&e.y+e.height>s}),$()}else{let e=Math.round((a-er.step)/R)*R,o=r-er.pitch;if(0!==e||0!==o){for(let A of(et=!0,t.core.isBatchOperation||t.core.beginBatch(),G)){let a=el.find(e=>e.id===A.id);if(!a)continue;let r=a.pitch+o;r>=0&&r<128&&t.core.moveNote(A.id,a.startStep+e,r)}if(G.length>0){let e=G[0],t=el.find(t=>t.id===e.id);if(t){let e=t.pitch+o;e!==eu&&e>=0&&e<128&&(eu=e,en(e))}}}$()}}},ec=()=>{if("pen"===S&&eo){if(et){let e=W();"move"===eo.mode?e.core.moveNoteEnd(eo.noteId):e.core.resizeNoteEnd(eo.noteId),ee=!0}eo=null,et=!1}"select"===S&&eA&&(et&&"move"===ea&&G.length>0&&W().core.endBatch(),eA=!1,er=null,et=!1,eu=null,q=null,el=[],$())},eg=()=>{let e=f.rollContainer.clientWidth||800,t=f.rollContainer.clientHeight||450;((e,t=800,o=450,A)=>{p=A;let a=document.createElement("canvas");i=a,a.width=t-60,a.height=20,a.style.position="absolute",a.style.left="60px",a.style.top="0px";let r=a.getContext("2d");if(!r)throw Error("Failed to get 2D rendering context for header.");c=r;let l=document.createElement("canvas");s=l,l.width=60,l.height=o-20,l.style.position="absolute",l.style.left="0px",l.style.top="20px";let u=l.getContext("2d");if(!u)throw Error("Failed to get 2D rendering context for keyboard.");g=u;let n=document.createElement("canvas");d=n,n.width=t-60,n.height=o-20,n.style.position="absolute",n.style.left="60px",n.style.top="20px",n.style.touchAction="none";let C=n.getContext("2d",{willReadFrequently:!0});if(!C)throw Error("Failed to get 2D rendering context for grid.");m=C,e.innerHTML="",e.style.position="relative",e.style.width=`${t+60}px`,e.style.height=`${o}px`,e.append(a,l,n),(()=>{let e=s.parentElement;if(!e)return;let t=e.querySelector("#header-corner");t||((t=document.createElement("div")).id="header-corner",t.style.position="absolute",t.style.left="0px",t.style.top="0px",t.style.width="60px",t.style.height="20px",t.style.backgroundColor="#0a0f1f",t.style.borderRight="2px solid #29adff",t.style.borderBottom="2px solid #29adff",e.insertBefore(t,i))})()})(f.wrapper,e,t,I);let o=d;o.addEventListener("pointerdown",es),o.addEventListener("dblclick",e=>{e.preventDefault();let{step:t,pitch:o}=ts(e),A=W(),a=A.core.getNotes().find(e=>e.pitch===o&&t>=e.startStep&&t<e.startStep+e.durationSteps);a&&A.core.deleteNoteById(a.id)}),o.addEventListener("wheel",e=>{e.preventDefault(),T=tY(T+e.deltaY,0,Z()),td(U=Math.max(0,U+e.deltaX),T),$()},{passive:!1}),o.addEventListener("click",()=>{ee&&(ee=!1)});let A=i;A.addEventListener("click",e=>{if("playing"===P)return;let t=A.getBoundingClientRect();N=Math.max(0,Math.floor(Math.floor((e.clientX-t.left+U)/I.stepWidth)/R)*R),$()}),td(U,T),$()},ep=()=>{let e=d,t=(U+e.width/2)/I.stepWidth;I.stepWidth=2*y*.5/100,f.zoomXLabel.textContent=`${y}%`,td(U=Math.max(0,t*I.stepWidth-e.width/2),T),$()},eB=()=>{let e=d,t=(T+e.height/2)/I.keyHeight;I.keyHeight=15*w/100,f.zoomYLabel.textContent=`${w}%`,T=tY(t*I.keyHeight-e.height/2,0,Z()),td(U,T),$()},eh=()=>({zoomX:y,zoomY:w,decomposeChord:f.decomposeChordToggle.checked,ignoreChordHeavy:f.ignoreChordHeavyToggle.checked}),eE=()=>t.onViewStateChange?.(eh()),eQ=(e,o,A,a,r,l)=>{let u=A/100*(a/127)*(F/100);t.onPlayNote?.({trackId:e,pitch:o,velocity:a,volume:u,when:r,duration:l})},ef=tQ({getTracks:()=>z.map(e=>({id:e.config.id,volume:e.volume,notes:e.core.getNotes()})),getBpm:()=>b,getPlayStartStep:()=>N,getDrumPattern:()=>h[k]??null,getSoloTrackId:()=>J?M:null,getAudioTime:u,onPlayNote:e=>{let o=z.findIndex(t=>t.config.id===e.trackId);o>=0&&K.has(o)&&t.singingVoices||t.onPlayNote?.({...e,volume:e.volume*(F/100)})},onPlayDrum:e=>{let o=e.velocity*(D/100)*(F/100);t.onPlayDrum?.({...e,velocity:o})},onTick:e=>{H=e;let t=d.width/I.stepWidth,o=U/I.stepWidth+t-4;if(H>o){let e=Math.round(t/I.stepsPerBar);td(U+=e*I.stepsPerBar*I.stepWidth,T)}$()},onEnd:()=>{P="stopped",H=0,ew(),$()},stepsPerBar:I.stepsPerBar}),eI=async()=>{let e;if("playing"===P)return;await t.onResumeAudio?.();let o="paused"===P?Y:N;t.singingVoices?.reset();let A=(e=new Map,z.forEach((t,o)=>{let A=t.lyricModel.trim(),a=t.lyrics.trim();if(!A||!a)return;let r=ek(a);0!==r.length&&e.set(o,{trackId:o,model:A.toLowerCase(),volume:t.vocalVolume,gate:t.vocalGate,pan:t.vocalPan,octave:t.vocalOctave,syllables:r})}),e);K=new Set(A.keys());let a=60/b/48,r=t.singingVoices?[...A.values()].map(e=>{let t=z[e.trackId],A=[...t?.core.getNotes()??[]].sort((e,t)=>e.startStep-t.startStep),r=(e.gate??100)/100,l=(e.octave??0)*12,u=Math.min(A.length,e.syllables.length),n=[];for(let t=0;t<u;t++){let u=A[t];u.startStep<o||n.push({syllable:e.syllables[t],pitch:u.pitch+l,startSec:(u.startStep-o)*a,durationSec:u.durationSteps*a*r})}return{id:t?.config.id,model:e.model,volume:eU(e.volume??200)*(F/100),pan:eT(e.pan??64),notes:n}}):[],l=t.singingVoices,u=!!l&&r.some(e=>e.notes.length>0);if(u&&l){let e=ty(f.rollContainer);tl(!0);try{await l.loadModels(r.map(e=>e.model)),await l.warm(r)}catch(e){console.warn("[dtm] voice preload failed",e)}finally{e.remove(),tl(!1)}}if("paused"!==P){let e=d;td(U=Math.max(0,N*I.stepWidth-.5*e.width),T)}P="playing",ef.start(o),u&&l&&l.startStream(r,ef.getStartTime(),{isAudible:e=>!J||e.id===M}),ew()},ev=()=>{ef.stop(),t.singingVoices?.stopStream(),P="stopped",H=0,ew(),$()},ew=()=>{let e="playing"===P,t=e?"停止":"paused"===P?"再開":"試聴";f.playBtn.innerHTML=`${em(e?"stop":"play")}<span>${t}</span>`,f.playBtn.classList.toggle("dtm-play--stop",e)},eb=()=>{let e=W().core;f.undoBtn.disabled=!e.canUndo(),f.redoBtn.disabled=!e.canRedo()},eF=()=>{for(let e of(f.trackTabs.innerHTML="",z)){let[t,o,A]=e.config.color,a=document.createElement("button");a.className=`dtm-pill ${e.config.id===M?"dtm-pill--active":""}`,a.style.setProperty("--dtm-pill-color",`rgb(${t},${o},${A})`),a.innerHTML=`<span class="dtm-dot"></span><span>${e.config.name}</span>`,a.addEventListener("click",()=>eD(e.config.id)),f.trackTabs.appendChild(a)}let e=W();f.trackBody.innerHTML=`
      <div class="dtm-row">
        <span class="dtm-label">velocity</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="track-vol" min="0" max="127" value="${e.volume}">
        <span class="dtm-label" data-dtm="track-vol-label">${e.volume}</span>
      </div>`;let t=f.trackBody.querySelector('[data-dtm="track-vol"]'),A=f.trackBody.querySelector('[data-dtm="track-vol-label"]');if(t.addEventListener("input",()=>{e.volume=Number.parseInt(t.value,10),e.core.setVolume(e.volume),A.textContent=String(e.volume)}),B||"chord"!==e.config.id){let t=document.createElement("div");t.className="dtm-row",t.style.flexDirection="column",t.style.alignItems="stretch",t.innerHTML=`
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
      </div>`,f.trackBody.appendChild(t);let o=t.querySelector('[data-dtm="lyric-model"]'),A=t.querySelector('[data-dtm="lyric-octave"]'),a=t.querySelector('[data-dtm="lyric-icon"]'),r=t.querySelector('[data-dtm="lyric-body"]'),l=t.querySelector('[data-dtm="lyric-input"]'),u=t.querySelector('[data-dtm="lyric-count"]'),n=t.querySelector('[data-dtm="lyric-vol"]'),i=t.querySelector('[data-dtm="lyric-vol-label"]'),s=t.querySelector('[data-dtm="lyric-pan"]'),d=t.querySelector('[data-dtm="lyric-pan-label"]'),c=t.querySelector('[data-dtm="lyric-terms"]'),g=t.querySelector('[data-dtm="lyric-terms-link"]'),m=e=>64===e?"C":e<64?`L${64-e}`:`R${e-64}`,p=(e,t)=>{let A=document.createElement("option");A.value=e,A.textContent=t,o.appendChild(A)};for(let e of(p("","なし"),tJ))p(e,tP(e));e.lyricModel&&!tJ.includes(e.lyricModel)&&p(e.lyricModel,tP(e.lyricModel)),o.value=e.lyricModel,A.value=String(e.vocalOctave),l.value=e.lyrics,n.value=String(e.vocalVolume),i.textContent=String(e.vocalVolume),s.value=String(e.vocalPan),d.textContent=m(e.vocalPan);let C=()=>{let t=ek(l.value).length;u.textContent=e.lyricModel&&t>0?`${t}\u97F3\u7BC0`:""},B=()=>{let t,o;r.style.display=e.lyricModel?"":"none",A.style.display=e.lyricModel?"":"none",C();let l=e.lyricModel?eO[e.lyricModel]:void 0;if(l){let t=tP(e.lyricModel);g.textContent=`${t}UTAU\u97F3\u6E90`,g.href=l,c.classList.remove("dtm-hidden")}else c.classList.add("dtm-hidden");(o=(t=e.lyricModel?eH[e.lyricModel.toLowerCase()]:void 0)?th[t]:void 0)?(a.src=o,a.classList.remove("dtm-hidden")):(a.removeAttribute("src"),a.classList.add("dtm-hidden"))};B(),o.addEventListener("change",()=>{e.lyricModel=o.value,B()}),A.addEventListener("change",()=>{e.vocalOctave=Number.parseInt(A.value,10)}),l.addEventListener("input",()=>{e.lyrics=l.value,C()}),n.addEventListener("input",()=>{e.vocalVolume=Number.parseInt(n.value,10),i.textContent=n.value}),s.addEventListener("input",()=>{e.vocalPan=Number.parseInt(s.value,10),d.textContent=m(e.vocalPan)}),d.style.cursor="pointer",d.title="タップで中央(C)へ",d.addEventListener("click",()=>{e.vocalPan=64,s.value="64",d.textContent=m(64)})}if("chord"===e.config.id&&Q){let t=document.createElement("div");t.className="dtm-row",t.style.flexDirection="column",t.style.alignItems="stretch",t.innerHTML=`
        <div class="dtm-row" style="justify-content: space-between; align-items: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="dtm-label">\u548C\u97F3</span>
            <button class="dtm-infobtn" data-dtm="chord-info" title="\u30B3\u30FC\u30C9\u9032\u884C\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${em("info",12)}</button>
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
          <textarea class="dtm-textarea dtm-grow" data-dtm="chord-input" placeholder="\u4F8B: C|G|Am|Em|F|C|F|G">${e.savedChordInput}</textarea>
          <button class="dtm-btn dtm-btn--primary" data-dtm="chord-apply">\u9069\u7528</button>
        </div>`,f.trackBody.appendChild(t);let A=t.querySelector('[data-dtm="chord-pattern"]'),a=t.querySelector('[data-dtm="chord-input"]');A.value=e.savedChordPattern;let r=()=>{e.savedChordInput=a.value,e.savedChordPattern=A.value};A.addEventListener("change",r),a.addEventListener("input",r),t.querySelector('[data-dtm="chord-info"]').addEventListener("click",()=>{o("コード進行の自動入力解説",tL)}),t.querySelector('[data-dtm="chord-apply"]').addEventListener("click",()=>{r(),eJ()})}},eD=e=>{M=e,eF(),eb(),$()},ex=e=>{for(let[t,o]of(S=e,[[f.toolPen,"pen"],[f.toolSelect,"select"],[f.toolEraser,"eraser"]]))t.classList.toggle("dtm-segbtn--active",o===e);"select"!==e&&(q=null,G=[]),$()},eM=()=>{var e;let t,o=Number(f.barLimitSelect.value),A=o>0?o*I.stepsPerBar:1/0,a=e=>A===1/0?e:e.filter(e=>e.startStep<A),r=(t=[],(e={instrument:x||void 0,drum:"none"!==k?k:void 0,volume:F,mode:C}).instrument&&t.push(`#inst=${e.instrument}`),e.drum&&t.push(`#drum=${e.drum}`),void 0!==e.volume&&t.push(`#volume=${e.volume}`),e.mode&&t.push(`#mode=${e.mode}`),t.join(" "));if(f.decomposeChordToggle.checked){let e=f.ignoreChordHeavyToggle.checked?z.filter(e=>!((e,t=.6)=>{if(e.length<3)return!1;let o=new Map;for(let t of e)o.set(t.startStep,(o.get(t.startStep)??0)+1);return e.filter(e=>(o.get(e.startStep)??0)>=3).length/e.length>=t})(e.core.getNotes())):z,t=z.length-e.length,A=(e=>{let t=[...e].sort((e,t)=>e.startStep-t.startStep||e.pitch-t.pitch),o=[],A=[];for(let e of t){let t=-1,a=1/0;for(let r=0;r<o.length;r++)A[r]<=e.startStep&&A[r]<a&&(a=A[r],t=r);-1===t?(o.push([e]),A.push(e.startStep+e.durationSteps)):(o[t].push(e),A[t]=e.startStep+e.durationSteps)}return o})(a(e.flatMap(e=>e.core.getNotes()))),l=z[0].core,u=A.map((e,t)=>`@${t} ${l.getMMLFromNotes(e,b,100).trim()}`),n=A.map((e,t)=>`@${t}${l.getMMLFromNotes(e,b,100).trim().replace(/\s+/g,"")}`);return{full:[r,...u,ey].filter(e=>e.length>0).join(";\n"),minified:[r,...n,ey].filter(e=>e.length>0).join(";"),ignoredCount:t,trackCount:A.length,barLimit:o}}let l=[],u=[];z.forEach((e,t)=>{let o=a(e.core.getNotes());if(o.length>0){let A=e.core.getMMLFromNotes(o,b,e.volume).trim();l.push(`@${t} ${A}`),u.push(`@${t}${A.replace(/\s+/g,"")}`)}});let n=z.map((e,t)=>({i:t,notes:a(e.core.getNotes()),text:e.lyrics.replace(/[\r\n]+/g," ").trim(),model:e.lyricModel.trim(),vol:e.vocalVolume,gate:e.vocalGate,pan:e.vocalPan,oct:e.vocalOctave})).filter(e=>e.model.length>0&&e.text.length>0&&e.notes.length>0).map(e=>{let t=[200===e.vol?"":`v${e.vol}`,100===e.gate?"":`q${e.gate}`,64===e.pan?"":`p${e.pan}`,0===e.oct?"":`o${e.oct}`].filter(e=>e.length>0).join(" "),o=t?`${e.model} ${t}`:e.model;return`@@${e.i} ${o} ${e.text}`});return{full:[r,...l,...n,ey].filter(e=>e.length>0).join(";\n"),minified:[r,...u,...n,ey].filter(e=>e.length>0).join(";"),ignoredCount:0,trackCount:l.length,barLimit:o}},eS=()=>{let e=Number.MAX_SAFE_INTEGER,t=[];for(let o of z)for(let A of o.core.getNotes())A.startStep<e?(e=A.startStep,t=[A]):A.startStep===e&&t.push(A);return 0===t.length?null:Math.round(t.reduce((e,t)=>e+t.pitch,0)/t.length)},eL=e=>{let t=d;T=tY((I.keyCount-1-(e-I.pitchRangeStart))*I.keyHeight-(t.height-I.keyHeight)/2,0,Z()),td(U,T)},eR=()=>{for(let e of z)e.core.resetHistory(),e.core.clearNotesWithoutHistory();$()},eN=e=>{if(!e)return;for(let e of(eR(),z))e.core.setLoadMode(!0);let{placements:o,bpm:A,lyrics:a,meta:r}=tB(e,{stepsPerBar:I.stepsPerBar,collectLyrics:!0,clampTrackCount:z.length});for(let e of(x=r.instrument??"",r.drum&&h[r.drum]&&(k=r.drum,f.drumSelect.value=r.drum,t.onDrumChange?.(r.drum)),void 0!==r.volume&&(F=r.volume,f.masterVolume.value=String(r.volume),f.masterVolumeLabel.textContent=`${r.volume}%`),z))e.lyrics="",e.lyricModel="",e.vocalVolume=200,e.vocalGate=100,e.vocalPan=64,e.vocalOctave=0;for(let e of(a?.forEach((e,t)=>{let o=z[t];o&&(o.lyrics=e.syllables.map(e=>e.kana).join(""),o.lyricModel=e.model,o.vocalVolume=e.volume,o.vocalGate=e.gate,o.vocalPan=e.pan,o.vocalOctave=e.octave??0)}),o)){let t=z[e.trackIndex];t&&t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps})}for(let e of(A&&eG(A),z))e.core.setLoadMode(!1),e.core.addHistoryOnce();N=0,U=0;let l=eS();null!==l?eL(l):td(U,T),$(),eF(),eb()},eJ=()=>{let e=W(),t=z.find(e=>"chord"===e.config.id);if(!t)return;let o=(e=>{let{chordStr:t,patternType:o,rootShift:A,bpm:a,stepsPerBar:r}=e,l=[];if(!t.trim())return l;let u=[];try{u=((e,t=120)=>{let o=[],A=60/t*4,a=new Set("ABCDEFG_=%N"),r=0,l=null;for(let t of e.replace(/[！-～]/g,e=>String.fromCharCode(e.charCodeAt(0)-65248)).replace(/　/g," ").split("\n").map(e=>e.trim()))if(!(!t.length||/^#/.test(t)))for(let e of t.split(/[|lｌ→]/)){if(!e.length)continue;let t=r++*A,u=[];for(let t=0;t<e.length;t++){let o=e[t],A=e[t-1],r=e.slice(t-2,t);a.has(o)&&"/"!==A&&"on"!==r&&("N."!==r||"C"!==o)&&u.push(t)}if(!u.length)continue;let n=2**Math.ceil(Math.log2(u.length)),i=A/n;for(let[A,a]of u.entries()){let r=e.slice(a,A===u.length-1?e.length:u[A+1]).replace(/\s+/g,""),n=r[0];if("_"===n||"N"===n){l=null;continue}if("="===n){l&&(l.duration+=i);continue}let s=t+A*i;if("%"===n){if(null===l)continue;l={...l,when:s,duration:i}}else{let e=r.slice(0,"#"===r[1]?2:1),t=r.slice(e.length).replace(/[\s・]/g,"");l={key:e,chord:t,when:s,duration:i}}o.push(l)}null!==l&&n>u.length&&(l.duration+=i*(n-u.length))}return o})(t,a)}catch{u=[]}if(u.length>0){let e=60/a*4/r,t={};for(let o of u){let A=Math.floor(o.when/e),a=Math.floor(o.duration/e);t[A]||(t[A]=[]),t[A].push({key:o.key,chord:o.chord,whenStep:A,durationSteps:a})}for(let e of Object.values(t))for(let t of e){let e;try{e=[...V(`${t.key}${t.chord}`).notes]}catch{continue}let a=t.durationSteps;if("block"===o)for(let o of e)l.push({startStep:t.whenStep,pitch:48+o+A,durationSteps:a,velocity:100});else if("arpeggio"===o){let o=Math.floor(a/e.length);e.forEach((e,r)=>{l.push({startStep:t.whenStep+r*o,pitch:48+e+A,durationSteps:a-r*o,velocity:100})})}else if("arpeggio-fast"===o)e.forEach((e,o)=>{l.push({startStep:t.whenStep+6*o,pitch:48+e+A,durationSteps:Math.max(12,a-6*o),velocity:100})});else if("offbeat"===o){let o=Math.floor(r/4),u=Math.floor(o/2);for(let r=0;r<4;r++){let n=t.whenStep+r*o+u;if(n<t.whenStep+a)for(let t of e)l.push({startStep:n,pitch:48+t+A,durationSteps:Math.min(u,12),velocity:100})}}else if("yatsume"===o){let o=Math.floor(r/4),u=e=>Math.max(1,Math.round(e*o/480)),n=[0,360,960,1320],i=u(360);for(let o of n){let r=t.whenStep+u(o);if(r<t.whenStep+a)for(let t of e)l.push({startStep:r,pitch:48+t+A,durationSteps:i,velocity:100})}}else"alternating"===o&&e.forEach((e,o)=>{let a=o*Math.floor(r/4);l.push({startStep:t.whenStep+a,pitch:48+e+A,durationSteps:Math.max(12,Math.floor(r/4)),velocity:100})})}}else t.split(/[\s,]+/).filter(e=>e).forEach((e,t)=>{let o;try{o=[...V(e).notes]}catch{return}if(0===o.length)return;let a=t*r;o.forEach((e,t)=>{let o=3*t;l.push({startStep:a+o,pitch:48+e+A,durationSteps:r-o,velocity:100})})});return l})({chordStr:e.savedChordInput,patternType:e.savedChordPattern,rootShift:e.savedChordRoot,bpm:b,stepsPerBar:I.stepsPerBar});for(let e of(t.core.clearNotesWithoutHistory(),t.core.beginBatch(),o))t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:Math.max(1,e.durationSteps),velocity:e.velocity});t.core.endBatch(),t.core.addHistoryOnce(),$()},eK=async e=>{if(!t.parseMidi)return;let o=await t.parseMidi(e),A=e5(o).filter(e=>e.selected).map(e=>e.index);eP(o,A)},eP=(e,t)=>{for(let e of(eR(),z))e.core.setLoadMode(!0);let{placements:o,bpm:A}=B?((e,t,o)=>{let{tracks:A,division:a}=e,r=e6(e),l=a/48,u=[];return t.forEach((e,t)=>{if(t>=o.length)return;let a=A[e];if(!a)return;let r=o[t],n=[],i=0;for(let e of a)if(i+=e.delta,9!==e.channel){if(e.noteOn&&e.noteOn.velocity>0){let t=e.noteOn.noteNumber,o=e.noteOn.velocity;n.push({pitch:t,velocity:o,start:i,end:null})}else if(e.noteOff||e.noteOn&&0===e.noteOn.velocity){let t=e.noteOff||e.noteOn;if(t){let e=t.noteNumber;for(let t=n.length-1;t>=0;t--)if(n[t].pitch===e&&null===n[t].end){n[t].end=i;break}}}}for(let e of n){if(null===e.end)continue;let t=Math.round(e.start/l),o=Math.max(1,Math.round((e.end-e.start)/l));u.push({trackId:r,startStep:t,pitch:e.pitch,durationSteps:o,velocity:e.velocity})}}),{placements:u,bpm:r}})(e,t,z.map(e=>e.config.id)):((e,t)=>{let{tracks:o,division:A}=e,a=e6(e),r={};for(let e of t){let t=o[e];if(!t)continue;let A=0;for(let e of t)if(A+=e.delta,9!==e.channel){if(e.noteOn&&e.noteOn.velocity>0){let t=e.noteOn.noteNumber,o=e.noteOn.velocity,a=e.channel??0;r[a]||(r[a]=[]),r[a].push({pitch:t,velocity:o,start:A,end:null})}else if(e.noteOff||e.noteOn&&0===e.noteOn.velocity){let t=e.noteOff||e.noteOn;if(t){let o=t.noteNumber,a=e.channel??0;if(r[a])for(let e=r[a].length-1;e>=0;e--){let t=r[a][e];if(t.pitch===o&&null===t.end){t.end=A;break}}}}}}let l=4*A,u=8*l,n={};for(let[e,t]of Object.entries(r)){let o=Number.parseInt(e,10),A=t.filter(e=>null!==e.end);if(0===A.length){n[o]={avgPitch:60,maxSimultaneous:0,hasSubmelodyPattern:!1};continue}let a=A.reduce((e,t)=>e+t.pitch,0)/A.length,r=0,i=[...A].sort((e,t)=>e.start-t.start);for(let e=0;e<i.length;e++){let t=1;for(let o=e+1;o<i.length;o++)i[o].start<i[e].end&&t++;r=Math.max(r,t)}let s=()=>{if(0===i.length)return!1;let e=[],t=i[0].start,o=i[0].end;for(let A=1;A<i.length;A++)i[A].start-i[A-1].end>=l&&(e.push({start:t,end:o}),t=i[A].start),o=i[A].end;return e.push({start:t,end:o}),e.every(e=>e.end-e.start<u)};n[o]={avgPitch:a,maxSimultaneous:r,hasSubmelodyPattern:s()}}let i=Object.keys(r).map(Number).sort((e,t)=>e-t),s=[...i].sort((e,t)=>n[e].avgPitch-n[t].avgPitch),d=n[s[Math.floor(s.length/4)]]?.avgPitch??60,c=i.filter(e=>n[e].avgPitch<=d&&n[e].maxSimultaneous<=2),g=i.filter(e=>n[e].maxSimultaneous<=1&&!c.includes(e)),m=g.filter(e=>n[e].hasSubmelodyPattern),p=g.filter(e=>!n[e].hasSubmelodyPattern),C=i.filter(e=>!c.includes(e)&&!p.includes(e)&&!m.includes(e)),B={melody:p,submelody:m,bass:c,chord:C},h=[],E=A/48;for(let[e,t]of Object.entries(r)){let o=Number.parseInt(e,10),A=null;for(let[e,t]of Object.entries(B))if(t.includes(o)){A=e;break}if(A)for(let e of t){if(null===e.end)continue;let t=Math.round(e.start/E),o=Math.max(1,Math.round((e.end-e.start)/E));h.push({trackId:A,startStep:t,pitch:e.pitch,durationSteps:o,velocity:e.velocity})}}return{placements:h,bpm:a}})(e,t);for(let e of o){let t=z.find(t=>t.config.id===e.trackId);t&&t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}for(let e of(eG(Math.round(A)),z))e.core.setLoadMode(!1),e.core.addHistoryOnce();N=0,U=0;let a=eS();null!==a?eL(a):td(U,T),$(),eb()},eY=()=>(e=>{var t;let{tracks:o,drumPattern:A,drumVolume:a=80,bpm:r,stepsPerBar:l}=e,u=[];if(o.forEach((e,t)=>{if(0===e.notes.length)return;let o=t<9?t:t+1&15,A=[];for(let t of e.notes){let a=Math.round(10*t.startStep),r=Math.round((t.startStep+(t.durationSteps||1))*10),l=Math.round((t.velocity??100)*(e.volume??100)/100);A.push({t:a,m:[144|o,t.pitch,l]}),A.push({t:r,m:[144|o,t.pitch,0]})}A.sort((e,t)=>e.t-t.t),u.push(A)}),A&&A.length>0){let e=Math.max(...o.filter(e=>e.notes.length>0).map(e=>Math.max(...e.notes.map(e=>e.startStep+e.durationSteps))),l),t=[],r=Math.ceil(e/l);for(let o=0;o<r;o++){let r=o*l;for(let o of A){let A=r+o.step;if(A>=e)continue;let l=Math.round((o.velocity??1)*(a/100)*127);t.push({t:Math.round(10*A),m:[153,o.pitch,l]}),t.push({t:Math.round((A+1)*10),m:[153,o.pitch,0]})}}t.sort((e,t)=>e.t-t.t),t.length>0&&u.push(t)}let n=[];for(let e of(t=u.length+1,n.push(77,84,104,100),n.push(...e9(6)),n.push(...e4(1)),n.push(...e4(t)),n.push(...e4(480)),te(n,e=>{e.push(0,255,81,3,...e8(Math.round(6e7/r)))}),u))te(n,t=>{let o=0;for(let A of e)t.push(...e7(A.t-o),...A.m),o=A.t});return new Blob([new Uint8Array(n).buffer],{type:"audio/midi"})})({tracks:z.map(e=>({notes:e.core.getNotes(),volume:e.volume})),drumPattern:h[k],drumVolume:D,bpm:b,stepsPerBar:I.stepsPerBar}),eG=e=>{for(let t of(b=e,f.bpmInput.value=String(e),z))t.core.setTempo(e)},eV=0,eq=()=>{let e=Date.now();e-eV<100||(eV=e,W().core.undo(),$(),eb())},eX=()=>{W().core.redo(),$(),eb()},ez=e=>{f.overlay.hidden=!1,tl(!0),setTimeout(()=>{e(),f.overlay.hidden=!0,tl(!1)},30)},eW=null,ej=[],eZ=e=>{if(e.ctrlKey||e.metaKey)if("KeyZ"!==e.code||e.shiftKey){if("KeyZ"===e.code&&e.shiftKey||"KeyY"===e.code)e.preventDefault(),eX();else if("KeyC"===e.code&&G.length>0)e.preventDefault(),X=[...G];else if("KeyX"===e.code&&G.length>0){e.preventDefault(),X=[...G];let t=W().core;for(let e of(t.beginBatch(),G))t.deleteNoteById(e.id);t.endBatch(),G=[]}else if("KeyV"===e.code&&X.length>0){e.preventDefault();let t=W().core,o=t.getNotes(),A=Math.min(...X.map(e=>e.startStep));for(let e of(t.beginBatch(),X)){let a=N+(e.startStep-A),r=a+e.durationSteps;o.some(t=>t.pitch===e.pitch&&a<t.startStep+t.durationSteps&&r>t.startStep)||t.addNote(a,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}t.endBatch(),$()}}else e.preventDefault(),eq()};eg(),z=n.map(e=>({config:e,core:new tg({onMMLGenerated:()=>{},onNotesChanged:()=>{O&&($(),eb())}},e.volume),volume:e.volume,savedChordInput:"",savedChordPattern:"block",savedChordRoot:0,lyrics:"",lyricModel:"",vocalVolume:200,vocalGate:100,vocalPan:64,vocalOctave:0})),O=!0,A=!1,a=!1,f.hScroll.addEventListener("pointerdown",e=>{A=!0,e.preventDefault(),f.hScroll.setPointerCapture(e.pointerId),r(e.clientX)}),f.vScroll.addEventListener("pointerdown",e=>{a=!0,e.preventDefault(),f.vScroll.setPointerCapture(e.pointerId),l(e.clientY)}),f.hScroll.addEventListener("pointermove",e=>{A&&r(e.clientX)}),f.vScroll.addEventListener("pointermove",e=>{a&&l(e.clientY)}),f.hScroll.addEventListener("pointerup",()=>{A=!1}),f.vScroll.addEventListener("pointerup",()=>{a=!1}),document.addEventListener("pointermove",e=>{A&&r(e.clientX),a&&l(e.clientY)}),document.addEventListener("pointerup",()=>{A=!1,a=!1}),r=e=>{let t=d,o=j(),A=v*I.stepWidth,a=o*I.stepWidth-t.width+A;if(a<=0)return;let r=f.hScroll.getBoundingClientRect(),l=Number.parseFloat(f.hScrollThumb.style.width)||40,u=tY(e-r.left-l/2,0,r.width-l)/(r.width-l);td(U=tY(u*a,0,a),T),$()},l=e=>{let t=Z();if(t<=0)return;let o=f.vScroll.getBoundingClientRect(),A=Number.parseFloat(f.vScrollThumb.style.height)||40,a=tY(e-o.top-A/2,0,o.height-A)/(o.height-A);T=tY(a*t,0,t),td(U,T),$()},f.playBtn.addEventListener("click",()=>{"playing"===P?ev():eI()}),f.playBtn.disabled=!1,f.recBtn.addEventListener("click",()=>t.onToggleRecord?.()),f.recBtn.style.display=t.onToggleRecord?"":"none",f.soloCheckbox.addEventListener("change",()=>{J=f.soloCheckbox.checked}),f.toolPen.addEventListener("click",()=>ex("pen")),f.toolSelect.addEventListener("click",()=>ex("select")),f.toolEraser.addEventListener("click",()=>ex("eraser")),f.undoBtn.addEventListener("click",eq),f.redoBtn.addEventListener("click",eX),f.noteLengthSelect.addEventListener("change",()=>{L=R=Number.parseInt(f.noteLengthSelect.value,10),$()}),f.bpmInput.addEventListener("input",()=>{eG(Number.parseInt(f.bpmInput.value,10)||120)}),f.zoomXIn.addEventListener("click",()=>{y=Math.min(200,y+25),ep(),eE()}),f.zoomXOut.addEventListener("click",()=>{y=Math.max(25,y-25),ep(),eE()}),f.zoomYIn.addEventListener("click",()=>{w=Math.min(200,w+25),eB(),eE()}),f.zoomYOut.addEventListener("click",()=>{w=Math.max(50,w-25),eB(),eE()}),f.decomposeChordToggle.addEventListener("change",eE),f.ignoreChordHeavyToggle.addEventListener("change",eE),f.masterVolume.addEventListener("input",()=>{F=Number.parseInt(f.masterVolume.value,10)||0,f.masterVolumeLabel.textContent=`${F}%`}),f.drumSelect.addEventListener("change",()=>{k=f.drumSelect.value,t.onDrumChange?.(k)}),f.drumVolume.addEventListener("input",()=>{D=Number.parseInt(f.drumVolume.value,10)||0,f.drumVolumeLabel.textContent=`${D}%`}),f.macroClear.addEventListener("click",()=>{let e=W();e.core.beginBatch(),e.core.clearNotesWithoutHistory(),e.core.endBatch(),e.core.saveHistory(),$()}),f.macroRandom.addEventListener("click",()=>{((e,t)=>{let{stepsPerBar:o,startStep:A,pitchRangeStart:a}=t,r=a+60,l=e2[Math.floor(Math.random()*e2.length)],u=Math.floor(12*Math.random()),n=[];for(let e=0;e<12;e++){let t=(e-u+12)%12;l.includes(t)&&n.push(r+e)}e.beginBatch();for(let t=0;t<8;t++){let a=A+t*o,r=Math.floor(4*Math.random())+2,l=new Set;for(let t=0;t<r;t++){let t=a+24*Math.floor(o/24*Math.random());if(l.has(t))continue;l.add(t);let A=n[Math.floor(Math.random()*n.length)];e.addNote(t,A,{noteLengthSteps:24})}}e.endBatch(),e.saveHistory()})(W().core,{stepsPerBar:I.stepsPerBar,startStep:N,pitchRangeStart:I.pitchRangeStart}),$()}),f.macroHarmonic.addEventListener("click",()=>{let e=z.find(e=>"chord"===e.config.id);e&&"chord"!==M&&(((e,t,o)=>{let A=o.stepsPerBar/2,a=e.getNotes().concat(t.getNotes());if(0===a.length)return;let r=Math.ceil(Math.max(...a.map(e=>e.startStep+e.durationSteps))/A),l=new Set;e.beginBatch();for(let o=0;o<r;o++){let a=o*A,r=a+A,u=o%2==0,n=t.getNotes().filter(e=>e.startStep>=a&&e.startStep<r);if(n.length>0?l=new Set(n.map(e=>e.pitch%12)):u&&(l=new Set),0!==l.size)for(let t of e.getNotes().filter(e=>e.startStep>=a&&e.startStep<r))l.has(t.pitch%12)||e.deleteNoteById(t.id)}e.endBatch(),e.saveHistory()})(W().core,e.core,{stepsPerBar:I.stepsPerBar}),$())}),f.macroMono.addEventListener("click",()=>{let e=z.find(e=>"chord"===e.config.id);e&&"chord"!==M&&(((e,t,o)=>{let A=o.stepsPerBar/2,a=e.getNotes().concat(t.getNotes());if(0===a.length)return;let r=Math.ceil(Math.max(...a.map(e=>e.startStep+e.durationSteps))/A),l=new Set;e.beginBatch();for(let o=0;o<r;o++){let a=o*A,r=a+A,u=o%2==0,n=t.getNotes().filter(e=>e.startStep>=a&&e.startStep<r);if(n.length>0?l=new Set(n.map(e=>e.pitch%12)):u&&(l=new Set),0===l.size)continue;let i=e.getNotes().filter(e=>e.startStep>=a&&e.startStep<r),s=i.filter(e=>l.has(e.pitch%12)),d=new Set(s.map(e=>e.id));for(let t of i)d.has(t.id)||e.deleteNoteById(t.id);let c=new Map;for(let e of s)c.has(e.startStep)||c.set(e.startStep,[]),c.get(e.startStep)?.push(e);for(let t of c.values())if(t.length>1){t.sort((e,t)=>t.pitch-e.pitch);let[,...o]=t;for(let t of o)e.deleteNoteById(t.id)}}e.endBatch(),e.saveHistory()})(W().core,e.core,{stepsPerBar:I.stepsPerBar}),$())}),f.generateMmlBtn.addEventListener("click",()=>{let{full:e,minified:t,ignoredCount:o,trackCount:A,barLimit:a}=eM();f.outputFull.textContent=e,f.outputMini.textContent=t;let r=f.decomposeChordToggle.checked,l=o>0?` / \u4F34\u594F${o}\u30C8\u30E9\u30C3\u30AF\u9664\u5916`:"",u=a>0?` / \u301C${a}\u5C0F\u7BC0`:"";f.outputStatus.textContent=`[${r?"和音分解":"通常"}] (${A}\u30C8\u30E9\u30C3\u30AF${l}${u}) \u901A\u5E38: ${e.length}\u6587\u5B57 / minify: ${t.length}\u6587\u5B57`,f.outputContainer.classList.remove("dtm-hidden"),eb()}),f.exportMidiBtn.addEventListener("click",()=>{let e=eY(),t=URL.createObjectURL(e),o=document.createElement("a");o.href=t,o.download="dtm.mid",o.click(),URL.revokeObjectURL(t)});let e$=(e,t)=>{navigator.clipboard?.writeText(e),t.classList.add("dtm-btn--success"),setTimeout(()=>t.classList.remove("dtm-btn--success"),1200)};f.copyFullBtn.addEventListener("click",()=>e$(f.outputFull.textContent??"",f.copyFullBtn)),f.copyMiniBtn.addEventListener("click",()=>e$(f.outputMini.textContent??"",f.copyMiniBtn)),f.mmlLoadBtn.addEventListener("click",()=>ez(()=>eN(f.mmlInput.value)));let e_=null,e0=null,e3=()=>{if(e_&&(e_.stop(),e_.destroy(),e_=null),e0){e0.textContent="▶ 試聴",e0.classList.remove("dtm-btn--danger"),e0.classList.add("dtm-btn--primary");let e=e0.closest(".dtm-modal-sample-box"),t=e?.querySelector(".dtm-modal-sample-player-container");t&&(t.innerHTML=""),e0=null}};for(let e of(o=(e,o)=>{for(let t of(e3(),f.modalTitle.textContent=e,f.modalBody.innerHTML=o,f.modalOverlay.removeAttribute("hidden"),f.modalBody.querySelectorAll(".dtm-modal-sample-copy-btn")))t.addEventListener("click",()=>{let e=t.getAttribute("data-mml")||"";navigator.clipboard.writeText(e).then(()=>{let e=t.textContent;t.textContent="✓ コピー完了",t.classList.add("dtm-btn--success"),setTimeout(()=>{t.textContent=e,t.classList.remove("dtm-btn--success")},1200)})});for(let e of f.modalBody.querySelectorAll(".dtm-modal-sample-play-btn")){let o=e;o.addEventListener("click",()=>{let e=o.closest(".dtm-modal-sample-box"),A=e?.querySelector(".dtm-modal-sample-player-container"),a=o.getAttribute("data-mml")||"";if(e0===o)e_&&e_.isPlaying()?e_.stop():(ev(),e_&&(e_.play(),o.textContent="■ 停止",o.classList.remove("dtm-btn--primary"),o.classList.add("dtm-btn--danger")));else if(e3(),ev(),e0=o,o.textContent="■ 停止",o.classList.remove("dtm-btn--primary"),o.classList.add("dtm-btn--danger"),A){A.innerHTML="";let e=tS(A,a,{onPlayNote:e=>{if(t.onPlayNote){let o=n[Number(e.trackId)],A=o?o.id:e.trackId;t.onPlayNote({...e,trackId:A})}},onPlayDrum:t.onPlayDrum,onResumeAudio:t.onResumeAudio,getAudioTime:t.getAudioTime,singingVoices:t.singingVoices,drumPatterns:t.drumPatterns,volume:F,onStop:()=>{e0===o&&(o.textContent="▶ 試聴",o.classList.remove("dtm-btn--danger"),o.classList.add("dtm-btn--primary"))}});e_=e,e.play()}})}},f.modalClose.addEventListener("click",()=>{e3(),f.modalOverlay.setAttribute("hidden","")}),f.modalOverlay.addEventListener("click",e=>{e.target===f.modalOverlay&&(e3(),f.modalOverlay.setAttribute("hidden",""))}),f.mmlInfoBtn.addEventListener("click",()=>{o("MMLの書き方解説",tR)}),f.midiInfoBtn.addEventListener("click",()=>{o("MIDIの読み込み解説",tU)}),f.shiftApplyBtn.addEventListener("click",()=>ez(()=>{((e,t)=>{if(0!==t)for(let o of e)for(let e of[...o.getNotes()]){let A=e.startStep+t;A<0?o.deleteNoteById(e.id):o.moveNote(e.id,A,e.pitch)}})(z.map(e=>e.core),Number.parseInt(f.shiftSelect.value,10)||0),$()})),E&&(f.midiInput.addEventListener("change",async()=>{let e=f.midiInput.files?.[0];if(!e||!t.parseMidi)return;f.overlay.hidden=!1,tl(!0);let o=new Uint8Array(await e.arrayBuffer());ej=e5(eW=await t.parseMidi(o)),f.midiTrackSelection.innerHTML='<span class="dtm-label">トラック</span>',ej.forEach((e,t)=>{let o=document.createElement("button");o.className=`dtm-btn ${e.selected?"dtm-btn--primary":"dtm-btn--ghost"}`,o.dataset.selected=String(e.selected),o.textContent=`${e.name} (${e.noteCount})`,o.addEventListener("click",()=>{let e="true"!==o.dataset.selected;o.dataset.selected=String(e),o.classList.toggle("dtm-btn--primary",e),o.classList.toggle("dtm-btn--ghost",!e)}),f.midiTrackSelection.appendChild(o),0===t&&(f.midiTrackSelection.dataset.ready="1")}),f.midiTrackSelection.classList.remove("dtm-hidden"),f.overlay.hidden=!0,tl(!1)}),f.midiLoadBtn.addEventListener("click",()=>{if(!eW)return;let e=[];f.midiTrackSelection.querySelectorAll("button").forEach((t,o)=>{"true"===t.dataset.selected&&e.push(ej[o].index)}),0!==e.length&&ez(()=>eP(eW,e))})),document.addEventListener("keydown",eZ),f.root.querySelectorAll("textarea, input")))e.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&["KeyZ","KeyY","KeyV","KeyC","KeyX"].includes(e.code)&&e.stopPropagation()});eG(b),eF(),ew(),eb(),$(),t.initialMML&&eN(t.initialMML);let e1=null,tt=new ResizeObserver(()=>{e1&&clearTimeout(e1),e1=setTimeout(()=>eg(),150)});tt.observe(f.rollContainer),document.addEventListener("pointermove",ed),document.addEventListener("pointerup",ec);let tl=e=>{f.topbar.classList.toggle("is-loading",e)};return{play:eI,pause:()=>{"playing"===P&&(Y=H,ef.stop(),t.singingVoices?.stopStream(),P="paused",ew())},stop:ev,getMML:eM,setInstrument:e=>{x=e},getDrum:()=>k,setDrum:e=>{("none"===e||h[e])&&(k=e,f.drumSelect.value=e,t.onDrumChange?.(e))},getViewState:eh,setViewState:e=>{"number"==typeof e.zoomX&&(y=tY(e.zoomX,25,200),ep()),"number"==typeof e.zoomY&&(w=tY(e.zoomY,50,200),eB()),"boolean"==typeof e.decomposeChord&&(f.decomposeChordToggle.checked=e.decomposeChord),"boolean"==typeof e.ignoreChordHeavy&&(f.ignoreChordHeavyToggle.checked=e.ignoreChordHeavy)},loadMML:eN,loadMIDI:eK,exportMIDI:eY,setBpm:eG,getPlaybackState:()=>P,setLoading:tl,destroy:()=>{ef.stop(),tt.disconnect(),document.removeEventListener("pointermove",ed),document.removeEventListener("pointerup",ec),document.removeEventListener("keydown",eZ),e.innerHTML=""}}})(e,f);H.push(I);let v=a??u.presetUI,w=null;if(v){Y.get(e)?.destroy();let t=e.querySelector('[data-dtm="roll"]');w=K(e,{getDaw:()=>I,getTrackIds:()=>l,value:n,loadingTarget:t??e,position:"prepend",onChange:e=>{h=e}}),Y.set(e,w)}return I.setInstrument(n),I.setLoading?.(!0),N(n,l,Q?"advanced":"simple").finally(()=>{I.setLoading?.(!1)}),{...I,destroy:()=>{I.destroy(),w?.destroy(),Y.get(e)===w&&Y.delete(e);let t=H.indexOf(I);t>=0&&H.splice(t,1)}}};return{audioContext:C,singingVoices:y,mountEditor:q,mountPlayer:(e,t,o={})=>{let A=tB(t,{}),a=A.meta??{},r=a.instrument&&tH[a.instrument]?a.instrument:S,l="advanced"===a.mode,u=[...new Set(A.placements.map(e=>e.trackIndex))].map(e=>L(e,l?"advanced":"simple"));N(r,u.length>0?u:[...t$],l?"advanced":"simple");let n=tS(e,t,{getAudioTime:()=>C.currentTime,onResumeAudio:E,onPlayNote:e=>{let t=T(r,L(Number(e.trackId),l?"advanced":"simple"),l?"advanced":"simple");t&&t.play({ctx:C,destination:B,pitch:e.pitch,volume:e.volume,when:e.when,duration:e.duration})},onPlayDrum:P,singingVoices:y,...o});return O.push(n),{...n,destroy:()=>{n.destroy();let e=O.indexOf(n);e>=0&&O.splice(e,1)}}},loadPreset:N,defaultPreset:S,mountPresetSelect:K,mountModeSwitch:(e,t)=>{let o=e.ownerDocument,A=t.tracksFor??(e=>"advanced"===e?tN:tT),a={simple:t.labels?.simple??"シンプル",advanced:t.labels?.advanced??"アドバンス"},r=e=>"function"==typeof t.editorOptions?t.editorOptions(e):t.editorOptions??{},l=t.mode??"simple",u=null,n=o.createElement("div");if(n.className=t.className??"dtm-controlbar",null!==t.label){let e=o.createElement("span");e.className="dtm-controlbar-label",e.textContent=t.label??"MODE",n.appendChild(e)}let i=o.createElement("div");i.className="dtm-modeseg";let s=new Map,d=()=>{for(let[e,t]of s)t.classList.toggle("dtm-modebtn--active",e===l)};for(let e of["simple","advanced"]){let t=o.createElement("button");t.type="button",t.className="dtm-modebtn",t.textContent=a[e],t.addEventListener("click",()=>m(e)),i.appendChild(t),s.set(e,t)}n.appendChild(i);let c=(o,a)=>{let l=r(o);u=q(t.editorTarget,{...l,mode:o,tracks:A(o),initialMML:a??l.initialMML}),"prepend"===t.position?e.insertBefore(n,e.firstChild):e.appendChild(n),t.onMount?.(u,o)},g=()=>{if(!u)return;let e=u.getMML().full;return t.onUnmount?.(u,l),u.destroy(),u=null,e};function m(e){if(e===l&&u)return;let o=g();l=e,d(),t.onChange?.(e),c(e,o)}d(),c(l,r(l).initialMML);let p={element:n,getDaw:()=>u,getMode:()=>l,setMode:m,destroy:()=>{g(),n.remove();let e=G.indexOf(p);e>=0&&G.splice(e,1)}};return G.push(p),p},dispose:()=>{for(let e of[...G])e.destroy();for(let e of O)e.destroy();for(let e of H)e.destroy();G.length=0,O.length=0,H.length=0,C.close()}}};e.s(["createDtmStudio",0,t0,"mountMmlPlayer",0,tS])}]);