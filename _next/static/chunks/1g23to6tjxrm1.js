(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,54845,e=>{e.q("/unj-reze/_next/static/media/voice-worker.0hu18hwk63o6f.js")},48605,e=>{"use strict";let t,a,o,r,u,n;var l,i,s,d,c,m,p,h=`0000 Acoustic Grand Piano
0010 Bright Acoustic Piano
0020 Electric Grand Piano
0030 Honky-tonk Piano
0040 Electric Piano 1
0050 Electric Piano 2
0060 Harpsichord
0070 Clavinet
0080 Celesta
0090 Glockenspiel
0100 Music Box
0110 Vibraphone
0120 Marimba
0130 Xylophone
0140 Tubular Bells
0150 Dulcimer
0160 Drawbar Organ
0170 Percussive Organ
0180 Rock Organ
0190 Church Organ
0200 Reed Organ
0210 Accordion
0220 Harmonica
0230 Tango Accordion
0240 Acoustic Guitar (nylon)
0250 Acoustic Guitar (steel)
0260 Electric Guitar (jazz)
0270 Electric Guitar (clean)
0280 Electric Guitar (muted)
0290 Overdriven Guitar
0300 Distortion Guitar
0310 Guitar Harmonics
0320 Acoustic Bass
0330 Electric Bass (finger)
0340 Electric Bass (pick)
0350 Fretless Bass
0360 Slap Bass 1
0370 Slap Bass 2
0380 Synth Bass 1
0390 Synth Bass 2
0400 Violin
0410 Viola
0420 Cello
0430 Contrabass
0440 Tremolo Strings
0450 Pizzicato Strings
0460 Orchestral Harp
0470 Timpani
0480 String Ensemble 1
0490 String Ensemble 2
0500 Synth Strings 1
0510 Synth Strings 2
0520 Choir Aahs
0530 Voice Oohs
0540 Synth Choir
0550 Orchestra Hit
0560 Trumpet
0570 Trombone
0580 Tuba
0590 Muted Trumpet
0600 French Horn
0610 Brass Section
0620 Synth Brass 1
0630 Synth Brass 2
0640 Soprano Sax
0650 Alto Sax
0660 Tenor Sax
0670 Baritone Sax
0680 Oboe
0690 English Horn
0700 Bassoon
0710 Clarinet
0720 Piccolo
0730 Flute
0740 Recorder
0750 Pan Flute
0760 Blown bottle
0770 Shakuhachi
0780 Whistle
0790 Ocarina
0800 Lead 1 (square)
0810 Lead 2 (sawtooth)
0820 Lead 3 (calliope)
0830 Lead 4 (chiff)
0840 Lead 5 (charang)
0850 Lead 6 (voice)
0860 Lead 7 (fifths)
0870 Lead 8 (bass + lead)
0880 Pad 1 (new age)
0890 Pad 2 (warm)
0900 Pad 3 (polysynth)
0910 Pad 4 (choir)
0920 Pad 5 (bowed)
0930 Pad 6 (metallic)
0940 Pad 7 (halo)
0950 Pad 8 (sweep)
0960 FX 1 (rain)
0970 FX 2 (soundtrack)
0980 FX 3 (crystal)
0990 FX 4 (atmosphere)
1000 FX 5 (brightness)
1010 FX 6 (goblins)
1020 FX 7 (echoes)
1030 FX 8 (sci-fi)
1040 Sitar
1050 Banjo
1060 Shamisen
1070 Koto
1080 Kalimba
1090 Bagpipe
1100 Fiddle
1110 Shanai
1120 Tinkle Bell
1130 Agogo
1140 Steel Drums
1150 Woodblock
1160 Taiko Drum
1170 Melodic Tom
1180 Synth Drum
1190 Reverse Cymbal
1200 Guitar Fret Noise
1210 Breath Noise
1220 Seashore
1230 Bird Tweet
1240 Telephone Ring
1250 Helicopter
1260 Applause
1270 Gunshot`;async function f(){let e={};for(let t of h.trim().split("\n")){let a=t.indexOf(" ");if(-1===a)continue;let o=t.slice(0,a);e[t.slice(a+1)]=o}return e}var g=h.trim().split("\n").map(e=>e.slice(e.indexOf(" ")+1)),v=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],y=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],b=e=>(e%12+12)%12,F=(e,t=!1)=>(t?y:v)[b(e)],C=class extends Error{constructor(e,t){super(`SyntaxError: ${t}
input.idx: ${e.idx}
input.str: ${e.str}`),this.name="ChordSyntaxError"}},A=(e,t)=>{throw new C(e,t)},x=class e{static nums=new Set("0123456789");str;nest;idx;constructor(e,t=0){this.str=e,this.nest=t,this.idx=0}get isEOF(){return this.str.length<=this.idx}get char(){return this.str[this.idx]}get num(){let t="";for(;!this.isEOF;){let a=this.char;if(!e.nums.has(a))break;t+=a,this.idx++}return t.length?Number(t):null}slice(e){return this.str.slice(this.idx,this.idx+e)}},E=class{pitch=null;chord=null;isChord=!1;pending=null;nest=-1;get value(){let{pitch:e,chord:t}=this;return new Set([...t].map(t=>t+e))}set value(e){let t=this.pitch;this.chord=new Set([...e].map(e=>e-t))}},B=class{map=new Map;lengths=[];_set(e,t){this.map.set(e,t),this.lengths.includes(e.length)||(this.lengths.push(e.length),this.lengths.sort((e,t)=>t-e))}set(e,t){if(Array.isArray(e))for(let a of e)this._set(a,t);else this._set(e,t)}parse(e){for(let t of this.lengths){let a=e.slice(t);if(this.map.has(a))return e.idx+=a.length,this.map.get(a)}return null}},w=new B;w.set("(",0),w.set(")",1),w.set(",",2),w.set(["/","on"],3);var k=(e,t=new E,a=0)=>{let o=e.idx,r=r=>{let u=e.str.slice(o,r);u.length&&S(new x(u,a),t)};for(;;){let{idx:u}=e;if(e.isEOF)return a&&A(e,`Unclosed ${a} brackets`),r(u),t;let n=w.parse(e);if(null===n){e.idx++;continue}let{pending:l}=t;switch(r(u),n){case 0:k(e,t,a+1);break;case 1:return a-1<0&&A(e,"Unable to close brackets"),t;case 2:t.pending=l;break;case 3:{let o=k(e,new E,a),r=[...t.value];if(o.isChord)t.value=[...o.value].concat(r);else{let e=r.sort((e,t)=>e-t),a=(o.pitch+3)%12-3;if(e[0]<a)for(;e[0]<a;)e.push(e.shift()+12);else for(;;){let t=e[e.length-1]-12;if(t<a)break;e.pop(),e.unshift(t)}e.push(a),t.value=e}}}o=e.idx}},S=(e,t)=>e.isEOF?t:null===t.pitch?I(e,t):null===t.pending?G(e,t):q(e,t),M=new B,D=new B;for(let e of[M,D])e.set(["#","♯"],1),e.set(["b","♭"],-1);M.set("+",1),M.set("-",-1);var L=(e,t=!1)=>(t?D:M).parse(e),N=[0,2,4,5,7,9,11];for(let e of[...N.keys()])N.push(N[e]+12);var T=e=>N[e-1],P=new B;for(let[e,t]of[..."CDEFGAB"].entries())P.set(t,N[e]);var I=(e,t)=>{let a=P.parse(e);null===a&&A(e,"Not found pitch"),t.pitch=a;let o=L(e,!0);return null!==o&&(t.pitch+=o),R(e,t)},O=[0,4,7],z=[0,3,6],U=new B;U.set(["m","min","Min","minor","Minor","-"],[0,3,7]),U.set(["dim","〇"],z),U.set("+",[0,4,8]),U.set(["Φ","φ","ø"],[0,3,6,10]);var R=(e,t)=>{let a=/^maj/i.test(e.str.slice(e.idx))?null:U.parse(e);if(null!==a&&(t.isChord=!0),t.chord=new Set(a||O),a===z){let{num:a}=e,o=t.chord;null!==a&&o.add(T(a)-2)}return t.nest=e.nest,S(e,t)},j=(e,t,a)=>{e.add(T(t)+a)},V=e=>{e.delete(T(5)),e.add(T(5)+1)},$=(e,t,a,o=!1)=>{5===t?e.delete(T(3)):6===t?e.add(T(6)):69===t?e.add(T(6)).add(T(9)):(t>=7&&e.add(T(7)+(o?-1:0)),t>=9&&e.add(T(9)),t>=11&&e.add(T(11)),t>=13&&e.add(T(13)))},H=new B;H.set("add",j),H.set(["omit","no"],(e,t,a)=>{e.delete(T(t)+a)}),H.set("sus",(e,t,a)=>{e.delete(T(3)),e.add(T(t)+a)}),H.set(["M","maj","Maj","major","Major","△","Δ"],$),H.set("aug",V);var G=(e,t)=>{t.isChord||(t.isChord=!0);let a=H.parse(e),o=t.chord;if(null===a){let a="+"===e.char,r=L(e),{num:u}=e;if(null===u&&(a?V(o):A(e,"Not found number")),null===r)e.nest===t.nest?$(o,u,0,!0):j(o,u,0);else o.delete(T(u)),o.add(T(u)+r)}else a===V?V(o):t.pending=a;return S(e,t)},q=(e,t)=>{let a=L(e),{num:o}=e,{pending:r,chord:u}=t;return null===o&&A(e,"Not found number"),r(u,o,null===a?0:a),t.pending=null,S(e,t)},W=e=>{let t=k(new x(e)),a=[...t.value].sort((e,t)=>e-t),o=[...t.chord].sort((e,t)=>e-t),r=[...new Set(a.map(b))].sort((e,t)=>e-t);return{symbol:e,root:b(t.pitch),notes:a,pitchClasses:r,intervals:o}},Q=["","m","7","M7","m7","dim","m7b5","aug","6","m6","sus4","sus2","mM7","dim7","7sus4","7#5","add9","madd9","9","M9","m9","69","m69","5"].map((e,t)=>({quality:e,pitchClasses:W(`C${e}`).pitchClasses,priority:t}));let K=new Map;for(let e of Q){let t=e.pitchClasses.join(",");K.has(t)||K.set(t,e)}var Y=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],_=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17],Z=e=>e.reduce((e,t)=>e+t,0)/e.length,X=(e,t)=>{let a=Z(e),o=Z(t),r=0,u=0,n=0;for(let l=0;l<e.length;l++){let i=e[l]-a,s=t[l]-o;r+=i*s,u+=i*i,n+=s*s}let l=Math.sqrt(u*n);return 0===l?0:r/l},J=(e,t,a)=>`${F(e,a)} ${t}`,ee=e=>({tonic:e.tonic,mode:e.mode,name:e.name}),et=(e,t)=>e.tonic===t.tonic&&e.mode===t.mode,ea=(e,t,a)=>{let o=Array(12).fill(0);for(let r of e){if(r.duration<=0){r.when>=t&&r.when<a&&(o[b(r.pitch)]+=1);continue}let e=Math.max(r.when,t),u=Math.min(r.when+r.duration,a)-e;u>0&&(o[b(r.pitch)]+=u)}return o},eo=(e,t)=>{let a=[];for(let o=0;o<12;o++)for(let r of["major","minor"]){let u="major"===r?Y:_,n=e.map((e,t)=>u[b(t-o)]);a.push({tonic:o,mode:r,name:J(o,r,t),score:X(e,n)})}return a.sort((e,t)=>t.score-e.score),a},er=e=>{let t=[];for(let a of e){let e=t[t.length-1];e&&et(e.key,a.key)?e.duration=a.when+a.duration-e.when:t.push({...a})}return t},eu=e=>0===e?1.3:3===e||4===e?1.2:10===e||11===e?.95:6===e||7===e||8===e?.7:.85,en=(()=>{let e=[];for(let t=0;t<12;t++)for(let a of Q){let o=new Set,r=Array(12).fill(0),u=new Set;for(let e of a.pitchClasses){u.add(e);let a=b(e+t);o.add(a),r[a]=eu(e)}e.push({root:t,quality:a.quality,priority:a.priority,pcs:o,weights:r,rel:u})}return e})(),el=[0,2,4,5,7,9,11],ei=[0,2,3,5,7,8,10],es=(e,t,a)=>{let o=Array(12).fill(0),r=0,u=1/0,n=-1;for(let l of e){let e=Math.max(l.when,t),i=Math.min(l.when+Math.max(l.duration,0),a),s=l.duration<=0?+(l.when>=t&&l.when<a):Math.max(i-e,0);!(s<=0)&&(o[b(l.pitch)]+=s,r+=s,l.pitch<u&&(u=l.pitch,n=b(l.pitch)))}return{when:t,duration:a-t,profile:r>0?o.map(e=>e/r):o,bass:n,empty:0===r}},ed=["I","II","III","IV","V","VI","VII"],ec=(e,t)=>{let a="major"===e.mode?el:ei,o=b(t.root-e.tonic),r=a.indexOf(o),u="";if(-1===r){let e=a.indexOf(b(o-1)),t=a.indexOf(b(o+1));-1!==e?(r=e,u="#"):-1!==t?(r=t,u="b"):(r=0,u="?")}let n=t.rel.has(4),l=t.rel.has(3),i=t.rel.has(6),s=t.rel.has(8),d=t.rel.has(10),c=ed[r],m="";return l&&i?(c=c.toLowerCase(),m=d?"ø7":"°",t.rel.has(9)&&(m="°7")):n&&s?m="+":l&&(c=c.toLowerCase()),m||(t.rel.has(11)?m="M7":d?m="7":t.rel.has(9)&&!t.rel.has(10)&&(m="6")),u+c+m},em=(e,t)=>{for(let a of e)if(t>=a.when&&t<a.when+a.duration)return a.key;return e.length?e[e.length-1].key:null},ep=(e,t,a)=>{let o=F(e.root,a)+e.quality,r=-1!==t&&t!==e.root&&e.pcs.has(t);return{symbol:r?`${o}/${F(t,a)}`:o,rootSymbol:o,inversion:r,bass:-1===t?e.root:t}},eh={play:{d:"M8 5v14l11-7z"},pause:{d:"M6 5h4v14H6zm8 0h4v14h-4z"},stop:{d:"M6 6h12v12H6z"},record:{d:"M12 6a6 6 0 100 12 6 6 0 000-12z"},undo:{d:"M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",stroke:!0},redo:{d:"M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6",stroke:!0},chevronUp:{d:"M5 15l7-7 7 7",stroke:!0},chevronDown:{d:"M19 9l-7 7-7-7",stroke:!0},chevronLeft:{d:"M15 19l-7-7 7-7",stroke:!0},chevronRight:{d:"M9 5l7 7-7 7",stroke:!0},first:{d:"M18 18l-6-6 6-6M11 18l-6-6 6-6",stroke:!0},copy:{d:"M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",stroke:!0},pen:{d:"M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"},eraser:{d:"M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"},select:{d:"M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2M20 7V5a1 1 0 00-1-1h-2M20 17v2a1 1 0 01-1 1h-2M4 11v2M20 11v2M11 4h2M11 20h2",stroke:!0},settings:{d:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",stroke:!0},info:{d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"},more:{d:"M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"}},ef=(e,t=20)=>{let a=eh[e];if(!a)return"";let o=a.stroke?'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"':'fill="currentColor"';return`<svg viewBox="0 0 24 24" width="${t}" height="${t}" ${o} aria-hidden="true"><path d="${a.d}"/></svg>`},eg={kick:36,snare:38,clap:39,rimshot:37,hihatClosed:42,hihatPedal:44,hihatOpen:46,tomLow:45,tomMid:47,tomHigh:50,crash:49,ride:51,splash:55,tambourine:54},ev={"4beat":[{step:0,pitch:eg.kick,velocity:1},{step:48,pitch:eg.kick,velocity:.9},{step:96,pitch:eg.kick,velocity:1},{step:144,pitch:eg.kick,velocity:.9}],"8beat":[{step:0,pitch:eg.kick,velocity:1},{step:0,pitch:eg.hihatClosed,velocity:.8},{step:24,pitch:eg.hihatClosed,velocity:.5},{step:48,pitch:eg.snare,velocity:1},{step:48,pitch:eg.clap,velocity:.6},{step:48,pitch:eg.hihatClosed,velocity:.8},{step:72,pitch:eg.hihatClosed,velocity:.5},{step:96,pitch:eg.kick,velocity:.9},{step:96,pitch:eg.hihatClosed,velocity:.8},{step:120,pitch:eg.hihatClosed,velocity:.5},{step:144,pitch:eg.snare,velocity:1},{step:144,pitch:eg.hihatClosed,velocity:.8},{step:168,pitch:eg.hihatClosed,velocity:.5}],"16beat":[{step:0,pitch:eg.kick,velocity:1},{step:0,pitch:eg.hihatClosed,velocity:.8},{step:12,pitch:eg.hihatClosed,velocity:.4},{step:24,pitch:eg.hihatClosed,velocity:.6},{step:36,pitch:eg.hihatClosed,velocity:.4},{step:48,pitch:eg.snare,velocity:1},{step:48,pitch:eg.hihatClosed,velocity:.8},{step:60,pitch:eg.hihatClosed,velocity:.4},{step:72,pitch:eg.hihatClosed,velocity:.6},{step:84,pitch:eg.hihatClosed,velocity:.4},{step:96,pitch:eg.kick,velocity:.9},{step:96,pitch:eg.hihatClosed,velocity:.8},{step:108,pitch:eg.kick,velocity:.7},{step:108,pitch:eg.hihatClosed,velocity:.4},{step:120,pitch:eg.hihatClosed,velocity:.6},{step:132,pitch:eg.hihatClosed,velocity:.4},{step:144,pitch:eg.snare,velocity:1},{step:144,pitch:eg.hihatClosed,velocity:.8},{step:156,pitch:eg.hihatClosed,velocity:.4},{step:168,pitch:eg.hihatClosed,velocity:.6},{step:180,pitch:eg.hihatClosed,velocity:.4}],shuffle:[{step:0,pitch:eg.kick,velocity:1},{step:0,pitch:eg.hihatClosed,velocity:.8},{step:32,pitch:eg.hihatClosed,velocity:.5},{step:48,pitch:eg.snare,velocity:1},{step:48,pitch:eg.hihatClosed,velocity:.8},{step:80,pitch:eg.hihatClosed,velocity:.5},{step:96,pitch:eg.kick,velocity:.9},{step:96,pitch:eg.hihatClosed,velocity:.8},{step:128,pitch:eg.hihatClosed,velocity:.5},{step:144,pitch:eg.snare,velocity:1},{step:144,pitch:eg.hihatClosed,velocity:.8},{step:176,pitch:eg.hihatClosed,velocity:.5}],dance:[{step:0,pitch:eg.kick,velocity:1},{step:24,pitch:eg.hihatOpen,velocity:.7},{step:48,pitch:eg.kick,velocity:1},{step:48,pitch:eg.clap,velocity:1},{step:72,pitch:eg.hihatOpen,velocity:.7},{step:96,pitch:eg.kick,velocity:1},{step:120,pitch:eg.hihatOpen,velocity:.7},{step:144,pitch:eg.kick,velocity:1},{step:144,pitch:eg.clap,velocity:1},{step:168,pitch:eg.hihatOpen,velocity:.7}],bossa:[{step:0,pitch:eg.kick,velocity:.9},{step:0,pitch:eg.hihatClosed,velocity:.6},{step:24,pitch:eg.hihatClosed,velocity:.4},{step:48,pitch:eg.rimshot,velocity:.8},{step:48,pitch:eg.hihatClosed,velocity:.6},{step:72,pitch:eg.kick,velocity:.7},{step:72,pitch:eg.hihatClosed,velocity:.4},{step:96,pitch:eg.kick,velocity:.9},{step:96,pitch:eg.hihatClosed,velocity:.6},{step:120,pitch:eg.hihatClosed,velocity:.4},{step:144,pitch:eg.rimshot,velocity:.8},{step:144,pitch:eg.hihatClosed,velocity:.6},{step:168,pitch:eg.hihatClosed,velocity:.4}],disco:[{step:0,pitch:eg.kick,velocity:1},{step:0,pitch:eg.hihatClosed,velocity:.7},{step:24,pitch:eg.tambourine,velocity:.8},{step:48,pitch:eg.snare,velocity:1},{step:48,pitch:eg.hihatClosed,velocity:.7},{step:72,pitch:eg.tambourine,velocity:.8},{step:96,pitch:eg.kick,velocity:1},{step:96,pitch:eg.hihatClosed,velocity:.7},{step:120,pitch:eg.tambourine,velocity:.8},{step:144,pitch:eg.snare,velocity:1},{step:144,pitch:eg.hihatClosed,velocity:.7},{step:168,pitch:eg.tambourine,velocity:.8}]},ey={piano:{displayName:"グランドピアノ",description:"最も破綻しにくい構成。楽曲制作のスケッチにも最適。",melody:"Acoustic Grand Piano",submelody:"Vibraphone",bass:"Electric Bass (finger)",chord:"Pad 2 (warm)"},acoustic:{displayName:"アコースティック",description:"生楽器の温かみを重視。フォークやポップスに。",melody:"Acoustic Guitar (steel)",submelody:"Harmonica",bass:"Acoustic Bass",chord:"Acoustic Guitar (nylon)"},jazz_night:{displayName:"ジャズ・ナイト",description:"Rhodes風のEPとウッドベースによる、大人びたアンサンブル。",melody:"Electric Piano 1",submelody:"Flute",bass:"Acoustic Bass",chord:"Electric Guitar (jazz)"},synth_pop:{displayName:"シンセポップ",description:"80s〜現代まで。抜けるリードと太いベースの王道。",melody:"Lead 2 (sawtooth)",submelody:"Lead 4 (chiff)",bass:"Synth Bass 2",chord:"Pad 3 (polysynth)"},cyber_punk:{displayName:"サイバーパンク",description:"デジタルな冷たさと歪みが混ざり合う、未来的な響き。",melody:"Lead 8 (bass + lead)",submelody:"Lead 5 (charang)",bass:"Synth Bass 2",chord:"Pad 8 (sweep)"},rock:{displayName:"ハードロック",description:"歪みギターと重厚なベースで、パワーを前面に。",melody:"Distortion Guitar",submelody:"Rock Organ",bass:"Electric Bass (pick)",chord:"Overdriven Guitar"},orchestra:{displayName:"オーケストラ",description:"壮大な物語を予感させる、管弦楽器の重厚な響き。",melody:"French Horn",submelody:"Pizzicato Strings",bass:"Cello",chord:"Tremolo Strings"},japanese_wa:{displayName:"和風・雅",description:"琴と三味線の繊細な調べに、尺八の情緒を添えて。",melody:"Koto",submelody:"Shamisen",bass:"Taiko Drum",chord:"Shakuhachi"},arabic_exotic:{displayName:"エキゾチック",description:"シタールやバグパイプによる、異国情緒溢れるサウンド。",melody:"Sitar",submelody:"Bagpipe",bass:"Fretless Bass",chord:"Kalimba"},fantasy_rpg:{displayName:"ファンタジーRPG",description:"オカリナとハープが紡ぐ、冒険と魔法の世界観。",melody:"Ocarina",submelody:"Celesta",bass:"Timpani",chord:"Orchestral Harp"},ambient_cloud:{displayName:"アンビエント",description:"輪郭をぼかした音色で、深い没入感と余韻を演出。",melody:"Lead 6 (voice)",submelody:"Music Box",bass:"Synth Bass 1",chord:"Pad 7 (halo)"},retro_game:{displayName:"8-bit レトロ",description:"矩形波を想起させる、初期ゲーム機のような懐かしい響き。",melody:"Lead 1 (square)",submelody:"Lead 2 (sawtooth)",bass:"Synth Bass 1",chord:"Clavinet"}};function eb(e){let t=new DataView(e);if(t.byteLength<8||0x4b4f4500!==t.getUint32(0,!1))throw Error("Not a .koe file (bad magic)");return{jsonLength:t.getUint32(4,!0)}}var eF=class{constructor(e,t){this.blob=e,this.base=t}blob;base;readBytes(e,t){let a=this.base+e;return this.blob.slice(a,a+t).arrayBuffer()}},eC=class{constructor(e,t){this.url=e,this.base=t}url;base;async readBytes(e,t){let a=this.base+e;return eA(this.url,a,t)}};async function eA(e,t,a){let o=await fetch(e,{headers:{Range:`bytes=${t}-${t+a-1}`},credentials:"omit"});if(206!==o.status)throw Error(`.koe fetch failed: expected 206 Partial Content, got ${o.status}`);return ex(o,a)}async function ex(e,t){let a=e.body?.getReader();if(!a){let a=await e.arrayBuffer();if(a.byteLength>t)throw Error(`.koe fetch failed: response exceeds requested ${t} bytes`);return a}let o=new Uint8Array(t),r=0;for(;;){let{done:e,value:u}=await a.read();if(e)break;if(r+u.byteLength>t)throw await a.cancel(),Error(`.koe fetch failed: response exceeds requested ${t} bytes`);o.set(u,r),r+=u.byteLength}return r===t?o.buffer:o.buffer.slice(0,r)}function eE(e){if(!Number.isInteger(e)||e<0||e>0x3200000)throw Error(`manifest JSON length out of bounds: ${e}`)}function eB(e){let t=JSON.parse(new TextDecoder().decode(e));if(!t||"object"!=typeof t||"object"!=typeof t.phonemes||null===t.phonemes)throw Error("invalid manifest: missing phonemes table");return t}var ew=class e{constructor(e,t){this.manifest=e,this.source=t}manifest;source;static async load(t){try{if("string"==typeof t){if(/^blob:/i.test(t)){let a=await fetch(t);if(!a.ok)throw Error(`blob: URL fetch failed: ${a.status}`);return await e.fromBlob(await a.blob())}if(!/^https?:/i.test(t))throw Error(`unsupported URL protocol: ${t}`);let a=await eA(t,0,8),{jsonLength:o}=eb(a);eE(o);let r=await eA(t,8,o),u=eB(r);return new e(u,new eC(t,8+o))}return await e.fromBlob(t)}catch(e){throw Error(`Failed to load .koe voice bank: ${e instanceof Error?e.message:String(e)}`)}}static async fromBlob(t){let{jsonLength:a}=eb(await t.slice(0,8).arrayBuffer());return eE(a),new e(eB(await t.slice(8,8+a).arrayBuffer()),new eF(t,8+a))}has(e){return Object.hasOwn(this.manifest.phonemes,e)}async readPcmBytes(e){if(!Object.hasOwn(this.manifest.phonemes,e))return null;let t=this.manifest.phonemes[e];if(!Number.isInteger(t.offset)||!Number.isInteger(t.length)||t.offset<0||t.length<0||t.length>5242880)throw Error(`manifest entry out of bounds for phoneme: ${e}`);return this.source.readBytes(t.offset,2*t.length)}async getPcm(e){let t=await this.readPcmBytes(e);if(!t)return null;let a=new Int16Array(t,0,Math.floor(t.byteLength/2)),o=new Float64Array(a.length);for(let e=0;e<a.length;e++)o[e]=a[e]/32768;return o}},ek=new Map,eS=class e{constructor(e){this.wasm=e}wasm;sampleRate=48e3;static async load(t){return new e(await function(e){let t,a=ek.get(e);if(a)return a;let o=e.slice(0,e.lastIndexOf("/")+1),r=()=>{let e=globalThis.WorldlineModule;if(!e)throw Error("worldline: WorldlineModule global was not defined by the script");return e({locateFile:e=>o+e})};if("u">typeof document)t=new Promise((t,a)=>{if(document.querySelector(`script[data-koe-worldline="${e}"]`))return void t();let o=document.createElement("script");o.src=e,o.dataset.koeWorldline=e,o.onload=()=>t(),o.onerror=()=>a(Error(`worldline: failed to load ${e}`)),document.head.appendChild(o)}).then(r);else{if("function"!=typeof globalThis.importScripts)return Promise.reject(Error("Worldline.load requires a DOM or a classic Web Worker (importScripts) to load worldline.js"));t=Promise.resolve().then(()=>(globalThis.importScripts(e),r()))}return ek.set(e,t),t}(t.scriptUrl))}renderNote(e){let{pcm:t,pitch:a,durationMs:o,preMs:r,consonantMs:u,tempo:n=120}=e;if(!t||t.length<4096)return null;let l=this.wasm,i=Math.round(69+12*Math.log2(a/440)),s=r+o,d=l._PhraseSynthNew();if(!d)return null;let c=l._malloc(120);if(!c)return l._PhraseSynthDelete(d),null;let m=l._malloc(8*t.length);if(!m)return l._free(c),l._PhraseSynthDelete(d),null;l.HEAPF64.set(t,m>>3);let p=(e,t,a)=>l.setValue(c+e,t,a);p(0,48e3,"i32"),p(4,t.length,"i32"),p(8,m,"*"),p(12,0,"i32"),p(16,0,"*"),p(20,i,"i32"),p(24,100,"double"),p(32,0,"double"),p(40,s,"double"),p(48,u,"double"),p(56,20,"double"),p(64,100,"double"),p(72,0,"double"),p(80,n,"double"),p(88,0,"i32"),p(92,0,"*"),p(96,0,"i32"),p(100,0,"i32"),p(104,100,"i32"),p(108,0,"i32"),p(112,0,"i32"),p(116,100,"i32"),l._PhraseSynthAddRequest(d,c,0,0,s,0,0,0),l._free(m),l._free(c);let h=Math.ceil((0+s+20)/10)+4,f=new Float64Array(h).fill(a),g=new Float64Array(h).fill(.5),v=new Float64Array(h).fill(.5),y=new Float64Array(h).fill(.5),b=new Float64Array(h).fill(1),F=l._malloc(8*h),C=l._malloc(8*h),A=l._malloc(8*h),x=l._malloc(8*h),E=l._malloc(8*h);if(!F||!C||!A||!x||!E)return F&&l._free(F),C&&l._free(C),A&&l._free(A),x&&l._free(x),E&&l._free(E),l._PhraseSynthDelete(d),null;l.HEAPF64.set(f,F>>3),l.HEAPF64.set(g,C>>3),l.HEAPF64.set(v,A>>3),l.HEAPF64.set(y,x>>3),l.HEAPF64.set(b,E>>3),l._PhraseSynthSetCurves(d,F,C,A,x,E,h,10),l._free(F),l._free(C),l._free(A),l._free(x),l._free(E);let B=l._malloc(4);if(!B)return l._PhraseSynthDelete(d),null;let w=l._PhraseSynthSynth(d,B,0),k=l.getValue(B,"*"),S=w>0&&k?new Float32Array(l.HEAPF32.buffer,k,w).slice():null;return k&&l._free(k),l._free(B),l._PhraseSynthDelete(d),S}},eM="#end;",eD={あ:["","a"],い:["","i"],う:["","u"],え:["","e"],お:["","o"],か:["k","a"],き:["k","i"],く:["k","u"],け:["k","e"],こ:["k","o"],さ:["s","a"],し:["sh","i"],す:["s","u"],せ:["s","e"],そ:["s","o"],た:["t","a"],ち:["ch","i"],つ:["ts","u"],て:["t","e"],と:["t","o"],な:["n","a"],に:["n","i"],ぬ:["n","u"],ね:["n","e"],の:["n","o"],は:["h","a"],ひ:["h","i"],ふ:["f","u"],へ:["h","e"],ほ:["h","o"],ま:["m","a"],み:["m","i"],む:["m","u"],め:["m","e"],も:["m","o"],や:["y","a"],ゆ:["y","u"],よ:["y","o"],ら:["r","a"],り:["r","i"],る:["r","u"],れ:["r","e"],ろ:["r","o"],わ:["w","a"],を:["w","o"],が:["g","a"],ぎ:["g","i"],ぐ:["g","u"],げ:["g","e"],ご:["g","o"],ざ:["z","a"],じ:["j","i"],ず:["z","u"],ぜ:["z","e"],ぞ:["z","o"],だ:["d","a"],ぢ:["j","i"],づ:["z","u"],で:["d","e"],ど:["d","o"],ば:["b","a"],び:["b","i"],ぶ:["b","u"],べ:["b","e"],ぼ:["b","o"],ぱ:["p","a"],ぴ:["p","i"],ぷ:["p","u"],ぺ:["p","e"],ぽ:["p","o"],ん:["N","N"]},eL={a:"あ",i:"い",u:"う",e:"え",o:"お"},eN=e=>/[ぁゃ]/.test(e)?"a":/[ぃ]/.test(e)?"i":/[ぅゅ]/.test(e)?"u":/[ぇ]/.test(e)?"e":/[ぉょ]/.test(e)?"o":/[あかさたなはまやらわがざだばぱ]/.test(e)?"a":/[いきしちにひみりぎじぢびぴ]/.test(e)?"i":/[うくすつぬふむゆるぐずづぶぷ]/.test(e)?"u":/[えけせてねへめれげぜでべぺ]/.test(e)?"e":/[おこそとのほもよろごぞどぼぽ]/.test(e)?"o":"",eT=e=>{if("ー"===e)return{kana:e,consonant:"-",vowel:"-"};if("っ"===e)return{kana:e,consonant:"Q",vowel:""};let t=e[0],a=eD[t],o=a?a[0]:"",r=a?a[1]:eN(t);if(2===e.length&&"っ"!==e[1]){let t=eN(e[1]);t&&(r=t)}return{kana:e,consonant:o,vowel:r}},eP=e=>(e=>{let t=[],a="";for(let o of e){if("-"===o.consonant){if(!a)continue;t.push({kana:eL[a]??o.kana,consonant:"",vowel:a});continue}o.vowel&&"N"!==o.vowel&&(a=o.vowel),t.push(o)}return t})((e=>{let t=[];for(let a of e)t.length>0&&"ぁぃぅぇぉゃゅょっ".includes(a)?t[t.length-1]+=a:t.push(a);return t})(e.normalize("NFKC").replace(/[ァ-ヶ]/g,e=>String.fromCharCode(e.charCodeAt(0)-96)).replace(/[^ぁ-ゖー]/g,"")).map(eT)),eI=e=>{let t=[],a=[];for(let o of e){let e=eP(o);0!==e.length&&(t.length>0&&a.push(t.length),t.push(...e))}return{syllables:t,lineBreaks:a}},eO=/^@@(\d+)\s*(.*)$/,ez=e=>!/^[@#]/.test(e),eU=e=>e.split(/[;\n\r]+/).map(e=>e.trim()).filter(e=>e.length>0),eR=(e,t,a)=>Math.min(a,Math.max(t,e)),ej=e=>e<=0?0:e<=100?e/100:10**((e-100)*.08/20),eV=/^@@([a-zA-Z_][a-zA-Z0-9_]*)\s+(\S+)\s+(\S+)\s*$/,e$=e=>{if(e.length>2048)return!1;try{let t=new URL(e);return"http:"===t.protocol||"https:"===t.protocol}catch{return!1}},eH=e=>{let t=new Map;for(let a of eU(e)){let e=a.match(eV);if(!e)continue;let o=e[1].toLowerCase(),r=e[2],u=e[3];if(!e$(u)){console.warn(`[dtm] \u30AB\u30B9\u30BF\u30E0\u30DC\u30FC\u30AB\u30EB "${o}": koe URL \u304C\u4E0D\u6B63\u307E\u305F\u306F\u9577\u3059\u304E\u308B\u305F\u3081\u30B9\u30AD\u30C3\u30D7\u3057\u307E\u3059`,u.slice(0,80));continue}let n=e$(r)?r:"";t.set(o,{key:o,iconUrl:n,url:u})}return[...t.values()]},eG=e=>Math.max(-1,Math.min(1,(e-64)/64)),eq={a:[800,1200],i:[300,2300],u:[350,800],e:[500,1900],o:[500,900],N:[250,1e3]},eW=e=>440*2**((e-69)/12),eQ="https://pub-12482a6b5cbc4c9e906b2e1904cabae5.r2.dev",eK={tsukuyomi:"つくよみちゃん.koe",rino:"春音リノver0.3.koe",roze:"束音ロゼver0.５1(多音階).koe",ruko_male:"欲音ルコ♂連続音Ver.1.03.koe",ruko_female:"欲音ルコ♀歌連続音普1.00.koe",teto:"重音テト単独音.koe",shiyo:"革命シヨ.koe",rei:"足立レイver3.5.0.koe",mgroid:"MGRoid_原音設定済み.koe",motroid:"MOTRoid完全版V2.koe"},eY={tsukuyomi:"つくよみちゃん",rino:"春音リノ",roze:"束音ロゼ",ruko_male:"欲音ルコ♂",ruko_female:"欲音ルコ♀",teto:"重音テト",shiyo:"革命シヨ",rei:"足立レイ",mgroid:"MGRoid",motroid:"MOTRoid"},e_={klatt:"puyuyu",tsukuyomi:"tsukuyomi",rino:"rino",roze:"roze",ruko_male:"ruko",ruko_female:"ruko",teto:"teto",shiyo:"shiyo",rei:"rei",mgroid:"MGRoid",motroid:"MOTRoid"},eZ={tsukuyomi:"https://tyc.rei-yumesaki.net/material/utau/terms/",rino:"https://hatenakun1.github.io/halunelino/",roze:"https://tabaneroze.ninja-web.net/terms-of-use.html",ruko_male:"https://long-sleeper.net/index.php?id=22",ruko_female:"https://long-sleeper.net/index.php?id=22",teto:"https://kasaneteto.jp/guidelines/voice.html",shiyo:"https://kakumeisiyo.my.canva.site/dagkuyjwycs",rei:"https://mechanicalgirl.jp/guidelines/",mgroid:"https://x.com/nisusansu/status/1048825378188353536",motroid:"https://www.nicovideo.jp/watch/sm40031282"},eX=(e,t=eQ)=>`${t}/${encodeURIComponent(e)}`,eJ="https://onjmin.github.io/koe/demo/world/worldline.js",e0=/_([A-G][#b]?-?\d+)$/,e3={c:0,d:2,e:4,f:5,g:7,a:9,b:11},e1=e=>{let t=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(e);if(!t)return null;let a=e3[t[1].toLowerCase()];return"#"===t[2]?a++:"b"===t[2]&&a--,(Number.parseInt(t[3],10)+1)*12+a},e2=e=>{let t=new Map;for(let a of e){let e=e0.exec(a);if(!e||t.has(e[1]))continue;let o=e1(e[1]);null!=o&&t.set(e[1],o)}return[...t].map(([e,t])=>({token:e,midi:t}))},e5=(e,t,a,o,r)=>{let u=a.kana,n="N"===a.consonant?"n":a.consonant,l="N"===a.vowel?"":a.vowel,i=`${n}${l}`||l,s=o||"-",d=[`${s} ${u}`,`${s} ${i}`,u,i],c=eL[a.vowel];c&&d.push(`${s} ${c}`,c,a.vowel),"N"===a.vowel&&d.push("ん","n","N",`${s} \u3093`);let m=new Set,p=t=>{for(let a of t.includes(" ")?[t,t.replace(/ /g,"　"),t.replace(/ /g,"")]:[t])if(!m.has(a)&&(m.add(a),e(a)))return a;return null};if(t.length)for(let{token:e}of t.slice().sort((e,t)=>Math.abs(e.midi-r)-Math.abs(t.midi-r)))for(let t of d){let a=p(`${t}_${e}`);if(a)return a}for(let e of d){let t=p(e);if(t)return t}return null},e6=async e=>{let t=await ew.load(e.koe),a=e.lightweight?null:await eS.load({scriptUrl:e.worldlineScriptUrl??eJ}).catch(()=>null),o=new Map,r=async(e,r,u)=>{var n;let l,i=await (!(l=o.get(e))&&(l=t.getPcm(e),o.set(e,l)),l);if(!i||0===i.length)return null;let s=t.manifest.phonemes[e],d={preMs:((n=s).pre||0)/48e3*1e3,consonantMs:(n.consonant||0)/48e3*1e3},c=eW(r);if(a){let e=a.renderNote({pcm:i,pitch:c,durationMs:u,...d});if(e)return{pcm:e,preSec:d.preMs/1e3,rate:1}}let m=s.pitch>0?c/s.pitch:1;return{pcm:new Float32Array(i),preSec:s.pre/48e3/m,rate:m}};return{hasAlias:e=>t.has(e),pitchTokens:e2(Object.keys(t.manifest.phonemes)),renderAlias:r,dispose:()=>{}}},e4=async e=>{if(new URL(e,location.href).origin===location.origin)return new Worker(e);let t=await fetch(e).then(e=>e.text());return new Worker(URL.createObjectURL(new Blob([t],{type:"text/javascript"})))},e8=async(e,t)=>{let a=await e4(e),o=new Set,r=new Map,u=0,n=null,l=null;return a.onmessage=e=>{let t=e.data;if("ready"===t.type){for(let e of t.aliases)o.add(e);n?.()}else if("error"===t.type)l?.(Error(t.message));else if("rendered"===t.type){let e=r.get(t.id);e&&(r.delete(t.id),e(t))}},a.onerror=e=>{l?.(Error(e.message||e.error||`Event: ${e.type}`))},await new Promise((e,o)=>{n=e,l=o,a.postMessage({type:"init",koe:t.koe,worldlineScriptUrl:t.worldlineScriptUrl??eJ,lightweight:!!t.lightweight})}),n=null,l=null,{hasAlias:e=>o.has(e),pitchTokens:e2(o),renderAlias:(e,t,o)=>new Promise(n=>{let l=++u;r.set(l,e=>n(e.pcm?{pcm:e.pcm,preSec:e.preSec??0,rate:e.rate??1}:null)),a.postMessage({type:"render",id:l,alias:e,pitch:t,durationMs:o})}),dispose:()=>a.terminate()}},e9=async(e,t,a)=>{let o;if(a.voiceWorkerUrl)try{o=await e8(a.voiceWorkerUrl,a)}catch(e){console.warn("[dtm] Failed to spawn voice worker. Falling back to local backend.",e),o=await e6(a)}else o=await e6(a);let r=new Map,u=new Map,n=new Set,l="",i=(e,t,a)=>`${e}|${t}|${10*Math.round(a/10)}`,s=(t,a,n)=>{let l=i(t,a,n),s=r.get(l);if(void 0!==s)return Promise.resolve(s);let d=u.get(l);if(d)return d;let c=(async()=>{let i=await o.renderAlias(t,a,n),s=null;if(i){let t=e.createBuffer(1,i.pcm.length,48e3);t.copyToChannel(i.pcm,0),s={audio:t,preSec:i.preSec,rate:i.rate}}return r.set(l,s),u.delete(l),s})();return u.set(l,c),c},d=(a,o,r,u)=>{let l=t,i=null;"function"==typeof e.createStereoPanner&&((i=e.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,u)),i.connect(t),l=i);let s=e.createBufferSource();s.buffer=a.audio,s.playbackRate.value=a.rate;let d=Math.min(a.preSec,.09),c=a.preSec-d,m=Math.max(e.currentTime+.001,o-d),p=m+(a.audio.duration/a.rate-c),h=e.createGain();h.gain.setValueAtTime(1e-4,m),h.gain.exponentialRampToValueAtTime(r,m+.01);let f=Math.max(m+.01,p-.04);h.gain.setValueAtTime(r,f),h.gain.exponentialRampToValueAtTime(1e-4,p),s.connect(h).connect(l),s.start(m,c),s.stop(p+.02),n.add(s),s.onended=()=>{n.delete(s),s.disconnect(),h.disconnect(),i?.disconnect()}},c=(t,a)=>{if("Q"===t.consonant||""===t.vowel)return;let r=e5(o.hasAlias,o.pitchTokens,t,l,a.pitch);if(t.vowel&&"N"!==t.vowel&&(l=t.vowel),!r)return;let u=e.currentTime+a.when,n=Math.max(1e-4,a.volume),i=a.pan??0,c=Math.max(60,1e3*a.duration);s(r,a.pitch,c).then(e=>{e&&d(e,u,n,i)})};return c.renderToCache=async(e,t,a,r)=>{if("Q"===e.consonant||""===e.vowel)return null;let u=e5(o.hasAlias,o.pitchTokens,e,t,a);if(!u)return null;let n=Math.max(60,r);return await s(u,a,n)?i(u,a,n):null},c.scheduleCached=(e,t,a,o)=>{let u=r.get(e);u&&d(u,t,a,o)},c.stopAll=()=>{for(let e of n){try{e.stop()}catch{}e.disconnect()}n.clear()},c.reset=()=>{l=""},c},e7=3,te="klatt",tt=(e,t,a={})=>{let o,r,u={};for(let[e,t]of Object.entries(eK))u[e]=eX(t);for(let[e,t]of Object.entries(a.voicebanks??{}))u[e.toLowerCase()]=t;let n=0,l=new Map([[te,(o=new Set,(r=(a,r)=>{let u=e.currentTime+r.when,n=Math.max(1e-4,r.volume);if(""===a.vowel||"Q"===a.consonant)return;let[l,i]=eq[a.vowel]??eq.a,s=u+Math.max(.04,r.duration),d=null,c=t;"function"==typeof e.createStereoPanner&&((d=e.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,r.pan??0)),d.connect(t),c=d);let m=e.createOscillator();m.type="sawtooth",m.frequency.value=eW(r.pitch);let p=(t,a,o)=>{let r=e.createBiquadFilter();r.type="bandpass",r.frequency.value=t,r.Q.value=a;let u=e.createGain();return u.gain.value=o,m.connect(r).connect(u),u},h=e.createGain();if(h.gain.setValueAtTime(1e-4,u),h.gain.exponentialRampToValueAtTime(n,u+.02),h.gain.setValueAtTime(n,s),h.gain.exponentialRampToValueAtTime(1e-4,s+.06),p(l,6,4).connect(h),p(i,9,2.8).connect(h),h.connect(c),new Set(["s","sh","ch","ts","h","f"]).has(a.consonant)){let t=Math.max(1,Math.floor(.05*e.sampleRate)),r=e.createBuffer(1,t,e.sampleRate),l=r.getChannelData(0);for(let e=0;e<t;e++)l[e]=2*Math.random()-1;let i=e.createBufferSource();i.buffer=r;let s=e.createBiquadFilter();s.type="highpass",s.frequency.value="sh"===a.consonant?3e3:4500;let d=e.createGain();d.gain.setValueAtTime(.5*n,u),d.gain.exponentialRampToValueAtTime(1e-4,u+.05),i.connect(s).connect(d).connect(c),i.start(u),i.stop(u+.05),o.add(i),i.onended=()=>{o.delete(i),i.disconnect(),s.disconnect(),d.disconnect()}}m.start(u),m.stop(s+.06+.02),o.add(m),m.onended=()=>{o.delete(m),m.disconnect(),d?.disconnect()}}).stopAll=()=>{for(let e of o){try{e.stop()}catch{}e.disconnect()}o.clear()},r)]]),i=new Map,s=(e,t)=>{let a="";for(let o of e.notes){let e=o.syllable;"Q"!==e.consonant&&""!==e.vowel&&(t(o,a),e.vowel&&"N"!==e.vowel&&(a=e.vowel))}},d=()=>{for(let e of(n++,l.values()))e.stopAll?.()};return{loadModels:async o=>{let r=new Set;for(let e of o)e&&r.add(e.toLowerCase());await Promise.all([...r].map(o=>(o=>{let r=o.toLowerCase(),n=l.get(r);if(n)return Promise.resolve(n);let s=i.get(r);if(s)return s;let d=u[r];if(!d)return Promise.resolve(null);let c=(async()=>e9(e,t,{koe:d,worldlineScriptUrl:a.worldlineScriptUrl,lightweight:a.lightweight,voiceWorkerUrl:a.voiceWorkerUrl}))().then(e=>(l.set(r,e),e)).catch(e=>(console.warn(`[dtm] koe\u97F3\u6E90 "${r}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F`,e),null));return i.set(r,c),c})(o)))},registerVoicebanks:e=>{for(let[t,a]of Object.entries(e)){let e=t.toLowerCase();e!==te&&u[e]!==a&&(u[e]=a,l.delete(e),i.delete(e))}},warm:async(e,t=e7,a)=>{let o=[];for(let a of e){let e=l.get(a.model.toLowerCase());if(!e?.renderToCache)continue;let r=0;s(a,(a,u)=>{r>=t&&a.startSec>=1.5||(r++,o.push({model:e,note:a,prevVowel:u}))})}let r=o.length;if(0===r)return void a?.(0,0);let u=0;a?.(u,r);let n=o.map(async e=>{await (e.model.renderToCache?.(e.note.syllable,e.prevVowel,e.note.pitch,1e3*e.note.durationSec)??Promise.resolve(null)),u++,a?.(u,r)});await Promise.all(n)},startStream:(t,a,o)=>{let r=++n,u=async t=>{let u=l.get(t.model.toLowerCase());if(!u)return;let i=[];s(t,(e,t)=>{i.push({note:e,prevVowel:t})});let d=Math.max(1e-4,t.volume);for(let{note:l,prevVowel:s}of i){if(r!==n)return;for(;l.startSec-(e.currentTime-a)>1.5;)if(await new Promise(e=>setTimeout(e,100)),r!==n)return;if(o?.isAudible&&!o.isAudible(t))continue;let i=a+l.startSec;if(u.renderToCache&&u.scheduleCached){let a=u.renderToCache,c=u.scheduleCached;(async()=>{let u=await a(l.syllable,s,l.pitch,1e3*l.durationSec);if(r===n&&u){let a=e.currentTime-i;a<.05?c(u,i,d,t.pan):(console.warn(`[dtm] Synthesizer late skip: ${l.syllable.kana} at ${l.startSec}s (delayed by ${a.toFixed(3)}s)`),o?.onLateSkip?.(l,a))}})()}else{let a=i-e.currentTime;u(l.syllable,{trackId:"",pitch:l.pitch,velocity:100,volume:d,when:a,duration:l.durationSec,pan:t.pan}),await new Promise(e=>setTimeout(e,0))}}};for(let e of t)u(e)},stopStream:d,reset:()=>{for(let e of(d(),l.values()))e.reset?.()}}},ta=[[0,2,4,5,7,9,11],[0,2,3,5,7,8,10],[0,2,4,7,9]],to=e=>{let{tracks:t}=e,a=[];for(let e=0;e<t.length;e++){let o=[],r=0;for(let a of t[e])if(r+=a.delta,a.noteOn&&a.noteOn.velocity>0)o.push({pitch:a.noteOn.noteNumber,channel:a.channel??0});else if(a.noteOff||a.noteOn&&0===a.noteOn.velocity){let e=a.noteOff||a.noteOn;if(e){for(let t=o.length-1;t>=0;t--)if(o[t].pitch===e.noteNumber&&void 0===o[t].end){o[t].end=r;break}}}let u=o.filter(e=>void 0!==e.end),n=u.filter(e=>9!==e.channel);u.length>0&&0===n.length||a.push({index:e,name:`Ch${e+1}`,noteCount:n.length,selected:n.length>0})}return a},tr=e=>{let{tracks:t}=e;for(let e of t)for(let t of e)if(t.setTempo&&"number"==typeof t.setTempo.microsecondsPerQuarter)return 6e7/t.setTempo.microsecondsPerQuarter;return 120},tu=e=>[(65280&e)>>8,255&e],tn=e=>[(0xff0000&e)>>16,...tu(e)],tl=e=>[(0xff000000&e)>>24,...tn(e)],ti=e=>{let t=[127&e],a=e>>7;for(;a>0;)t.push(127&a|128),a>>=7;return t.reverse()},ts=(e,t)=>{e.push(77,84,114,107);let a=[];t(a),a.push(...ti(0)),a.push(255,47,0),e.push(...tl(a.length)),e.push(...a)},td=class{#e;constructor(){this.#e={value:null,prev:null,next:null}}add(e){let t={value:e,prev:this.#e,next:null};this.#e.next=t,this.#e=t}undo(){let{prev:e}=this.#e;return null===e||null===e.value?null:(this.#e=e,this.#e.value)}redo(){let{next:e}=this.#e;return null===e||null===e.value?null:(this.#e=e,this.#e.value)}canUndo(){return this.#e.prev?.value!==null}canRedo(){let{next:e}=this.#e;return null!==e&&null!==e.value}},tc=0,tm=0,tp=()=>({x:tc,y:tm}),th=new Set([1,3,6,8,10]),tf=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],tg=()=>{c.clearRect(0,0,i.width,i.height);let{keyHeight:e,keyCount:t,pitchRangeStart:a}=p,o=Math.floor(tm/e)*e,r=tm+i.height,u="#ccc8b4";for(let n=o;n<r;n+=e){let o=t-1-n/e+a,r=o%12,l=th.has(r),i=4==Math.floor(o/12)-1,s=n-tm,d=Math.floor(37.2);if(l?(c.fillStyle=i?"#d8d4be":u,c.fillRect(0,s,60,e),c.fillStyle=i?"#1a1408":"#111111",c.fillRect(0,s,d,e),c.strokeStyle="#383838",c.lineWidth=1,c.beginPath(),c.moveTo(d,s),c.lineTo(d,s+e),c.stroke()):(c.fillStyle=i?"#dedad0":u,c.fillRect(0,s,60,e),(5===r||0===r)&&(c.strokeStyle="#807a6a",c.lineWidth=1,c.beginPath(),c.moveTo(0,s+e-.5),c.lineTo(60,s+e-.5),c.stroke())),0===r){let t=Math.floor(o/12)-1;c.fillStyle="#555040",c.font="10px 'k8x12',monospace",c.textAlign="right",c.textBaseline="bottom",c.fillText(`${tf[r]}${t}`,56,s+e-2)}}c.beginPath(),c.strokeStyle="#29adff",c.lineWidth=2,c.moveTo(60,0),c.lineTo(60,i.height),c.stroke()},tv=()=>{d.clearRect(0,0,l.width,l.height);let{stepWidth:e,stepsPerBar:t}=p;d.save(),d.translate(-tc,0),d.fillStyle="#0a0f1f",d.fillRect(tc,0,l.width,20),d.strokeStyle="#3d405b",d.lineWidth=1,d.font="11px 'k8x12',monospace",d.fillStyle="#83769c";let a=Math.floor(tc/(t*e)),o=Math.ceil((tc+l.width)/(t*e));for(let r=a;r<=o+1;r++){let a=r*t*e;d.beginPath(),d.moveTo(a,0),d.lineTo(a,20),d.stroke(),r>=0&&(d.textAlign="left",d.textBaseline="middle",d.fillText(`${r+1}`,a+5,10))}d.restore()},ty=(e,t=[59,130,246,1])=>{let{keyHeight:a,stepWidth:o,keyCount:r,pitchRangeStart:u}=p;for(let n of e){let e=n.startStep*o,l=(r-1-(n.pitch-u))*a,i=n.durationSteps*o,s=e-tc,d=l-tm,c=void 0!==n.velocity?.5+n.velocity/127*.5:1,[p,h,f,g]=t,v=g*c;m.fillStyle=`rgba(${p},${h},${f},${v})`,m.fillRect(s+1,d+1,i-2,a-2)}},tb=e=>{let[t,a]=(e=>{let{clientX:t,clientY:a}=e,o=s.getBoundingClientRect();return[Math.floor(t-o.left),Math.floor(a-o.top),e.buttons]})(e),{keyCount:o,pitchRangeStart:r,keyHeight:u,stepWidth:n}=p;return{step:Math.floor((t+tc)/n),pitch:o-1-Math.floor((a+tm)/u)+r,x:t,y:a}},tF=(e,t)=>{tc=e,tm=t,tg(),tv()},tC=["c","c+","d","d+","e","f","f+","g","g+","a","a+","b"],tA=class e{notes=[];nextNoteId=0;handlers;volume=80;tempo=120;history=new td;isUndoRedo=!1;isBatchOperation=!1;lastHistorySnapshot="[]";lastUndoTime=0;static UNDO_DEBOUNCE_MS=100;toolMode="pen";constructor(e,t=80){this.handlers=e,this.volume=t,this.lastHistorySnapshot=JSON.stringify(this.notes),this.history.add([]),this.generateAndNotify()}beginBatch(){this.isBatchOperation=!0}endBatch(){this.isBatchOperation=!1,this.saveHistory()}saveHistory(){if(this.isUndoRedo||this.isBatchOperation)return;let e=JSON.stringify(this.notes);e!==this.lastHistorySnapshot&&(this.lastHistorySnapshot=e,this.history.add(JSON.parse(e)))}restoreHistory(e){return null!==e&&(this.isUndoRedo=!0,this.notes=JSON.parse(JSON.stringify(e)),this.nextNoteId=this.notes.length>0?Math.max(...this.notes.map(e=>e.id))+1:0,this.lastHistorySnapshot=JSON.stringify(this.notes),this.generateAndNotify(),this.isUndoRedo=!1,!0)}undo(){let t=Date.now();return!(t-this.lastUndoTime<e.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=t,this.restoreHistory(this.history.undo()))}redo(){let t=Date.now();return!(t-this.lastUndoTime<e.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=t,this.restoreHistory(this.history.redo()))}canUndo(){return this.history.canUndo()}canRedo(){return this.history.canRedo()}setToolMode(e){this.toolMode=e}getToolMode(){return this.toolMode}resetHistory(){this.history=new td,this.history.add([]),this.lastHistorySnapshot=JSON.stringify(this.notes)}addHistoryOnce(){this.lastHistorySnapshot="[]",this.saveHistory()}clearNotesWithoutHistory(){this.notes=[],this.nextNoteId=0,this.lastHistorySnapshot="[]"}setLoadMode(e){this.isUndoRedo=e}addNote(e,t,a){if(-1===this.notes.findIndex(a=>a.startStep===e&&a.pitch===t)){let o={id:this.nextNoteId++,startStep:e,durationSteps:a.noteLengthSteps,pitch:t,velocity:a.velocity??100};this.notes.push(o)}this.notes.sort((e,t)=>e.startStep-t.startStep),this.saveHistory(),this.generateAndNotify()}deleteNoteById(e){let t=this.notes.findIndex(t=>t.id===e);-1!==t&&(this.notes.splice(t,1),this.saveHistory(),this.generateAndNotify())}getMaxStep(){return 0===this.notes.length?0:12*Math.ceil(Math.max(...this.notes.map(e=>e.startStep+e.durationSteps))/12)}moveNote(e,t,a){let o=this.notes.find(t=>t.id===e);if(!o)return;let r=this.getMaxStep()+p.stepsPerBar,u=p.pitchRangeStart,n=u+p.keyCount-1,l=Math.min(Math.max(a,u),n),i=Math.min(Math.max(t,0),r-o.durationSteps);o.startStep=i,o.pitch=l,this.notes.sort((e,t)=>e.startStep-t.startStep),this.generateAndNotify()}moveNoteEnd(e){this.saveHistory()}resizeNote(e,t){let a=this.notes.find(t=>t.id===e);a&&(a.durationSteps=Math.max(1,t),this.notes.sort((e,t)=>e.startStep-t.startStep),this.generateAndNotify())}resizeNoteEnd(e){this.saveHistory()}getNotes(){return this.notes}getMML(e){return this.generateMML(e)}setVolume(e){this.volume=e,this.generateAndNotify()}setTempo(e){this.tempo=e,this.generateAndNotify()}generateAndNotify(){this.handlers.onNotesChanged([...this.notes]);let e=this.generateMML();this.handlers.onMMLGenerated(e)}stepsToMMLDuration(e,t){let a=p.stepsPerBar,o="64",r=1/0;for(let u of[{dur:"1.",s:1.5*a},{dur:"1",s:a/1},{dur:"2.",s:a/2*1.5},{dur:"2",s:a/2},{dur:"4.",s:a/4*1.5},{dur:"4",s:a/4},{dur:"8.",s:a/8*1.5},{dur:"8",s:a/8},{dur:"12",s:a/12},{dur:"16.",s:a/16*1.5},{dur:"16",s:a/16},{dur:"24",s:a/24},{dur:"32",s:a/32},{dur:"64",s:a/64}]){if(u.s>t)continue;let a=Math.abs(e-u.s);a<r&&(r=a,o=u.dur)}return o}findBestFitDuration(e){let t=p;for(let a of[1,2,4,8,12,16,24,32,48,64]){let o=t.stepsPerBar/a;if(e>=o)return{dur:a,steps:o}}return{dur:64,steps:t.stepsPerBar/64}}getNoteWithOctave(e,t){let a=Math.floor(e/12)-1,o=tC[e%12];return -1===t||Math.abs(a-t)>=2?{text:`o${a}${o}`,currentOctave:a}:a===t?{text:o,currentOctave:a}:a===t+1?{text:`>${o}`,currentOctave:a}:a===t-1?{text:`<${o}`,currentOctave:a}:{text:`o${a}${o}`,currentOctave:a}}generateMML=e=>{let t=p,a=e??this.volume,o=`t${this.tempo} v${a}`,r=[],u=-1,n=0;if(0===this.notes.length)return o;let l=Math.max(...this.notes.map(e=>e.startStep+e.durationSteps)),i=new Map;for(let e of this.notes){let t=i.get(e.startStep)??[];t.push(e),i.set(e.startStep,t)}let s=Array.from(i.keys()).sort((e,t)=>e-t),d=t.stepsPerBar/64,c=e=>{for(;e-n>=d;){let t=e-n,{dur:a,steps:o}=this.findBestFitDuration(t);r.push(`r${a}`),n+=o}};for(let e=0;e<s.length;e++){let t=s[e],a=i.get(t);if(!a)continue;c(t);let o=(s[e+1]??l)-n;if(o<d)continue;let m=a[0].durationSteps,p=this.stepsToMMLDuration(m,o),h=this.getStepFromDottedMML(p);if(a.length>1){let e=a.map(e=>{let t=Math.floor(e.pitch/12)-1,a=tC[e.pitch%12];return`o${t}${a}`});r.push(`[${e.join("")}]${p}`)}else{let{text:e,currentOctave:t}=this.getNoteWithOctave(a[0].pitch,u);r.push(`${e}${p}`),u=t}n+=h}return c(l),`${o} ${r.join(" ")}`};getMMLFromNotes(e,t,a){let o=this.notes,r=this.tempo,u=this.volume;this.notes=[...e].sort((e,t)=>e.startStep-t.startStep),void 0!==t&&(this.tempo=t),void 0!==a&&(this.volume=a);let n=this.generateMML();return this.notes=o,this.tempo=r,this.volume=u,n}getStepFromDottedMML(e){let t=p.stepsPerBar,a=e.endsWith("."),o=t/parseInt(a?e.slice(0,-1):e,10);return a?1.5*o:o}},tx=`
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
`,tE={c:0,d:2,e:4,f:5,g:7,a:9,b:11},tB=(e,t,a)=>Math.min(a,Math.max(t,e)),tw=/#(inst|drum|volume|drumvolume|mode)=([\w-]+)/gi,tk=/#t(\d+)inst=([^#;\r\n]+)/gi,tS=e=>{let t={};for(let a of e.matchAll(tw)){let e=a[1].toLowerCase();if("inst"===e)t.instrument=a[2];else if("drum"===e)t.drum=a[2];else if("volume"===e){let e=Number.parseInt(a[2],10);Number.isNaN(e)||(t.volume=e)}else if("drumvolume"===e){let e=Number.parseInt(a[2],10);Number.isNaN(e)||(t.drumVolume=e)}else"mode"===e&&("simple"===a[2]||"advanced"===a[2])&&(t.mode=a[2])}for(let a of e.matchAll(tk)){let e=Number.parseInt(a[1],10),o=a[2].trim();!Number.isNaN(e)&&o&&(t.trackInstruments??={},t.trackInstruments[e]=o)}return t},tM=(e,t="")=>{let a=[];if(e.instrument&&a.push(`#inst=${e.instrument}`),e.drum&&a.push(`#drum=${e.drum}`),void 0!==e.volume&&a.push(`#volume=${e.volume}`),void 0!==e.drumVolume&&a.push(`#drumvolume=${e.drumVolume}`),e.mode&&a.push(`#mode=${e.mode}`),e.trackInstruments)for(let[t,o]of Object.entries(e.trackInstruments))o&&a.push(`#t${t}inst=${o}`);return a.join(t)},tD=(e,t={})=>{let a=t.stepsPerBar??192,o=t.collectTokens??!1,r=t.collectLyrics??!1,u=t.clampTrackCount,n=[],l=new Map,i=null;if(!e)return{placements:n,bpm:i,tokenTracks:o?l:void 0,lyrics:r?new Map:void 0,mergedTrackCount:0,meta:{}};let s=e.split(/[\n\r]+/).map(e=>e.split(";").filter(e=>!eV.test(e.trim())).join(";")).join("\n").replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,""),d=tS(s),c=s.replace(tw,"").replace(tk,""),m=r?(e=>{let t=new Map,a=eU(e);for(let e=0;e<a.length;e++){let o=a[e].match(eO);if(!o)continue;let r=Number.parseInt(o[1],10),u=o[2].trim(),n=200,l=100,i=64,s=0,d=u.match(/^([a-z_][a-z0-9_]*?)(?=(?:[vqpo]-?\d)|[^a-z0-9_]|$)(?::(\d+))?/i),c="",m=[];for(d&&(c=d[1].toLowerCase(),d[2]&&(n=eR(Number.parseInt(d[2],10),0,400)),m.push(d[0]),u=u.substring(d[0].length).trim());;){let e=u.match(/^v(\d+)/i);if(e){n=eR(Number.parseInt(e[1],10),0,400),m.push(e[0]),u=u.substring(e[0].length).trim();continue}let t=u.match(/^q(\d+)/i);if(t){l=eR(Number.parseInt(t[1],10),0,100),m.push(t[0]),u=u.substring(t[0].length).trim();continue}let a=u.match(/^p(\d+)/i);if(a){i=eR(Number.parseInt(a[1],10),0,127),m.push(a[0]),u=u.substring(a[0].length).trim();continue}let o=u.match(/^o(-?\d+)/i);if(o){s=eR(Number.parseInt(o[1],10),-2,2),m.push(o[0]),u=u.substring(o[0].length).trim();continue}break}let p=[u];for(;e+1<a.length&&ez(a[e+1]);)p.push(a[++e]);let{syllables:h,lineBreaks:f}=eI(p);t.set(r,{trackId:r,model:c,volume:n,gate:l,pan:i,octave:s,syllables:h,metaText:m.join(" "),...f.length>0?{lineBreaks:f}:{}})}return t})(c):void 0,p=eM.replace(/;+$/,""),h=RegExp(`(?<![cdafgCDAFG])${p}\\b;?`,"gi"),f=(e=>{let t=eU(e),a=[];for(let e=0;e<t.length;e++){if(eO.test(t[e])){for(;e+1<t.length&&ez(t[e+1]);)e++;continue}a.push(t[e])}return a.join("\n")})(c).replace(h,"").replace(/[\n\r]+/g," ").trim().split(/(@\d+)/).filter(e=>e.trim().length>0),g=0,v=0,y=4,b=0,F=16,C=100,A=new Map,x=()=>{let e=A.get(g);e||(e=new Set,A.set(g,e)),e.add(v)};for(let e of f){let t=e.trim();if(t.startsWith("@")){let e=Number.parseInt(t.substring(1),10);v=e,void 0!==u&&e>=u&&(e=u-1),g=e,y=4,b=0,F=16,C=100;continue}let r=t.replace(/\s+/g,"").toLowerCase(),s=0,d=(e,t,a,u)=>{if(!o)return;let n=l.get(g);n||(n=[],l.set(g,n)),n.push({text:r.slice(u,s),startStep:t,durationSteps:a,type:e})},c=()=>{let e="";for(;s<r.length&&/\d/.test(r[s]);)e+=r[s],s++;let t=Math.round(a/(e?tB(Number.parseInt(e,10),1,64):F));for(;s<r.length&&"."===r[s];)t=Math.round(1.5*t),s++;return t};for(;s<r.length;){let e=r[s],t=s;if("o"===e){s++;let e="";for(;s<r.length&&/\d/.test(r[s]);)e+=r[s],s++;y=e?tB(Number.parseInt(e,10),0,8):4,d("octave",b,0,t)}else if(">"===e)y=Math.min(8,y+1),s++,d("shift",b,0,t);else if("<"===e)y=Math.max(0,y-1),s++,d("shift",b,0,t);else if("l"===e){s++;let e="";for(;s<r.length&&/\d/.test(r[s]);)e+=r[s],s++;F=tB(Number.parseInt(e,10)||16,1,64),d("length",b,0,t)}else if("r"===e){s++;let e=b,a=c();d("rest",e,a,t),b+=a}else if("t"===e||"v"===e||"q"===e||"p"===e){s++;let a="";for(;s<r.length&&/\d/.test(r[s]);)a+=r[s],s++;"t"===e&&a?null===i&&(i=tB(Number.parseInt(a,10),1,255)):"v"===e&&a&&(C=tB(Number.parseInt(a,10),0,127)),d("ctrl",b,0,t)}else if("["===e){s++;let e=[],a=y;for(;s<r.length&&"]"!==r[s];){let t=r[s];if(Object.hasOwn(tE,t)){let a=tE[t];++s<r.length&&("#"===r[s]||"+"===r[s])?(a++,s++):s<r.length&&"-"===r[s]&&(a--,s++),e.push((y+1)*12+a)}else if(">"===t)y=Math.min(8,y+1),s++;else if("<"===t)y=Math.max(0,y-1),s++;else if("o"===t){s++;let e="";for(;s<r.length&&/\d/.test(r[s]);)e+=r[s],s++;y=e?tB(Number.parseInt(e,10),0,8):4}else s++}s<r.length&&"]"===r[s]&&s++;let o=c();for(let t of(e.length>0&&x(),e))n.push({trackIndex:g,startStep:b,pitch:t,durationSteps:Math.max(1,o),velocity:C});d("chord",b,Math.max(1,o),t),b+=o,y=a}else if(Object.hasOwn(tE,e)){let a=tE[e];++s<r.length&&("#"===r[s]||"+"===r[s])?(a++,s++):s<r.length&&"-"===r[s]&&(a--,s++);let o=(y+1)*12+a,u=c();x(),n.push({trackIndex:g,startStep:b,pitch:o,durationSteps:Math.max(1,u),velocity:C}),d("note",b,Math.max(1,u),t),b+=u}else s++}}let E=0;for(let e of A.values())e.size>=2&&E++;return{placements:n,bpm:i,tokenTracks:o?l:void 0,lyrics:m,mergedTrackCount:E,meta:d}},tL=(e,t,a,o)=>"step"in e?e.step:"bar"in e?Math.max(0,e.bar-1)*a:"seconds"in e?e.seconds/o:0,tN=e=>{let t=[],a=0,o=0,r=null,u=null,n=!1,l=0,i=new Map,s=-1,d=-1,c=!1,m=0,p=0,h=0,f=0,g=0,v=0,y=0,b=0,F=()=>60/e.getBpm()/48,C=(e,t)=>!c||g<=0||e<f?l+e/t:m+(e-f)%g/t,A=()=>{let r=F(),u=e.getAudioTime()-a,n=e.getSoloTrackId(),l=performance.now()/1e3;if(s>0&&d>=0){let t=l-s,a=u-d;if(t>.5||a>.5){console.warn(`[sequencer] Interruption detected (realDelta: ${t.toFixed(3)}s, audioDelta: ${a.toFixed(3)}s). Stopping playback.`),E(),e.onEnd(!0);return}}for(let t of(s=l,d=u,e.getTracks()))i.set(t.id,t.volume);for(;;){let a=t[o];if(o>=t.length||c&&a&&a.when>=f){if(!c||g<=0)break;o=v,y+=g,a=t[o]}if(!a)break;let r=a.when+y-u;if(r>.5)break;if(o++,n&&a.trackId!==n)continue;let l=a.velocity/127,s=(i.get(a.trackId)??100*a.volume)/100;e.onPlayNote({trackId:a.trackId,pitch:a.pitch,velocity:a.velocity,volume:s*l,when:Math.max(0,r),duration:a.duration})}let h=e.getDrumPattern();if(h&&h.length>0){let{stepsPerBar:t}=e,a=C(u,r)%t,o=a+4,n=a<4;for(let t of h){if(!(n&&0===t.step||t.step>=a&&t.step<o))continue;let u=(t.step-a)*r;u<-.1||u>.5||e.onPlayDrum({pitch:t.pitch,velocity:t.velocity??1,when:Math.max(0,u),duration:.1})}}if(u>=0){let t=C(u,r);if(e.cues&&e.cues.length>0&&e.onCue){let a=e.getBpm(),o=e.stepsPerBar,u=(e,t,a)=>{if(a>=t)return e>t&&e<=a;{let o=e>t&&e<=p,r=e>=m&&e<=a;return o||r}};for(let n of e.cues)u(tL(n.time,a,o,r),b,t)&&e.onCue(n.id)}b=t}if(!c){let a=t[t.length-1],r=a?.when??0,n=a?.duration??0;o>=t.length&&u>r+n+.1&&(E(),e.onEnd(!1))}},x=()=>{if(!n)return;let t=F(),o=e.getAudioTime()-a;e.onTick(C(o,t)),u=requestAnimationFrame(x)},E=()=>{null!==r&&(clearInterval(r),r=null),null!==u&&(cancelAnimationFrame(u),u=null),n=!1};return{start:C=>{if(E(),(a=>{t=[],i=new Map;let o=F(),r=e.getBpm(),u=e.stepsPerBar,n=e.getLoop?.()??!1;if(c=!!n,"object"==typeof n){m=n.start?tL(n.start,r,u,o):0;let e=n.end?tL(n.end,r,u,o):null;p=null!==e?e:-1}else m=0,p=-1;let l=c?Math.min(a,m):a,s=0;for(let r of e.getTracks())for(let e of(i.set(r.id,r.volume),r.notes)){if(e.startStep<l)continue;let u=(e.startStep-a)*o,n=e.durationSteps*o;s=Math.max(s,e.startStep+e.durationSteps),t.push({trackId:r.id,pitch:e.pitch,volume:r.volume/100,velocity:e.velocity??127,when:u,duration:n})}for(t.sort((e,t)=>e.when-t.when),-1===p&&(p=s),h=(m-a)*o,g=(f=(p-a)*o)-h,v=0;v<t.length&&!(a+t[v].when/o>=m-1e-4);)v++})(l=C??e.getPlayStartStep()),0===t.length&&!e.getDrumPattern()?.length)return;n=!0,a=e.getAudioTime()+.1;let B=F();for(o=0;o<t.length&&!(l+t[o].when/B>=l-1e-4);)o++;y=0,b=l-1e-4,s=-1,d=-1,r=setInterval(A,20),u=requestAnimationFrame(x)},stop:E,isActive:()=>n,getStartTime:()=>a}},tT="dtm-daw-styles",tP=`
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
  padding: 0;
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
.dtm-topbar-row1 {
  display: flex;
  align-items: center;
  gap: var(--dtm-gap);
  flex-basis: 100%;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.dtm-topbar-row1::-webkit-scrollbar { display: none; }
.dtm-topbar-row1 > * { flex-shrink: 0; }
.dtm-topbar-row1 > .dtm-grow { flex-shrink: 1; }

/* PLAY\u30DC\u30BF\u30F3 \u2014 \u30B2\u30FC\u30E0\u306E\u300C\u6C7A\u5B9A\u30DC\u30BF\u30F3\u300D\u7684\u5B58\u5728\u611F */
.dtm-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dtm-tap);
  height: var(--dtm-tap);
  flex: 0 0 auto;
  border: 2px solid var(--c-black);
  background: var(--dtm-success);
  color: var(--c-black);
  cursor: pointer;
  box-shadow: 0 0 0 2px var(--dtm-success), 4px 4px 0 var(--c-black);
}
.dtm-play:active  { transform: translate(4px,4px); box-shadow: none; }
.dtm-play:disabled { opacity: .35; cursor: default; box-shadow: none; }
.dtm-play--stop {
  background: var(--dtm-danger);
  box-shadow: 0 0 0 2px var(--dtm-danger), 4px 4px 0 var(--c-black);
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

/* \u2500\u2500\u2500 \u30C8\u30E9\u30C3\u30AF\u30D4\u30EB\uFF08\u756A\u53F7\u30DC\u30BF\u30F3\u3001\u30C8\u30E9\u30F3\u30B9\u30DD\u30FC\u30C8\u30D0\u30FC2\u884C\u76EE\uFF09 \u2500\u2500\u2500 */
.dtm-tracks {
  flex-basis: 100%;
  display: flex;
  flex-wrap: nowrap;
  gap: 3px;
}
.dtm-pill {
  --dtm-pill-color: var(--dtm-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: 0;
  height: 26px;
  padding: 0;
  border: 2px solid var(--c-black);
  background: color-mix(in srgb, var(--dtm-pill-color) 40%, black);
  color: var(--c-white);
  font-family: var(--dtm-font);
  font-size: 11px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 2px 2px 0 var(--c-black);
  opacity: 0.7;
}
/* \u30A2\u30AF\u30C6\u30A3\u30D6\u9078\u629E = \u4E0D\u900F\u660E + \u91D1\u67A0 */
.dtm-pill--active {
  opacity: 1;
  border-color: var(--dtm-gold);
  box-shadow: 0 0 0 1px var(--dtm-gold), 2px 2px 0 var(--c-black);
}
.dtm-pill:not(.dtm-pill--active):active { transform: translate(2px,2px); box-shadow: none; }

/* \u2500\u2500\u2500 \u30D4\u30A2\u30CE\u30ED\u30FC\u30EB\uFF08\u30C8\u30E9\u30C3\u30AB\u30FC\u98A8\uFF09 \u2500\u2500\u2500 */
.dtm-roll-wrap { display: flex; gap: var(--dtm-gap); }
.dtm-roll {
  position: relative;
  flex: 1 1 auto;
  height: 32vh;
  max-height: 32vh;
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
  content: '\u30ED\u30FC\u30C9\u4E2D';
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

.dtm-confirm-footer {
  padding: 8px 12px;
  border-top: 2px solid var(--c-black);
  background: var(--dtm-deep);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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
  image-rendering: pixelated;
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
`,tI=(e=document)=>{if(e.getElementById(tT))return;let t=e.createElement("style");t.id=tT,t.textContent=tP,e.head.appendChild(t)},tO=(e,t)=>{let a=e.style.position;"static"===window.getComputedStyle(e).position&&(e.style.position="relative");let o=e.ownerDocument??document,r=o.createElement("div");r.className="dtm-overlay";let u=o.createElement("div");u.className="dtm-spinner";let n=o.createElement("i");n.className="dtm-spinner-fill",u.appendChild(n),r.appendChild(u);let l=o.createElement("div");if(l.className="dtm-loading-label",r.appendChild(l),t?.onSkip){let e=o.createElement("button");e.type="button",e.className="dtm-overlay-skip-btn",e.textContent=t.skipLabel??"音声合成をスキップ",e.addEventListener("click",a=>{a.stopPropagation(),e.disabled=!0,t.onSkip?.()}),r.appendChild(e)}return e.appendChild(r),{remove:()=>{r.parentNode&&(r.remove(),e.style.position=a)},setProgress:(e,t,a)=>{if(t>0){let o=Math.max(0,Math.min(100,Math.round(e/t*100)));u.classList.add("dtm-spinner--determinate"),n.style.width=`${o}%`,null!=a?l.textContent=`${e} / ${t} (${o}%) - \u3042\u3068\u7D04 ${a} \u79D2`:l.textContent=`${e} / ${t} (${o}%)`}else u.classList.remove("dtm-spinner--determinate"),n.style.width="0",l.textContent=""}}},tz={puyuyu:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB60lEQVR42tWXPUxTURiGn9vWMCgtEQoDcWhAFgdtB0dMGjfcIAwMjcYoKIObq3F1EwKixNR0cCC46YQ4ODqIi4kRjUPj0Jaa1roYi9fh9Kuck3tvb7v08C73J+/5Tt7nnPvlHoeQend3yKULXXxQc8L4IvRZsU6JM9NJAKLZOQCazox6jiU0/2Gzrgq6r5RvetsFeP+2EkjEPgJ+yd3olDL81RObEp+My7Ct6oLrRcIeAmbyyKULngOikf2uJpA6GT54kug7gfZ6HO6cdwF+pYYBGBxT12vzrwF49mKpq8JXZzcAyG9dBqBRqgJw8lNRob+ybwkBc+2vrx1oBknQq4Sg6OnyCEf7g319YGU1rSM6taWujtou9S/ZwILxid1gf2sP2NsJZZdGZz57DkhMvlG9/uVZvT906bePwO9GDYCBwSFtDUWLN1UfePxkw/tzCumXeawh0O4D59InNAL54gIAN27d1wZsPrqnvu8zz/V+EdIvBD7u/bGUgEhI/BjLae9PlwqBBf385trbQ0Buvj2ccAFGR396kuhVZvJyOQ5A6s5Xx64+UPlebd2p/wAhYSYQ3S40tef1XCxwIkn+fx4s2wPmv2FyXCdhJjcT+703k1v3V+x0OhkJiV7ll9x+Ap1Px25giWNzOv4HHKK9IIEhxAYAAAAASUVORK5CYII=",rino:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABvklEQVR42mNkIACC8yv/MzAwMKSF+jOQAmat3ojCXzuxnRGbOiaGAQaM1PY5oRBBD4kBDwEWdIGdR078p6YFesryeOUHTwjAfI7u4kt3HzLgEyfWp4M/BHD5zE1BhoGBgYFh+vZdDAwMDAzKauoo4jAAk8cFkHLTf+TcMPhC4O6tm6gCaD6Fy6OJZ7o5Q0Ji194hmgbQfZ6VFA+h0TRMm7cQtSiVkcFrwc4jJ4ZYLoD5/P9/SIEobGCNNa5hPsel7t3FY1hz06xBHwLoccxj5IhV4/8nT/CqWz61D4V/bNu2wZkGGNHrAlhu2HvxBgMDAwPDmtJssgze9eAJStyHdE8d5O0BdxsLRuSWEHrcWXl5EWUgzKdwQKBFNfjbhEXailjlTf79Q+GfYYL4pe/qfQYGBgaGU9dQW8WPd18bnK1ieBqQddVCiXtOyU8MDAwMDBGrJzAwMDAw2Duj5vNMIX2UtDF9STtUH1TBNVSL0M0fvCUhIYDu81ioz3EBWMhJv0KtFZdd/j5IQwDm4oN792PVAEsTDDAaTR86iNO6xMDAwMCwiMECa0gMnTSAK0RwySNC5BJKSCTv/T64QgAAipubBW9f1GUAAAAASUVORK5CYII=",roze:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB0klEQVR42s2XPUsDQRCGnxVbC4OVFkELlRR+lBY2dkmlpSLYWVmIpA7BOkL+gQghjYVWiaRVsBFNgiZGQbGIlR+FP2AtzEh23TsTEW6nudu529l53/nYXUVHZqbmNEC9VVWEiPwXJEHzg+wPELEMime12yvRaQCllHjunPjYfjDG42MTxnxAuZDbDEbOwHc8Rss5DfCcTBvIQ5Aa3229MDp2skfHrjM3os8BeQlCLsgWZhadBkRfLB84megSbVWFZ1VQb1UN5GvJDePH8/ppX4Znp+cB+LBySJDLev7kgC2/Ia4dFb+Qrqz9aWF/cuC/DIVkv7Nq/OkD4pFk5Y+OZsVaxiqRCI1tr7kVPQNB2S6MCFLdaJhtTWuj13/LdsEYPmUzAMTSafzeC+wO1bVLumc2mwC04ymzA1LoywF/+4Ad4/dSCYDhVKqvBeLZ3dDq8JeB970v5Ne2vsOESK+MvOTXARixqsQ/BiTrY0mzbt9yuVDk0i/sE9XQYcZ5b5BziD+nYvFIYmWfFYNkdWnLqb9pnxl9RZi1T8f+3Qts5BL7/XwegIvJZQAu7917yKZ+BWCnUjGqpmsvUH5XwW/IbaS2nrtjZ+fUnadKJIy7Y+QMfAL8JMMLhDWQAQAAAABJRU5ErkJggg==",ruko:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACC0lEQVR42s2XsUsbURzHP08kinNvkWAXiy0F6dBJM0S7Bf+AUK2CkKCzS6GDZJBObkJBcNFS7NRFApaCEbRdHERQTJwKGYS4dJE2FM/h7id9P1/SKx3ufZfk3r17d9/P+/1+9ztDQgVBEPIParVaJsm8HlKWyedyTme1gwPzp/OnIyOJFjyt17sS0fdLn4D8kSfTDpI6T0pE1hPCqRPo7RQD/6tm38PYsZuExFb6BDqdkL16VSwC8DiTAeC83bbmbW1vW/NEbz99s0hA3c860CtPLk60ZHwv/n2jnK7Mzkbjm5vWeFbFgkiTSr8ObKytWVnwulKRyuW8IGw2AZiInQgZk8065w+/mAbgx8lnZ2z5kwWy1+I8DCMwS4NDzgv3VMyIU9HFl/cRGWPs87++e5YFeiCfy1nHxavLRAs9eDLeNQY6ZZe//YBod2YGgMzUVKIF2zs7ABz1RN7mPu5HdUHtvb8xIO9pIdO3sOCsA39znlT+vg1119RoNEKAr9UqAM9vbizHweQkAGf70Z6XSiUTZ0HoIutvTyhPKjpcXw8BgnwegEcDA86FLq6v7S64VgNgvFw2qs6EXvWE975etGOtwmLFOq6+W3Z/B8QEtDQRfwiI87uuNSZQnp+3Oh/R0slvAFZH7UTSnZG8NSV7NAn/6sBYoeCcKM5+PnvpJNF//KHrjfS6Qjx1ArcCiMI3kOeT7AAAAABJRU5ErkJggg==",shiyo:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACJklEQVR42s2Xv09TURTHP5eAJJrI3ISBhIFJiaBp08GFAYKTA6FxejVBGgeTtzjxF7gwaWoNtCPEoSwSli4aa+uPSHFiaGLiQFwkDDWBBK7De6fpvd4+YOKe5eW8e+557/u959dV9BcdP1Xvy0ajoXv1dDoNQLPZBCCTyaik/bYMcMWiEpBjITcQiwhyBxOG3cbqJAC5sKW8YmDwPAOttYHMRn7n+nMATn7Iygtjn1LKZkL3MuFvDBzv3Qfg+98I0c9PywA8nBm51AeGb793xoK/MSB/eG18NUJeenwh5NXakdNOd75FVN+YNtbF3h8GJDoXn6wnbhBmRDZjhhYX3kX62we4/AizEhMSY/7WgU3r7LtnTGjogtyWk3Zo6MJILpz2PAtEcmHL+d7O425BGR1N/NDxXuhnNxw87+w+z84a+r2FNaej/+x2dpy9wK6Q/sbAbtztfm9tJZ71bq0GwOHU1KVixt+JSCriyM1nAKTGxoz1yYkJQ2/t7zsdd9ptAH51XiZml38xIJNKEHzQAEunp6aBxYDNSH17+0J1RbqkfzFgz/3FYhGApWzWsLt7dmboXwciLG/qdQAqlYpy+ZNp2V8GgiDQAIVCARcTIq+tuX85vjeI2Pu7N6lbQ55ngZx1Oq54+ZUVAMrlcqTn81H+V6sAvEqljP1iZ98jxB+Hcc/588gzBj6WShogOz/vZMRG+GVuDoCnBwdG9+ubPX3mhStn4B+i9swYdEa2xAAAAABJRU5ErkJggg==",teto:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB00lEQVR42tVXPUsDQRB9q8GvQiyjWKS0CApBCEENafwoYiMWIoJX+gMiKFoqFskPsFQQsbLxisQqRCQIEgiksEzhRyspREU9i705suNecqmyviozszfsezs7OxEIDqfZyMTSAIBcxebrRAc50YMuQ/gx5CDGhFR/HwCg+PGp+DWKtFTICAUcHUMOYhzp1e+5/v2jVYSjSSFhhgKZWNrRMTx5ew/EvJ0S1tCA1p+r2GYoEKIffMeEcHxSKlK6BwCsJaeV+AXzhyng+nl+4/pAiFc5BzHMHslbsr1rK0r5+f1uEVfC/BoghmJxS7bLp6pkvLwn49GEW9UyDp9+8v9qgDpWFnpG2atDvZ8pZs2uml0D3ltgJ1YAAOnypfa9dwrH8gv3zP+gVlaY8+95fnPeAs08IJptv8nHKRy4jPfRZlISPvnNm4gUJebXdwAA15sRAMDCaR0A8PL8CABYarwCAPLDIwCA0bFxZT3VQrsZ0Zw+wJl723eZkJ+YWl9yXqi6Nl8fTW3Iy1E8c1opYZQCCryzPIdy9qQATUwEincKc28BgdcEx9RDTbGrE1HFr+kH5teA0rk4Q46bwYZizwVkbnQNBPp3TIjPJBX77rbUUe6uK/ALBWuzghq8Lc4AAAAASUVORK5CYII=",tsukuyomi:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB3UlEQVR42tWXPUsDQRCGnwuijYIoFqKmEDSCxIgIgqnsogbsrC3ERiwN4g8Ikk6sFH+BnYofvcTKxoigBCzEYGGjWIiCOYvNBHe5TdQUt051czc3e++zO7tzHnUst7vn04BlFue9Ws8jhGxN9ZTPzU43NkIlj41E6AQ8m/JYfByAoWgXAPtHJzRCRN43SbizBkzlv1X2VzLuVoHYzf0TAMnys+aLCTGThMTJGnKfQOpyWF1cvgHQsh4FYPDzRd3vmQHgoPShJbi9uqhJyPk1UK3Jwsq1/115rLst8AX/4UFP0NsbGHf7+Kr579l7zR/ZGvbcrAJR7vvqEOwcTdZMYIuTPCYJUS7Ewydgzn2Bay2gdWzqR4nMuMPlhcC5l/HcWQOnCaU4lVU3xI9tnwFQnOgDoDmdDs5QKmlxYhdGmBA2ibhTBfKFHCkCm00dAKymJn+USAidHx8DkI+0q7PBUC7j5BJ7jlSB7RyXziVT8fM7Oz7AeLmsz3VEaWi7UvtAcmvJC+qmq4T/XT8gdTsw2692to07AF7jeU35wFq/7COqzhdVnVOnu3aHgNm1VpVXlImJX9zQffO5kDg1dlb3CNj6dZsVK2vAVP7Xf8bwCfxWuc23Eanmt/xlh07gC6oBviFE8rZHAAAAAElFTkSuQmCC",rei:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACXElEQVR42s2XQWhTQRCGv1c8CFa9SSPEKkQPtfIOBQUlBgThEVIjEgRvEuuhCDkVL7Ug2N4ilqB4aCveFOnBanm+gxRUKlgJUmgraEA0YEpPRT3opeth30p2eXk0XrJzecxkZnbm39mZicM26dXAGUEblKkuOFHyvn09AmBtY90B6KLD5LSKUNH9ZB8Aw/W1/zpA2StSfuxDQGWeyWX1u5/3Nf7t8RORjk4uvYs9aOVqt8a/CQ5gBQI7WlZ9mLkZOaxGZ+jqesGpCgCe50nB2JFIO3sQ+FftRuaNbFkzSPgjGv9j+SgAe9zV2INMvbT3zRIEtkZT4buXEa3QrVUpQUWLuBX9GXwgv+O35d1Tkj94nwBYbvyUflxba0Bl7CZ2A3B6fhKA17krsQ72Tk3qSLQZQOc7oTnlMtWFVtMwRGZGGiYOxTreGk1F94XFkmU10DS3BYAQEhBx47CMcKIWadhKT2Vu8iOXixIBo7Pa8wo2c/lYRXX32yXR+CK/d8/GdkR79oHNXF4AbBzrBSCZL0Qa7OxNtodEiED/1C9t5tgzC0zB+ZknADwNeYXE0rWbkbWgOqUpf/HhIwC7wg5bfhhO0bGyZZ2wqXOJ5rsyqfpMIuPPPdLkF0rXAfhcuaPJU12+NmPS71/KjhgEWke0rwbUJqQif+weBKA+NwtANn9J0//9ta7xtbTcAVOLvmafNqfgRM2xCwEzY8LNZbBQUAoADJy7qNWE+XrKIQLckpsQQ0Oa3vNZieRwsSjsegUqIkX3pqf1qg33+/6e/dH/C9a/R+or3iSFRMcR+AtdbNaYOcb0dwAAAABJRU5ErkJggg==",MGRoid:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABy0lEQVR42tWXv0tCURTHPy9dwog0AssiVLChNmnQaHaJIoj+gQgkoj+jsSEiGmpodosWA9ck6g1BDg0qQYNLDpG1GK/h3RvvxfU+nbyd6f4473C/33ve95xr0b853kk2m2UQs21bDi3v+ghDtnCQQzEWcwDO2u2+kC83mwDcTEwEMWkZx4Cjc7xMJAA4DkCeGx11GRDrjUZDefdG5YA+uwUyaQetlstEPK5ELi0ajfZ1gKEzYEkG/iK/23l0B7MDRnwV1O51fYx6dABj/wI9coHsdz1g3j0NCyZsLRPmK+HL4jMAixdlAD4KB0pmxsquQtSOCgDMs6Bkwkgd0FoqlQIgs7oFQGhjRemX+ZwW/lMAfNfo9RdZxumAshZ0r8K+Ow6lT9zBUk4d6anqIq/v+5CH17tm1wIrqAOSTHiQuJvlMzdAoYiKuSDkRjPgiE4IgPtkUlv3q19fWj/ZSRndDyhNIsyJ+n+dzyvna7e3ALwJvZisVFD1F7ZtO/9DB+SJHw53lVneqytW1PteVdDwd4HU/u3zivKDzbkZbc2QViqVtMiNZMDy5oJE8Pcu3zsdAMYjEWVAzzvg/yrhQK/ker3u20yn0wPFHjoDP1pgkXMfnLDSAAAAAElFTkSuQmCC",MOTRoid:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAByElEQVR42s2WTyiEURTFfyMbS1ZSlIUxScpCNrNAkpLdhClFlJRJdpQ/5V+xE7PQFJHFyJKUJKLZaBZqkhjKQslCLG3UWIw7ec/7xidq3lnNve++23fOO2/u86ChPbyd+hp3tDbzH9g5OFLivVCXByCPHMPjlrkw+KsiuhI5VyBfT/z3mev9JJZ1ezywdfeccnNmbhVyuy/3Coj7nVwv2KwpAaAn8ZiVkezT652UsO8WCK5jJ0pcH9OYOrha9un1GVivwMzEOADJ6CoApQtx48bdQNnnr3cAugMNAMRWpoz1/usbALzBQQB8/kZLFZAv0/EwVpdVESfGMV+lsb94xz4FMu4f6lTybpkLdObf+lurwNTcvOLWh6XpXzX0n54Z89JP+ts/CwRtj1cAFHq9Sj4+uWisr5sdVeLXZBKA/ZIqy6fhT3O7YmNJPdOWFmNd8vBQiW97R7JOTXtfxYKjyAwAzQPp//jxp8v0tAuFjA3Pw2EA5ourjfvt84DTQkFNVQrgrb9Dyb/UNhlvhe76ootjtd9a+gXxlrjy2P0eEOZOyDDTGLpFRtlPJezzgNPZC6LBPgDKlyPG9fvhAQCC0XWzAms7dt2CDzsGp242tsuqAAAAAElFTkSuQmCC"},tU="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcElEQVR42u2WOw7AIAxD7Yr7X9kdqi5IIXQKBWckKHrOTyEAodAuFJsBDGAAA7TIIT0LkuTQ/1r0L4u3XgZ6ZbNKsvf9mlBSqu5fU9DXMFP3teujeOtPQbYPZnplFK88A4xuwmM2IX0VG8AABjge4AZHeT8uyZjZYAAAAABJRU5ErkJggg==",tR=["#00e436","#29adff","#ff77a8","#ffec27"],tj=null,tV=new Set,t$={klatt:"軽量ロボ声",...eY},tH=null,tG=null,tq=()=>{tH&&(tH.classList.remove("dtm-player-balloon--visible"),tH=null),tG&&(clearTimeout(tG),tG=null)},tW=e=>{tH===e?tG&&clearTimeout(tG):(tq(),tH=e,e.classList.add("dtm-player-balloon--visible")),tG=setTimeout(()=>{tq()},3e3)},tQ=async(e,t)=>{try{return await navigator.clipboard.writeText(t),!0}catch{try{let a=e.createElement("textarea");a.value=t,a.style.position="fixed",a.style.opacity="0",e.body.appendChild(a),a.select();let o=e.execCommand("copy");return e.body.removeChild(a),o}catch{return!1}}},tK=async e=>{try{if("u">typeof CompressionStream){let t=new CompressionStream("gzip"),a=t.writable.getWriter();a.write((e=>{let t=[];for(let a=0;a<e.length;a++){let o=e.charCodeAt(a);32!==o&&(o<=127?t.push(o):12540===o?t.push(223):o>=12353&&o<=12447?t.push(128+(o-12353)):o>=12449&&o<=12543&&(t.push(255),t.push(128+(o-96-12353))))}return new Uint8Array(t)})(e)),a.close();let o=await new Response(t.readable).arrayBuffer();return`z.${(e=>{let t="";for(let a=0;a<e.length;a++)t+=String.fromCharCode(e[a]);return btoa(t).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")})(new Uint8Array(o))}`}}catch(e){console.warn("[dtm] CompressionStream failed, fallback to encodeURIComponent",e)}return`u.${encodeURIComponent(e)}`},tY=(e,t,a={})=>{tI(e.ownerDocument??document);let{placements:o,bpm:r,tokenTracks:u,lyrics:n,meta:l}=tD(t,{collectTokens:!0,collectLyrics:!0}),i=n??new Map,s=new Map(eH(t).map(e=>[e.key,e])),d=r??a.defaultBpm??120,c=a.drumPatterns??ev,m=l.drum?c[l.drum]??null:null,p=l.volume??a.volume??100,h=l.drumVolume??80,f=a.trackColors??tR,g=a.synth??!a.onPlayNote,v=60/d/48,y=[...new Set(o.map(e=>e.trackIndex))].sort((e,t)=>e-t),F=o.reduce((e,t)=>Math.max(e,t.startStep+t.durationSteps),0),C=o.map(e=>({pitch:e.pitch,when:e.startStep*v,duration:e.durationSteps*v})),A=[];if(C.length>0){let e=[];try{e=((e,t={})=>{if(!e.length)return{keys:[],chords:[]};let{flat:a=!1,bpm:o,frameSize:r=.5,changePenalty:u=.4,nonChordTonePenalty:n=.55,useKey:l=!0}=t,i=((e,t={})=>{if(!e.length)return[];let{flat:a=!1}=t,o=e.reduce((e,t)=>Math.min(e,t.when),1/0),r=e.reduce((e,t)=>Math.max(e,t.when+Math.max(t.duration,0)),-1/0),u=r-o;if(u<=0){let t=((e,t={})=>{if(!e.length)return[];let{flat:a=!1}=t,o=(e=>{let t=Array(12).fill(0);for(let a of e)"number"==typeof a?t[b(a)]+=1:t[b(a.pitch)]+=a.duration??1;return t})(e);return o.every(e=>0===e)?[]:eo(o,a)})(e.map(e=>({pitch:e.pitch,duration:Math.max(e.duration,1)})),{flat:a})[0];return t?[{key:ee(t),when:o,duration:0}]:[]}let n=t.windowSize??u/4,l=t.hopSize??n/2,i=t.minSegmentDuration??0,s=t.switchMargin??.08,d=[];for(let t=o;t<r-1e-9;t+=l){let u=Math.min(t+l,r),i=Math.min(t+n,r),c=ea(e,Math.max(o,i-n),i),m=d[d.length-1];if(c.every(e=>0===e)){m&&(m.duration=u-m.when);continue}let p=eo(c,a),h=p[0];if(m){let e=p.find(e=>et(e,m.key));e&&h.score-e.score<=s&&(h=e)}m&&et(m.key,h)?m.duration=u-m.when:d.push({key:ee(h),when:t,duration:u-t})}var c=er(d);if(i<=0)return c;let m=c.map(e=>({...e})),p=0;for(;p<m.length&&m.length>1;){if(m[p].duration>=i){p++;continue}p>0?m[p-1].duration+=m[p].duration:(m[p+1].when=m[p].when,m[p+1].duration+=m[p].duration),m.splice(p,1)}return er(m)})(e,t),s=e.reduce((e,t)=>Math.min(e,t.when),1/0),d=e.reduce((e,t)=>Math.max(e,t.when+Math.max(t.duration,0)),-1/0);if(d<=s)return{keys:i,chords:[]};let c=o?60/o:Math.max(r,.001),m=[];for(let t=s;t<d-1e-9;t+=c)m.push(es(e,t,Math.min(t+c,d)));let p=((e,t)=>{let a=e.length,o=en.length;if(0===a)return[];let r=Array.from({length:a},()=>Array(o).fill(-1)),u=e[0].slice();for(let n=1;n<a;n++){let a=-1/0,l=0;for(let e=0;e<o;e++)u[e]>a&&(a=u[e],l=e);let i=Array(o).fill(0),s=e[n],d=a-t;for(let e=0;e<o;e++)u[e]>=d?(i[e]=s[e]+u[e],r[n][e]=e):(i[e]=s[e]+d,r[n][e]=l);u=i}let n=0;for(let e=1;e<o;e++)u[e]>u[n]&&(n=e);let l=Array(a).fill(0);l[a-1]=n;for(let e=a-1;e>0;e--)l[e-1]=r[e][l[e]];return l})(m.map(e=>{if(e.empty)return Array(en.length).fill(0);let t=l?em(i,e.when+e.duration/2):null;return en.map(a=>((e,t,a,o)=>{let r=0,u=0;for(let a=0;a<12;a++){let o=e.profile[a];0!==o&&(t.pcs.has(a)?r+=o*t.weights[a]:u+=o)}let n=r-o*u;return 0===e.profile[t.root]&&(n-=.3),-1!==e.bass&&t.root===e.bass&&(n+=.3),a&&(n+=((e,t)=>{let a=new Set(("major"===t.mode?el:ei).map(e=>b(e+t.tonic))),o=a.has(e.root),r=!0;for(let t of e.pcs)if(!a.has(t)){r=!1;break}let u=0;r?u+=.25:o&&(u+=.1);let n=b(e.root-t.tonic);return(0===n||5===n||7===n)&&(u+=.05),u})(t,a)),n-=.002*t.priority})(e,a,t,n))}),u),h=[];for(let e=0;e<m.length;e++){let t=m[e],o=en[p[e]],r=h[h.length-1];if(r&&r.root===o.root&&r.quality===o.quality){r.duration=t.when+t.duration-r.when;continue}let u=em(i,t.when+t.duration/2),{symbol:n,rootSymbol:l,inversion:s,bass:d}=ep(o,t.bass,a);h.push({symbol:n,rootSymbol:l,root:o.root,quality:o.quality,bass:d,inversion:s,when:t.when,duration:t.duration,key:u,degree:u?ec(u,o):null})}return{keys:i,chords:h}})(C,{bpm:d}).chords}catch{e=[]}for(let t of e){let e=Math.max(0,Math.round(t.when/v)),a=Math.round((t.when+t.duration)/v);for(let o=e;o<a&&o<=F;o++)A[o]=t.symbol}let t="";for(let e=0;e<=F;e++)A[e]?t=A[e]:A[e]=t}let x=y.map(e=>{let t=0,a=o.filter(t=>t.trackIndex===e).map(e=>({id:t++,startStep:e.startStep,durationSteps:e.durationSteps,pitch:e.pitch,velocity:e.velocity}));return{id:String(e),volume:p,notes:a}}),E=e=>f[e%f.length]??tR[0],B=null,w=()=>(B||(B=new AudioContext),B),k=null,S=()=>(k||(k=((e,t=e.destination)=>({playNote:a=>{let o,r=e.createOscillator(),u=e.createGain();r.type="square",r.frequency.value=(o=a.pitch,440*2**((o-69)/12));let n=e.currentTime+a.when,l=Math.max(1e-4,.06*a.volume*1.5);if(u.gain.setValueAtTime(l,n),u.gain.exponentialRampToValueAtTime(.001,n+a.duration),r.connect(u),"function"==typeof e.createStereoPanner&&a.pan){let o=e.createStereoPanner();o.pan.value=Math.max(-1,Math.min(1,a.pan)),u.connect(o),o.connect(t)}else u.connect(t);r.start(n),r.stop(n+a.duration+.02)},playDrum:a=>{let o=e.currentTime+a.when,r=Math.max(1e-4,Math.min(1,a.velocity)),u=35===a.pitch||36===a.pitch,n=38===a.pitch||39===a.pitch||40===a.pitch;if(u){let a=e.createOscillator(),u=e.createGain();a.frequency.setValueAtTime(150,o),a.frequency.exponentialRampToValueAtTime(50,o+.12),u.gain.setValueAtTime(.9*r,o),u.gain.exponentialRampToValueAtTime(.001,o+.18),a.connect(u).connect(t),a.start(o),a.stop(o+.2),a.onended=()=>a.disconnect();return}let l=n?.18:.05,i=Math.max(1,Math.floor(e.sampleRate*l)),s=e.createBuffer(1,i,e.sampleRate),d=s.getChannelData(0);for(let e=0;e<i;e++)d[e]=2*Math.random()-1;let c=e.createBufferSource();c.buffer=s;let m=e.createBiquadFilter();m.type=n?"bandpass":"highpass",m.frequency.value=n?2e3:8e3;let p=e.createGain();p.gain.setValueAtTime(r*(n?.7:.4),o),p.gain.exponentialRampToValueAtTime(.001,o+l),c.connect(m).connect(p).connect(t),c.start(o),c.stop(o+l),c.onended=()=>{c.disconnect(),m.disconnect(),p.disconnect()}}}))(w())),k),M=null,D=()=>{if(a.singingVoices)return a.singingVoices;if(!M){let e=w();M=tt(e,e.destination)}return M},L=g||!!a.singingVoices,N=e.ownerDocument??document,T=N.createElement("div");T.className="dtm-daw dtm-player";let P=N.createElement("div");P.className="dtm-player-head";let I=N.createElement("button");I.type="button",I.className="dtm-player-play",I.innerHTML=ef("play",12),I.disabled=0===y.length;let O=new Set,z=new Map,U=new Map,R=new Map,j=e=>{O.has(e)?O.delete(e):O.add(e),V(e)},V=e=>{let t=O.has(e),a=R.get(e);a&&a.classList.toggle("is-muted",t);let o=z.get(e);o&&o.classList.toggle("is-muted",t);let r=U.get(e);r&&r.classList.toggle("is-muted",t)},$=N.createElement("div");$.className="dtm-player-mml-header";let H=[];for(let e of y){let t=N.createElement("span");t.className="dtm-player-emoji",t.style.backgroundColor=E(e);let a=N.createElement("span");a.textContent="🥺",t.appendChild(a),t.addEventListener("click",t=>{t.stopPropagation(),j(e)}),$.appendChild(t),H.push(t),U.set(e,t)}let G=N.createElement("div");G.className="dtm-player-more-container";let q=N.createElement("button");q.type="button",q.className="dtm-player-more-btn",q.innerHTML=ef("more",14),q.title="メニュー",G.appendChild(q);let W=N.createElement("div");W.className="dtm-player-menu",W.style.display="none";let Q=e=>{let t=N.createElement("button");return t.type="button",t.className="dtm-player-menu-item",t.textContent=e,t},K=Q("MMLを表示"),Y=Q("MML書式とは"),_=Q("埋め込む"),Z=Q("MMLコピー");a._skipInfoModals||(W.appendChild(K),W.appendChild(Y),W.appendChild(_)),W.appendChild(Z),G.appendChild(W),$.appendChild(G);let X=e=>{let t=void 0!==e?e:"none"===W.style.display;W.style.display=t?"flex":"none",t?(q.classList.add("is-active"),N.addEventListener("click",J)):(q.classList.remove("is-active"),N.removeEventListener("click",J))},J=e=>{G.contains(e.target)||X(!1)};q.addEventListener("click",e=>{e.stopPropagation(),X()});let eu=null,ed=null,eh=()=>{ed&&(ed.stop(),ed.destroy(),ed=null),eu?.remove(),eu=null},eg=e=>{eh();let t=N.createElement("div");t.className="dtm-modal-overlay";let a=N.createElement("div");a.className="dtm-win dtm-modal";let o=N.createElement("div");o.className="dtm-modal-header";let r=N.createElement("span");r.className="dtm-modal-title",r.textContent=e;let u=N.createElement("button");u.type="button",u.className="dtm-modal-close",u.innerHTML="&times;",u.title="閉じる",o.append(r,u);let n=N.createElement("div");return n.className="dtm-modal-body",a.append(o,n),t.appendChild(a),u.addEventListener("click",e=>{e.stopPropagation(),eh()}),t.addEventListener("click",e=>{e.target===t&&eh()}),N.body.appendChild(t),eu=t,n},ey=(e,t)=>{let a=N.createElement("div");a.style.marginTop="8px";let o=N.createElement("button");o.type="button",o.className="dtm-btn dtm-btn--primary dtm-btn--xs",o.textContent="📋 コピー",o.addEventListener("click",async e=>{e.stopPropagation();let a=await tQ(N,t);o.textContent=a?"✓ コピー完了":"コピー失敗",a&&o.classList.add("dtm-btn--success"),setTimeout(()=>{o.textContent="📋 コピー",o.classList.remove("dtm-btn--success")},1200)}),a.appendChild(o),e.appendChild(a)};a._skipInfoModals||(K.addEventListener("click",e=>{e.stopPropagation(),X(!1);let o=eg("MMLを表示"),r=N.createElement("p");r.textContent="このMMLをコピーして、他のプレイヤーや共有URLに貼り付けて使用できます。",r.style.marginBottom="8px",o.appendChild(r);let u=a.getMml?.()??t,n=u.split(";").map(e=>e.trim()).filter(e=>e.length>0).join(";\n"),l=N.createElement("pre");l.textContent=n,l.style.whiteSpace="pre-wrap",l.style.wordBreak="break-all",l.style.cursor="text",l.addEventListener("click",()=>{let e=N.createRange();e.selectNodeContents(l);let t=N.defaultView?.getSelection();t?.removeAllRanges(),t?.addRange(e)}),o.appendChild(l),ey(o,u)}),Y.addEventListener("click",e=>{e.stopPropagation(),X(!1);let t=eg("MMLの書き方解説");t.innerHTML=tx,(e=>{for(let t of e.querySelectorAll(".dtm-modal-sample-copy-btn")){let e=t;e.addEventListener("click",async t=>{t.stopPropagation();let a=e.getAttribute("data-mml")??"",o=e.textContent,r=await tQ(N,a);e.textContent=r?"✓ コピー完了":"コピー失敗",r&&e.classList.add("dtm-btn--success"),setTimeout(()=>{e.textContent=o,e.classList.remove("dtm-btn--success")},1200)})}let t=null,o=e=>{e&&(e.textContent="▶ 試聴",e.classList.remove("dtm-btn--danger"),e.classList.add("dtm-btn--primary"))},r=e=>{e.textContent="■ 停止",e.classList.remove("dtm-btn--primary"),e.classList.add("dtm-btn--danger")};for(let u of e.querySelectorAll(".dtm-modal-sample-play-btn")){let e=u;e.addEventListener("click",u=>{u.stopPropagation();let n=e.getAttribute("data-mml")??"";if(t===e&&ed)return void(ed.isPlaying()?ed.stop():(ed.play(),r(e)));ed&&(ed.stop(),ed.destroy(),ed=null),o(t),t=e;let l=e.closest(".dtm-modal-sample-box"),i=l?.querySelector(".dtm-modal-sample-player-container");i&&(i.innerHTML="",ed=tY(i,n,{onPlayNote:a.onPlayNote,onPlayDrum:a.onPlayDrum,onResumeAudio:a.onResumeAudio,getAudioTime:a.getAudioTime,singingVoices:a.singingVoices,drumPatterns:a.drumPatterns,volume:p,skipConsent:!0,_skipInfoModals:!0,onStop:()=>{t===e&&o(e)}}),r(e),ed.play())})}})(t)}),_.addEventListener("click",async e=>{e.stopPropagation(),X(!1);let o=eg("埋め込み"),r=N.createElement("p");r.textContent="生成中...",o.appendChild(r);try{let e=a.embedUrl??"https://onjmin.github.io/dtm/demo/embed.html",u=await tK(t),n=`${e}#${u}`,l=`<iframe src="${n}" width="100%" height="260" frameborder="0" loading="lazy" title="@onjmin/dtm player"></iframe>`;if(!o.isConnected)return;r.remove();let i=N.createElement("p");i.textContent="このHTMLをブログやサイトに貼り付けると、プレイヤーをそのまま埋め込めます。";let s=N.createElement("pre");s.textContent=l,s.style.whiteSpace="pre-wrap",s.style.wordBreak="break-all",o.append(i,s),ey(o,l)}catch(e){console.error("[dtm] failed to generate embed snippet",e),o.isConnected&&(r.textContent="生成に失敗しました")}})),Z.addEventListener("click",async e=>{e.stopPropagation(),await tQ(N,a.getMml?.()??t)?Z.textContent="コピーしました！":Z.textContent="コピー失敗",setTimeout(()=>{Z.textContent="MMLコピー"},2e3)});let eb=new Set;for(let[e,t]of i){let a=U.get(e);if(!a)continue;let o=s.get(t.model.toLowerCase()),r=e_[t.model.toLowerCase()],u=o?o.iconUrl||tU:r?tz[r]:void 0;if(!u)continue;let n=N.createElement("img");n.src=u,o&&(n.onerror=()=>{n.onerror=null,n.src=tU}),n.width=20,n.height=20,n.style.borderRadius="50%",n.style.objectFit="cover",n.style.imageRendering="pixelated",n.draggable=!1,eb.add(a),a.textContent="",a.appendChild(n);let l=N.createElement("div");l.className="dtm-player-balloon",l.textContent=t$[t.model.toLowerCase()]??t.model,a.appendChild(l),a.addEventListener("mouseenter",()=>{tW(l)}),a.addEventListener("mouseleave",()=>{tH===l&&tq()}),a.addEventListener("click",e=>{e.stopPropagation(),tW(l)})}let eF=new WeakMap,eC=e=>{let t=performance.now(),a=eF.get(e);void 0!==a&&t-a<50||(eF.set(e,t),e.classList.remove("dtm-player-emoji--jump"),e.offsetWidth,e.classList.add("dtm-player-emoji--jump"))},eA=[],ex=()=>{for(let e of eA)clearTimeout(e);eA.length=0},eE=[],eB=e=>{let t=setTimeout(()=>{if(eb.has(e))return;let t=e.querySelector("span");t?t.textContent="😌":e.textContent="😌";let a=setTimeout(()=>{if(eb.has(e))return;let t=e.querySelector("span");t?t.textContent="🥺":e.textContent="🥺",eB(e)},100+50*Math.random());eE.push(a)},2e3+5e3*Math.random());eE.push(t)};for(let e of H)eB(e);let ew=N.createElement("div");for(let e of(ew.className="dtm-player-dots",ew.style.display="none",y)){let t=N.createElement("span");t.className="dtm-player-dot",t.style.backgroundColor=E(e),ew.appendChild(t)}let ek=N.createElement("div");ek.className="dtm-player-beat-row";let eS=[];for(let e=0;e<4;e++){let e=N.createElement("span");e.className="dtm-player-beat-dot",ek.appendChild(e),eS.push(e)}let eM=N.createElement("span");eM.className="dtm-player-bar",eM.textContent="-",ek.appendChild(eM);let eD=N.createElement("span");eD.className="dtm-player-chord",eD.textContent="",ek.appendChild(eD),P.append(I,ek,ew,$),T.appendChild(P);let eL=N.createElement("div");eL.className="dtm-player-message",eL.style.display="none",T.appendChild(eL);let eN=null,eT=0,eP=N.createElement("div");eP.className="dtm-player-body",T.appendChild(eP);let eI=[];for(let e of y){let t=i.get(e),a=!!t&&t.syllables.length>0,r=N.createElement("div");r.className="dtm-player-lane-row",R.set(e,r);let n=N.createElement("div");n.className="dtm-player-lane-label dtm-player-lane-label--btn";let l=N.createElement("span");l.className="dtm-player-dot",l.style.backgroundColor=E(e);let s=N.createElement("span");s.className="dtm-player-lane-no",s.textContent=`@${e}`,n.append(l,s),z.set(e,n),n.addEventListener("click",()=>{j(e)});let d=N.createElement("div");d.className="dtm-player-lane",d.style.setProperty("--tk",E(e));let c=[];if(a){let a=o.filter(t=>t.trackIndex===e).sort((e,t)=>e.startStep-t.startStep),r=(t.gate??100)/100,u=new Set(t.lineBreaks??[]);if(t.metaText){let e=N.createElement("span");e.className="dtm-tk dtm-tk--meta",e.textContent=t.metaText,d.appendChild(e)}let n=Math.min(a.length,t.syllables.length);for(let e=0;e<n;e++){let o=a[e];if(u.has(e)){let e=N.createElement("span");e.className="dtm-tk dtm-tk--break",e.textContent="\\n",d.appendChild(e)}let n=N.createElement("span");n.className="dtm-tk dtm-tk--lyric",n.textContent=t.syllables[e].kana,d.appendChild(n),c.push({el:n,startStep:o.startStep,durationSteps:Math.max(1,Math.round(o.durationSteps*r))})}}else for(let t of u?.get(e)??[]){let e=N.createElement("span");e.className=`dtm-tk dtm-tk--${t.type}`,e.textContent=t.text,d.appendChild(e),t.durationSteps>0&&c.push({el:e,startStep:t.startStep,durationSteps:t.durationSteps})}r.append(n,d),eP.appendChild(r),eI.push({lane:d,tokens:c})}let eO=[...new Set([...i.values()].map(e=>e.model))].filter(e=>eZ[e]);if(eO.length>0){let e=N.createElement("div");for(let t of(e.className="dtm-player-terms",e.style.fontSize="10px",e.style.color="var(--dtm-warn)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="4px",e.style.marginTop="4px",e.style.padding="0 4px",eO)){let a=N.createElement("div");a.style.display="flex",a.style.alignItems="center",a.style.gap="4px",a.style.flexWrap="wrap";let o=eY[t]??t,r=eZ[t],u=N.createElement("span");u.textContent="使用時には";let n=N.createElement("a");n.textContent=`${o}UTAU\u97F3\u6E90`,n.href=r,n.target="_blank",n.rel="noopener",n.style.color="var(--dtm-primary)",n.style.textDecoration="underline";let l=N.createElement("span");l.textContent="の利用規約に従ってください",a.append(u,n,l),e.appendChild(a)}T.appendChild(e)}e.appendChild(T);let ez=null,eU=(e,t)=>{if(0===t.offsetWidth||0===e.clientWidth)return;let a=t.offsetLeft+t.offsetWidth/2,o=Math.max(0,e.scrollWidth-e.clientWidth),r=a-e.clientWidth/2;e.scrollLeft=Math.max(0,Math.min(r,o))},eR=tN({getTracks:()=>x,getBpm:()=>d,getPlayStartStep:()=>0,getDrumPattern:()=>m,getSoloTrackId:()=>null,getAudioTime:()=>g?w().currentTime:a.getAudioTime?.()??performance.now()/1e3,onPlayNote:e=>{var t;let o=Number(e.trackId);if(O.has(o))return;let r=U.get(o);r&&((t=e.when)<=0?eC(r):eA.push(setTimeout(()=>eC(r),1e3*t))),(!i.has(o)||e$)&&(a.onPlayNote?.(e),g&&S().playNote(e))},onPlayDrum:e=>{let t=e.velocity*(h/100)*(p/100);a.onPlayDrum?.({...e,velocity:t}),g&&S().playDrum({...e,velocity:t})},onTick:e=>{(e=>{let t=Math.floor(e),a=Math.floor(e/48)%4;for(let e=0;e<4;e++)eS[e].classList.toggle("dtm-player-beat-dot--on",e===a);eM.textContent=String(Math.floor(e/192)+1);let o=A[t]??"";for(let a of(eD.textContent!==o&&(eD.textContent=o,o&&console.log(`[dtm-player-chord] Active Chord: ${o} (step: ${t})`)),eI)){let t=null;for(let o of a.tokens){let a=e>=o.startStep&&e<o.startStep+o.durationSteps;o.el.classList.toggle("is-active",a),a&&!t&&(t=o)}t&&eU(a.lane,t.el)}})(e)},onEnd:e=>eW(),stepsPerBar:192}),eV=!1,e$=!1,eq=e=>{eV=e,I.innerHTML=ef(e?"stop":"play",12),I.classList.toggle("dtm-player-play--stop",e)},eW=()=>{for(let e of(eq(!1),ex(),eS))e.classList.remove("dtm-player-beat-dot--on");for(let e of(eM.textContent="-",eD.textContent="",eI)){for(let t of e.tokens)t.el.classList.remove("is-active");e.lane.scrollLeft=0}tj===eJ&&(tj=null),a.onStop?.()},eQ=async()=>{let e=L&&i.size>0,t=e?[...i.entries()].map(([e,t])=>{let a=x.find(t=>Number(t.id)===e),o=[...a?.notes??[]].sort((e,t)=>e.startStep-t.startStep),r=(t.gate??100)/100,u=(t.octave??0)*12,n=Math.min(o.length,t.syllables.length),l=[];for(let e=0;e<n;e++){let a=o[e];l.push({syllable:t.syllables[e],pitch:a.pitch+u,startSec:a.startStep*v,durationSec:a.durationSteps*v*r})}return{id:String(e),model:t.model,volume:ej(t.volume??200)*(p/100),pan:eG(t.pan??64),notes:l}}):[];if(e){let e=D(),a=tO(eP,{skipLabel:"音声合成をスキップ（元のメロディで再生）",onSkip:()=>{eV&&tj===eJ&&(e$=!0,a.remove(),eR.start(0))}});try{if(s.size>0&&e.registerVoicebanks?.(Object.fromEntries([...s].map(([e,t])=>[e,t.url]))),await e.loadModels(t.map(e=>e.model)),e$)return;let o=performance.now();await e.warm(t,e7,(e,t)=>{if(!e$)if(0===e)a.setProgress(e,t);else{let r=(performance.now()-o)/1e3/e,u=t-e,n=Math.ceil(u*r);a.setProgress(e,t,n)}})}catch(e){console.warn("[dtm] voice preload failed",e)}finally{a.remove()}if(!eV||tj!==eJ||e$)return}eR.start(0),e&&!e$&&D().startStream(t,eR.getStartTime(),{isAudible:e=>!O.has(Number(e.id)),onLateSkip:()=>{let e;(e=performance.now())-eT<1500||(eT=e,eL.textContent="音声合成が間に合わないため、一部の発音をスキップしました",eL.style.display="",eN&&clearTimeout(eN),eN=setTimeout(()=>{eL.style.display="none",eL.textContent="",eN=null},3e3))}})},eK=()=>{eV||0===y.length||(e=>{try{if(a.skipConsent)return!1;let t=eO.filter(e=>{if(tV.has(e))return!1;try{if("u"<typeof localStorage||!localStorage)return!0;return"true"!==localStorage.getItem(`dtm_agreed_terms_${e}`)}catch(e){return console.warn("[dtm-player] localStorage access denied in consent check",e),!0}});if(0===t.length)return!1;let o=N.createElement("div");o.className="dtm-consent-overlay";let r=N.createElement("div");r.className="dtm-win dtm-consent-modal";let u=N.createElement("div");u.className="dtm-consent-header",u.textContent="利用規約の確認";let n=N.createElement("div");n.className="dtm-consent-body";let l='<p style="margin: 0 0 8px 0; line-height: 1.4; font-weight: bold; color: var(--dtm-danger);">本データには UTAU 歌声音源が含まれています。<br>ご利用にあたっては、以下の音源利用規約への同意が必要です。</p>';for(let e of t){let t=eY[e]||e,a=eZ[e];l+=`
					<div style="margin-bottom: 8px; padding: 6px 10px; background: var(--dtm-deep); border: 2px solid var(--c-black); box-shadow: 2px 2px 0 var(--c-black);">
						<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 11px; font-weight: bold; color: var(--dtm-gold);">
							<span>\u4F7F\u7528\u6642\u306B\u306F</span>
							<a href="${a}" target="_blank" rel="noopener noreferrer" style="color: var(--dtm-primary); text-decoration: underline;">${t}UTAU\u97F3\u6E90</a>
							<span>\u306E\u5229\u7528\u898F\u7D04\u306B\u5F93\u3063\u3066\u304F\u3060\u3055\u3044</span>
						</div>
					</div>
				`}n.innerHTML=l;let i=N.createElement("div");i.className="dtm-consent-footer";let s=N.createElement("button");return s.type="button",s.className="dtm-btn dtm-btn--success",s.textContent="同意して利用する",s.onclick=()=>{for(let e of t){try{"u">typeof localStorage&&localStorage&&localStorage.setItem(`dtm_agreed_terms_${e}`,"true")}catch(e){}tV.add(e)}o.remove(),ez=null,e&&e()},i.appendChild(s),r.append(u,n,i),o.appendChild(r),N.body.appendChild(o),ez=o,!0}catch(e){return console.error("[dtm-player] Error in checkConsentAndShow:",e),!1}})(()=>eK())||(tj&&tj!==eJ&&tj.stop(),tj=eJ,e$=!1,eq(!0),(async()=>{let e=[],t=a.onResumeAudio?.();if(t&&e.push(t),g){let t=w();"suspended"===t.state&&e.push(t.resume())}e.length>0&&await Promise.all(e),eV&&tj===eJ&&(L&&i.size>0&&D().reset(),await eQ())})())},eX=()=>{eV&&(eR.stop(),(a.singingVoices??M)?.stopStream(),eW())};I.addEventListener("click",()=>{eV?eX():eK()});let eJ={play:eK,stop:eX,isPlaying:()=>eV,destroy:()=>{for(let e of(N.removeEventListener("click",J),eR.stop(),(a.singingVoices??M)?.stopStream(),tj===eJ&&(tj=null),B&&(B.close(),B=null),eE))clearTimeout(e);ex(),tH&&T.contains(tH)&&tq(),T.remove(),ez?.remove(),eh()}};return eJ},t_=`
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
`,tZ=`
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
    <li><strong>\u521D\u5FC3\u8005\u30E2\u30FC\u30C9</strong>: \u5404\u30C8\u30E9\u30C3\u30AF\u306E\u7279\u5FB4\u304B\u3089\u3001\u30E1\u30ED\u30C7\u30A3\u30FC\u30FB\u30B5\u30D6\u30E1\u30ED\u30FB\u30D9\u30FC\u30B9\u30FB\u4F34\u594F\u306E4\u3064\u306E\u5F79\u5272\u306B\u81EA\u52D5\u3067\u632F\u308A\u5206\u3051\u3089\u308C\u307E\u3059\u3002</li>
    <li><strong>\u4E0A\u7D1A\u8005\u30E2\u30FC\u30C9</strong>: MIDI\u306E\u30C8\u30E9\u30C3\u30AF\u69CB\u6210\u304C\u305D\u306E\u307E\u307E\u53CD\u6620\u3055\u308C\u307E\u3059\uFF081\u5BFE1\uFF09\u3002</li>
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
`,tX=`
<div class="dtm-modal-body-content">
  <h4>1. UTAU\u97F3\u6E90\u3092 .koe \u306B\u5909\u63DB\u3059\u308B</h4>
  <p>UTAU\u7528\u306E\u97F3\u6E90\uFF08zip\uFF09\u3092\u305D\u306E\u307E\u307E\u4F7F\u3046\u3053\u3068\u306F\u3067\u304D\u307E\u305B\u3093\u3002\u4E0B\u8A18\u306E\u5909\u63DB\u30B5\u30A4\u30C8\u3067 <code>.koe</code> \u5F62\u5F0F\u306B\u5909\u63DB\u3057\u3066\u304F\u3060\u3055\u3044\u3002</p>
  <p style="margin-top:4px;"><small>\u5909\u63DB\u30B5\u30A4\u30C8: <a href="https://onjmin.github.io/koe/demo/" target="_blank" rel="noopener">koe\u5909\u63DB\u30C7\u30E2\uFF08onjmin.github.io/koe/demo\uFF09</a></small></p>

  <h4>2. \u5909\u63DB\u3057\u305F .koe \u3092\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3059\u308B</h4>
  <p>\u5909\u63DB\u5F8C\u306E <code>.koe</code> \u30D5\u30A1\u30A4\u30EB\u306F\u3001\u8AB0\u3067\u3082\u76F4\u63A5\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3067\u304D\u308B\u5F62\u3067\u30CD\u30C3\u30C8\u4E0A\u306B\u7F6E\u304F\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\uFF08\u30ED\u30FC\u30AB\u30EB\u306E\u30D5\u30A1\u30A4\u30EB\u30D1\u30B9\u306F\u4F7F\u3048\u307E\u305B\u3093\uFF09\u3002</p>
  <ul>
    <li><strong>Google\u30C9\u30E9\u30A4\u30D6</strong>: \u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u5F8C\u3001\u5171\u6709\u8A2D\u5B9A\u3092\u300C\u30EA\u30F3\u30AF\u3092\u77E5\u3063\u3066\u3044\u308B\u5168\u54E1\u300D\u306B\u5909\u66F4 \u2192 \u5171\u6709\u30EA\u30F3\u30AF\u306E<code>/d/</code>\u3068<code>/view</code>\u306E\u9593\u306EID\uFF08\u30D5\u30A1\u30A4\u30EBID\uFF09\u3092 controlled URL \u306B\u7D44\u307F\u8FBC\u3093\u3067\u76F4\u63A5\u30EA\u30F3\u30AF\u5316\u3057\u307E\u3059\uFF08\u4F8B: <code>https://drive.google.com/uc?export=download&id=\u30D5\u30A1\u30A4\u30EBID</code>\uFF09\u3002</li>
    <li>\u305D\u306E\u4ED6\u3001\u76F4\u63A5\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9URL\u3092\u767A\u884C\u3067\u304D\u308B\u30DB\u30B9\u30C6\u30A3\u30F3\u30B0\uFF08GitHub Pages\u3001Cloudflare R2 \u306A\u3069\uFF09\u3067\u3082\u69CB\u3044\u307E\u305B\u3093\u3002</li>
  </ul>

  <h4>3. DTM\u3067\u4F7F\u3046</h4>
  <ul>
    <li>\u6B4C\u5531\u30E2\u30C7\u30EB\u306E\u30D7\u30EB\u30C0\u30A6\u30F3\u304B\u3089\u300C\u30AB\u30B9\u30BF\u30E0\u97F3\u6E90\u3092\u8FFD\u52A0\u2026\u300D\u3092\u9078\u3073\u307E\u3059\u3002</li>
    <li>\u300C\u97F3\u6E90URL\u300D\u306B\u624B\u98062\u306E\u76F4\u63A5\u30EA\u30F3\u30AF\u3092\u8CBC\u308A\u4ED8\u3051\u307E\u3059\u3002</li>
    <li>\u30A2\u30A4\u30B3\u30F3\u753B\u50CFUR\u30EB\u30FB\u8868\u793A\u540D\u30FB\u8B58\u5225\u5B50\u306F\u4EFB\u610F\u3067\u3059\uFF08\u7701\u7565\u53EF\uFF09\u3002</li>
    <li>\u300C\u8FFD\u52A0\u300D\u3092\u62BC\u3059\u3068\u30D7\u30EB\u30C0\u30A6\u30F3\u306B\u767B\u9332\u3055\u308C\u3001\u4EE5\u964D\u305D\u306E\u30C8\u30E9\u30C3\u30AF\u3067\u4F7F\u3048\u307E\u3059\u3002</li>
  </ul>
  <p style="margin-top:4px;"><small>\u203B\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3057\u305F\u97F3\u6E90\u306F\u81EA\u5DF1\u8CAC\u4EFB\u3067\u7BA1\u7406\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u6A29\u5229\u95A2\u4FC2\uFF08\u914D\u5E03\u5143\u306E\u5229\u7528\u898F\u7D04\uFF09\u306B\u3082\u5F93\u3063\u3066\u304F\u3060\u3055\u3044\u3002</small></p>
</div>
`,tJ=[{id:"melody",name:"メロディー",color:[41,173,255],instrument:0,volume:100},{id:"submelody",name:"サブメロ",color:[255,119,168],instrument:1,volume:95},{id:"bass",name:"ベース",color:[0,228,54],instrument:2,volume:88},{id:"chord",name:"伴奏",color:[255,163,0],instrument:3,volume:76}],t0=[{id:"t0",name:"トラック1",color:[41,173,255],instrument:0,volume:100},{id:"t1",name:"トラック2",color:[0,228,54],instrument:1,volume:100},{id:"t2",name:"トラック3",color:[255,119,168],instrument:2,volume:100},{id:"t3",name:"トラック4",color:[255,163,0],instrument:3,volume:100},{id:"t4",name:"トラック5",color:[255,236,39],instrument:4,volume:100},{id:"t5",name:"トラック6",color:[131,118,156],instrument:5,volume:100},{id:"t6",name:"トラック7",color:[255,0,77],instrument:6,volume:100},{id:"t7",name:"トラック8",color:[255,204,170],instrument:7,volume:100},{id:"t8",name:"トラック9",color:[194,195,199],instrument:8,volume:100},{id:"t9",name:"トラック10",color:[0,135,81],instrument:9,volume:100},{id:"t10",name:"トラック11",color:[171,82,54],instrument:10,volume:100},{id:"t11",name:"トラック12",color:[126,37,83],instrument:11,volume:100},{id:"t12",name:"トラック13",color:[255,241,232],instrument:12,volume:100},{id:"t13",name:"トラック14",color:[120,200,255],instrument:13,volume:100},{id:"t14",name:"トラック15",color:[100,255,160],instrument:14,volume:100}],t3=["klatt",...Object.keys(eK)],t1={klatt:"軽量ロボ声",...eY},t2=(e,t)=>t1[e]??t.get(e)?.label??e,t5="+custom",t6=/^[a-zA-Z_][a-zA-Z0-9_]*$/,t4=(e,t,a)=>Math.min(Math.max(e,t),a),t8=e=>{if(!e)return"";let t=e.replace(/\s+/g,"").toLowerCase();return g.find(e=>e.replace(/\s+/g,"").toLowerCase()===t)??e},t9=void 0===Number.MAX_SAFE_INTEGER?0x1fffffffffffff:Number.MAX_SAFE_INTEGER,t7=new WeakMap,ae=(t=(e,t)=>(t7.set(e,t),t),e=>{let a=t7.get(e),o=void 0===a?e.size:a<0x40000000?a+1:0;if(!e.has(o))return t(e,o);if(e.size<0x20000000){for(;e.has(o);)o=Math.floor(0x40000000*Math.random());return t(e,o)}if(e.size>t9)throw Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;e.has(o);)o=Math.floor(Math.random()*t9);return t(e,o)}),at=(a=new WeakMap,r=e=>{if(a.has(e))return a.get(e);let t=new Map;return a.set(e,t),t},o=new WeakMap,u=e=>({...e,connect:({call:e})=>async()=>{let{port1:t,port2:a}=new MessageChannel,r=await e("connect",{port:t},[t]);return o.set(a,r),a},disconnect:({call:e})=>async t=>{let a=o.get(t);if(void 0===a)throw Error("The given port is not connected.");await e("disconnect",{portId:a})},isSupported:({call:e})=>()=>e("isSupported")}),n=e=>"function"==typeof e.start,e=>{let t=u(e);return e=>{let a=r(e);e.addEventListener("message",({data:e})=>{let{id:t}=e;if(null!==t&&a.has(t)){let{reject:o,resolve:r}=a.get(t);a.delete(t),void 0===e.error?r(e.result):o(Error(e.error.message))}}),n(e)&&e.start();let o=(t,o=null,r=[])=>new Promise((u,n)=>{let l=ae(a);a.set(l,{reject:n,resolve:u}),null===o?e.postMessage({id:l,method:t},r):e.postMessage({id:l,method:t,params:o},r)}),u=(t,a,o=[])=>{e.postMessage({id:null,method:t,params:a},o)},l={};for(let[e,a]of Object.entries(t))l={...l,[e]:a({call:o,notify:u})};return{...l}}})({parseArrayBuffer:({call:e})=>async t=>e("parse",{arrayBuffer:t},[t])}),aa=new Blob(['(()=>{var e={455(e,t){!function(e){"use strict";var t=function(e){return function(t){var n=e(t);return t.add(n),n}},n=function(e){return function(t,n){return e.set(t,n),n}},r=void 0===Number.MAX_SAFE_INTEGER?9007199254740991:Number.MAX_SAFE_INTEGER,o=536870912,s=2*o,i=function(e,t){return function(n){var i=t.get(n),a=void 0===i?n.size:i<s?i+1:0;if(!n.has(a))return e(n,a);if(n.size<o){for(;n.has(a);)a=Math.floor(Math.random()*s);return e(n,a)}if(n.size>r)throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;n.has(a);)a=Math.floor(Math.random()*r);return e(n,a)}},a=new WeakMap,f=n(a),c=i(f,a),u=t(c);e.addUniqueNumber=u,e.generateUniqueNumber=c}(t)}},t={};function n(r){var o=t[r];if(void 0!==o)return o.exports;var s=t[r]={exports:{}};return e[r].call(s.exports,s,s.exports,n),s.exports}(()=>{"use strict";const e=-32603,t=-32602,r=-32601,o=(e,t)=>Object.assign(new Error(e),{status:t}),s=t=>o(\'The handler of the method called "\'.concat(t,\'" returned an unexpected result.\'),e),i=(t,n)=>async({data:{id:i,method:a,params:f}})=>{const c=n[a];try{if(void 0===c)throw(e=>o(\'The requested method called "\'.concat(e,\'" is not supported.\'),r))(a);const n=void 0===f?c():c(f);if(void 0===n)throw(t=>o(\'The handler of the method called "\'.concat(t,\'" returned no required result.\'),e))(a);const u=n instanceof Promise?await n:n;if(null===i){if(void 0!==u.result)throw s(a)}else{if(void 0===u.result)throw s(a);const{result:e,transferables:n=[]}=u;t.postMessage({id:i,result:e},n)}}catch(e){const{message:n,status:r=-32603}=e;t.postMessage({error:{code:r,message:n},id:i})}};var a=n(455);const f=new Map,c=(e,n,r)=>({...n,connect:({port:t})=>{t.start();const r=e(t,n),o=(0,a.generateUniqueNumber)(f);return f.set(o,()=>{r(),t.close(),f.delete(o)}),{result:o}},disconnect:({portId:e})=>{const n=f.get(e);if(void 0===n)throw(e=>o(\'The specified parameter called "portId" with the given value "\'.concat(e,\'" does not identify a port connected to this worker.\'),t))(e);return n(),{result:null}},isSupported:async()=>{if(await new Promise(e=>{const t=new ArrayBuffer(0),{port1:n,port2:r}=new MessageChannel;n.onmessage=({data:t})=>e(null!==t),r.postMessage(t,[t])})){const e=r();return{result:e instanceof Promise?await e:e}}return{result:!1}}}),u=(e,t,n=()=>!0)=>{const r=c(u,t,n),o=i(e,r);return e.addEventListener("message",o),()=>e.removeEventListener("message",o)},l=e=>void 0!==e.channel,d=e=>e.toString(16).toUpperCase().padStart(2,"0"),g=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=[],s=new Uint8Array(e.buffer,r,n);for(let e=0;e<n;e+=1)o[e]=d(s[e]);return o.join("")},h=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=new Uint8Array(e.buffer,r,n);return String.fromCharCode.apply(null,o)},m=e=>{const t=new DataView(e),n=v(t);let r=14;const o=[];for(let e=0,s=n.numberOfTracks;e<s;e+=1){let e;({offset:r,track:e}=b(t,r)),o.push(e)}return{division:n.division,format:n.format,tracks:o}},p=(e,t,n)=>{let r;const{offset:o,value:s}=T(e,t),i=e.getUint8(o);return r=240===i?y(e,o+1):255===i?U(e,o+1):w(i,e,o+1,n),{...r,event:{...r.event,delta:s},eventTypeByte:i}},v=e=>{if(e.byteLength<14)throw new Error("Expected at least 14 bytes instead of ".concat(e.byteLength));if("MThd"!==h(e,0,4))throw new Error(\'Unexpected characters "\'.concat(h(e,0,4),\'" found instead of "MThd"\'));if(6!==e.getUint32(4))throw new Error("The header has an unexpected length of ".concat(e.getUint32(4)," instead of 6"));const t=e.getUint16(8),n=e.getUint16(10);return{division:e.getUint16(12),format:t,numberOfTracks:n}},U=(e,t)=>{let n;const r=e.getUint8(t),{offset:o,value:s}=T(e,t+1);if(1===r)n={text:h(e,o,s)};else if(2===r)n={copyrightNotice:h(e,o,s)};else if(3===r)n={trackName:h(e,o,s)};else if(4===r)n={instrumentName:h(e,o,s)};else if(5===r)n={lyric:h(e,o,s)};else if(6===r)n={marker:h(e,o,s)};else if(7===r)n={cuePoint:h(e,o,s)};else if(8===r)n={programName:h(e,o,s)};else if(9===r)n={deviceName:h(e,o,s)};else if(10===r||11===r||12===r||13===r||14===r||15===r)n={metaTypeByte:d(r),text:h(e,o,s)};else if(32===r)n={channelPrefix:e.getUint8(o)};else if(33===r)n={midiPort:e.getUint8(o)};else if(47===r)n={endOfTrack:!0};else if(81===r)n={setTempo:{microsecondsPerQuarter:(e.getUint8(o)<<16)+(e.getUint8(o+1)<<8)+e.getUint8(o+2)}};else if(84===r){let t;const r=e.getUint8(o);96&r?32==(96&r)?t=25:64==(96&r)?t=29:96&~r||(t=30):t=24,n={smpteOffset:{frame:e.getUint8(o+3),frameRate:t,hour:31&r,minutes:e.getUint8(o+1),seconds:e.getUint8(o+2),subFrame:e.getUint8(o+4)}}}else if(88===r)n={timeSignature:{denominator:Math.pow(2,e.getUint8(o+1)),metronome:e.getUint8(o+2),numerator:e.getUint8(o),thirtyseconds:e.getUint8(o+3)}};else if(89===r)n={keySignature:{key:e.getInt8(o),scale:e.getInt8(o+1)}};else{if(127!==r)throw new Error(\'Cannot parse a meta event with a type of "\'.concat(d(r),\'"\'));n={sequencerSpecificData:g(e,o,s)}}return{event:n,offset:o+s}},w=(e,t,n,r)=>{const o=128&e?null:r,s=(null===o?e:o)>>4;let i,a=null===o?n:n-1;if(8===s)i={noteOff:{noteNumber:t.getUint8(a),velocity:t.getUint8(a+1)}},a+=2;else if(9===s){const e=t.getUint8(a),n=t.getUint8(a+1);i=0===n?{noteOff:{noteNumber:e,velocity:n}}:{noteOn:{noteNumber:e,velocity:n}},a+=2}else if(10===s)i={keyPressure:{noteNumber:t.getUint8(a),pressure:t.getUint8(a+1)}},a+=2;else if(11===s)i={controlChange:{type:t.getUint8(a),value:t.getUint8(a+1)}},a+=2;else if(12===s)i={programChange:{programNumber:t.getUint8(a)}},a+=1;else if(13===s)i={channelPressure:{pressure:t.getUint8(a)}},a+=1;else{if(14!==s)throw new Error(\'Cannot parse a midi event with a type of "\'.concat(d(s),\'"\'));i={pitchBend:t.getUint8(a)|t.getUint8(a+1)<<7},a+=2}return i.channel=15&(null===o?e:o),{event:i,offset:a}},y=(e,t)=>{const{offset:n,value:r}=T(e,t);return{event:{sysex:g(e,n,r)},offset:n+r}},b=(e,t)=>{if("MTrk"!==h(e,t,4))throw new Error(\'Unexpected characters "\'.concat(h(e,t,4),\'" found instead of "MTrk"\'));const n=[],r=e.getUint32(t+4)+t+8;let o=null,s=t+8;for(;s<r;){const t=p(e,s,o),{event:r,eventTypeByte:i}=t;n.push(r),s=t.offset,l(r)&&(128&i)>0&&(o=i)}return{offset:s,track:n}},T=(e,t)=>{let n=t,r=0;for(;;){const t=e.getUint8(n);if(n+=1,!(t>127))return r+=t,{offset:n,value:r};r+=127&t,r<<=7}};u(self,{parse:({arrayBuffer:e})=>({result:m(e)})})})()})();'],{type:"application/javascript; charset=utf-8"}),ao=URL.createObjectURL(aa),ar=at(new Worker(ao));ar.connect,ar.disconnect,ar.isSupported;var au=ar.parseArrayBuffer;URL.revokeObjectURL(ao);var an=class e{constructor(e,t,a){this.zones=e,this.ch=t,this.isDrum=a}zones;ch;isDrum;static afterTime=.5;static fonts=new Map;static ch=-1;static toURL(e){return`https://surikov.github.io/webaudiofontdata/sound/${e}.js`}static async load({ctx:t,fontName:a,url:o,isDrum:r=!1,pitchs:u}){if(a in window||await new Promise((e,t)=>{let a=document.createElement("script");a.onload=()=>{e(a),a.remove()},a.onerror=t,a.src=o,document.head.append(a)}),!(a in window))throw Error("SoundFont is not found.");let{fonts:n}=e;if(!n.has(a)){let o=new Map,l=-1,i=window;for(let[e,r]of(await al(t,i[a].zones,u))){if(!r.buffer)continue;let{numberOfChannels:t}=r.buffer;l<t&&(l=t),o.set(Number(e),r)}e.ch<l&&(e.ch=l),n.set(a,new e(o,l,r))}let l=n.get(a);if(!l)throw Error("SoundFont load failed.");return l}play({ctx:t,destination:a,pitch:o=60,volume:r=1,when:u=0,duration:n=1}={}){t??=new AudioContext,a??=t.destination;let{zones:l,isDrum:i}=this;if(!l.has(o))return;let s=l.get(o);if(!s)return;let d=t.createBufferSource(),c=t.createGain(),m=u+t.currentTime,{buffer:p,_param:h}=s;if(!p||!h)return;d.buffer=p,d.playbackRate.setValueAtTime(h.playbackRate,0),Object.assign(d,h.src);let f=n+e.afterTime,g=m+(i?p.duration:d.loop?f:Math.min(f,h.max));c.gain.setValueAtTime(r,t.currentTime),i||c.gain.linearRampToValueAtTime(0,g),d.connect(c).connect(a),d.start(m),d.stop(g)}},al=(e,t,a=[])=>{if(!a.length)for(let e of t){let t=0|e.keyRangeLow,o=0|e.keyRangeHigh;if(!(t>o))for(let e=t;e<=o;e++)a.push(e)}let o=new Set(a),r=new Map(a.map(e=>[e,t[0]]));for(let e=t.length-1;e>=0;e--)for(let a of o){let u=t[e];a<u.keyRangeLow||a>u.keyRangeHigh+1||(o.delete(a),r.set(a,{...u}))}return Promise.all([...r].map(async([t,a])=>(await ai(e,a),await as(a,t),[t,a])))},ai=async(e,t)=>{if(!t.buffer){if(t.delay=0,t.sample){let a=atob(t.sample);t.buffer=e.createBuffer(1,a.length/2,t.sampleRate);let o=t.buffer.getChannelData(0);for(let e=0;e<a.length/2;e++){let t=a.charCodeAt(2*e),r=a.charCodeAt(2*e+1);t<0&&(t=256+t),r<0&&(r=256+r);let u=256*r+t;u>=32768&&(u-=65536),o[e]=u/65536}}else if(t.file){let a=Uint8Array.from(atob(t.file),e=>e.charCodeAt(0)).buffer;if("interrupted"===e.state)try{await e.resume()}catch{}try{t.buffer=await e.decodeAudioData(a)}catch(e){throw console.error(`[zone.file format] keyRange: ${t.keyRangeLow}-${t.keyRangeHigh} - Decode failed:`,e),e}}if(t.buffer&&t.loopStart>=1&&t.loopStart<t.loopEnd&&(t.loopEnd-t.loopStart)/t.sampleRate<.03){let a=t.buffer,o=a.sampleRate,r=o/t.sampleRate,u=Math.round(t.loopStart*r),n=Math.round(t.loopEnd*r),l=n-u;if(l>0){let r=Math.ceil(Math.round(.2*o)/l),i=Math.min(u,a.length),s=Math.max(0,a.length-n),d=i+l*r+s,c=0,m=0;if(a.numberOfChannels>0){let e=a.getChannelData(0);for(let t=0;t<e.length;t++){let a=Math.abs(e[t]);a>c&&(c=a),t>=u&&t<n&&a>m&&(m=a)}}let p=1;m>0&&c>0&&m<.8*c&&(p=.75*c/m)>20&&(p=20);try{let c=e.createBuffer(a.numberOfChannels,d,o);for(let e=0;e<a.numberOfChannels;e++){let t=a.getChannelData(e),o=c.getChannelData(e);o.set(t.subarray(0,i),0);let d=i,m=t.subarray(u,n),h=new Float32Array(l);for(let e=0;e<l;e++)h[e]=m[e]*p;for(let e=0;e<r;e++)o.set(h,d),d+=l;if(s>0&&n<a.length){let e=t.subarray(n);if(1!==p){let t=new Float32Array(s);for(let a=0;a<s;a++)t[a]=e[a]*p;o.set(t,d)}else o.set(e,d)}}t.buffer=c,t.loopEnd=t.loopStart+(t.loopEnd-t.loopStart)*r}catch(e){console.warn("[SoundFont.loopExtension] Failed to extend loop buffer:",e)}}}for(let[e,a]of[["loopStart",0],["loopEnd",0],["coarseTune",0],["fineTune",0],["originalPitch",6e3],["sampleRate",44100],["sustain",0]])Number.isNaN(Number(t[e]))&&(t[e]=a)}},as=(e,t)=>{let{originalPitch:a,loopStart:o,loopEnd:r,coarseTune:u,fineTune:n,sampleRate:l,delay:i,buffer:s}=e,d=2**((100*t-(a-100*u-n))/1200),c=(s?.duration??0)/d,m={loop:o>=1&&o<r};m.loop&&([m.loopStart,m.loopEnd]=[o,r].map(e=>e/l+i)),e._param={playbackRate:d,max:c,src:m}},ad=(e,t,a)=>{e.has(t)||e.set(t,new a);let o=e.get(t);if(void 0===o)throw Error("touch: unexpected undefined");return o},ac=new class{font=null;fonts=new Map;async load({ctx:e,font:t,id:a,keys:o}){let r=ad(ad(this.fonts,t,Map),a,Map);if(!r.size)for(let[u,n]of(await Promise.all([...o].map(async o=>{let r=`${o}_${a}_${t}`;return[Number(o),await an.load({ctx:e,fontName:`_drum_${r}`,url:`https://surikov.github.io/webaudiofontdata/sound/128${r}.js`,isDrum:!0,pitchs:[o]})]}))))r.set(u,n);this.font=r}play(e){let{font:t}=this;if(!t)return;let a=e?.pitch??60;t.has(a)&&t.get(a)?.play(e)}},am=(e,t,a)=>{e.has(t)||e.set(t,new a);let o=e.get(t);if(void 0===o)throw Error("touch: unexpected undefined");return o},ap=new class{tone=new Map;drum=new Map;callback=new Set;onload(e){this.callback.add(e)}async init(){let e=await fetch("https://surikov.github.io/webaudiofontdata/sf2/list.txt"),t=await e.text(),{tone:a,drum:o}=this;for(let e of t.trim().split("\n"))if("128"===e.slice(0,3)){let t=e.slice(3).split("_"),[a,r]=t;am(am(o,t.slice(2).join("_").slice(0,-3),Map),r,Set).add(a)}else{let t=e.split("_"),[o]=t;am(a,t.slice(1).join("_").slice(0,-3),Set).add(o)}for(let e of this.callback)e();this.callback.clear()}},ah=["melody","submelody","bass","chord","t4","t5","t6","t7","t8","t9","t10","t11","t12","t13","t14"],af=async(t={})=>{let a,o={midi:!0,chord:!0,presetUI:!0,...t.features},r=t.audioContext??new AudioContext({sampleRate:44100}),u=r.createGain();u.gain.value=t.masterVolume??1,u.connect(r.destination);let n=r.createGain();n.gain.value=t.drumVolume??1,n.connect(r.destination);let h=()=>"closed"===r.state?Promise.resolve():r.resume(),v=t.engines??{},y=v.SoundFont??an,b=v.SoundFont_drum??ac,F=v.SoundFont_list??ap;o.midi&&(a=v.parseMidi||(e=>{let t=e.buffer;if(t instanceof ArrayBuffer)return au(t.slice(e.byteOffset,e.byteOffset+e.byteLength));throw Error("SharedArrayBuffer is not supported for MIDI parsing")}));let C=tt(r,u,{voiceWorkerUrl:null===t.voiceWorkerUrl?void 0:t.voiceWorkerUrl??(()=>{try{return new e.U(e.r(54845)).href}catch{return}})(),voicebanks:t.koeBaseUrl?Object.fromEntries(Object.entries(eK).map(([e,a])=>[e,eX(a,t.koeBaseUrl)])):void 0,worldlineScriptUrl:t.worldlineScriptUrl}),A=new Promise(e=>{F.init(),F.onload(()=>e())}),x=(async()=>{try{await b.load({ctx:r,font:"FluidR3_GM_sf2_file",id:"0",keys:Object.values(eg)})}catch(e){console.error("[dtm] ドラム音源の読み込みに失敗",e)}})(),E={},B=e=>{if(E[e])return E[e];let t=e.replace(/\s+/g,"").toLowerCase(),a=Object.keys(E).find(e=>e.replace(/\s+/g,"").toLowerCase()===t);return a?E[a]:void 0},w=new Map,k=new Map,S=e=>{if(w.has(e))return Promise.resolve();let t=k.get(e);if(t)return t;let a=`${e}_FluidR3_GM_sf2_file`,o=y.load({ctx:r,fontName:`_tone_${a}`,url:y.toURL(a)}).then(t=>{w.set(e,t)}).catch(t=>{console.error(`[dtm] \u697D\u5668 "${e}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557`,t)}).finally(()=>{k.delete(e)});return k.set(e,o),o},M=t.defaultPreset??"retro_game",D=(e,t="simple")=>"simple"!==t?ah[e]??`t${e}`:0===e?"melody":1===e?"submelody":2===e?"bass":"chord",L=(e,t="simple")=>{if("melody"===e||"submelody"===e||"bass"===e||"chord"===e)return e;if(e.startsWith("t")){let a=Number(e.substring(1));if(!Number.isNaN(a))return D(a,t)}return e},N=(e,t)=>e[t]??e.melody,T=(e,t,a="simple")=>{let o=ey[e];if(!o)return;let r=E[N(o,L(t,a))];return r?w.get(r):void 0},P=async(e,t=[...ah],a="simple")=>{let o=ey[e];if(!o)return;await A;let r=new Set;for(let e of t){let t=E[N(o,L(e,a))];t&&r.add(t)}await Promise.all([...r].map(e=>S(e)))},I=async(e,t,a,o,r="simple")=>{let u="playing"===e.getPlaybackState();u&&e.pause();let n=o?tO(o):null;e.setLoading?.(!0);try{e.setInstrument(t),await P(t,a,r)}finally{n?.remove(),e.setLoading?.(!1),u&&e.play()}},O=(e,t)=>{let a=e.ownerDocument,o=a.createElement("div");if(o.className=t.className??"dtm-controlbar",null!==t.label){let e=a.createElement("span");e.className="dtm-controlbar-label",e.textContent=t.label??"楽器プリセット",o.appendChild(e)}let r=a.createElement("select");for(let[e,t]of(r.className="dtm-select dtm-grow",Object.entries(ey))){let o=a.createElement("option");o.value=e,o.textContent=t.displayName,r.appendChild(o)}r.value=t.value&&ey[t.value]?t.value:M,o.appendChild(r);let u=!1,n=async()=>{let e=t.getDaw();if(!e||u)return;u=!0;let a=r.value;t.onChange?.(a);let o=t.getTrackIds?.()??[...ah],n=o.includes("t0");try{await I(e,a,o,t.loadingTarget,n?"advanced":"simple")}finally{u=!1}};return r.addEventListener("change",n),"prepend"===t.position?e.insertBefore(o,e.firstChild):e.appendChild(o),{element:o,select:r,setValue:e=>{ey[e]&&(r.value=e)},getValue:()=>r.value,destroy:()=>{r.removeEventListener("change",n),o.remove()}}};await A,E=await f(),await Promise.all([x,P(M)]);let z=e=>{b.font&&b.play({ctx:r,destination:n,pitch:e.pitch,volume:e.velocity,when:e.when,duration:e.duration})},U=new WeakMap,R=[],j=[],V=[],$=(e,t={})=>{let{preset:n,presetUI:f,onInstrumentChange:v,onTrackInstrumentChange:y,...b}=t,F=b.tracks??tJ,x=F.map(e=>e.id),E=n&&ey[n]?n:M,k=t.initialMML?tS(t.initialMML):{},D=k.instrument&&ey[k.instrument]?k.instrument:E,L=D,N="advanced"===b.mode,I=new Map;if(k.trackInstruments)for(let[e,t]of Object.entries(k.trackInstruments)){let a=Number(e),o=B(t);o&&I.set(a,o)}let j=null,V=async(e,t)=>{if(!t)return void I.delete(e);await A;let a=B(t);a&&(I.set(e,a),await S(a))},$={getAudioTime:()=>r.currentTime,onResumeAudio:h,onPlayNote:e=>{let t,a=F.findIndex(t=>t.id===e.trackId),o=a>=0?I.get(a):void 0;(t=o?w.get(o):T(L,e.trackId,N?"advanced":"simple"))&&t.play({ctx:r,destination:u,pitch:e.pitch,volume:e.volume,when:e.when,duration:e.duration})},onPlayDrum:z,singingVoices:C,parseMidi:a,onInstrumentChange:e=>{L=e,j&&j.setValue(e),v?.(e)},onTrackInstrumentChange:(e,t)=>{V(e,t),y?.(e,t)},...b},H=((e,t={})=>{let a,o,r,u,n,h,f,v,y,b,F;tI();let C=t.getAudioTime??(()=>performance.now()/1e3),A=t.tracks??tJ,x=t.mode??(A.length>tJ.length?"advanced":"simple"),E="advanced"===x,B=t.drumPatterns??ev,w=!!t.parseMidi,k=!E,S=((e,t)=>{let{drumPatternNames:a,defaultDrumPattern:o,defaultBpm:r,showMidi:u}=t,n=['<option value="none">なし</option>'].concat(a.map(e=>`<option value="${e}" ${e===o?"selected":""}>${e}</option>`)).join("");e.innerHTML=`
<div class="dtm-daw" data-dtm="root">
  <div class="dtm-topbar" data-dtm="transport">
    <div class="dtm-topbar-row1">
      <button class="dtm-iconbtn" data-dtm="prev-bar" title="1\u5C0F\u7BC0\u524D">${ef("chevronLeft")}</button>
      <button class="dtm-play" data-dtm="play" disabled>${ef("play")}</button>
      <button class="dtm-iconbtn" data-dtm="next-bar" title="1\u5C0F\u7BC0\u5F8C">${ef("chevronRight")}</button>
      <label class="dtm-toggle"><input type="checkbox" data-dtm="solo"><span>\u30BD\u30ED</span></label>
      <span class="dtm-topbar-loading dtm-blink" data-dtm="topbar-loading">... LOADING ...</span>
      <span class="dtm-grow"></span>
      <span class="dtm-label">BPM</span>
      <input type="number" class="dtm-input dtm-input--num" data-dtm="bpm" value="${r}" min="20" max="300">
    </div>
    <div class="dtm-tracks" data-dtm="track-tabs"></div>
  </div>

  <div class="dtm-tooldock">
    <div class="dtm-seg">
      <button class="dtm-segbtn dtm-segbtn--active" data-dtm="tool-pen" title="\u30DA\u30F3">${ef("pen")}</button>
      <button class="dtm-segbtn" data-dtm="tool-select" title="\u9078\u629E">${ef("select")}</button>
      <button class="dtm-segbtn" data-dtm="tool-eraser" title="\u6D88\u3057\u30B4\u30E0">${ef("eraser")}</button>
    </div>
    <button class="dtm-iconbtn" data-dtm="undo" title="\u5143\u306B\u623B\u3059" disabled>${ef("undo")}</button>
    <button class="dtm-iconbtn" data-dtm="redo" title="\u3084\u308A\u76F4\u3057" disabled>${ef("redo")}</button>
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

  <details class="dtm-panel ${u?"":"dtm-hidden"}" data-dtm="midi-panel">
    <summary>MIDI / MML \u5165\u529B</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row" style="flex-wrap:nowrap">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; flex-shrink:0;">
          <span class="dtm-label" style="line-height: 1;">MIDI</span>
          <button class="dtm-infobtn" data-dtm="midi-info" title="MIDI\u306E\u8AAD\u307F\u8FBC\u307F\u89E3\u8AAC">${ef("info",12)}</button>
        </div>
        <input type="file" class="dtm-input dtm-grow" accept=".mid,.midi" data-dtm="midi-input" style="min-width:0">
        <button class="dtm-btn dtm-btn--success" data-dtm="midi-load" style="flex-shrink:0">\u8AAD\u8FBC</button>
      </div>
      <div class="dtm-row dtm-hidden" data-dtm="midi-track-selection"></div>
      <div class="dtm-row" style="flex-wrap:nowrap">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; flex-shrink:0;">
          <span class="dtm-label" style="line-height: 1;">MML</span>
          <button class="dtm-infobtn" data-dtm="mml-info" title="MML\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${ef("info",12)}</button>
        </div>
        <textarea class="dtm-textarea dtm-grow" data-dtm="mml-input" placeholder="MML\u3092\u5165\u529B"></textarea>
        <button class="dtm-btn dtm-btn--primary" data-dtm="mml-load" style="flex-shrink:0">\u8AAD\u8FBC</button>
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
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-full" title="\u30B3\u30D4\u30FC">${ef("copy")}</button>
        </div>
        <div class="dtm-output-label">\uFF11\u884C\u7248</div>
        <div class="dtm-output-row">
          <pre><code data-dtm="output-mini"></code></pre>
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-mini" title="\u30B3\u30D4\u30FC">${ef("copy")}</button>
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

</div>`;let l=e.querySelector('[data-dtm="root"]'),i=e=>{let t;return t=`[data-dtm="${e}"]`,l.querySelector(t)};return{root:l,topbar:i("transport"),topbarLoading:i("topbar-loading"),playBtn:i("play"),prevBarBtn:i("prev-bar"),nextBarBtn:i("next-bar"),soloCheckbox:i("solo"),toolPen:i("tool-pen"),toolSelect:i("tool-select"),toolEraser:i("tool-eraser"),undoBtn:i("undo"),redoBtn:i("redo"),noteLengthSelect:i("note-length"),bpmInput:i("bpm"),zoomXLabel:i("zoomx-label"),zoomYLabel:i("zoomy-label"),zoomXIn:i("zoomx-in"),zoomXOut:i("zoomx-out"),zoomYIn:i("zoomy-in"),zoomYOut:i("zoomy-out"),rollContainer:i("roll"),wrapper:i("wrapper"),vScroll:i("vscroll"),vScrollThumb:i("vscroll-thumb"),hScroll:i("hscroll"),hScrollThumb:i("hscroll-thumb"),masterVolume:i("master-volume"),masterVolumeLabel:i("master-volume-label"),trackTabs:i("track-tabs"),trackBody:i("track-body"),drumSelect:i("drum-select"),drumVolume:i("drum-volume"),drumVolumeLabel:i("drum-volume-label"),midiInput:i("midi-input"),midiLoadBtn:i("midi-load"),midiInfoBtn:i("midi-info"),midiTrackSelection:i("midi-track-selection"),midiPanel:i("midi-panel"),mmlInput:i("mml-input"),mmlLoadBtn:i("mml-load"),mmlLoadNote:i("mml-load-note"),shiftSelect:i("shift-select"),shiftApplyBtn:i("shift-apply"),macroClear:i("macro-clear"),macroRandom:i("macro-random"),macroHarmonic:i("macro-harmonic"),macroMono:i("macro-mono"),exportMidiBtn:i("export-midi"),generateMmlBtn:i("generate-mml"),decomposeChordToggle:i("decompose-chord"),ignoreChordHeavyToggle:i("ignore-chord-heavy"),barLimitSelect:i("bar-limit"),outputContainer:i("output-container"),outputStatus:i("output-status"),outputFull:i("output-full"),outputMini:i("output-mini"),copyFullBtn:i("copy-full"),copyMiniBtn:i("copy-mini"),overlay:i("overlay"),mmlInfoBtn:i("mml-info"),modalOverlay:i("modal-overlay"),modalTitle:i("modal-title"),modalBody:i("modal-body"),modalClose:i("modal-close")}})(e,{tracks:A,drumPatternNames:Object.keys(B),defaultDrumPattern:B.dance?"dance":Object.keys(B)[0]??"none",defaultBpm:t.defaultBpm??120,showMidi:w,showChord:k}),M={stepsPerBar:192,keyCount:128,pitchRangeStart:0,keyHeight:15,stepWidth:1},D=100,L=100,N=t.defaultBpm??120,T=50,P=80,I=S.drumSelect.value,O="",z=t.initialActiveTrack??A[0].id,U="pen",R=48,j=12,V=0,$=t.initialScrollPitch??48,H=(M.keyCount-1-$)*M.keyHeight-215,G=0,q=!1,Q=new Set,K="stopped",Y=0,_=0,Z=!1,X=!1,J=new Map,ee=e=>{let t=e.key.toLowerCase();t3.includes(t)||J.set(t,{...e,key:t})},et=()=>{for(let e of(J.clear(),t.customVocals??[]))ee(e)};et();let ea=[],eo=null,er=[],eu=[],en=!1,el=null,ei=e=>{if(!t.onLyricsChange)return;let a=e.config.id,o={lyrics:e.lyrics,model:e.lyricModel,vocalVolume:e.vocalVolume,vocalGate:e.vocalGate,vocalPan:e.vocalPan,vocalOctave:e.vocalOctave};el&&clearTimeout(el),el=setTimeout(()=>{t.onLyricsChange?.(a,o),el=null},300)},es=new Set,ed=new Set,ec=()=>eu.find(e=>e.config.id===z)??eu[0],em=()=>{let e=0;for(let t of eu)for(let a of t.core.getNotes()){let t=a.startStep+a.durationSteps;t>e&&(e=t)}return 0===e?4*M.stepsPerBar:(Math.floor((e-1)/M.stepsPerBar)+2)*M.stepsPerBar},ep=()=>{let e=s;return Math.max(0,em()*M.stepWidth-e.width)},eh=()=>Math.max(0,M.keyCount*M.keyHeight-s.height),eg=()=>{for(let e of(((e=1)=>{tg(),tv(),m.clearRect(0,0,s.width,s.height);let{keyHeight:t,keyCount:a,stepWidth:o,stepsPerBar:r,pitchRangeStart:u}=p,n=Math.floor(tm/t)*t,l=tm+s.height;for(let e=n;e<l;e+=t){let o=a-1-e/t,r=o+u,n=o%12,l=th.has(n),i=0===n,d=4==Math.floor(r/12)-1,c=e-tm;m.fillStyle=l?"#080b16":"#111628",m.fillRect(0,c,s.width,t),d&&(m.fillStyle="rgba(41,173,255,0.05)",m.fillRect(0,c,s.width,t)),m.beginPath(),m.strokeStyle=i?"#3d405b":"#1a1d30",m.lineWidth=1;let p=c+t;m.moveTo(0,p),m.lineTo(s.width,p),m.stroke()}let i=e||48,d=Math.floor(tc/(o*i))*o*i,c=tc+s.width,h=o*i;for(let e=d;e<=c;e+=h){let t=e/o,a=t%r==0,u=t%i==0,n=e-tc;m.beginPath(),m.strokeStyle=a?"#3d405b":u?"#242840":"#1a1d30",m.lineWidth=a?2:1,m.moveTo(n,0),m.lineTo(n,s.height),m.stroke()}})(48),eu)){if(es.has(e.config.id)||q&&e.config.id!==z)continue;let[t,a,o]=e.config.color,r=e.config.id===z?1:.3;ty(e.core.getNotes(),[t,a,o,r])}if("select"===U&&eo){let e=m;e.save(),e.strokeStyle="#ffec27",e.lineWidth=2,e.setLineDash([4,4]),e.strokeRect(eo.x,eo.y,eo.width,eo.height),e.fillStyle="rgba(255,236,39,0.08)",e.fillRect(eo.x,eo.y,eo.width,eo.height),e.restore()}if("select"===U&&ea.length>0){let e=new Set(ea.map(e=>e.id)),t=ec();((e,t,a=[59,130,246,1])=>{let{keyHeight:o,stepWidth:r,keyCount:u,pitchRangeStart:n}=p;for(let l of e){if(!t.has(l.id))continue;let e=l.startStep*r,i=(u-1-(l.pitch-n))*o,s=l.durationSteps*r,d=e-tc,c=i-tm,p=void 0!==l.velocity?.5+l.velocity/127*.5:1,[h,f,g,v]=a,y=Math.min(255,1.3*h),b=Math.min(255,1.3*f),F=Math.min(255,1.3*g),C=v*p;m.fillStyle=`rgba(${y},${b},${F},${C})`,m.fillRect(d+1,c+1,s-2,o-2)}})(t.core.getNotes(),e,[...t.config.color,1])}(()=>{let e=m,t=s;if(!e)return;let a=G*M.stepWidth-V;a<-10||a>t.width+10||(e.save(),e.strokeStyle="#ffec27",e.lineWidth=2,e.setLineDash([4,4]),e.beginPath(),e.moveTo(a,0),e.lineTo(a,t.height),e.stroke(),e.restore())})(),"playing"===K&&(()=>{let e=m,t=s;if(!e)return;let a=_*M.stepWidth-V;a<0||a>t.width||(e.save(),e.strokeStyle="#ff004d",e.lineWidth=2,e.beginPath(),e.moveTo(a,0),e.lineTo(a,t.height),e.stroke(),e.restore())})(),eb()},eb=()=>{let e=s,t=ep(),a=S.hScroll.clientWidth;if(t<=0)S.hScrollThumb.style.width="100%",S.hScrollThumb.style.left="0";else{let o=em()*M.stepWidth,r=Math.max(40,e.width/o*a),u=V/t;S.hScrollThumb.style.width=`${r}px`,S.hScrollThumb.style.left=`${t4(u*(a-r),0,a-r)}px`}let o=M.keyCount*M.keyHeight,r=S.vScroll.clientHeight;if(o<=e.height)S.vScrollThumb.style.height="100%",S.vScrollThumb.style.top="0";else{let t=Math.max(40,e.height/o*r),a=eh(),u=H/a;S.vScrollThumb.style.height=`${t}px`,S.vScrollThumb.style.top=`${u*(r-t)}px`}},eF=!1,eC=!1,eA=null,ex=!1,eE="rect",eB=null,ew=[],ek=null,eS=e=>{if(X)return;t.onResumeAudio?.();let a=ec();eq(a.config.id,e,a.volume,100,0,.5)},eD=(e,t,a=0)=>{let o=ec(),{stepWidth:r,keyHeight:u,keyCount:n,pitchRangeStart:l}=M,i=tp();for(let s of o.core.getNotes()){let o=s.startStep*r,d=(n-1-(s.pitch-l))*u,c=s.durationSteps*r,m=o-i.x,p=d-i.y;if(e>=m-a&&e<=m+c+a&&t>=p-a&&t<=p+u+a)return s}return null},eL=()=>t.lockedTracks?.includes(ec().config.id)??!1,eN=e=>{e.preventDefault(),t.onResumeAudio?.();let{x:a,y:o,step:r,pitch:u}=tb(e),n=ec();if("eraser"===U){if(eL())return;let e=eD(a,o);e&&n.core.deleteNoteById(e.id);return}if("select"===U){if(ea.length>0){let e=eD(a,o);if(e&&ea.some(t=>t.id===e.id)){ew=ea.map(e=>({id:e.id,startStep:e.startStep,pitch:e.pitch})),ex=!0,eE="move",eB={x:a,y:o,step:r,pitch:u},eC=!1,ek=null;return}ea=[],eo=null}let e=eD(a,o);e?(ea=[e],ew=[{id:e.id,startStep:e.startStep,pitch:e.pitch}],ex=!0,eE="move"):(ea=[],eo=null,ex=!0,eE="rect"),eB={x:a,y:o,step:r,pitch:u},eC=!1;return}eC=!1;let l=eD(a,o,6);if(l){eS(l.pitch);let{stepWidth:e}=M,t=tp(),o=l.startStep*e-t.x,n=l.durationSteps*e;eA=a>=o+n-10&&a<=o+n?{noteId:l.id,mode:"resize",dragOffsetStep:0,dragOffsetPitch:0,startStep:l.startStep,durationSteps:l.durationSteps,lastPreviewPitch:l.pitch}:{noteId:l.id,mode:"move",dragOffsetStep:r-l.startStep,dragOffsetPitch:u-l.pitch,startStep:l.startStep,durationSteps:l.durationSteps,lastPreviewPitch:l.pitch},eF=!0;return}if(eL())return;let i=Math.floor(r/R)*R,s=i+R;if(!n.core.getNotes().some(e=>e.pitch===u&&i<e.startStep+e.durationSteps&&s>e.startStep)){n.core.addNote(i,u,{noteLengthSteps:R}),eS(u);let e=n.core.getNotes().find(e=>e.startStep===i&&e.pitch===u);e&&(eA={noteId:e.id,mode:"move",dragOffsetStep:0,dragOffsetPitch:0,startStep:e.startStep,durationSteps:e.durationSteps,lastPreviewPitch:e.pitch},eC=!0),eF=!0}},eT=e=>{let t=ec();if("pen"===U){if(!eA)return;let{step:o,pitch:r}=tb(e);if(eC=!0,"move"===eA.mode){var a;let e=Math.round((o-eA.dragOffsetStep)/j)*j,u=r-eA.dragOffsetPitch;if(a=eA.noteId,ec().core.getNotes().some(t=>t.id!==a&&t.pitch===u&&e>=t.startStep&&e<t.startStep+t.durationSteps))return;t.core.moveNote(eA.noteId,e,u),u!==eA.lastPreviewPitch&&(eA.lastPreviewPitch=u,eS(u));return}let u=Math.max(Math.round((o-eA.startStep+1)/j)*j,j);t.core.resizeNote(eA.noteId,u),eA.durationSteps=u,R=u,eg();return}if("select"===U&&ex&&eB){let{x:a,y:o,step:r,pitch:u}=tb(e);if("rect"===eE){let e={x:Math.min(a,eB.x),y:Math.min(o,eB.y),width:Math.abs(a-eB.x),height:Math.abs(o-eB.y)};eo=e;let{stepWidth:r,keyHeight:u,keyCount:n,pitchRangeStart:l}=M,i=tp();ea=t.core.getNotes().filter(t=>{let a=t.startStep*r,o=n-1-(t.pitch-l),s=a-i.x,d=o*u-i.y,c=t.durationSteps*r;return e.x<s+c&&e.x+e.width>s&&e.y<d+u&&e.y+e.height>d}),eg()}else{let e=Math.round((r-eB.step)/j)*j,a=u-eB.pitch;if(0!==e||0!==a){for(let o of(eC=!0,t.core.isBatchOperation||t.core.beginBatch(),ea)){let r=ew.find(e=>e.id===o.id);if(!r)continue;let u=r.pitch+a;u>=0&&u<128&&t.core.moveNote(o.id,r.startStep+e,u)}if(ea.length>0){let e=ea[0],t=ew.find(t=>t.id===e.id);if(t){let e=t.pitch+a;e!==ek&&e>=0&&e<128&&(ek=e,eS(e))}}}eg()}}},eI=()=>{if("pen"===U&&eA){if(eC){let e=ec();"move"===eA.mode?e.core.moveNoteEnd(eA.noteId):e.core.resizeNoteEnd(eA.noteId),eF=!0}eA=null,eC=!1}"select"===U&&ex&&(eC&&"move"===eE&&ea.length>0&&ec().core.endBatch(),ex=!1,eB=null,eC=!1,ek=null,eo=null,ew=[],eg())},eO=()=>{let e=S.rollContainer.clientWidth||800,t=S.rollContainer.clientHeight||450;((e,t=800,a=450,o)=>{p=o;let r=document.createElement("canvas");l=r,r.width=t-60,r.height=20,r.style.position="absolute",r.style.left="60px",r.style.top="0px";let u=r.getContext("2d");if(!u)throw Error("Failed to get 2D rendering context for header.");d=u;let n=document.createElement("canvas");i=n,n.width=60,n.height=a-20,n.style.position="absolute",n.style.left="0px",n.style.top="20px";let h=n.getContext("2d");if(!h)throw Error("Failed to get 2D rendering context for keyboard.");c=h;let f=document.createElement("canvas");s=f,f.width=t-60,f.height=a-20,f.style.position="absolute",f.style.left="60px",f.style.top="20px",f.style.touchAction="none";let g=f.getContext("2d",{willReadFrequently:!0});if(!g)throw Error("Failed to get 2D rendering context for grid.");m=g,e.innerHTML="",e.style.position="relative",e.style.width=`${t+60}px`,e.style.height=`${a}px`,e.append(r,n,f),(()=>{let e=i.parentElement;if(!e)return;let t=e.querySelector("#header-corner");t||((t=document.createElement("div")).id="header-corner",t.style.position="absolute",t.style.left="0px",t.style.top="0px",t.style.width="60px",t.style.height="20px",t.style.backgroundColor="#0a0f1f",t.style.borderRight="2px solid #29adff",t.style.borderBottom="2px solid #29adff",e.insertBefore(t,l))})()})(S.wrapper,e,t,M);let a=s;a.addEventListener("pointerdown",eN),a.addEventListener("dblclick",e=>{if(e.preventDefault(),eL())return;let{step:t,pitch:a}=tb(e),o=ec(),r=o.core.getNotes().find(e=>e.pitch===a&&t>=e.startStep&&t<e.startStep+e.durationSteps);r&&o.core.deleteNoteById(r.id)}),a.addEventListener("wheel",e=>{e.preventDefault(),H=t4(H+e.deltaY,0,eh()),tF(V=t4(V+e.deltaX,0,ep()),H),eg()},{passive:!1}),a.addEventListener("click",()=>{eF&&(eF=!1)});let o=l;o.addEventListener("click",e=>{if("playing"===K)return;let t=o.getBoundingClientRect();G=Math.max(0,Math.floor(Math.floor((e.clientX-t.left+V)/M.stepWidth)/j)*j),"paused"===K&&(K="stopped",eX()),eg()}),tF(V,H),eg()},ez=()=>{let e=s,t=(V+e.width/2)/M.stepWidth;M.stepWidth=2*D*.5/100,S.zoomXLabel.textContent=`${D}%`,tF(V=t4(t*M.stepWidth-e.width/2,0,ep()),H),eg()},eU=()=>{let e=s,t=(H+e.height/2)/M.keyHeight;M.keyHeight=15*L/100,S.zoomYLabel.textContent=`${L}%`,H=t4(t*M.keyHeight-e.height/2,0,eh()),tF(V,H),eg()},eR=()=>({zoomX:D,zoomY:L,decomposeChord:S.decomposeChordToggle.checked,ignoreChordHeavy:S.ignoreChordHeavyToggle.checked}),eV=()=>t.onViewStateChange?.(eR()),eq=(e,a,o,r,u,n)=>{let l=o/100*(r/127)*(T/100);t.onPlayNote?.({trackId:e,pitch:a,velocity:r,volume:l,when:u,duration:n})},eW=tN({getTracks:()=>eu.map(e=>({id:e.config.id,volume:e.volume,notes:e.core.getNotes()})),getBpm:()=>N,getPlayStartStep:()=>G,getDrumPattern:()=>B[I]??null,getSoloTrackId:()=>q?z:null,getAudioTime:C,onPlayNote:e=>{if(ed.has(e.trackId))return;let a=eu.findIndex(t=>t.config.id===e.trackId);a>=0&&Q.has(a)&&t.singingVoices||t.onPlayNote?.({...e,volume:e.volume*(T/100)})},onPlayDrum:e=>{let a=e.velocity*(P/100)*(T/100);t.onPlayDrum?.({...e,velocity:a})},onTick:e=>{_=e;let t=s.width/M.stepWidth,a=V/M.stepWidth+t-4;if(_>a){let e=Math.round(t/M.stepsPerBar);tF(V=t4(V+e*M.stepsPerBar*M.stepWidth,0,ep()),H)}eg()},onEnd:e=>{e?(K="paused",Y=_):(K="stopped",_=0),eX(),eg()},stepsPerBar:M.stepsPerBar}),eQ=async()=>{let e;if("playing"===K)return;await t.onResumeAudio?.();let a="paused"===K?Y:G;t.singingVoices?.reset();let o=(e=new Map,eu.forEach((t,a)=>{let o=t.lyricModel.trim(),r=t.lyrics.trim();if(!o||!r)return;let u=eP(r);0!==u.length&&e.set(a,{trackId:a,model:o.toLowerCase(),volume:t.vocalVolume,gate:t.vocalGate,pan:t.vocalPan,octave:t.vocalOctave,syllables:u})}),e);Q=new Set(o.keys());let r=60/N/48,u=t.singingVoices?[...o.values()].map(e=>{let t=eu[e.trackId],o=[...t?.core.getNotes()??[]].sort((e,t)=>e.startStep-t.startStep),u=(e.gate??100)/100,n=(e.octave??0)*12,l=Math.min(o.length,e.syllables.length),i=[];for(let t=0;t<l;t++){let l=o[t];l.startStep<a||i.push({syllable:e.syllables[t],pitch:l.pitch+n,startSec:(l.startStep-a)*r,durationSec:l.durationSteps*r*u})}return{id:t?.config.id,model:e.model,volume:ej(e.volume??200)*(T/100),pan:eG(e.pan??64),notes:i}}):[],n=t.singingVoices,l=!!n&&u.some(e=>e.notes.length>0);if(l&&n){let e=tO(S.rollContainer);tR(!0);try{J.size>0&&n.registerVoicebanks?.(Object.fromEntries([...J].map(([e,t])=>[e,t.url]))),await n.loadModels(u.map(e=>e.model)),await n.warm(u)}catch(e){console.warn("[dtm] voice preload failed",e)}finally{e.remove(),tR(!1)}}if("paused"!==K){let e=s;tF(V=t4(G*M.stepWidth-.5*e.width,0,ep()),H)}K="playing",eW.start(a),l&&n&&n.startStream(u,eW.getStartTime(),{isAudible:e=>!q||e.id===z}),eX()},eK=()=>{"playing"===K&&(Y=_,eW.stop(),t.singingVoices?.stopStream(),K="paused",eX())},eY=()=>{eW.stop(),t.singingVoices?.stopStream(),K="stopped",_=0,eX(),eg()},eX=()=>{let e="playing"===K;S.playBtn.innerHTML=ef(e?"pause":"play"),S.playBtn.classList.toggle("dtm-play--stop",e)},eJ=()=>{let e=ec().core;S.undoBtn.disabled=!e.canUndo(),S.redoBtn.disabled=!e.canRedo()},e0=()=>{for(let[e,t]of(S.trackTabs.innerHTML="",eu.entries())){let[a,o,r]=t.config.color,u=document.createElement("button");u.className=`dtm-pill ${t.config.id===z?"dtm-pill--active":""}`,u.style.setProperty("--dtm-pill-color",`rgb(${a},${o},${r})`),u.title=t.config.name,u.textContent=String(e+1),u.addEventListener("click",()=>e3(t.config.id)),S.trackTabs.appendChild(u)}let e=ec();S.trackBody.innerHTML=`
      <div class="dtm-row">
        <span class="dtm-label">\u30D9\u30ED\u30B7\u30C6\u30A3</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="track-vol" min="0" max="127" value="${e.volume}">
        <span class="dtm-label" data-dtm="track-vol-label">${e.volume}</span>
      </div>`;let o=S.trackBody.querySelector('[data-dtm="track-vol"]'),r=S.trackBody.querySelector('[data-dtm="track-vol-label"]');o.addEventListener("input",()=>{e.volume=Number.parseInt(o.value,10),e.core.setVolume(e.volume),r.textContent=String(e.volume)});let u=document.createElement("div");u.className="dtm-row",u.innerHTML='<span class="dtm-label">楽器</span>';let n=document.createElement("select");n.className="dtm-select dtm-grow";let l=document.createElement("option");l.value="",l.textContent="デフォルト（プリセット）",n.appendChild(l),["ピアノ","クロマティックパーカッション","オルガン","ギター","ベース","ストリングス","アンサンブル","ブラス","リード（木管）","パイプ","シンセリード","シンセパッド","シンセエフェクト","エスニック","パーカッシブ","サウンドエフェクト"].forEach((e,t)=>{let a=document.createElement("optgroup");a.label=e;for(let e=0;e<8;e++){let o=g[8*t+e];if(!o)break;let r=document.createElement("option");r.value=o,r.textContent=o,a.appendChild(r)}n.appendChild(a)}),n.value=t8(e.trackInstrument);let i=()=>{n.disabled=!!e.lyricModel,n.title=e.lyricModel?"歌詞モードのときは楽器を個別指定できません":""};if(i(),n.addEventListener("change",()=>{e.trackInstrument=n.value;let a=eu.indexOf(e);t.onTrackInstrumentChange?.(a,e.trackInstrument)}),u.appendChild(n),S.trackBody.appendChild(u),E||"chord"!==e.config.id){let t=document.createElement("div");t.className="dtm-row",t.style.flexDirection="column",t.style.alignItems="stretch",t.innerHTML=`
      <div class="dtm-row">
        <span class="dtm-label">\u266A UTAU</span>
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
      <div class="dtm-row dtm-hidden" data-dtm="lyric-custom" style="flex-direction:column;align-items:stretch;gap:4px">
        <div class="dtm-row" style="justify-content: space-between; align-items: center;">
          <a data-dtm="lyric-custom-conv-link" href="https://onjmin.github.io/koe/demo/" target="_blank" rel="noopener" style="font-size:11px;color:var(--dtm-primary);text-decoration:underline">UTAU\u97F3\u6E90(zip)\u3092.koe\u306B\u5909\u63DB</a>
          <button class="dtm-btn dtm-btn--ghost dtm-btn--xs" data-dtm="lyric-custom-guide">\u4F7F\u3044\u65B9\u30AC\u30A4\u30C9</button>
        </div>
        <input type="url" class="dtm-input" data-dtm="lyric-custom-src" placeholder="\u97F3\u6E90URL\uFF08https://\u301C.koe\uFF09" aria-label="\u30AB\u30B9\u30BF\u30E0\u97F3\u6E90\uFF08.koe\uFF09\u306EURL">
        <input type="url" class="dtm-input" data-dtm="lyric-custom-icon" placeholder="\u30A2\u30A4\u30B3\u30F3\u753B\u50CFURL\uFF08\u4EFB\u610F\uFF09" aria-label="\u30AB\u30B9\u30BF\u30E0\u97F3\u6E90\u306E\u30A2\u30A4\u30B3\u30F3\u753B\u50CFURL">
        <input type="text" class="dtm-input" data-dtm="lyric-custom-alias" placeholder="\u8868\u793A\u540D\uFF08\u4EFB\u610F\uFF09" aria-label="\u30AB\u30B9\u30BF\u30E0\u97F3\u6E90\u306E\u8868\u793A\u540D\uFF08\u30D7\u30EB\u30C0\u30A6\u30F3\u306E\u5225\u540D\uFF09" maxlength="64">
        <input type="text" class="dtm-input" data-dtm="lyric-custom-key" placeholder="\u8B58\u5225\u5B50\uFF08\u4EFB\u610F\u30FB\u7701\u7565\u3067\u81EA\u52D5\u63A1\u756A\u3001\u82F1\u5B57\u59CB\u307E\u308A\u82F1\u6570\u5B57\u3068_\uFF09" aria-label="\u30AB\u30B9\u30BF\u30E0\u97F3\u6E90\u306EMML\u8B58\u5225\u5B50\uFF08\u30AD\u30FC\uFF09" maxlength="32">
        <div class="dtm-row">
          <span class="dtm-label dtm-grow" data-dtm="lyric-custom-note" style="color:var(--dtm-warn)"></span>
          <button class="dtm-btn dtm-btn--primary" data-dtm="lyric-custom-apply">\u8FFD\u52A0</button>
        </div>
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
      </div>`,S.trackBody.appendChild(t);let o=t.querySelector('[data-dtm="lyric-model"]'),r=t.querySelector('[data-dtm="lyric-octave"]'),u=t.querySelector('[data-dtm="lyric-icon"]'),n=t.querySelector('[data-dtm="lyric-body"]'),l=t.querySelector('[data-dtm="lyric-input"]'),s=t.querySelector('[data-dtm="lyric-count"]'),d=t.querySelector('[data-dtm="lyric-vol"]'),c=t.querySelector('[data-dtm="lyric-vol-label"]'),m=t.querySelector('[data-dtm="lyric-pan"]'),p=t.querySelector('[data-dtm="lyric-pan-label"]'),h=t.querySelector('[data-dtm="lyric-terms"]'),f=t.querySelector('[data-dtm="lyric-terms-link"]'),g=t.querySelector('[data-dtm="lyric-custom"]'),v=t.querySelector('[data-dtm="lyric-custom-src"]'),y=t.querySelector('[data-dtm="lyric-custom-icon"]'),b=t.querySelector('[data-dtm="lyric-custom-alias"]'),F=t.querySelector('[data-dtm="lyric-custom-key"]'),C=t.querySelector('[data-dtm="lyric-custom-guide"]'),A=t.querySelector('[data-dtm="lyric-custom-note"]'),x=t.querySelector('[data-dtm="lyric-custom-apply"]'),E=e=>64===e?"C":e<64?`L${64-e}`:`R${e-64}`,B=(e,t)=>{let a=document.createElement("option");a.value=e,a.textContent=t,o.appendChild(a)};for(let e of(B("","ボーカルなし"),t3))B(e,t2(e,J));for(let[e,t]of J)B(e,t.label??e);B(t5,"カスタム音源を追加…"),!e.lyricModel||t3.includes(e.lyricModel)||J.has(e.lyricModel)||B(e.lyricModel,t2(e.lyricModel,J)),o.value=e.lyricModel,r.value=String(e.vocalOctave),l.value=e.lyrics,d.value=String(e.vocalVolume),c.textContent=String(e.vocalVolume),m.value=String(e.vocalPan),p.textContent=E(e.vocalPan);let w=()=>{let t=eP(l.value).length;s.textContent=e.lyricModel&&t>0?`${t}\u97F3\u7BC0`:""},k=()=>{n.style.display=e.lyricModel?"":"none",r.style.display=e.lyricModel?"":"none",w(),(()=>{if(J.has(e.lyricModel))return h.classList.add("dtm-hidden");let t=e.lyricModel?eZ[e.lyricModel]:void 0;if(t){let a=t2(e.lyricModel,J);f.textContent=`${a}UTAU\u97F3\u6E90`,f.href=t,h.classList.remove("dtm-hidden")}else h.classList.add("dtm-hidden")})(),(()=>{if(!e.lyricModel){u.removeAttribute("src"),u.classList.add("dtm-hidden");return}let t=J.get(e.lyricModel);if(void 0!==t){u.src=t.iconUrl||tU,u.classList.remove("dtm-hidden"),u.onerror=()=>{u.onerror=null,u.src=tU};return}u.onerror=null;let a=e_[e.lyricModel.toLowerCase()],o=a?tz[a]:void 0;o?(u.src=o,u.classList.remove("dtm-hidden")):(u.removeAttribute("src"),u.classList.add("dtm-hidden"))})()};k(),o.addEventListener("change",()=>{if(o.value===t5){A.textContent="",b.value="",F.value="",g.classList.remove("dtm-hidden");return}g.classList.add("dtm-hidden"),e.lyricModel=o.value,k(),i(),ei(e)}),C.addEventListener("click",()=>{a("カスタム音源(.koe)の使い方",tX)}),x.addEventListener("click",()=>{let t,a=v.value.trim();if(!e$(a)){A.textContent="音源URLが不正です（http/httpsのみ・2048文字まで）";return}let o=y.value.trim(),r=e$(o)?o:"",u=b.value.trim(),n=[...J.values()].find(e=>e.url===a),l=F.value.trim().toLowerCase();if(l){if(!t6.test(l)){A.textContent="識別子が不正です（英字またはアンダースコアで始まる英数字・_のみ）";return}if(t3.includes(l)){A.textContent="その識別子は内蔵モデル名と衝突しています";return}let e=J.get(l);if(e&&e.url!==a){A.textContent="その識別子は別の音源に使用済みです";return}t=l}else t=n?.key??(()=>{let e=1;for(;J.has(`custom${e}`);)e++;return`custom${e}`})();ee({key:t,iconUrl:r||(n?.iconUrl??""),url:a,label:u||n?.label}),e.lyricModel=t,ei(e),e0()}),r.addEventListener("change",()=>{e.vocalOctave=Number.parseInt(r.value,10),ei(e)}),l.addEventListener("input",()=>{e.lyrics=l.value,w(),ei(e)}),d.addEventListener("input",()=>{e.vocalVolume=Number.parseInt(d.value,10),c.textContent=d.value,ei(e)}),m.addEventListener("input",()=>{e.vocalPan=Number.parseInt(m.value,10),p.textContent=E(e.vocalPan),ei(e)}),p.style.cursor="pointer",p.title="タップで中央(C)へ",p.addEventListener("click",()=>{e.vocalPan=64,m.value="64",p.textContent=E(64),ei(e)})}if("chord"===e.config.id&&k){let t=document.createElement("div");t.className="dtm-row",t.style.flexDirection="column",t.style.alignItems="stretch",t.innerHTML=`
        <div class="dtm-row" style="justify-content: space-between; align-items: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="dtm-label">\u548C\u97F3</span>
            <button class="dtm-infobtn" data-dtm="chord-info" title="\u30B3\u30FC\u30C9\u9032\u884C\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${ef("info",12)}</button>
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
        </div>`,S.trackBody.appendChild(t);let o=t.querySelector('[data-dtm="chord-pattern"]'),r=t.querySelector('[data-dtm="chord-input"]');o.value=e.savedChordPattern;let u=()=>{e.savedChordInput=r.value,e.savedChordPattern=o.value};o.addEventListener("change",u),r.addEventListener("input",u),t.querySelector('[data-dtm="chord-info"]').addEventListener("click",()=>{a("コード進行の自動入力解説",t_)}),t.querySelector('[data-dtm="chord-apply"]').addEventListener("click",()=>{u(),e9()})}},e3=e=>{z=e,e0(),eJ(),eg()},e1=e=>{for(let[t,a]of(U=e,[[S.toolPen,"pen"],[S.toolSelect,"select"],[S.toolEraser,"eraser"]]))t.classList.toggle("dtm-segbtn--active",a===e);"select"!==e&&(eo=null,ea=[]),eg()},e2=()=>{let e=Number(S.barLimitSelect.value),t=e>0?e*M.stepsPerBar:1/0,a=e=>t===1/0?e:e.filter(e=>e.startStep<t),o={};eu.forEach((e,t)=>{e.trackInstrument&&(o[t]=e.trackInstrument)});let r=Object.keys(o).length>0?o:void 0,u=tM({instrument:O||void 0,drum:"none"!==I?I:void 0,volume:T,drumVolume:P,mode:x,trackInstruments:r}," "),n=tM({instrument:O||void 0,drum:"none"!==I?I:void 0,volume:T,drumVolume:P,mode:x,trackInstruments:r},"");if(S.decomposeChordToggle.checked){let t=S.ignoreChordHeavyToggle.checked?eu.filter(e=>!((e,t=.6)=>{if(e.length<3)return!1;let a=new Map;for(let t of e)a.set(t.startStep,(a.get(t.startStep)??0)+1);return e.filter(e=>(a.get(e.startStep)??0)>=3).length/e.length>=t})(e.core.getNotes())):eu,o=eu.length-t.length,r=(e=>{let t=[...e].sort((e,t)=>e.startStep-t.startStep||e.pitch-t.pitch),a=[],o=[];for(let e of t){let t=-1,r=1/0;for(let u=0;u<a.length;u++)o[u]<=e.startStep&&o[u]<r&&(r=o[u],t=u);-1===t?(a.push([e]),o.push(e.startStep+e.durationSteps)):(a[t].push(e),o[t]=e.startStep+e.durationSteps)}return a})(a(t.flatMap(e=>e.core.getNotes()))),l=eu[0].core,i=r.map((e,t)=>`@${t} ${l.getMMLFromNotes(e,N,100).trim()}`),s=r.map((e,t)=>`@${t}${l.getMMLFromNotes(e,N,100).trim().replace(/\s+/g,"")}`);return{full:[u,...i,eM].filter(e=>e.length>0).join(";\n"),minified:[n,...s,eM].filter(e=>e.length>0).join(";"),ignoredCount:o,trackCount:r.length,barLimit:e}}let l=[],i=[];eu.forEach((e,t)=>{let o=a(e.core.getNotes());if(o.length>0){let a=e.core.getMMLFromNotes(o,N,e.volume).trim();l.push(`@${t} ${a}`),i.push(`@${t}${a.replace(/\s+/g,"")}`)}});let s=eu.map((e,t)=>({i:t,notes:a(e.core.getNotes()),text:e.lyrics.replace(/[\r\n]+/g," ").trim(),model:e.lyricModel.trim(),vol:e.vocalVolume,gate:e.vocalGate,pan:e.vocalPan,oct:e.vocalOctave})).filter(e=>e.model.length>0&&e.text.length>0&&e.notes.length>0).map(e=>{let t=[200===e.vol?"":`v${e.vol}`,100===e.gate?"":`q${e.gate}`,64===e.pan?"":`p${e.pan}`,0===e.oct?"":`o${e.oct}`].filter(e=>e.length>0).join(" "),a=t?`${e.model} ${t}`:e.model;return`@@${e.i} ${a} ${e.text}`}),d=[];for(let[e,t]of J){if(!eu.some(t=>t.lyricModel.trim().toLowerCase()===e&&t.lyrics.trim().length>0&&a(t.core.getNotes()).length>0))continue;let o=t.iconUrl||"-";d.push(`@@${e} ${o} ${t.url}`)}return{full:[u,...d,...l,...s,eM].filter(e=>e.length>0).join(";\n"),minified:[n,...d,...i,...s,eM].filter(e=>e.length>0).join(";"),ignoredCount:0,trackCount:l.length,barLimit:e}},e5=()=>{let e=Number.MAX_SAFE_INTEGER,t=[];for(let a of eu)for(let o of a.core.getNotes())o.startStep<e?(e=o.startStep,t=[o]):o.startStep===e&&t.push(o);return 0===t.length?null:Math.round(t.reduce((e,t)=>e+t.pitch,0)/t.length)},e6=e=>{let t=s;H=t4((M.keyCount-1-(e-M.pitchRangeStart))*M.keyHeight-(t.height-M.keyHeight)/2,0,eh()),tF(V,H)},e4=()=>{for(let e of eu)e.core.resetHistory(),e.core.clearNotesWithoutHistory();eg()},e8=e=>{if(!e)return;for(let e of(eY(),e4(),eu))e.core.setLoadMode(!0);for(let t of(et(),eH(e)))ee(t);let{placements:a,bpm:o,lyrics:r,meta:u,mergedTrackCount:n}=tD(e,{stepsPerBar:M.stepsPerBar,collectLyrics:!0,clampTrackCount:eu.length});for(let e of(u.instrument&&ey[u.instrument]&&(O=u.instrument,t.onInstrumentChange?.(u.instrument)),u.drum&&B[u.drum]&&(I=u.drum,S.drumSelect.value=u.drum,t.onDrumChange?.(u.drum)),void 0!==u.volume&&(T=u.volume,S.masterVolume.value=String(u.volume),S.masterVolumeLabel.textContent=`${u.volume}%`),void 0!==u.drumVolume&&(P=u.drumVolume,S.drumVolume.value=String(u.drumVolume),S.drumVolumeLabel.textContent=`${u.drumVolume}%`),eu.forEach((e,a)=>{let o=t8(u.trackInstruments?.[a]??"");e.trackInstrument!==o&&(e.trackInstrument=o,t.onTrackInstrumentChange?.(a,o))}),eu))e.lyrics="",e.lyricModel="",e.vocalVolume=200,e.vocalGate=100,e.vocalPan=64,e.vocalOctave=0;for(let e of(r?.forEach(e=>{let t=eu[e.trackId];t&&(t.lyrics=e.syllables.map(e=>e.kana).join(""),t.lyricModel=e.model,t.vocalVolume=e.volume,t.vocalGate=e.gate,t.vocalPan=e.pan,t.vocalOctave=e.octave??0)}),a)){let t=eu[e.trackIndex];t&&t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}for(let e of(o&&td(o),eu))e.core.setLoadMode(!1),e.core.addHistoryOnce();G=0,V=0;let l=e5();null!==l?e6(l):e6(48),eg(),e0(),eJ(),!E&&n>0?(S.mmlLoadNote.textContent="シンプルモードのため、一部のトラックを合算して読み込みました",S.mmlLoadNote.classList.remove("dtm-hidden")):(S.mmlLoadNote.textContent="",S.mmlLoadNote.classList.add("dtm-hidden"))},e9=()=>{let e=ec(),t=eu.find(e=>"chord"===e.config.id);if(!t)return;let a=(e=>{let{chordStr:t,patternType:a,rootShift:o,bpm:r,stepsPerBar:u}=e,n=[];if(!t.trim())return n;let l=[];try{l=((e,t=120)=>{let a=[],o=60/t*4,r=new Set("ABCDEFG_=%N"),u=0,n=null;for(let t of e.replace(/[！-～]/g,e=>String.fromCharCode(e.charCodeAt(0)-65248)).replace(/　/g," ").split("\n").map(e=>e.trim()))if(!(!t.length||/^#/.test(t)))for(let e of t.split(/[|lｌ→]/)){if(!e.length)continue;let t=u++*o,l=[];for(let t=0;t<e.length;t++){let a=e[t],o=e[t-1],u=e.slice(t-2,t);r.has(a)&&"/"!==o&&"on"!==u&&("N."!==u||"C"!==a)&&l.push(t)}if(!l.length)continue;let i=2**Math.ceil(Math.log2(l.length)),s=o/i;for(let[o,r]of l.entries()){let u=e.slice(r,o===l.length-1?e.length:l[o+1]).replace(/\s+/g,""),i=u[0];if("_"===i||"N"===i){n=null;continue}if("="===i){n&&(n.duration+=s);continue}let d=t+o*s;if("%"===i){if(null===n)continue;n={...n,when:d,duration:s}}else{let e=u.slice(0,"#"===u[1]?2:1),t=u.slice(e.length).replace(/[\s・]/g,"");n={key:e,chord:t,when:d,duration:s}}a.push(n)}null!==n&&i>l.length&&(n.duration+=s*(i-l.length))}return a})(t,r)}catch{l=[]}if(l.length>0){let e=60/r*4/u,t={};for(let a of l){let o=Math.floor(a.when/e),r=Math.floor(a.duration/e);t[o]||(t[o]=[]),t[o].push({key:a.key,chord:a.chord,whenStep:o,durationSteps:r})}for(let e of Object.values(t))for(let t of e){let e;try{e=[...W(`${t.key}${t.chord}`).notes]}catch{continue}let r=t.durationSteps;if("block"===a)for(let a of e)n.push({startStep:t.whenStep,pitch:48+a+o,durationSteps:r,velocity:100});else if("arpeggio"===a){let a=Math.floor(r/e.length);e.forEach((e,u)=>{n.push({startStep:t.whenStep+u*a,pitch:48+e+o,durationSteps:r-u*a,velocity:100})})}else if("arpeggio-fast"===a)e.forEach((e,a)=>{n.push({startStep:t.whenStep+6*a,pitch:48+e+o,durationSteps:Math.max(12,r-6*a),velocity:100})});else if("offbeat"===a){let a=Math.floor(u/4),l=Math.floor(a/2);for(let u=0;u<4;u++){let i=t.whenStep+u*a+l;if(i<t.whenStep+r)for(let t of e)n.push({startStep:i,pitch:48+t+o,durationSteps:Math.min(l,12),velocity:100})}}else if("yatsume"===a){let a=Math.floor(u/4),l=e=>Math.max(1,Math.round(e*a/480)),i=[0,360,960,1320],s=l(360);for(let a of i){let u=t.whenStep+l(a);if(u<t.whenStep+r)for(let t of e)n.push({startStep:u,pitch:48+t+o,durationSteps:s,velocity:100})}}else"alternating"===a&&e.forEach((e,a)=>{let r=a*Math.floor(u/4);n.push({startStep:t.whenStep+r,pitch:48+e+o,durationSteps:Math.max(12,Math.floor(u/4)),velocity:100})})}}else t.split(/[\s,]+/).filter(e=>e).forEach((e,t)=>{let a;try{a=[...W(e).notes]}catch{return}if(0===a.length)return;let r=t*u;a.forEach((e,t)=>{let a=3*t;n.push({startStep:r+a,pitch:48+e+o,durationSteps:u-a,velocity:100})})});return n})({chordStr:e.savedChordInput,patternType:e.savedChordPattern,rootShift:e.savedChordRoot,bpm:N,stepsPerBar:M.stepsPerBar});for(let e of(t.core.clearNotesWithoutHistory(),t.core.beginBatch(),a))t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:Math.max(1,e.durationSteps),velocity:e.velocity});t.core.endBatch(),t.core.addHistoryOnce(),eg()},e7=async e=>{if(!t.parseMidi)return;let a=await t.parseMidi(e),o=to(a).filter(e=>e.selected).map(e=>e.index);te(a,o)},te=(e,t)=>{for(let e of(eY(),e4(),eu))e.core.setLoadMode(!0);for(let e of eu)e.lyrics="",e.lyricModel="",e.vocalVolume=200,e.vocalGate=100,e.vocalPan=64,e.vocalOctave=0;let{placements:a,bpm:o}=E?((e,t,a)=>{let{tracks:o,division:r}=e,u=tr(e),n=r/48,l=[];return t.forEach((e,t)=>{if(t>=a.length)return;let r=o[e];if(!r)return;let u=a[t],i=[],s=0;for(let e of r)if(s+=e.delta,9!==e.channel){if(e.noteOn&&e.noteOn.velocity>0){let t=e.noteOn.noteNumber,a=e.noteOn.velocity;i.push({pitch:t,velocity:a,start:s,end:null})}else if(e.noteOff||e.noteOn&&0===e.noteOn.velocity){let t=e.noteOff||e.noteOn;if(t){let e=t.noteNumber;for(let t=i.length-1;t>=0;t--)if(i[t].pitch===e&&null===i[t].end){i[t].end=s;break}}}}for(let e of i){if(null===e.end)continue;let t=Math.round(e.start/n),a=Math.max(1,Math.round((e.end-e.start)/n));l.push({trackId:u,startStep:t,pitch:e.pitch,durationSteps:a,velocity:e.velocity})}}),{placements:l,bpm:u}})(e,t,eu.map(e=>e.config.id)):((e,t)=>{let{tracks:a,division:o}=e,r=tr(e),u={};for(let e of t){let t=a[e];if(!t)continue;let o=0;for(let e of t)if(o+=e.delta,9!==e.channel){if(e.noteOn&&e.noteOn.velocity>0){let t=e.noteOn.noteNumber,a=e.noteOn.velocity,r=e.channel??0;u[r]||(u[r]=[]),u[r].push({pitch:t,velocity:a,start:o,end:null})}else if(e.noteOff||e.noteOn&&0===e.noteOn.velocity){let t=e.noteOff||e.noteOn;if(t){let a=t.noteNumber,r=e.channel??0;if(u[r])for(let e=u[r].length-1;e>=0;e--){let t=u[r][e];if(t.pitch===a&&null===t.end){t.end=o;break}}}}}}let n=4*o,l=8*n,i={};for(let[e,t]of Object.entries(u)){let a=Number.parseInt(e,10),o=t.filter(e=>null!==e.end);if(0===o.length){i[a]={avgPitch:60,maxSimultaneous:0,hasSubmelodyPattern:!1};continue}let r=o.reduce((e,t)=>e+t.pitch,0)/o.length,u=0,s=[...o].sort((e,t)=>e.start-t.start);for(let e=0;e<s.length;e++){let t=1;for(let a=e+1;a<s.length;a++)s[a].start<s[e].end&&t++;u=Math.max(u,t)}let d=()=>{if(0===s.length)return!1;let e=[],t=s[0].start,a=s[0].end;for(let o=1;o<s.length;o++)s[o].start-s[o-1].end>=n&&(e.push({start:t,end:a}),t=s[o].start),a=s[o].end;return e.push({start:t,end:a}),e.every(e=>e.end-e.start<l)};i[a]={avgPitch:r,maxSimultaneous:u,hasSubmelodyPattern:d()}}let s=Object.keys(u).map(Number).sort((e,t)=>e-t),d=[...s].sort((e,t)=>i[e].avgPitch-i[t].avgPitch),c=i[d[Math.floor(d.length/4)]]?.avgPitch??60,m=s.filter(e=>i[e].avgPitch<=c&&i[e].maxSimultaneous<=2),p=s.filter(e=>i[e].maxSimultaneous<=1&&!m.includes(e)),h=p.filter(e=>i[e].hasSubmelodyPattern),f=p.filter(e=>!i[e].hasSubmelodyPattern),g=s.filter(e=>!m.includes(e)&&!f.includes(e)&&!h.includes(e)),v={melody:f,submelody:h,bass:m,chord:g},y=[],b=o/48;for(let[e,t]of Object.entries(u)){let a=Number.parseInt(e,10),o=null;for(let[e,t]of Object.entries(v))if(t.includes(a)){o=e;break}if(o)for(let e of t){if(null===e.end)continue;let t=Math.round(e.start/b),a=Math.max(1,Math.round((e.end-e.start)/b));y.push({trackId:o,startStep:t,pitch:e.pitch,durationSteps:a,velocity:e.velocity})}}return{placements:y,bpm:r}})(e,t);for(let e of a){let t=eu.find(t=>t.config.id===e.trackId);t&&t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}for(let e of(td(Math.round(o)),eu))e.core.setLoadMode(!1),e.core.addHistoryOnce();G=0,V=0;let r=e5();null!==r?e6(r):e6(48),eg(),e0(),eJ()},tt=()=>(e=>{var t;let{tracks:a,drumPattern:o,drumVolume:r=80,bpm:u,stepsPerBar:n}=e,l=[];if(a.forEach((e,t)=>{if(0===e.notes.length)return;let a=t<9?t:t+1&15,o=[];for(let t of e.notes){let r=Math.round(10*t.startStep),u=Math.round((t.startStep+(t.durationSteps||1))*10),n=Math.round((t.velocity??100)*(e.volume??100)/100);o.push({t:r,m:[144|a,t.pitch,n]}),o.push({t:u,m:[144|a,t.pitch,0]})}o.sort((e,t)=>e.t-t.t),l.push(o)}),o&&o.length>0){let e=Math.max(...a.filter(e=>e.notes.length>0).map(e=>Math.max(...e.notes.map(e=>e.startStep+e.durationSteps))),n),t=[],u=Math.ceil(e/n);for(let a=0;a<u;a++){let u=a*n;for(let a of o){let o=u+a.step;if(o>=e)continue;let n=Math.round((a.velocity??1)*(r/100)*127);t.push({t:Math.round(10*o),m:[153,a.pitch,n]}),t.push({t:Math.round((o+1)*10),m:[153,a.pitch,0]})}}t.sort((e,t)=>e.t-t.t),t.length>0&&l.push(t)}let i=[];for(let e of(t=l.length+1,i.push(77,84,104,100),i.push(...tl(6)),i.push(...tu(1)),i.push(...tu(t)),i.push(...tu(480)),ts(i,e=>{e.push(0,255,81,3,...tn(Math.round(6e7/u)))}),l))ts(i,t=>{let a=0;for(let o of e)t.push(...ti(o.t-a),...o.m),a=o.t});return new Blob([new Uint8Array(i).buffer],{type:"audio/midi"})})({tracks:eu.map(e=>({notes:e.core.getNotes(),volume:e.volume})),drumPattern:B[I],drumVolume:P,bpm:N,stepsPerBar:M.stepsPerBar}),td=e=>{for(let t of(N=e,S.bpmInput.value=String(e),eu))t.core.setTempo(e)},tf=0,tC=()=>{let e=Date.now();e-tf<100||(tf=e,ec().core.undo(),eg(),eJ())},tE=()=>{ec().core.redo(),eg(),eJ()},tB=e=>{S.overlay.hidden=!1,tR(!0),setTimeout(()=>{e(),S.overlay.hidden=!0,tR(!1)},30)},tw=e=>new Promise(t=>{let a=document.createElement("div");a.className="dtm-modal-overlay",a.innerHTML=`
				<div class="dtm-modal">
					<div class="dtm-modal-header">
						<span class="dtm-modal-title">\u30E2\u30FC\u30C9\u306E\u78BA\u8A8D</span>
					</div>
					<div class="dtm-modal-body"><p>${e}</p></div>
					<div class="dtm-confirm-footer">
						<button class="dtm-btn dtm-btn--ghost dtm-confirm-no">\u3044\u3044\u3048\uFF08\u3053\u306E\u307E\u307E\u8AAD\u307F\u8FBC\u3080\uFF09</button>
						<button class="dtm-btn dtm-btn--primary dtm-confirm-yes">\u306F\u3044\uFF08\u4E0A\u7D1A\u8005\u30E2\u30FC\u30C9\u306B\u5207\u308A\u66FF\u3048\u308B\uFF09</button>
					</div>
				</div>`;let o=e=>{a.remove(),t(e)};a.querySelector(".dtm-confirm-yes").addEventListener("click",()=>o(!0)),a.querySelector(".dtm-confirm-no").addEventListener("click",()=>o(!1)),a.addEventListener("click",e=>{e.target===a&&o(!1)}),document.body.appendChild(a)}),tk=null,tS=[],tL=e=>{if(e.ctrlKey||e.metaKey)if("KeyZ"!==e.code||e.shiftKey){if("KeyZ"===e.code&&e.shiftKey||"KeyY"===e.code)e.preventDefault(),tE();else if("KeyC"===e.code&&ea.length>0)e.preventDefault(),er=[...ea];else if("KeyX"===e.code&&ea.length>0){if(e.preventDefault(),!eL()){er=[...ea];let e=ec().core;for(let t of(e.beginBatch(),ea))e.deleteNoteById(t.id);e.endBatch(),ea=[]}}else if("KeyV"===e.code&&er.length>0){if(e.preventDefault(),eL())return;let t=ec().core,a=t.getNotes(),o=Math.min(...er.map(e=>e.startStep));for(let e of(t.beginBatch(),er)){let r=G+(e.startStep-o),u=r+e.durationSteps;a.some(t=>t.pitch===e.pitch&&r<t.startStep+t.durationSteps&&u>t.startStep)||t.addNote(r,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}t.endBatch(),eg()}}else e.preventDefault(),tC()};eO(),eu=A.map(e=>{let a=[];return{config:e,core:new tA({onMMLGenerated:()=>{},onNotesChanged:o=>{if(Z){if(!en&&t.onNotesPatch){let r=new Map(a.map(e=>[`${e.startStep}_${e.pitch}`,e])),u=new Map(o.map(e=>[`${e.startStep}_${e.pitch}`,e])),n=o.filter(e=>{let t=r.get(`${e.startStep}_${e.pitch}`);return!t||t.durationSteps!==e.durationSteps||t.velocity!==e.velocity}).map(e=>({startStep:e.startStep,pitch:e.pitch,durationSteps:e.durationSteps,velocity:e.velocity})),l=a.filter(e=>!u.has(`${e.startStep}_${e.pitch}`)).map(e=>({startStep:e.startStep,pitch:e.pitch}));(n.length>0||l.length>0)&&t.onNotesPatch(e.id,n,l)}a=o.map(e=>({...e})),eg(),eJ()}}},e.volume),volume:e.volume,savedChordInput:"",savedChordPattern:"block",savedChordRoot:0,lyrics:"",lyricModel:"",vocalVolume:200,vocalGate:100,vocalPan:64,vocalOctave:0,trackInstrument:""}}),Z=!0,o=!1,r=!1,u=!1,n=()=>{if(o&&(o=!1,u)){u=!1;let e=Math.max(0,Math.floor(V/M.stepWidth/j)*j);Y=e,_=e,eQ()}},S.hScroll.addEventListener("pointerdown",e=>{o=!0,(u="playing"===K)&&eK(),e.preventDefault(),S.hScroll.setPointerCapture(e.pointerId),h(e.clientX)}),S.vScroll.addEventListener("pointerdown",e=>{r=!0,e.preventDefault(),S.vScroll.setPointerCapture(e.pointerId),f(e.clientY)}),S.hScroll.addEventListener("pointermove",e=>{o&&h(e.clientX)}),S.vScroll.addEventListener("pointermove",e=>{r&&f(e.clientY)}),S.hScroll.addEventListener("pointerup",n),S.vScroll.addEventListener("pointerup",()=>{r=!1}),document.addEventListener("pointermove",e=>{o&&h(e.clientX),r&&f(e.clientY)}),document.addEventListener("pointerup",()=>{n(),r=!1}),h=e=>{let t=ep();if(t<=0)return;let a=S.hScroll.getBoundingClientRect(),o=Number.parseFloat(S.hScrollThumb.style.width)||40,r=t4(e-a.left-o/2,0,a.width-o)/(a.width-o);tF(V=t4(r*t,0,t),H),eg()},f=e=>{let t=eh();if(t<=0)return;let a=S.vScroll.getBoundingClientRect(),o=Number.parseFloat(S.vScrollThumb.style.height)||40,r=t4(e-a.top-o/2,0,a.height-o)/(a.height-o);H=t4(r*t,0,t),tF(V,H),eg()},S.playBtn.addEventListener("click",()=>{"playing"===K?eY():eQ()}),S.playBtn.disabled=!1,S.prevBarBtn.addEventListener("click",()=>{tV(Math.max(0,Math.floor((tj()-1)/M.stepsPerBar)*M.stepsPerBar))}),S.nextBarBtn.addEventListener("click",()=>{tV(Math.floor(tj()/M.stepsPerBar+1)*M.stepsPerBar)}),S.soloCheckbox.addEventListener("change",()=>{q=S.soloCheckbox.checked,eg()}),S.toolPen.addEventListener("click",()=>e1("pen")),S.toolSelect.addEventListener("click",()=>e1("select")),S.toolEraser.addEventListener("click",()=>e1("eraser")),S.undoBtn.addEventListener("click",tC),S.redoBtn.addEventListener("click",tE),S.noteLengthSelect.addEventListener("change",()=>{R=j=Number.parseInt(S.noteLengthSelect.value,10),eg()}),S.bpmInput.addEventListener("input",()=>{td(Number.parseInt(S.bpmInput.value,10)||120)}),S.zoomXIn.addEventListener("click",()=>{D=Math.min(200,D+25),ez(),eV()}),S.zoomXOut.addEventListener("click",()=>{D=Math.max(25,D-25),ez(),eV()}),S.zoomYIn.addEventListener("click",()=>{L=Math.min(200,L+25),eU(),eV()}),S.zoomYOut.addEventListener("click",()=>{L=Math.max(50,L-25),eU(),eV()}),S.decomposeChordToggle.addEventListener("change",eV),S.ignoreChordHeavyToggle.addEventListener("change",eV),S.masterVolume.addEventListener("input",()=>{T=Number.parseInt(S.masterVolume.value,10)||0,S.masterVolumeLabel.textContent=`${T}%`}),S.drumSelect.addEventListener("change",()=>{I=S.drumSelect.value,t.onDrumChange?.(I)}),S.drumVolume.addEventListener("input",()=>{P=Number.parseInt(S.drumVolume.value,10)||0,S.drumVolumeLabel.textContent=`${P}%`}),S.macroClear.addEventListener("click",()=>{let e=ec();e.core.beginBatch(),e.core.clearNotesWithoutHistory(),e.core.endBatch(),e.core.saveHistory(),eg()}),S.macroRandom.addEventListener("click",()=>{((e,t)=>{let{stepsPerBar:a,startStep:o,pitchRangeStart:r}=t,u=r+60,n=ta[Math.floor(Math.random()*ta.length)],l=Math.floor(12*Math.random()),i=[];for(let e=0;e<12;e++){let t=(e-l+12)%12;n.includes(t)&&i.push(u+e)}e.beginBatch();for(let t=0;t<8;t++){let r=o+t*a,u=Math.floor(4*Math.random())+2,n=new Set;for(let t=0;t<u;t++){let t=r+24*Math.floor(a/24*Math.random());if(n.has(t))continue;n.add(t);let o=i[Math.floor(Math.random()*i.length)];e.addNote(t,o,{noteLengthSteps:24})}}e.endBatch(),e.saveHistory()})(ec().core,{stepsPerBar:M.stepsPerBar,startStep:G,pitchRangeStart:M.pitchRangeStart}),eg()}),S.macroHarmonic.addEventListener("click",()=>{let e=eu.find(e=>"chord"===e.config.id);e&&"chord"!==z&&(((e,t,a)=>{let o=a.stepsPerBar/2,r=e.getNotes().concat(t.getNotes());if(0===r.length)return;let u=Math.ceil(Math.max(...r.map(e=>e.startStep+e.durationSteps))/o),n=new Set;e.beginBatch();for(let a=0;a<u;a++){let r=a*o,u=r+o,l=a%2==0,i=t.getNotes().filter(e=>e.startStep>=r&&e.startStep<u);if(i.length>0?n=new Set(i.map(e=>e.pitch%12)):l&&(n=new Set),0!==n.size)for(let t of e.getNotes().filter(e=>e.startStep>=r&&e.startStep<u))n.has(t.pitch%12)||e.deleteNoteById(t.id)}e.endBatch(),e.saveHistory()})(ec().core,e.core,{stepsPerBar:M.stepsPerBar}),eg())}),S.macroMono.addEventListener("click",()=>{let e=eu.find(e=>"chord"===e.config.id);e&&"chord"!==z&&(((e,t,a)=>{let o=a.stepsPerBar/2,r=e.getNotes().concat(t.getNotes());if(0===r.length)return;let u=Math.ceil(Math.max(...r.map(e=>e.startStep+e.durationSteps))/o),n=new Set;e.beginBatch();for(let a=0;a<u;a++){let r=a*o,u=r+o,l=a%2==0,i=t.getNotes().filter(e=>e.startStep>=r&&e.startStep<u);if(i.length>0?n=new Set(i.map(e=>e.pitch%12)):l&&(n=new Set),0===n.size)continue;let s=e.getNotes().filter(e=>e.startStep>=r&&e.startStep<u),d=s.filter(e=>n.has(e.pitch%12)),c=new Set(d.map(e=>e.id));for(let t of s)c.has(t.id)||e.deleteNoteById(t.id);let m=new Map;for(let e of d)m.has(e.startStep)||m.set(e.startStep,[]),m.get(e.startStep)?.push(e);for(let t of m.values())if(t.length>1){t.sort((e,t)=>t.pitch-e.pitch);let[,...a]=t;for(let t of a)e.deleteNoteById(t.id)}}e.endBatch(),e.saveHistory()})(ec().core,e.core,{stepsPerBar:M.stepsPerBar}),eg())}),S.generateMmlBtn.addEventListener("click",()=>{let{full:e,minified:t,ignoredCount:a,trackCount:o,barLimit:r}=e2();S.outputFull.textContent=e,S.outputMini.textContent=t;let u=S.decomposeChordToggle.checked,n=a>0?` / \u4F34\u594F${a}\u30C8\u30E9\u30C3\u30AF\u9664\u5916`:"",l=r>0?` / \u301C${r}\u5C0F\u7BC0`:"";S.outputStatus.textContent=`[${u?"和音分解":"通常"}] (${o}\u30C8\u30E9\u30C3\u30AF${n}${l}) \u901A\u5E38: ${e.length}\u6587\u5B57 / minify: ${t.length}\u6587\u5B57`,S.outputContainer.classList.remove("dtm-hidden"),eJ()}),S.exportMidiBtn.addEventListener("click",()=>{let e=tt(),t=URL.createObjectURL(e),a=document.createElement("a");a.href=t,a.download="dtm.mid",a.click(),URL.revokeObjectURL(t)}),v=(e,t)=>{navigator.clipboard?.writeText(e),t.classList.add("dtm-btn--success"),setTimeout(()=>t.classList.remove("dtm-btn--success"),1200)},S.copyFullBtn.addEventListener("click",()=>v(S.outputFull.textContent??"",S.copyFullBtn)),S.copyMiniBtn.addEventListener("click",()=>v(S.outputMini.textContent??"",S.copyMiniBtn)),S.mmlLoadBtn.addEventListener("click",async()=>{let e=S.mmlInput.value;if(!E&&t.onRequestAdvancedMode){let{mergedTrackCount:a}=tD(e,{stepsPerBar:M.stepsPerBar,clampTrackCount:eu.length});if(a>0&&await tw("初心者モードで読み込むと、音が崩れる可能性があります。<br>上級者モードに切り替えますか？"))return void t.onRequestAdvancedMode(e)}tB(()=>e8(e))}),y=null,b=null,F=()=>{if(y&&(y.stop(),y.destroy(),y=null),b){b.textContent="▶ 試聴",b.classList.remove("dtm-btn--danger"),b.classList.add("dtm-btn--primary");let e=b.closest(".dtm-modal-sample-box"),t=e?.querySelector(".dtm-modal-sample-player-container");t&&(t.innerHTML=""),b=null}},a=(e,a)=>{for(let t of(F(),S.modalTitle.textContent=e,S.modalBody.innerHTML=a,S.modalOverlay.removeAttribute("hidden"),S.modalBody.querySelectorAll(".dtm-modal-sample-copy-btn")))t.addEventListener("click",()=>{let e=t.getAttribute("data-mml")||"";navigator.clipboard.writeText(e).then(()=>{let e=t.textContent;t.textContent="✓ コピー完了",t.classList.add("dtm-btn--success"),setTimeout(()=>{t.textContent=e,t.classList.remove("dtm-btn--success")},1200)})});for(let e of S.modalBody.querySelectorAll(".dtm-modal-sample-play-btn")){let a=e;a.addEventListener("click",()=>{let e=a.closest(".dtm-modal-sample-box"),o=e?.querySelector(".dtm-modal-sample-player-container"),r=a.getAttribute("data-mml")||"";if(b===a)y?.isPlaying()?y.stop():(eY(),y&&(y.play(),a.textContent="■ 停止",a.classList.remove("dtm-btn--primary"),a.classList.add("dtm-btn--danger")));else if(F(),eY(),b=a,a.textContent="■ 停止",a.classList.remove("dtm-btn--primary"),a.classList.add("dtm-btn--danger"),o){o.innerHTML="";let e=tY(o,r,{onPlayNote:e=>{if(t.onPlayNote){let a=A[Number(e.trackId)],o=a?a.id:e.trackId;t.onPlayNote({...e,trackId:o})}},onPlayDrum:t.onPlayDrum,onResumeAudio:t.onResumeAudio,getAudioTime:t.getAudioTime,singingVoices:t.singingVoices,drumPatterns:t.drumPatterns,volume:T,_skipInfoModals:!0,onStop:()=>{b===a&&(a.textContent="▶ 試聴",a.classList.remove("dtm-btn--danger"),a.classList.add("dtm-btn--primary"))}});y=e,e.play()}})}},S.modalClose.addEventListener("click",()=>{F(),S.modalOverlay.setAttribute("hidden","")}),S.modalOverlay.addEventListener("click",e=>{e.target===S.modalOverlay&&(F(),S.modalOverlay.setAttribute("hidden",""))}),S.mmlInfoBtn.addEventListener("click",()=>{a("MMLの書き方解説",tx)}),S.midiInfoBtn.addEventListener("click",()=>{a("MIDIの読み込み解説",tZ)}),S.shiftApplyBtn.addEventListener("click",()=>tB(()=>{((e,t)=>{if(0!==t)for(let a of e)for(let e of[...a.getNotes()]){let o=e.startStep+t;o<0?a.deleteNoteById(e.id):a.moveNote(e.id,o,e.pitch)}})(eu.map(e=>e.core),Number.parseInt(S.shiftSelect.value,10)||0),eg()})),w&&(S.midiInput.addEventListener("change",async()=>{let e=S.midiInput.files?.[0];if(!e||!t.parseMidi)return;S.overlay.hidden=!1,tR(!0);let a=new Uint8Array(await e.arrayBuffer());tS=to(tk=await t.parseMidi(a)),S.midiTrackSelection.innerHTML='<span class="dtm-label">トラック</span>',tS.forEach((e,t)=>{let a=document.createElement("button");a.className=`dtm-btn ${e.selected?"dtm-btn--primary":"dtm-btn--ghost"}`,a.dataset.selected=String(e.selected),a.textContent=`${e.name} (${e.noteCount})`,a.addEventListener("click",()=>{let e="true"!==a.dataset.selected;a.dataset.selected=String(e),a.classList.toggle("dtm-btn--primary",e),a.classList.toggle("dtm-btn--ghost",!e)}),S.midiTrackSelection.appendChild(a),0===t&&(S.midiTrackSelection.dataset.ready="1")}),S.midiTrackSelection.classList.remove("dtm-hidden"),S.overlay.hidden=!0,tR(!1)}),S.midiLoadBtn.addEventListener("click",async()=>{if(!tk)return;let e=[];if(S.midiTrackSelection.querySelectorAll("button").forEach((t,a)=>{"true"===t.dataset.selected&&e.push(tS[a].index)}),0!==e.length){if(!E&&t.onRequestAdvancedMode&&e.length>eu.length&&await tw("初心者モードで読み込むと、音が崩れる可能性があります。<br>上級者モードに切り替えますか？")){let a=tk,o=e.slice();t.onRequestAdvancedMode(void 0,e=>{e.applyMidiParsed?.(a,o)});return}tB(()=>te(tk,e))}})),document.addEventListener("keydown",tL),S.root.addEventListener("keydown",e=>{let t=e.target;"TEXTAREA"!==t.tagName&&"INPUT"!==t.tagName||(e.ctrlKey||e.metaKey)&&["KeyZ","KeyY","KeyV","KeyC","KeyX"].includes(e.code)&&e.stopPropagation()}),td(N),e0(),eX(),eJ(),eg(),t.initialMML&&e8(t.initialMML);let tT=null,tP=new ResizeObserver(()=>{tT&&clearTimeout(tT),tT=setTimeout(()=>eO(),150)});tP.observe(S.rollContainer),document.addEventListener("pointermove",eT),document.addEventListener("pointerup",eI);let tR=e=>{X=e,S.topbar.classList.toggle("is-loading",e)},tj=()=>"playing"===K?_:"paused"===K?Y:G,tV=async e=>{"playing"===K?(eW.stop(),t.singingVoices?.stopStream(),G=e,Y=e,_=e,K="paused",await eQ()):t$(e)},t$=e=>{G=e,Y=e,_=e,K="paused";let t=s;tF(V=t4(e*M.stepWidth-.5*t.width,0,ep()),H),eX(),eg()};return{play:eQ,pause:eK,stop:eY,getMML:e2,setInstrument:e=>{O=e},getDrum:()=>I,setDrum:e=>{("none"===e||B[e])&&(I=e,S.drumSelect.value=e,t.onDrumChange?.(e))},getViewState:eR,setViewState:e=>{"number"==typeof e.zoomX&&(D=t4(e.zoomX,25,200),ez()),"number"==typeof e.zoomY&&(L=t4(e.zoomY,50,200),eU()),"boolean"==typeof e.decomposeChord&&(S.decomposeChordToggle.checked=e.decomposeChord),"boolean"==typeof e.ignoreChordHeavy&&(S.ignoreChordHeavyToggle.checked=e.ignoreChordHeavy)},loadMML:e8,loadMIDI:e7,applyMidiParsed:(e,t)=>{tB(()=>te(e,t))},exportMIDI:tt,setBpm:td,getPlaybackState:()=>K,getCurrentPlayStep:tj,forcePauseAt:t$,setLoading:tR,applyPatch:(e,t,a)=>{let o=eu.find(t=>t.config.id===e);if(o){for(let e of(en=!0,o.core.beginBatch(),t)){let t=o.core.getNotes().find(t=>t.startStep===e.startStep&&t.pitch===e.pitch);t&&o.core.deleteNoteById(t.id),o.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}for(let e of a){let t=o.core.getNotes().find(t=>t.startStep===e.startStep&&t.pitch===e.pitch);t&&o.core.deleteNoteById(t.id)}o.core.endBatch(),en=!1,eg()}},setTrackVisible:(e,t)=>{t?es.delete(e):es.add(e),eg()},setTrackAudible:(e,t)=>{t?ed.delete(e):ed.add(e)},applyLyrics:(e,t)=>{let a=eu.find(t=>t.config.id===e);a&&(a.lyrics=t.lyrics,a.lyricModel=t.model,a.vocalVolume=t.vocalVolume,a.vocalGate=t.vocalGate,a.vocalPan=t.vocalPan,a.vocalOctave=t.vocalOctave)},applyTrackInstrument:(e,t)=>{let a=eu[e];a&&(a.trackInstrument=t8(t),a.config.id===z&&e0())},noteToCanvas:(e,t)=>{let a=s,o=e*M.stepWidth-V,r=(M.keyCount-1-t)*M.keyHeight-H,u=o>=0&&o<=a.width&&r>=0&&r<=a.height,n=null;return u||(n=o<0?"left":o>a.width?"right":r<0?"top":"bottom"),{x:o,y:r,onScreen:u,side:n}},destroy:()=>{eW.stop(),t.singingVoices?.stopStream(),tP.disconnect(),document.removeEventListener("pointermove",eT),document.removeEventListener("pointerup",eI),document.removeEventListener("keydown",tL),e.innerHTML=""}}})(e,$);R.push(H);let G=f??o.presetUI,q=e.querySelector('[data-dtm="roll"]');G&&(U.get(e)?.destroy(),j=O(e,{getDaw:()=>H,getTrackIds:()=>x,value:D,loadingTarget:q??e,position:"prepend",onChange:e=>{L=e}}),U.set(e,j)),H.setInstrument(D);let Q=q?tO(q):null;return H.setLoading?.(!0),P(D,x,N?"advanced":"simple").finally(()=>{Q?.remove(),H.setLoading?.(!1)}),{...H,setInstrument:e=>{H.setInstrument(e),L=e,j&&j.setValue(e)},applyTrackInstrument:(e,t)=>{H.applyTrackInstrument(e,t),V(e,t)},destroy:()=>{H.destroy(),j?.destroy(),U.get(e)===j&&U.delete(e);let t=R.indexOf(H);t>=0&&R.splice(t,1)}}};return{audioContext:r,singingVoices:C,mountEditor:$,mountPlayer:(e,t,a={})=>{let o=tD(t,{}),n=o.meta??{},l=n.instrument&&ey[n.instrument]?n.instrument:M,i="advanced"===n.mode,s=[...new Set(o.placements.map(e=>e.trackIndex))].map(e=>D(e,i?"advanced":"simple")),d=s.length>0?s:[...ah],c=new Map,m=async()=>{if(n.trackInstruments)for(let[e,t]of(await A,Object.entries(n.trackInstruments))){let a=B(t);a&&(c.set(Number(e),a),await S(a))}};Promise.all([P(l,d,i?"advanced":"simple"),m()]);let p=tY(e,t,{getAudioTime:()=>r.currentTime,onResumeAudio:h,onPlayNote:e=>{let t,a=Number(e.trackId),o=c.get(a);(t=o?w.get(o):T(l,D(a,i?"advanced":"simple"),i?"advanced":"simple"))&&t.play({ctx:r,destination:u,pitch:e.pitch,volume:e.volume,when:e.when,duration:e.duration})},onPlayDrum:z,singingVoices:C,...a});return j.push(p),{...p,destroy:()=>{p.destroy();let e=j.indexOf(p);e>=0&&j.splice(e,1)}}},loadPreset:P,defaultPreset:M,mountPresetSelect:O,mountModeSwitch:(e,t)=>{let a=e.ownerDocument,o=t.tracksFor??(e=>"advanced"===e?t0:tJ),r={simple:t.labels?.simple??"初心者",advanced:t.labels?.advanced??"上級者"},u=e=>"function"==typeof t.editorOptions?t.editorOptions(e):t.editorOptions??{},n=t.mode??"simple",l=null,i=a.createElement("div");if(i.className=t.className??"dtm-controlbar",null!==t.label){let e=a.createElement("span");e.className="dtm-controlbar-label",e.textContent=t.label??"モード",i.appendChild(e)}let s=a.createElement("div");s.className="dtm-modeseg";let d=new Map,c=()=>{for(let[e,t]of d)t.classList.toggle("dtm-modebtn--active",e===n)};for(let e of["simple","advanced"]){let t=a.createElement("button");t.type="button",t.className="dtm-modebtn",t.textContent=r[e],t.addEventListener("click",()=>h(e)),s.appendChild(t),d.set(e,t)}i.appendChild(s);let m=(a,r)=>{let s=u(a);l=$(t.editorTarget,{...s,mode:a,tracks:o(a),initialMML:r??s.initialMML,onRequestAdvancedMode:(e,a)=>{p(),n="advanced",c(),t.onChange?.("advanced"),m("advanced",e),a&&l&&a(l)}}),"prepend"===t.position?e.insertBefore(i,e.firstChild):e.appendChild(i),t.onMount?.(l,a)},p=()=>{if(!l)return;let e=l.getMML().full;return t.onUnmount?.(l,n),l.destroy(),l=null,e};function h(e){if(e===n&&l)return;let a=p();n=e,c(),t.onChange?.(e),m(e,a)}c(),m(n,u(n).initialMML);let f={element:i,getDaw:()=>l,getMode:()=>n,setMode:h,destroy:()=>{p(),i.remove();let e=V.indexOf(f);e>=0&&V.splice(e,1)}};return V.push(f),f},dispose:()=>{for(let e of[...V])e.destroy();for(let e of j)e.destroy();for(let e of R)e.destroy();V.length=0,j.length=0,R.length=0,r.close()}}};let ag=Function("url","return import(url)");async function av(e,t){let a=await ag(e);return a[t]??a.default}let ay=null;e.s(["getStudio",0,()=>(ay||(ay=(async()=>{let[e,t,a]=await Promise.all([av("https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont.mjs","SoundFont"),av("https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_drum.mjs","SoundFont_drum"),av("https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_list.mjs","SoundFont_list")]);return af({engines:{SoundFont:e,SoundFont_drum:t,SoundFont_list:a}})})()),ay)],48605)}]);