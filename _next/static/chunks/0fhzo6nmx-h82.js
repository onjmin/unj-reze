(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,39240,e=>{e.q("/unj-reze/_next/static/media/voice-worker.0-2eet5p8gboy.js")},48605,e=>{"use strict";let t,o,a,r,n,l;var A,u,i,s,d,c,g,m=`0000 Acoustic Grand Piano
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
1270 Gunshot`;async function p(){let e={};for(let t of m.trim().split("\n")){let o=t.indexOf(" ");if(-1===o)continue;let a=t.slice(0,o);e[t.slice(o+1)]=a}return e}var C=m.trim().split("\n").map(e=>e.slice(e.indexOf(" ")+1)),h=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],B=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"],E=e=>(e%12+12)%12,f=(e,t=!1)=>(t?B:h)[E(e)],Q=class extends Error{constructor(e,t){super(`SyntaxError: ${t}
input.idx: ${e.idx}
input.str: ${e.str}`),this.name="ChordSyntaxError"}},I=(e,t)=>{throw new Q(e,t)},v=class e{static nums=new Set("0123456789");str;nest;idx;constructor(e,t=0){this.str=e,this.nest=t,this.idx=0}get isEOF(){return this.str.length<=this.idx}get char(){return this.str[this.idx]}get num(){let t="";for(;!this.isEOF;){let o=this.char;if(!e.nums.has(o))break;t+=o,this.idx++}return t.length?Number(t):null}slice(e){return this.str.slice(this.idx,this.idx+e)}},y=class{pitch=null;chord=null;isChord=!1;pending=null;nest=-1;get value(){let{pitch:e,chord:t}=this;return new Set([...t].map(t=>t+e))}set value(e){let t=this.pitch;this.chord=new Set([...e].map(e=>e-t))}},b=class{map=new Map;lengths=[];_set(e,t){this.map.set(e,t),this.lengths.includes(e.length)||(this.lengths.push(e.length),this.lengths.sort((e,t)=>t-e))}set(e,t){if(Array.isArray(e))for(let o of e)this._set(o,t);else this._set(e,t)}parse(e){for(let t of this.lengths){let o=e.slice(t);if(this.map.has(o))return e.idx+=o.length,this.map.get(o)}return null}},w=new b;w.set("(",0),w.set(")",1),w.set(",",2),w.set(["/","on"],3);var F=(e,t=new y,o=0)=>{let a=e.idx,r=r=>{let n=e.str.slice(a,r);n.length&&k(new v(n,o),t)};for(;;){let{idx:n}=e;if(e.isEOF)return o&&I(e,`Unclosed ${o} brackets`),r(n),t;let l=w.parse(e);if(null===l){e.idx++;continue}let{pending:A}=t;switch(r(n),l){case 0:F(e,t,o+1);break;case 1:return o-1<0&&I(e,"Unable to close brackets"),t;case 2:t.pending=A;break;case 3:{let a=F(e,new y,o),r=[...t.value];if(a.isChord)t.value=[...a.value].concat(r);else{let e=r.sort((e,t)=>e-t),o=(a.pitch+3)%12-3;if(e[0]<o)for(;e[0]<o;)e.push(e.shift()+12);else for(;;){let t=e[e.length-1]-12;if(t<o)break;e.pop(),e.unshift(t)}e.push(o),t.value=e}}}a=e.idx}},k=(e,t)=>e.isEOF?t:null===t.pitch?N(e,t):null===t.pending?Y(e,t):V(e,t),x=new b,D=new b;for(let e of[x,D])e.set(["#","♯"],1),e.set(["b","♭"],-1);x.set("+",1),x.set("-",-1);var M=(e,t=!1)=>(t?D:x).parse(e),S=[0,2,4,5,7,9,11];for(let e of[...S.keys()])S.push(S[e]+12);var L=e=>S[e-1],R=new b;for(let[e,t]of[..."CDEFGAB"].entries())R.set(t,S[e]);var N=(e,t)=>{let o=R.parse(e);null===o&&I(e,"Not found pitch"),t.pitch=o;let a=M(e,!0);return null!==a&&(t.pitch+=a),J(e,t)},T=[0,4,7],U=[0,3,6],P=new b;P.set(["m","min","Min","minor","Minor","-"],[0,3,7]),P.set(["dim","〇"],U),P.set("+",[0,4,8]),P.set(["Φ","φ","ø"],[0,3,6,10]);var J=(e,t)=>{let o=/^maj/i.test(e.str.slice(e.idx))?null:P.parse(e);if(null!==o&&(t.isChord=!0),t.chord=new Set(o||T),o===U){let{num:o}=e,a=t.chord;null!==o&&a.add(L(o)-2)}return t.nest=e.nest,k(e,t)},K=(e,t,o)=>{e.add(L(t)+o)},H=e=>{e.delete(L(5)),e.add(L(5)+1)},O=(e,t,o,a=!1)=>{5===t?e.delete(L(3)):6===t?e.add(L(6)):69===t?e.add(L(6)).add(L(9)):(t>=7&&e.add(L(7)+(a?-1:0)),t>=9&&e.add(L(9)),t>=11&&e.add(L(11)),t>=13&&e.add(L(13)))},G=new b;G.set("add",K),G.set(["omit","no"],(e,t,o)=>{e.delete(L(t)+o)}),G.set("sus",(e,t,o)=>{e.delete(L(3)),e.add(L(t)+o)}),G.set(["M","maj","Maj","major","Major","△","Δ"],O),G.set("aug",H);var Y=(e,t)=>{t.isChord||(t.isChord=!0);let o=G.parse(e),a=t.chord;if(null===o){let o="+"===e.char,r=M(e),{num:n}=e;if(null===n&&(o?H(a):I(e,"Not found number")),null===r)e.nest===t.nest?O(a,n,0,!0):K(a,n,0);else a.delete(L(n)),a.add(L(n)+r)}else o===H?H(a):t.pending=o;return k(e,t)},V=(e,t)=>{let o=M(e),{num:a}=e,{pending:r,chord:n}=t;return null===a&&I(e,"Not found number"),r(n,a,null===o?0:o),t.pending=null,k(e,t)},q=e=>{let t=F(new v(e)),o=[...t.value].sort((e,t)=>e-t),a=[...t.chord].sort((e,t)=>e-t),r=[...new Set(o.map(E))].sort((e,t)=>e-t);return{symbol:e,root:E(t.pitch),notes:o,pitchClasses:r,intervals:a}},z=["","m","7","M7","m7","dim","m7b5","aug","6","m6","sus4","sus2","mM7","dim7","7sus4","7#5","add9","madd9","9","M9","m9","69","m69","5"].map((e,t)=>({quality:e,pitchClasses:q(`C${e}`).pitchClasses,priority:t}));let X=new Map;for(let e of z){let t=e.pitchClasses.join(",");X.has(t)||X.set(t,e)}var W=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],j=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17],Z=e=>e.reduce((e,t)=>e+t,0)/e.length,$=(e,t)=>{let o=Z(e),a=Z(t),r=0,n=0,l=0;for(let A=0;A<e.length;A++){let u=e[A]-o,i=t[A]-a;r+=u*i,n+=u*u,l+=i*i}let A=Math.sqrt(n*l);return 0===A?0:r/A},_=(e,t,o)=>`${f(e,o)} ${t}`,ee=e=>({tonic:e.tonic,mode:e.mode,name:e.name}),et=(e,t)=>e.tonic===t.tonic&&e.mode===t.mode,eo=(e,t,o)=>{let a=Array(12).fill(0);for(let r of e){if(r.duration<=0){r.when>=t&&r.when<o&&(a[E(r.pitch)]+=1);continue}let e=Math.max(r.when,t),n=Math.min(r.when+r.duration,o)-e;n>0&&(a[E(r.pitch)]+=n)}return a},ea=(e,t)=>{let o=[];for(let a=0;a<12;a++)for(let r of["major","minor"]){let n="major"===r?W:j,l=e.map((e,t)=>n[E(t-a)]);o.push({tonic:a,mode:r,name:_(a,r,t),score:$(e,l)})}return o.sort((e,t)=>t.score-e.score),o},er=e=>{let t=[];for(let o of e){let e=t[t.length-1];e&&et(e.key,o.key)?e.duration=o.when+o.duration-e.when:t.push({...o})}return t},en=e=>0===e?1.3:3===e||4===e?1.2:10===e||11===e?.95:6===e||7===e||8===e?.7:.85,el=(()=>{let e=[];for(let t=0;t<12;t++)for(let o of z){let a=new Set,r=Array(12).fill(0),n=new Set;for(let e of o.pitchClasses){n.add(e);let o=E(e+t);a.add(o),r[o]=en(e)}e.push({root:t,quality:o.quality,priority:o.priority,pcs:a,weights:r,rel:n})}return e})(),eA=[0,2,4,5,7,9,11],eu=[0,2,3,5,7,8,10],ei=(e,t,o)=>{let a=Array(12).fill(0),r=0,n=1/0,l=-1;for(let A of e){let e=Math.max(A.when,t),u=Math.min(A.when+Math.max(A.duration,0),o),i=A.duration<=0?+(A.when>=t&&A.when<o):Math.max(u-e,0);!(i<=0)&&(a[E(A.pitch)]+=i,r+=i,A.pitch<n&&(n=A.pitch,l=E(A.pitch)))}return{when:t,duration:o-t,profile:r>0?a.map(e=>e/r):a,bass:l,empty:0===r}},es=["I","II","III","IV","V","VI","VII"],ed=(e,t)=>{let o="major"===e.mode?eA:eu,a=E(t.root-e.tonic),r=o.indexOf(a),n="";if(-1===r){let e=o.indexOf(E(a-1)),t=o.indexOf(E(a+1));-1!==e?(r=e,n="#"):-1!==t?(r=t,n="b"):(r=0,n="?")}let l=t.rel.has(4),A=t.rel.has(3),u=t.rel.has(6),i=t.rel.has(8),s=t.rel.has(10),d=es[r],c="";return A&&u?(d=d.toLowerCase(),c=s?"ø7":"°",t.rel.has(9)&&(c="°7")):l&&i?c="+":A&&(d=d.toLowerCase()),c||(t.rel.has(11)?c="M7":s?c="7":t.rel.has(9)&&!t.rel.has(10)&&(c="6")),n+d+c},ec=(e,t)=>{for(let o of e)if(t>=o.when&&t<o.when+o.duration)return o.key;return e.length?e[e.length-1].key:null},eg=(e,t,o)=>{let a=f(e.root,o)+e.quality,r=-1!==t&&t!==e.root&&e.pcs.has(t);return{symbol:r?`${a}/${f(t,o)}`:a,rootSymbol:a,inversion:r,bass:-1===t?e.root:t}},em={play:{d:"M8 5v14l11-7z"},pause:{d:"M6 5h4v14H6zm8 0h4v14h-4z"},stop:{d:"M6 6h12v12H6z"},record:{d:"M12 6a6 6 0 100 12 6 6 0 000-12z"},undo:{d:"M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6",stroke:!0},redo:{d:"M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6",stroke:!0},chevronUp:{d:"M5 15l7-7 7 7",stroke:!0},chevronDown:{d:"M19 9l-7 7-7-7",stroke:!0},chevronLeft:{d:"M15 19l-7-7 7-7",stroke:!0},chevronRight:{d:"M9 5l7 7-7 7",stroke:!0},first:{d:"M18 18l-6-6 6-6M11 18l-6-6 6-6",stroke:!0},copy:{d:"M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",stroke:!0},pen:{d:"M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75 1.84-1.83zM3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"},eraser:{d:"M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"},select:{d:"M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2M20 7V5a1 1 0 00-1-1h-2M20 17v2a1 1 0 01-1 1h-2M4 11v2M20 11v2M11 4h2M11 20h2",stroke:!0},settings:{d:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",stroke:!0},info:{d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"},more:{d:"M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"}},ep=(e,t=20)=>{let o=em[e];if(!o)return"";let a=o.stroke?'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"':'fill="currentColor"';return`<svg viewBox="0 0 24 24" width="${t}" height="${t}" ${a} aria-hidden="true"><path d="${o.d}"/></svg>`},eC={kick:36,snare:38,clap:39,rimshot:37,hihatClosed:42,hihatPedal:44,hihatOpen:46,tomLow:45,tomMid:47,tomHigh:50,crash:49,ride:51,splash:55,tambourine:54},eh={"4beat":[{step:0,pitch:eC.kick,velocity:1},{step:48,pitch:eC.kick,velocity:.9},{step:96,pitch:eC.kick,velocity:1},{step:144,pitch:eC.kick,velocity:.9}],"8beat":[{step:0,pitch:eC.kick,velocity:1},{step:0,pitch:eC.hihatClosed,velocity:.8},{step:24,pitch:eC.hihatClosed,velocity:.5},{step:48,pitch:eC.snare,velocity:1},{step:48,pitch:eC.clap,velocity:.6},{step:48,pitch:eC.hihatClosed,velocity:.8},{step:72,pitch:eC.hihatClosed,velocity:.5},{step:96,pitch:eC.kick,velocity:.9},{step:96,pitch:eC.hihatClosed,velocity:.8},{step:120,pitch:eC.hihatClosed,velocity:.5},{step:144,pitch:eC.snare,velocity:1},{step:144,pitch:eC.hihatClosed,velocity:.8},{step:168,pitch:eC.hihatClosed,velocity:.5}],"16beat":[{step:0,pitch:eC.kick,velocity:1},{step:0,pitch:eC.hihatClosed,velocity:.8},{step:12,pitch:eC.hihatClosed,velocity:.4},{step:24,pitch:eC.hihatClosed,velocity:.6},{step:36,pitch:eC.hihatClosed,velocity:.4},{step:48,pitch:eC.snare,velocity:1},{step:48,pitch:eC.hihatClosed,velocity:.8},{step:60,pitch:eC.hihatClosed,velocity:.4},{step:72,pitch:eC.hihatClosed,velocity:.6},{step:84,pitch:eC.hihatClosed,velocity:.4},{step:96,pitch:eC.kick,velocity:.9},{step:96,pitch:eC.hihatClosed,velocity:.8},{step:108,pitch:eC.kick,velocity:.7},{step:108,pitch:eC.hihatClosed,velocity:.4},{step:120,pitch:eC.hihatClosed,velocity:.6},{step:132,pitch:eC.hihatClosed,velocity:.4},{step:144,pitch:eC.snare,velocity:1},{step:144,pitch:eC.hihatClosed,velocity:.8},{step:156,pitch:eC.hihatClosed,velocity:.4},{step:168,pitch:eC.hihatClosed,velocity:.6},{step:180,pitch:eC.hihatClosed,velocity:.4}],shuffle:[{step:0,pitch:eC.kick,velocity:1},{step:0,pitch:eC.hihatClosed,velocity:.8},{step:32,pitch:eC.hihatClosed,velocity:.5},{step:48,pitch:eC.snare,velocity:1},{step:48,pitch:eC.hihatClosed,velocity:.8},{step:80,pitch:eC.hihatClosed,velocity:.5},{step:96,pitch:eC.kick,velocity:.9},{step:96,pitch:eC.hihatClosed,velocity:.8},{step:128,pitch:eC.hihatClosed,velocity:.5},{step:144,pitch:eC.snare,velocity:1},{step:144,pitch:eC.hihatClosed,velocity:.8},{step:176,pitch:eC.hihatClosed,velocity:.5}],dance:[{step:0,pitch:eC.kick,velocity:1},{step:24,pitch:eC.hihatOpen,velocity:.7},{step:48,pitch:eC.kick,velocity:1},{step:48,pitch:eC.clap,velocity:1},{step:72,pitch:eC.hihatOpen,velocity:.7},{step:96,pitch:eC.kick,velocity:1},{step:120,pitch:eC.hihatOpen,velocity:.7},{step:144,pitch:eC.kick,velocity:1},{step:144,pitch:eC.clap,velocity:1},{step:168,pitch:eC.hihatOpen,velocity:.7}],bossa:[{step:0,pitch:eC.kick,velocity:.9},{step:0,pitch:eC.hihatClosed,velocity:.6},{step:24,pitch:eC.hihatClosed,velocity:.4},{step:48,pitch:eC.rimshot,velocity:.8},{step:48,pitch:eC.hihatClosed,velocity:.6},{step:72,pitch:eC.kick,velocity:.7},{step:72,pitch:eC.hihatClosed,velocity:.4},{step:96,pitch:eC.kick,velocity:.9},{step:96,pitch:eC.hihatClosed,velocity:.6},{step:120,pitch:eC.hihatClosed,velocity:.4},{step:144,pitch:eC.rimshot,velocity:.8},{step:144,pitch:eC.hihatClosed,velocity:.6},{step:168,pitch:eC.hihatClosed,velocity:.4}],disco:[{step:0,pitch:eC.kick,velocity:1},{step:0,pitch:eC.hihatClosed,velocity:.7},{step:24,pitch:eC.tambourine,velocity:.8},{step:48,pitch:eC.snare,velocity:1},{step:48,pitch:eC.hihatClosed,velocity:.7},{step:72,pitch:eC.tambourine,velocity:.8},{step:96,pitch:eC.kick,velocity:1},{step:96,pitch:eC.hihatClosed,velocity:.7},{step:120,pitch:eC.tambourine,velocity:.8},{step:144,pitch:eC.snare,velocity:1},{step:144,pitch:eC.hihatClosed,velocity:.7},{step:168,pitch:eC.tambourine,velocity:.8}]},eB={piano:{displayName:"グランドピアノ",description:"最も破綻しにくい構成。楽曲制作のスケッチにも最適。",melody:"Acoustic Grand Piano",submelody:"Vibraphone",bass:"Electric Bass (finger)",chord:"Pad 2 (warm)"},acoustic:{displayName:"アコースティック",description:"生楽器の温かみを重視。フォークやポップスに。",melody:"Acoustic Guitar (steel)",submelody:"Harmonica",bass:"Acoustic Bass",chord:"Acoustic Guitar (nylon)"},jazz_night:{displayName:"ジャズ・ナイト",description:"Rhodes風のEPとウッドベースによる、大人びたアンサンブル。",melody:"Electric Piano 1",submelody:"Flute",bass:"Acoustic Bass",chord:"Electric Guitar (jazz)"},synth_pop:{displayName:"シンセポップ",description:"80s〜現代まで。抜けるリードと太いベースの王道。",melody:"Lead 2 (sawtooth)",submelody:"Lead 4 (chiff)",bass:"Synth Bass 2",chord:"Pad 3 (polysynth)"},cyber_punk:{displayName:"サイバーパンク",description:"デジタルな冷たさと歪みが混ざり合う、未来的な響き。",melody:"Lead 8 (bass + lead)",submelody:"Lead 5 (charang)",bass:"Synth Bass 2",chord:"Pad 8 (sweep)"},rock:{displayName:"ハードロック",description:"歪みギターと重厚なベースで、パワーを前面に。",melody:"Distortion Guitar",submelody:"Rock Organ",bass:"Electric Bass (pick)",chord:"Overdriven Guitar"},orchestra:{displayName:"オーケストラ",description:"壮大な物語を予感させる、管弦楽器の重厚な響き。",melody:"French Horn",submelody:"Pizzicato Strings",bass:"Cello",chord:"Tremolo Strings"},japanese_wa:{displayName:"和風・雅",description:"琴と三味線の繊細な調べに、尺八の情緒を添えて。",melody:"Koto",submelody:"Shamisen",bass:"Taiko Drum",chord:"Shakuhachi"},arabic_exotic:{displayName:"エキゾチック",description:"シタールやバグパイプによる、異国情緒溢れるサウンド。",melody:"Sitar",submelody:"Bagpipe",bass:"Fretless Bass",chord:"Kalimba"},fantasy_rpg:{displayName:"ファンタジーRPG",description:"オカリナとハープが紡ぐ、冒険と魔法の世界観。",melody:"Ocarina",submelody:"Celesta",bass:"Timpani",chord:"Orchestral Harp"},ambient_cloud:{displayName:"アンビエント",description:"輪郭をぼかした音色で、深い没入感と余韻を演出。",melody:"Lead 6 (voice)",submelody:"Music Box",bass:"Synth Bass 1",chord:"Pad 7 (halo)"},retro_game:{displayName:"8-bit レトロ",description:"矩形波を想起させる、初期ゲーム機のような懐かしい響き。",melody:"Lead 1 (square)",submelody:"Lead 2 (sawtooth)",bass:"Synth Bass 1",chord:"Clavinet"}};function eE(e){let t=new DataView(e);if(t.byteLength<8||0x4b4f4500!==t.getUint32(0,!1))throw Error("Not a .koe file (bad magic)");return{jsonLength:t.getUint32(4,!0)}}var ef=class{constructor(e,t){this.blob=e,this.base=t}blob;base;readBytes(e,t){let o=this.base+e;return this.blob.slice(o,o+t).arrayBuffer()}},eQ=class{constructor(e,t){this.url=e,this.base=t}url;base;async readBytes(e,t){let o=this.base+e,a=await fetch(this.url,{headers:{Range:`bytes=${o}-${o+t-1}`}});if(!a.ok&&206!==a.status)throw Error(`.koe range request failed: ${a.status}`);return a.arrayBuffer()}};async function eI(e,t,o){let a=await fetch(e,{headers:{Range:`bytes=${t}-${t+o-1}`}});if(!a.ok&&206!==a.status)throw Error(`.koe fetch failed: ${a.status}`);return a.arrayBuffer()}var ev=class e{constructor(e,t){this.manifest=e,this.source=t}manifest;source;static async load(t){if("string"==typeof t){let{jsonLength:o}=eE(await eI(t,0,8)),a=await eI(t,8,o);return new e(JSON.parse(new TextDecoder().decode(a)),new eQ(t,8+o))}let{jsonLength:o}=eE(await t.slice(0,8).arrayBuffer()),a=await t.slice(8,8+o).arrayBuffer();return new e(JSON.parse(new TextDecoder().decode(a)),new ef(t,8+o))}has(e){return void 0!==this.manifest.phonemes[e]}async readPcmBytes(e){let t=this.manifest.phonemes[e];return t?this.source.readBytes(t.offset,2*t.length):null}async getPcm(e){let t=await this.readPcmBytes(e);if(!t)return null;let o=new Int16Array(t),a=new Float64Array(o.length);for(let e=0;e<o.length;e++)a[e]=o[e]/32768;return a}},ey=new Map,eb=class e{constructor(e){this.wasm=e}wasm;sampleRate=48e3;static async load(t){return new e(await function(e){let t,o=ey.get(e);if(o)return o;let a=e.slice(0,e.lastIndexOf("/")+1),r=()=>{let e=globalThis.WorldlineModule;if(!e)throw Error("worldline: WorldlineModule global was not defined by the script");return e({locateFile:e=>a+e})};if("u">typeof document)t=new Promise((t,o)=>{if(document.querySelector(`script[data-koe-worldline="${e}"]`))return void t();let a=document.createElement("script");a.src=e,a.dataset.koeWorldline=e,a.onload=()=>t(),a.onerror=()=>o(Error(`worldline: failed to load ${e}`)),document.head.appendChild(a)}).then(r);else{if("function"!=typeof globalThis.importScripts)return Promise.reject(Error("Worldline.load requires a DOM or a classic Web Worker (importScripts) to load worldline.js"));t=Promise.resolve().then(()=>(globalThis.importScripts(e),r()))}return ey.set(e,t),t}(t.scriptUrl))}renderNote(e){let{pcm:t,pitch:o,durationMs:a,preMs:r,consonantMs:n,tempo:l=120}=e;if(!t||t.length<4096)return null;let A=this.wasm,u=Math.round(69+12*Math.log2(o/440)),i=r+a,s=A._PhraseSynthNew();if(!s)return null;let d=A._malloc(120);if(!d)return A._PhraseSynthDelete(s),null;let c=A._malloc(8*t.length);if(!c)return A._free(d),A._PhraseSynthDelete(s),null;A.HEAPF64.set(t,c>>3);let g=(e,t,o)=>A.setValue(d+e,t,o);g(0,48e3,"i32"),g(4,t.length,"i32"),g(8,c,"*"),g(12,0,"i32"),g(16,0,"*"),g(20,u,"i32"),g(24,100,"double"),g(32,0,"double"),g(40,i,"double"),g(48,n,"double"),g(56,20,"double"),g(64,100,"double"),g(72,0,"double"),g(80,l,"double"),g(88,0,"i32"),g(92,0,"*"),g(96,0,"i32"),g(100,0,"i32"),g(104,100,"i32"),g(108,0,"i32"),g(112,0,"i32"),g(116,100,"i32"),A._PhraseSynthAddRequest(s,d,0,0,i,0,0,0),A._free(c),A._free(d);let m=Math.ceil((0+i+20)/10)+4,p=new Float64Array(m).fill(o),C=new Float64Array(m).fill(.5),h=new Float64Array(m).fill(.5),B=new Float64Array(m).fill(.5),E=new Float64Array(m).fill(1),f=A._malloc(8*m),Q=A._malloc(8*m),I=A._malloc(8*m),v=A._malloc(8*m),y=A._malloc(8*m);if(!f||!Q||!I||!v||!y)return f&&A._free(f),Q&&A._free(Q),I&&A._free(I),v&&A._free(v),y&&A._free(y),A._PhraseSynthDelete(s),null;A.HEAPF64.set(p,f>>3),A.HEAPF64.set(C,Q>>3),A.HEAPF64.set(h,I>>3),A.HEAPF64.set(B,v>>3),A.HEAPF64.set(E,y>>3),A._PhraseSynthSetCurves(s,f,Q,I,v,y,m,10),A._free(f),A._free(Q),A._free(I),A._free(v),A._free(y);let b=A._malloc(4);if(!b)return A._PhraseSynthDelete(s),null;let w=A._PhraseSynthSynth(s,b,0),F=A.getValue(b,"*"),k=w>0?new Float32Array(A.HEAPF32.buffer,F,w).slice():null;return A._free(b),A._PhraseSynthDelete(s),k}},ew="#end;",eF={あ:["","a"],い:["","i"],う:["","u"],え:["","e"],お:["","o"],か:["k","a"],き:["k","i"],く:["k","u"],け:["k","e"],こ:["k","o"],さ:["s","a"],し:["sh","i"],す:["s","u"],せ:["s","e"],そ:["s","o"],た:["t","a"],ち:["ch","i"],つ:["ts","u"],て:["t","e"],と:["t","o"],な:["n","a"],に:["n","i"],ぬ:["n","u"],ね:["n","e"],の:["n","o"],は:["h","a"],ひ:["h","i"],ふ:["f","u"],へ:["h","e"],ほ:["h","o"],ま:["m","a"],み:["m","i"],む:["m","u"],め:["m","e"],も:["m","o"],や:["y","a"],ゆ:["y","u"],よ:["y","o"],ら:["r","a"],り:["r","i"],る:["r","u"],れ:["r","e"],ろ:["r","o"],わ:["w","a"],を:["w","o"],が:["g","a"],ぎ:["g","i"],ぐ:["g","u"],げ:["g","e"],ご:["g","o"],ざ:["z","a"],じ:["j","i"],ず:["z","u"],ぜ:["z","e"],ぞ:["z","o"],だ:["d","a"],ぢ:["j","i"],づ:["z","u"],で:["d","e"],ど:["d","o"],ば:["b","a"],び:["b","i"],ぶ:["b","u"],べ:["b","e"],ぼ:["b","o"],ぱ:["p","a"],ぴ:["p","i"],ぷ:["p","u"],ぺ:["p","e"],ぽ:["p","o"],ん:["N","N"]},ek={a:"あ",i:"い",u:"う",e:"え",o:"お"},ex=e=>/[ぁゃ]/.test(e)?"a":/[ぃ]/.test(e)?"i":/[ぅゅ]/.test(e)?"u":/[ぇ]/.test(e)?"e":/[ぉょ]/.test(e)?"o":/[あかさたなはまやらわがざだばぱ]/.test(e)?"a":/[いきしちにひみりぎじぢびぴ]/.test(e)?"i":/[うくすつぬふむゆるぐずづぶぷ]/.test(e)?"u":/[えけせてねへめれげぜでべぺ]/.test(e)?"e":/[おこそとのほもよろごぞどぼぽ]/.test(e)?"o":"",eD=e=>{if("ー"===e)return{kana:e,consonant:"-",vowel:"-"};if("っ"===e)return{kana:e,consonant:"Q",vowel:""};let t=e[0],o=eF[t],a=o?o[0]:"",r=o?o[1]:ex(t);if(2===e.length&&"っ"!==e[1]){let t=ex(e[1]);t&&(r=t)}return{kana:e,consonant:a,vowel:r}},eM=e=>(e=>{let t=[],o="";for(let a of e){if("-"===a.consonant){if(!o)continue;t.push({kana:ek[o]??a.kana,consonant:"",vowel:o});continue}a.vowel&&"N"!==a.vowel&&(o=a.vowel),t.push(a)}return t})((e=>{let t=[];for(let o of e)t.length>0&&"ぁぃぅぇぉゃゅょっ".includes(o)?t[t.length-1]+=o:t.push(o);return t})(e.normalize("NFKC").replace(/[ァ-ヶ]/g,e=>String.fromCharCode(e.charCodeAt(0)-96)).replace(/[^ぁ-ゖー]/g,"")).map(eD)),eS=e=>{let t=[],o=[];for(let a of e){let e=eM(a);0!==e.length&&(t.length>0&&o.push(t.length),t.push(...e))}return{syllables:t,lineBreaks:o}},eL=/^@@(\d+)\s*(.*)$/,eR=e=>!/^[@#]/.test(e),eN=e=>e.split(/[;\n\r]+/).map(e=>e.trim()).filter(e=>e.length>0),eT=(e,t,o)=>Math.min(o,Math.max(t,e)),eU=e=>e<=0?0:e<=100?e/100:10**((e-100)*.08/20),eP=e=>Math.max(-1,Math.min(1,(e-64)/64)),eJ={a:[800,1200],i:[300,2300],u:[350,800],e:[500,1900],o:[500,900],N:[250,1e3]},eK=e=>440*2**((e-69)/12),eH="https://pub-12482a6b5cbc4c9e906b2e1904cabae5.r2.dev",eO={tsukuyomi:"つくよみちゃん.koe",rino:"春音リノver0.3.koe",roze:"束音ロゼver0.５1(多音階).koe",ruko_male:"欲音ルコ♂連続音Ver.1.03.koe",ruko_female:"欲音ルコ♀歌連続音普1.00.koe",teto:"重音テト単独音.koe",shiyo:"革命シヨ.koe"},eG={tsukuyomi:"つくよみちゃん",rino:"春音リノ",roze:"束音ロゼ",ruko_male:"欲音ルコ♂",ruko_female:"欲音ルコ♀",teto:"重音テト",shiyo:"革命シヨ"},eY={klatt:"puyuyu",tsukuyomi:"tsukuyomi",rino:"rino",roze:"roze",ruko_male:"ruko",ruko_female:"ruko",teto:"teto",shiyo:"shiyo"},eV={tsukuyomi:"https://tyc.rei-yumesaki.net/material/utau/terms/",rino:"https://hatenakun1.github.io/halunelino/",roze:"https://tabaneroze.ninja-web.net/terms-of-use.html",ruko_male:"https://long-sleeper.net/index.php?id=22",ruko_female:"https://long-sleeper.net/index.php?id=22",teto:"https://kasaneteto.jp/guidelines/voice.html",shiyo:"https://kakumeisiyo.my.canva.site/dagkuyjwycs"},eq=(e,t=eH)=>`${t}/${encodeURIComponent(e)}`,ez="https://onjmin.github.io/koe/demo/world/worldline.js",eX=/_([A-G][#b]?-?\d+)$/,eW={c:0,d:2,e:4,f:5,g:7,a:9,b:11},ej=e=>{let t=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(e);if(!t)return null;let o=eW[t[1].toLowerCase()];return"#"===t[2]?o++:"b"===t[2]&&o--,(Number.parseInt(t[3],10)+1)*12+o},eZ=e=>{let t=new Map;for(let o of e){let e=eX.exec(o);if(!e||t.has(e[1]))continue;let a=ej(e[1]);null!=a&&t.set(e[1],a)}return[...t].map(([e,t])=>({token:e,midi:t}))},e$=(e,t,o,a,r)=>{let n=o.kana,l="N"===o.consonant?"n":o.consonant,A="N"===o.vowel?"":o.vowel,u=`${l}${A}`||A,i=a||"-",s=[`${i} ${n}`,`${i} ${u}`,n,u],d=ek[o.vowel];d&&s.push(`${i} ${d}`,d,o.vowel),"N"===o.vowel&&s.push("ん","n","N",`${i} \u3093`);let c=new Set,g=t=>{for(let o of t.includes(" ")?[t,t.replace(/ /g,"　"),t.replace(/ /g,"")]:[t])if(!c.has(o)&&(c.add(o),e(o)))return o;return null};if(t.length)for(let{token:e}of t.slice().sort((e,t)=>Math.abs(e.midi-r)-Math.abs(t.midi-r)))for(let t of s){let o=g(`${t}_${e}`);if(o)return o}for(let e of s){let t=g(e);if(t)return t}return null},e_=async e=>{let t=await ev.load(e.koe),o=e.lightweight?null:await eb.load({scriptUrl:e.worldlineScriptUrl??ez}).catch(()=>null),a=new Map,r=async(e,r,n)=>{var l;let A,u=await (!(A=a.get(e))&&(A=t.getPcm(e),a.set(e,A)),A);if(!u||0===u.length)return null;let i=t.manifest.phonemes[e],s={preMs:((l=i).pre||0)/48e3*1e3,consonantMs:(l.consonant||0)/48e3*1e3},d=eK(r);if(o){let e=o.renderNote({pcm:u,pitch:d,durationMs:n,...s});if(e)return{pcm:e,preSec:s.preMs/1e3,rate:1}}let c=i.pitch>0?d/i.pitch:1;return{pcm:Float32Array.from(u),preSec:i.pre/48e3/c,rate:c}};return{hasAlias:e=>t.has(e),pitchTokens:eZ(Object.keys(t.manifest.phonemes)),renderAlias:r,dispose:()=>{}}},e0=async e=>{if(new URL(e,location.href).origin===location.origin)return new Worker(e);let t=await fetch(e).then(e=>e.text());return new Worker(URL.createObjectURL(new Blob([t],{type:"text/javascript"})))},e3=async(e,t)=>{let o=await e0(e),a=new Set,r=new Map,n=0,l=null,A=null;return o.onmessage=e=>{let t=e.data;if("ready"===t.type){for(let e of t.aliases)a.add(e);l?.()}else if("error"===t.type)A?.(Error(t.message));else if("rendered"===t.type){let e=r.get(t.id);e&&(r.delete(t.id),e(t))}},o.onerror=e=>{A?.(Error(e.message||e.error||`Event: ${e.type}`))},await new Promise((e,a)=>{l=e,A=a,o.postMessage({type:"init",koe:t.koe,worldlineScriptUrl:t.worldlineScriptUrl??ez,lightweight:!!t.lightweight})}),l=null,A=null,{hasAlias:e=>a.has(e),pitchTokens:eZ(a),renderAlias:(e,t,a)=>new Promise(l=>{let A=++n;r.set(A,e=>l(e.pcm?{pcm:e.pcm,preSec:e.preSec??0,rate:e.rate??1}:null)),o.postMessage({type:"render",id:A,alias:e,pitch:t,durationMs:a})}),dispose:()=>o.terminate()}},e1=async(e,t,o)=>{let a;if(o.voiceWorkerUrl)try{a=await e3(o.voiceWorkerUrl,o)}catch(e){console.warn("[dtm] Failed to spawn voice worker. Falling back to local backend.",e),a=await e_(o)}else a=await e_(o);let r=new Map,n=new Map,l=new Set,A="",u=(e,t,o)=>`${e}|${t}|${10*Math.round(o/10)}`,i=(t,o,l)=>{let A=u(t,o,l),i=r.get(A);if(void 0!==i)return Promise.resolve(i);let s=n.get(A);if(s)return s;let d=(async()=>{let u=await a.renderAlias(t,o,l),i=null;if(u){let t=e.createBuffer(1,u.pcm.length,48e3);t.copyToChannel(u.pcm,0),i={audio:t,preSec:u.preSec,rate:u.rate}}return r.set(A,i),n.delete(A),i})();return n.set(A,d),d},s=(o,a,r,n)=>{let A=t,u=null;"function"==typeof e.createStereoPanner&&((u=e.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,n)),u.connect(t),A=u);let i=e.createBufferSource();i.buffer=o.audio,i.playbackRate.value=o.rate;let s=Math.min(o.preSec,.09),d=o.preSec-s,c=Math.max(e.currentTime+.001,a-s),g=c+(o.audio.duration/o.rate-d),m=e.createGain();m.gain.setValueAtTime(1e-4,c),m.gain.exponentialRampToValueAtTime(r,c+.01);let p=Math.max(c+.01,g-.04);m.gain.setValueAtTime(r,p),m.gain.exponentialRampToValueAtTime(1e-4,g),i.connect(m).connect(A),i.start(c,d),i.stop(g+.02),l.add(i),i.onended=()=>{l.delete(i),i.disconnect(),m.disconnect(),u?.disconnect()}},d=(t,o)=>{if("Q"===t.consonant||""===t.vowel)return;let r=e$(a.hasAlias,a.pitchTokens,t,A,o.pitch);if(t.vowel&&"N"!==t.vowel&&(A=t.vowel),!r)return;let n=e.currentTime+o.when,l=Math.max(1e-4,o.volume),u=o.pan??0,d=Math.max(60,1e3*o.duration);i(r,o.pitch,d).then(e=>{e&&s(e,n,l,u)})};return d.renderToCache=async(e,t,o,r)=>{if("Q"===e.consonant||""===e.vowel)return null;let n=e$(a.hasAlias,a.pitchTokens,e,t,o);if(!n)return null;let l=Math.max(60,r);return await i(n,o,l)?u(n,o,l):null},d.scheduleCached=(e,t,o,a)=>{let n=r.get(e);n&&s(n,t,o,a)},d.stopAll=()=>{for(let e of l){try{e.stop()}catch{}e.disconnect()}l.clear()},d.reset=()=>{A=""},d},e2=3,e5=(e,t,o={})=>{let a,r,n={};for(let[e,t]of Object.entries(eO))n[e]=eq(t);for(let[e,t]of Object.entries(o.voicebanks??{}))n[e.toLowerCase()]=t;let l=0,A=new Map([["klatt",(a=new Set,(r=(o,r)=>{let n=e.currentTime+r.when,l=Math.max(1e-4,r.volume);if(""===o.vowel||"Q"===o.consonant)return;let[A,u]=eJ[o.vowel]??eJ.a,i=n+Math.max(.04,r.duration),s=null,d=t;"function"==typeof e.createStereoPanner&&((s=e.createStereoPanner()).pan.value=Math.max(-1,Math.min(1,r.pan??0)),s.connect(t),d=s);let c=e.createOscillator();c.type="sawtooth",c.frequency.value=eK(r.pitch);let g=(t,o,a)=>{let r=e.createBiquadFilter();r.type="bandpass",r.frequency.value=t,r.Q.value=o;let n=e.createGain();return n.gain.value=a,c.connect(r).connect(n),n},m=e.createGain();if(m.gain.setValueAtTime(1e-4,n),m.gain.exponentialRampToValueAtTime(l,n+.02),m.gain.setValueAtTime(l,i),m.gain.exponentialRampToValueAtTime(1e-4,i+.06),g(A,6,4).connect(m),g(u,9,2.8).connect(m),m.connect(d),new Set(["s","sh","ch","ts","h","f"]).has(o.consonant)){let t=Math.max(1,Math.floor(.05*e.sampleRate)),r=e.createBuffer(1,t,e.sampleRate),A=r.getChannelData(0);for(let e=0;e<t;e++)A[e]=2*Math.random()-1;let u=e.createBufferSource();u.buffer=r;let i=e.createBiquadFilter();i.type="highpass",i.frequency.value="sh"===o.consonant?3e3:4500;let s=e.createGain();s.gain.setValueAtTime(.5*l,n),s.gain.exponentialRampToValueAtTime(1e-4,n+.05),u.connect(i).connect(s).connect(d),u.start(n),u.stop(n+.05),a.add(u),u.onended=()=>{a.delete(u),u.disconnect(),i.disconnect(),s.disconnect()}}c.start(n),c.stop(i+.06+.02),a.add(c),c.onended=()=>{a.delete(c),c.disconnect(),s?.disconnect()}}).stopAll=()=>{for(let e of a){try{e.stop()}catch{}e.disconnect()}a.clear()},r)]]),u=new Map,i=(e,t)=>{let o="";for(let a of e.notes){let e=a.syllable;"Q"!==e.consonant&&""!==e.vowel&&(t(a,o),e.vowel&&"N"!==e.vowel&&(o=e.vowel))}},s=()=>{for(let e of(l++,A.values()))e.stopAll?.()};return{loadModels:async a=>{let r=new Set;for(let e of a)e&&r.add(e.toLowerCase());await Promise.all([...r].map(a=>(a=>{let r=a.toLowerCase(),l=A.get(r);if(l)return Promise.resolve(l);let i=u.get(r);if(i)return i;let s=n[r];if(!s)return Promise.resolve(null);let d=(async()=>e1(e,t,{koe:s,worldlineScriptUrl:o.worldlineScriptUrl,lightweight:o.lightweight,voiceWorkerUrl:o.voiceWorkerUrl}))().then(e=>(A.set(r,e),e)).catch(e=>(console.warn(`[dtm] koe\u97F3\u6E90 "${r}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F`,e),null));return u.set(r,d),d})(a)))},warm:async(e,t=e2,o)=>{let a=[];for(let o of e){let e=A.get(o.model.toLowerCase());if(!e?.renderToCache)continue;let r=0;i(o,(o,n)=>{r>=t&&o.startSec>=1.5||(r++,a.push({model:e,note:o,prevVowel:n}))})}let r=a.length;if(0===r)return void o?.(0,0);let n=0;o?.(n,r);let l=a.map(async e=>{await (e.model.renderToCache?.(e.note.syllable,e.prevVowel,e.note.pitch,1e3*e.note.durationSec)??Promise.resolve(null)),n++,o?.(n,r)});await Promise.all(l)},startStream:(t,o,a)=>{let r=++l,n=async t=>{let n=A.get(t.model.toLowerCase());if(!n)return;let u=[];i(t,(e,t)=>{u.push({note:e,prevVowel:t})});let s=Math.max(1e-4,t.volume);for(let{note:A,prevVowel:i}of u){if(r!==l)return;for(;A.startSec-(e.currentTime-o)>1.5;)if(await new Promise(e=>setTimeout(e,100)),r!==l)return;if(a?.isAudible&&!a.isAudible(t))continue;let u=o+A.startSec;if(n.renderToCache&&n.scheduleCached){let o=n.renderToCache,d=n.scheduleCached;(async()=>{let n=await o(A.syllable,i,A.pitch,1e3*A.durationSec);if(r===l&&n){let o=e.currentTime-u;o<.05?d(n,u,s,t.pan):(console.warn(`[dtm] Synthesizer late skip: ${A.syllable.kana} at ${A.startSec}s (delayed by ${o.toFixed(3)}s)`),a?.onLateSkip?.(A,o))}})()}else{let o=u-e.currentTime;n(A.syllable,{trackId:"",pitch:A.pitch,velocity:100,volume:s,when:o,duration:A.durationSec,pan:t.pan}),await new Promise(e=>setTimeout(e,0))}}};for(let e of t)n(e)},stopStream:s,reset:()=>{for(let e of(s(),A.values()))e.reset?.()}}},e6=[[0,2,4,5,7,9,11],[0,2,3,5,7,8,10],[0,2,4,7,9]],e4=e=>{let{tracks:t}=e,o=[];for(let e=0;e<t.length;e++){let a=[],r=0;for(let o of t[e])if(r+=o.delta,o.noteOn&&o.noteOn.velocity>0)a.push({pitch:o.noteOn.noteNumber,channel:o.channel??0});else if(o.noteOff||o.noteOn&&0===o.noteOn.velocity){let e=o.noteOff||o.noteOn;if(e){for(let t=a.length-1;t>=0;t--)if(a[t].pitch===e.noteNumber&&void 0===a[t].end){a[t].end=r;break}}}let n=a.filter(e=>void 0!==e.end),l=n.filter(e=>9!==e.channel);n.length>0&&0===l.length||o.push({index:e,name:`Ch${e+1}`,noteCount:l.length,selected:l.length>0})}return o},e8=e=>{let{tracks:t}=e;for(let e of t)for(let t of e)if(t.setTempo&&"number"==typeof t.setTempo.microsecondsPerQuarter)return 6e7/t.setTempo.microsecondsPerQuarter;return 120},e9=e=>[(65280&e)>>8,255&e],e7=e=>[(0xff0000&e)>>16,...e9(e)],te=e=>[(0xff000000&e)>>24,...e7(e)],tt=e=>{let t=[127&e],o=e>>7;for(;o>0;)t.push(127&o|128),o>>=7;return t.reverse()},to=(e,t)=>{e.push(77,84,114,107);let o=[];t(o),o.push(...tt(0)),o.push(255,47,0),e.push(...te(o.length)),e.push(...o)},ta=class{#e;constructor(){this.#e={value:null,prev:null,next:null}}add(e){let t={value:e,prev:this.#e,next:null};this.#e.next=t,this.#e=t}undo(){let{prev:e}=this.#e;return null===e||null===e.value?null:(this.#e=e,this.#e.value)}redo(){let{next:e}=this.#e;return null===e||null===e.value?null:(this.#e=e,this.#e.value)}canUndo(){return this.#e.prev?.value!==null}canRedo(){let{next:e}=this.#e;return null!==e&&null!==e.value}},tr=0,tn=0,tl=()=>({x:tr,y:tn}),tA=new Set([1,3,6,8,10]),tu=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],ti=()=>{d.clearRect(0,0,u.width,u.height);let{keyHeight:e,keyCount:t,pitchRangeStart:o}=g,a=Math.floor(tn/e)*e,r=tn+u.height,n="#ccc8b4";for(let l=a;l<r;l+=e){let a=t-1-l/e+o,r=a%12,A=tA.has(r),u=4==Math.floor(a/12)-1,i=l-tn,s=Math.floor(37.2);if(A?(d.fillStyle=u?"#d8d4be":n,d.fillRect(0,i,60,e),d.fillStyle=u?"#1a1408":"#111111",d.fillRect(0,i,s,e),d.strokeStyle="#383838",d.lineWidth=1,d.beginPath(),d.moveTo(s,i),d.lineTo(s,i+e),d.stroke()):(d.fillStyle=u?"#dedad0":n,d.fillRect(0,i,60,e),(5===r||0===r)&&(d.strokeStyle="#807a6a",d.lineWidth=1,d.beginPath(),d.moveTo(0,i+e-.5),d.lineTo(60,i+e-.5),d.stroke())),0===r){let t=Math.floor(a/12)-1;d.fillStyle="#555040",d.font="10px 'k8x12',monospace",d.textAlign="right",d.textBaseline="bottom",d.fillText(`${tu[r]}${t}`,56,i+e-2)}}d.beginPath(),d.strokeStyle="#29adff",d.lineWidth=2,d.moveTo(60,0),d.lineTo(60,u.height),d.stroke()},ts=()=>{s.clearRect(0,0,A.width,A.height);let{stepWidth:e,stepsPerBar:t}=g;s.save(),s.translate(-tr,0),s.fillStyle="#0a0f1f",s.fillRect(tr,0,A.width,20),s.strokeStyle="#3d405b",s.lineWidth=1,s.font="11px 'k8x12',monospace",s.fillStyle="#83769c";let o=Math.floor(tr/(t*e)),a=Math.ceil((tr+A.width)/(t*e));for(let r=o;r<=a+1;r++){let o=r*t*e;s.beginPath(),s.moveTo(o,0),s.lineTo(o,20),s.stroke(),r>=0&&(s.textAlign="left",s.textBaseline="middle",s.fillText(`${r+1}`,o+5,10))}s.restore()},td=(e,t=[59,130,246,1])=>{let{keyHeight:o,stepWidth:a,keyCount:r,pitchRangeStart:n}=g;for(let l of e){let e=l.startStep*a,A=(r-1-(l.pitch-n))*o,u=l.durationSteps*a,i=e-tr,s=A-tn,d=void 0!==l.velocity?.5+l.velocity/127*.5:1,[g,m,p,C]=t,h=C*d;c.fillStyle=`rgba(${g},${m},${p},${h})`,c.fillRect(i+1,s+1,u-2,o-2)}},tc=e=>{let[t,o]=(e=>{let{clientX:t,clientY:o}=e,a=i.getBoundingClientRect();return[Math.floor(t-a.left),Math.floor(o-a.top),e.buttons]})(e),{keyCount:a,pitchRangeStart:r,keyHeight:n,stepWidth:l}=g;return{step:Math.floor((t+tr)/l),pitch:a-1-Math.floor((o+tn)/n)+r,x:t,y:o}},tg=(e,t)=>{tr=e,tn=t,ti(),ts()},tm=["c","c+","d","d+","e","f","f+","g","g+","a","a+","b"],tp=class e{notes=[];nextNoteId=0;handlers;volume=80;tempo=120;history=new ta;isUndoRedo=!1;isBatchOperation=!1;lastHistorySnapshot="[]";lastUndoTime=0;static UNDO_DEBOUNCE_MS=100;toolMode="pen";constructor(e,t=80){this.handlers=e,this.volume=t,this.lastHistorySnapshot=JSON.stringify(this.notes),this.history.add([]),this.generateAndNotify()}beginBatch(){this.isBatchOperation=!0}endBatch(){this.isBatchOperation=!1,this.saveHistory()}saveHistory(){if(this.isUndoRedo||this.isBatchOperation)return;let e=JSON.stringify(this.notes);e!==this.lastHistorySnapshot&&(this.lastHistorySnapshot=e,this.history.add(JSON.parse(e)))}restoreHistory(e){return null!==e&&(this.isUndoRedo=!0,this.notes=JSON.parse(JSON.stringify(e)),this.nextNoteId=this.notes.length>0?Math.max(...this.notes.map(e=>e.id))+1:0,this.lastHistorySnapshot=JSON.stringify(this.notes),this.generateAndNotify(),this.isUndoRedo=!1,!0)}undo(){let t=Date.now();return!(t-this.lastUndoTime<e.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=t,this.restoreHistory(this.history.undo()))}redo(){let t=Date.now();return!(t-this.lastUndoTime<e.UNDO_DEBOUNCE_MS)&&(this.lastUndoTime=t,this.restoreHistory(this.history.redo()))}canUndo(){return this.history.canUndo()}canRedo(){return this.history.canRedo()}setToolMode(e){this.toolMode=e}getToolMode(){return this.toolMode}resetHistory(){this.history=new ta,this.history.add([]),this.lastHistorySnapshot=JSON.stringify(this.notes)}addHistoryOnce(){this.lastHistorySnapshot="[]",this.saveHistory()}clearNotesWithoutHistory(){this.notes=[],this.nextNoteId=0,this.lastHistorySnapshot="[]"}setLoadMode(e){this.isUndoRedo=e}addNote(e,t,o){if(-1===this.notes.findIndex(o=>o.startStep===e&&o.pitch===t)){let a={id:this.nextNoteId++,startStep:e,durationSteps:o.noteLengthSteps,pitch:t,velocity:o.velocity??100};this.notes.push(a)}this.notes.sort((e,t)=>e.startStep-t.startStep),this.saveHistory(),this.generateAndNotify()}deleteNoteById(e){let t=this.notes.findIndex(t=>t.id===e);-1!==t&&(this.notes.splice(t,1),this.saveHistory(),this.generateAndNotify())}getMaxStep(){return 0===this.notes.length?0:12*Math.ceil(Math.max(...this.notes.map(e=>e.startStep+e.durationSteps))/12)}moveNote(e,t,o){let a=this.notes.find(t=>t.id===e);if(!a)return;let r=this.getMaxStep()+g.stepsPerBar,n=g.pitchRangeStart,l=n+g.keyCount-1,A=Math.min(Math.max(o,n),l),u=Math.min(Math.max(t,0),r-a.durationSteps);a.startStep=u,a.pitch=A,this.notes.sort((e,t)=>e.startStep-t.startStep),this.generateAndNotify()}moveNoteEnd(e){this.saveHistory()}resizeNote(e,t){let o=this.notes.find(t=>t.id===e);o&&(o.durationSteps=Math.max(1,t),this.notes.sort((e,t)=>e.startStep-t.startStep),this.generateAndNotify())}resizeNoteEnd(e){this.saveHistory()}getNotes(){return this.notes}getMML(e){return this.generateMML(e)}setVolume(e){this.volume=e,this.generateAndNotify()}setTempo(e){this.tempo=e,this.generateAndNotify()}generateAndNotify(){this.handlers.onNotesChanged([...this.notes]);let e=this.generateMML();this.handlers.onMMLGenerated(e)}stepsToMMLDuration(e,t){let o=g.stepsPerBar,a="64",r=1/0;for(let n of[{dur:"1.",s:1.5*o},{dur:"1",s:o/1},{dur:"2.",s:o/2*1.5},{dur:"2",s:o/2},{dur:"4.",s:o/4*1.5},{dur:"4",s:o/4},{dur:"8.",s:o/8*1.5},{dur:"8",s:o/8},{dur:"12",s:o/12},{dur:"16.",s:o/16*1.5},{dur:"16",s:o/16},{dur:"24",s:o/24},{dur:"32",s:o/32},{dur:"64",s:o/64}]){if(n.s>t)continue;let o=Math.abs(e-n.s);o<r&&(r=o,a=n.dur)}return a}findBestFitDuration(e){let t=g;for(let o of[1,2,4,8,12,16,24,32,48,64]){let a=t.stepsPerBar/o;if(e>=a)return{dur:o,steps:a}}return{dur:64,steps:t.stepsPerBar/64}}getNoteWithOctave(e,t){let o=Math.floor(e/12)-1,a=tm[e%12];return -1===t||Math.abs(o-t)>=2?{text:`o${o}${a}`,currentOctave:o}:o===t?{text:a,currentOctave:o}:o===t+1?{text:`>${a}`,currentOctave:o}:o===t-1?{text:`<${a}`,currentOctave:o}:{text:`o${o}${a}`,currentOctave:o}}generateMML=e=>{let t=g,o=e??this.volume,a=`t${this.tempo} v${o}`,r=[],n=-1,l=0;if(0===this.notes.length)return a;let A=Math.max(...this.notes.map(e=>e.startStep+e.durationSteps)),u=new Map;for(let e of this.notes){let t=u.get(e.startStep)??[];t.push(e),u.set(e.startStep,t)}let i=Array.from(u.keys()).sort((e,t)=>e-t),s=t.stepsPerBar/64,d=e=>{for(;e-l>=s;){let t=e-l,{dur:o,steps:a}=this.findBestFitDuration(t);r.push(`r${o}`),l+=a}};for(let e=0;e<i.length;e++){let t=i[e],o=u.get(t);if(!o)continue;d(t);let a=(i[e+1]??A)-l;if(a<s)continue;let c=o[0].durationSteps,g=this.stepsToMMLDuration(c,a),m=this.getStepFromDottedMML(g);if(o.length>1){let e=o.map(e=>{let t=Math.floor(e.pitch/12)-1,o=tm[e.pitch%12];return`o${t}${o}`});r.push(`[${e.join("")}]${g}`)}else{let{text:e,currentOctave:t}=this.getNoteWithOctave(o[0].pitch,n);r.push(`${e}${g}`),n=t}l+=m}return d(A),`${a} ${r.join(" ")}`};getMMLFromNotes(e,t,o){let a=this.notes,r=this.tempo,n=this.volume;this.notes=[...e].sort((e,t)=>e.startStep-t.startStep),void 0!==t&&(this.tempo=t),void 0!==o&&(this.volume=o);let l=this.generateMML();return this.notes=a,this.tempo=r,this.volume=n,l}getStepFromDottedMML(e){let t=g.stepsPerBar,o=e.endsWith("."),a=t/parseInt(o?e.slice(0,-1):e,10);return o?1.5*a:a}},tC=`
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
`,th={c:0,d:2,e:4,f:5,g:7,a:9,b:11},tB=(e,t,o)=>Math.min(o,Math.max(t,e)),tE=/#(inst|drum|volume|drumvolume|mode)=([\w-]+)/gi,tf=/#t(\d+)inst=([^#;\r\n]+)/gi,tQ=e=>{let t={};for(let o of e.matchAll(tE)){let e=o[1].toLowerCase();if("inst"===e)t.instrument=o[2];else if("drum"===e)t.drum=o[2];else if("volume"===e){let e=Number.parseInt(o[2],10);Number.isNaN(e)||(t.volume=e)}else if("drumvolume"===e){let e=Number.parseInt(o[2],10);Number.isNaN(e)||(t.drumVolume=e)}else"mode"===e&&("simple"===o[2]||"advanced"===o[2])&&(t.mode=o[2])}for(let o of e.matchAll(tf)){let e=Number.parseInt(o[1],10),a=o[2].trim();!Number.isNaN(e)&&a&&(t.trackInstruments??={},t.trackInstruments[e]=a)}return t},tI=(e,t="")=>{let o=[];if(e.instrument&&o.push(`#inst=${e.instrument}`),e.drum&&o.push(`#drum=${e.drum}`),void 0!==e.volume&&o.push(`#volume=${e.volume}`),void 0!==e.drumVolume&&o.push(`#drumvolume=${e.drumVolume}`),e.mode&&o.push(`#mode=${e.mode}`),e.trackInstruments)for(let[t,a]of Object.entries(e.trackInstruments))a&&o.push(`#t${t}inst=${a}`);return o.join(t)},tv=(e,t={})=>{let o=t.stepsPerBar??192,a=t.collectTokens??!1,r=t.collectLyrics??!1,n=t.clampTrackCount,l=[],A=new Map,u=null;if(!e)return{placements:l,bpm:u,tokenTracks:a?A:void 0,lyrics:r?new Map:void 0,mergedTrackCount:0,meta:{}};let i=e.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,""),s=tQ(i),d=i.replace(tE,"").replace(tf,""),c=r?(e=>{let t=new Map,o=eN(e);for(let e=0;e<o.length;e++){let a=o[e].match(eL);if(!a)continue;let r=Number.parseInt(a[1],10),n=a[2].trim(),l=200,A=100,u=64,i=0,s=n.match(/^([a-z_]+?)(?=(?:[vqpo]-?\d)|[^a-z_]|$)(?::(\d+))?/i),d="",c=[];for(s&&(d=s[1].toLowerCase(),s[2]&&(l=eT(Number.parseInt(s[2],10),0,400)),c.push(s[0]),n=n.substring(s[0].length).trim());;){let e=n.match(/^v(\d+)/i);if(e){l=eT(Number.parseInt(e[1],10),0,400),c.push(e[0]),n=n.substring(e[0].length).trim();continue}let t=n.match(/^q(\d+)/i);if(t){A=eT(Number.parseInt(t[1],10),0,100),c.push(t[0]),n=n.substring(t[0].length).trim();continue}let o=n.match(/^p(\d+)/i);if(o){u=eT(Number.parseInt(o[1],10),0,127),c.push(o[0]),n=n.substring(o[0].length).trim();continue}let a=n.match(/^o(-?\d+)/i);if(a){i=eT(Number.parseInt(a[1],10),-2,2),c.push(a[0]),n=n.substring(a[0].length).trim();continue}break}let g=[n];for(;e+1<o.length&&eR(o[e+1]);)g.push(o[++e]);let{syllables:m,lineBreaks:p}=eS(g);t.set(r,{trackId:r,model:d,volume:l,gate:A,pan:u,octave:i,syllables:m,metaText:c.join(" "),...p.length>0?{lineBreaks:p}:{}})}return t})(d):void 0,g=ew.replace(/;+$/,""),m=RegExp(`(?<![cdafgCDAFG])${g}\\b;?`,"gi"),p=(e=>{let t=eN(e),o=[];for(let e=0;e<t.length;e++){if(eL.test(t[e])){for(;e+1<t.length&&eR(t[e+1]);)e++;continue}o.push(t[e])}return o.join("\n")})(d).replace(m,"").replace(/[\n\r]+/g," ").trim().split(/(@\d+)/).filter(e=>e.trim().length>0),C=0,h=0,B=4,E=0,f=16,Q=new Map,I=()=>{let e=Q.get(C);e||(e=new Set,Q.set(C,e)),e.add(h)};for(let e of p){let t=e.trim();if(t.startsWith("@")){let e=Number.parseInt(t.substring(1),10);h=e,void 0!==n&&e>=n&&(e=n-1),C=e,B=4,E=0,f=16;continue}let r=t.replace(/\s+/g,"").toLowerCase(),i=0,s=(e,t,o,n)=>{if(!a)return;let l=A.get(C);l||(l=[],A.set(C,l)),l.push({text:r.slice(n,i),startStep:t,durationSteps:o,type:e})},d=()=>{let e="";for(;i<r.length&&/\d/.test(r[i]);)e+=r[i],i++;let t=Math.round(o/(e?tB(Number.parseInt(e,10),1,64):f));for(;i<r.length&&"."===r[i];)t=Math.round(1.5*t),i++;return t};for(;i<r.length;){let e=r[i],t=i;if("o"===e){i++;let e="";for(;i<r.length&&/\d/.test(r[i]);)e+=r[i],i++;B=e?tB(Number.parseInt(e,10),0,8):4,s("octave",E,0,t)}else if(">"===e)B=Math.min(8,B+1),i++,s("shift",E,0,t);else if("<"===e)B=Math.max(0,B-1),i++,s("shift",E,0,t);else if("l"===e){i++;let e="";for(;i<r.length&&/\d/.test(r[i]);)e+=r[i],i++;f=tB(Number.parseInt(e,10)||16,1,64),s("length",E,0,t)}else if("r"===e){i++;let e=E,o=d();s("rest",e,o,t),E+=o}else if("t"===e||"v"===e||"q"===e||"p"===e){i++;let o="";for(;i<r.length&&/\d/.test(r[i]);)o+=r[i],i++;"t"===e&&o&&null===u&&(u=tB(Number.parseInt(o,10),1,255)),s("ctrl",E,0,t)}else if("["===e){i++;let e=[],o=B;for(;i<r.length&&"]"!==r[i];){let t=r[i];if(Object.hasOwn(th,t)){let o=th[t];++i<r.length&&("#"===r[i]||"+"===r[i])?(o++,i++):i<r.length&&"-"===r[i]&&(o--,i++),e.push((B+1)*12+o)}else if(">"===t)B=Math.min(8,B+1),i++;else if("<"===t)B=Math.max(0,B-1),i++;else if("o"===t){i++;let e="";for(;i<r.length&&/\d/.test(r[i]);)e+=r[i],i++;B=e?tB(Number.parseInt(e,10),0,8):4}else i++}i<r.length&&"]"===r[i]&&i++;let a=d();for(let t of(e.length>0&&I(),e))l.push({trackIndex:C,startStep:E,pitch:t,durationSteps:Math.max(1,a)});s("chord",E,Math.max(1,a),t),E+=a,B=o}else if(Object.hasOwn(th,e)){let o=th[e];++i<r.length&&("#"===r[i]||"+"===r[i])?(o++,i++):i<r.length&&"-"===r[i]&&(o--,i++);let a=(B+1)*12+o,n=d();I(),l.push({trackIndex:C,startStep:E,pitch:a,durationSteps:Math.max(1,n)}),s("note",E,Math.max(1,n),t),E+=n}else i++}}let v=0;for(let e of Q.values())e.size>=2&&v++;return{placements:l,bpm:u,tokenTracks:a?A:void 0,lyrics:c,mergedTrackCount:v,meta:s}},ty=(e,t,o,a)=>"step"in e?e.step:"bar"in e?Math.max(0,e.bar-1)*o:"seconds"in e?e.seconds/a:0,tb=e=>{let t=[],o=0,a=0,r=null,n=null,l=!1,A=0,u=new Map,i=-1,s=-1,d=!1,c=0,g=0,m=0,p=0,C=0,h=0,B=0,E=0,f=()=>60/e.getBpm()/48,Q=(e,t)=>!d||C<=0||e<p?A+e/t:c+(e-p)%C/t,I=()=>{let r=f(),n=e.getAudioTime()-o,l=e.getSoloTrackId(),A=performance.now()/1e3;if(i>0&&s>=0){let t=A-i,o=n-s;if(t>.5||o>.5){console.warn(`[sequencer] Interruption detected (realDelta: ${t.toFixed(3)}s, audioDelta: ${o.toFixed(3)}s). Stopping playback.`),y(),e.onEnd(!0);return}}for(let t of(i=A,s=n,e.getTracks()))u.set(t.id,t.volume);for(;;){let o=t[a];if(a>=t.length||d&&o&&o.when>=p){if(!d||C<=0)break;a=h,B+=C,o=t[a]}if(!o)break;let r=o.when+B-n;if(r>.5)break;if(a++,l&&o.trackId!==l)continue;let A=o.velocity/127,i=(u.get(o.trackId)??100*o.volume)/100;e.onPlayNote({trackId:o.trackId,pitch:o.pitch,velocity:o.velocity,volume:i*A,when:Math.max(0,r),duration:o.duration})}let m=e.getDrumPattern();if(m&&m.length>0){let{stepsPerBar:t}=e,o=Q(n,r)%t,a=o+4,l=o<4;for(let t of m){if(!(l&&0===t.step||t.step>=o&&t.step<a))continue;let n=(t.step-o)*r;n<-.1||n>.5||e.onPlayDrum({pitch:t.pitch,velocity:t.velocity??1,when:Math.max(0,n),duration:.1})}}if(n>=0){let t=Q(n,r);if(e.cues&&e.cues.length>0&&e.onCue){let o=e.getBpm(),a=e.stepsPerBar,n=(e,t,o)=>{if(o>=t)return e>t&&e<=o;{let a=e>t&&e<=g,r=e>=c&&e<=o;return a||r}};for(let l of e.cues)n(ty(l.time,o,a,r),E,t)&&e.onCue(l.id)}E=t}if(!d){let o=t[t.length-1],r=o?.when??0,l=o?.duration??0;a>=t.length&&n>r+l+.1&&(y(),e.onEnd(!1))}},v=()=>{if(!l)return;let t=f(),a=e.getAudioTime()-o;e.onTick(Q(a,t)),n=requestAnimationFrame(v)},y=()=>{null!==r&&(clearInterval(r),r=null),null!==n&&(cancelAnimationFrame(n),n=null),l=!1};return{start:Q=>{if(y(),(o=>{t=[],u=new Map;let a=f(),r=e.getBpm(),n=e.stepsPerBar,l=e.getLoop?.()??!1;if(d=!!l,"object"==typeof l){c=l.start?ty(l.start,r,n,a):0;let e=l.end?ty(l.end,r,n,a):null;g=null!==e?e:-1}else c=0,g=-1;let A=d?Math.min(o,c):o,i=0;for(let r of e.getTracks())for(let e of(u.set(r.id,r.volume),r.notes)){if(e.startStep<A)continue;let n=(e.startStep-o)*a,l=e.durationSteps*a;i=Math.max(i,e.startStep+e.durationSteps),t.push({trackId:r.id,pitch:e.pitch,volume:r.volume/100,velocity:e.velocity??127,when:n,duration:l})}for(t.sort((e,t)=>e.when-t.when),-1===g&&(g=i),m=(c-o)*a,C=(p=(g-o)*a)-m,h=0;h<t.length&&!(o+t[h].when/a>=c-1e-4);)h++})(A=Q??e.getPlayStartStep()),0===t.length&&!e.getDrumPattern()?.length)return;l=!0,o=e.getAudioTime()+.1;let b=f();for(a=0;a<t.length&&!(A+t[a].when/b>=A-1e-4);)a++;B=0,E=A-1e-4,i=-1,s=-1,r=setInterval(I,20),n=requestAnimationFrame(v)},stop:y,isActive:()=>l,getStartTime:()=>o}},tw="dtm-daw-styles",tF=`
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
`,tk=(e=document)=>{if(e.getElementById(tw))return;let t=e.createElement("style");t.id=tw,t.textContent=tF,e.head.appendChild(t)},tx=(e,t)=>{let o=e.style.position;"static"===window.getComputedStyle(e).position&&(e.style.position="relative");let a=e.ownerDocument??document,r=a.createElement("div");r.className="dtm-overlay";let n=a.createElement("div");n.className="dtm-spinner";let l=a.createElement("i");l.className="dtm-spinner-fill",n.appendChild(l),r.appendChild(n);let A=a.createElement("div");if(A.className="dtm-loading-label",r.appendChild(A),t?.onSkip){let e=a.createElement("button");e.type="button",e.className="dtm-overlay-skip-btn",e.textContent=t.skipLabel??"音声合成をスキップ",e.addEventListener("click",o=>{o.stopPropagation(),e.disabled=!0,t.onSkip?.()}),r.appendChild(e)}return e.appendChild(r),{remove:()=>{r.parentNode&&(r.remove(),e.style.position=o)},setProgress:(e,t,o)=>{if(t>0){let a=Math.max(0,Math.min(100,Math.round(e/t*100)));n.classList.add("dtm-spinner--determinate"),l.style.width=`${a}%`,null!=o?A.textContent=`${e} / ${t} (${a}%) - \u3042\u3068\u7D04 ${o} \u79D2`:A.textContent=`${e} / ${t} (${a}%)`}else n.classList.remove("dtm-spinner--determinate"),l.style.width="0",A.textContent=""}}},tD={puyuyu:"data:image/png;base64,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",rino:"data:image/png;base64,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",roze:"data:image/png;base64,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",ruko:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYAAAAGACAYAAACkx7W/AAAQAElEQVR4AezXv4tl5RkH8HemiGCTxikCG2yUQTYkVZp1ZTcKKQZJmwVxAxZinRQJWFgJ6e3GKrsI8wcsduIEZk2TKpCAG0EEi8CmFpTAZGd/qDPOnXvvuec5533f5yO+O3PvPed9n+fznJkvs13817XAzs7OscVg6DPQ9Q+H5ooA8BAQIEAgqYAASDp4bRMoCNILCID0jwAAAgSyCgiArJPXNwEC6QUEQNpHQOMECGQXEADZnwD9EyCQVkAApB29xgkQyCrwpG8B8ETCVwIECCQTEADJBq5dAgQIPBEQAE8kfCWQRUCfBB4LCIDHEL4QIEAgm4AAyDZx/RIgQOCxgAB4DJHni04JECDwSEAAPHLwLwECBNIJCIB0I9cwAQJZBc72LQDOinhNgACBJAICIMmgtUmAAIGzAgLgrIjXBHoV0BeBMwIC4AyIlwQIEMgiIACyTFqfBAgQOCMgAM6A9PtSZwQIEDgtIABOe3hFgACBNAICIM2oNUqAQFaBRX1vX7969dhabLAIbqz3d3Z2jiPX5d3dYvVrMNZzuGifyGdzir0X9TXW+63/7vQXwFhPgn0IECDQmIAAaGxgyiWwtoAbCCwQEAALYLxNgACB3gUEQO8T1h8BAgQWCAiABTD9vK0TAgQInC8gAM538S4BAgS6FxAA3Y9YgwQIZBVY1rcAWCbkcwIECHQqIAA6Hay2CBAgsExAACwT8jmBVgXUTWCJgABYAuRjAgQI9CogAHqdrL4IECCwREAALAFq92OVEyBA4GIBAXCxj08JECDQrYAA6Ha0GiNAIKvAqn0LgFWlXEeAAIHOBARAZwPVDgECBFYVEACrSrmOQCsC6iSwooAAWBHKZQQIEOhNQAD0NlH9ECBAYEUBAbAiVDuXqZQAAQKrCQiA1ZxcRYAAge4EBEB3I9UQAQJZBdbte/vw6Ggrcq1b0LrX//PTT0vk2tnZOY5cl3d3S+Ra19P1bQlEPjtT7B2tHfmze7J3dP2Rv5tP9vYXQPQE7U+AAIFKBQRApYNRFoG1BdxAYE0BAbAmmMsJECDQi4AA6GWS+iBAgMCaAgJgTbB6L1cZAQIE1hMQAOt5uZoAAQLdCAiAbkapEQIEsgoM7VsADJVzHwECBBoXEACND1D5BAgQGCogAIbKuY9ALQLqIDBQQAAMhHMbAQIEWhcQAK1PUP0ECBAYKCAABsLVc5tKCBAgMExAAAxzcxcBAgSaFxAAzY9QAwQIZBXYtG8BsKmg+wkQINCogABodHDKJkCAwKYCAmBTQfcTmEvAuQQ2FBAAGwK6nQABAq0KCIBWJ6duAgQIbCggADYEnO92JxMgQGAzAQGwmZ+7CRAg0KyAAGh2dAonQCCrwFh9b1+/evU4co1VqH0IEJhe4Munni2R6/Lubolc04uNe+LOzs5x5PIXwLjzshsBAgSaERAAzYxKoQQeC/hCYCQBATASpG0IECDQmoAAaG1i6iVAgMBIAgJgJMjptnESAQIExhEQAOM42oUAAQLNCQiA5kamYAIEsgqM3bcAGFvUfgQIEGhEQAA0MihlEiBAYGwBATC2qP0IRAnYl8DIAgJgZFDbESBAoBUBAdDKpNRJgACBkQUEwMigcdvZmQABAuMKCIBxPe1GgACBZgQEQDOjUigBAlkFovoWAFGy9iVAgEDlAgKg8gEpjwABAlECAiBK1r4ExhKwD4EgAQEQBGtbAgQI1C4gAGqfkPoIECAQJCAAgmDH29ZOBAgQiBEQADGudiVAgED1AgKg+hEpkACBrALRfQuAJcKXd3dL5Hr9xo0Sud69ebNErsjap9h7yfg3/niKHiLP2BhgyQZfPvVsiVxLjk//sQBI/wgAIEAgq4AAyDp5fdcvoEICwQICIBjY9gQIEKhVQADUOhl1ESBAIFhAAAQDD9/enQQIEIgVEACxvnYnQIBAtQICoNrRKIwAgawCU/UtAKaSdg4BAgQqExAAlQ1EOQQIEJhKQABMJe0cAqsKuI7ARAICYCJoxxAgQKA2AQFQ20TUQ4AAgYkEBMBE0Ksf40oCBAhMIyAApnF2CgECBKoTEADVjURBBAhkFZi6bwEwtbjzCBAgUImAAKhkEMogQIDA1AICYGpx5xFYJOB9AhMLCICJwR1HgACBWgQEQC2TUAcBAgQmFhAAE4MvPs4nBAgQmFZAAEzr7TQCBAhUIyAAqhmFQggQyCowV9/br9+4USLXXI21cu7tg4MSua7s7ZXIFVn7FHu/e/NmiVxT9BB5xqWvvyiRq5Wf00V1Rv7uPNn7z++8UyKXvwAWTdb7BAgQ6FxAAHQ+YO01IKBEAjMJCICZ4B1LgACBuQUEwNwTcD4BAgRmEhAAM8F/d6zvCBAgMI+AAJjH3akECBCYXUAAzD4CBRAgkFVg7r4FwNwTcD4BAgRmEhAAM8E7lgABAnMLCIC5J+D8vAI6JzCzgACYeQCOJ0CAwFwCAmAueecSIEBgZgEBMNsAHEyAAIF5BQTAvP5OJ0CAwGwCAmA2egcTIJBVoJa+BUAtk1AHAQIEJhYQABODO44AAQK1CAiAWiahjjwCOiVQiYAAqGQQyiBAgMDUAgJganHnESBAoBIBATD5IBxIgACBOgQEQB1zUAUBAgQmFxAAk5M7kACBrAK19R0eAK/fuFEiVzTo4dFRaXltXbpUItfHBwclckXP98reXolcLT87U9QePd/o/W8/eP4jV3T94QEQ3YD9CRAgQGCYgAAY5uYuAusLuINAZQICoLKBKIcAAQJTCQiAqaSdQ4AAgcoEBMBkA3EQAQIE6hIQAHXNQzUECBCYTEAATEbtIAIEsgrU2rcAqHUy6iJAgECwgAAIBrY9AQIEahUQALVORl39COiEQKUCAqDSwSiLAAEC0QICIFrY/gQIEKhUQACED8YBBAgQqFNAANQ5F1URIEAgXEAAhBM7gACBrAK19y0Aap+Q+ggQIBAkIACCYG1LgACB2gUEQO0TUl+7AionULmAAKh8QMojQIBAlIAAiJK1LwECBCoXEABhA7IxAQIE6hYQAHXPR3UECBAIExAAYbQ2JkAgq0ArfYcHwO2DgxK57t+/XyLX8fFxiVy//8lPS8sr+kH/+MHzE7mi63/ulddKyyvy2T/Z+7OPPiiR68c//3WJXNHPT/T+4QEQ3YD9CRAgQGCYgAAY5uYuAosFfEKgEQEB0MiglEmAAIGxBQTA2KL2I0CAQCMCAmD0QdmQAAECbQgIgDbmpEoCBAiMLiAARie1IQECWQVa61sAtDYx9RIgQGAkAQEwEqRtCBAg0JqAAGhtYuqtV0BlBBoTEACNDUy5BAgQGEtAAIwlaR8CBAg0JiAARhuYjQgQINCWgABoa16qJUCAwGgCAmA0ShsRIJBVoNW+BUCrk1M3AQIENhQQABsCup0AAQKtCgiAVien7noEVEKgUQEB0OjglE2AAIFNBQTApoLuJ0CAQKMCAmDjwdmAAAECbQoIgDbnpmoCBAhsLCAANia0AQECWQVa77v5ALh+9WqJXNEDvvHf/5SWV7RP6/s/88KLpeUV7f/cK6+VyBVdf/T+tw8OSuRqPgCiB2B/AgQI9CogAHqdrL7iBZxAoHEBAdD4AJVPgACBoQICYKic+wgQINC4gAAYPEA3EiBAoG0BAdD2/FRPgACBwQICYDCdGwkQyCrQS98CoJdJ6oMAAQJrCgiANcFcToAAgV4EBEAvk9THdAJOItCJgADoZJDaIECAwLoCAmBdMdcTIECgEwEBsPYg3UCAAIE+BARAH3PUBQECBNYWEABrk7mBAIGsAr31LQB6m6h+CBAgsKKAAFgRymUECBDoTUAA9DZR/cQJ2JlAZwICoLOBaocAAQKrCgiAVaVcR4AAgc4EBMDKA3UhAQIE+hIQAH3NUzcECBBYWUAArEzlQgIEsgr02vf27YODErlah/vVSy+VyPWL994rkeuXn39eIlfr842u/29/+k2JXH/92XaJXJ+8/36JXNH+l77+okSu6Pqj9/cXQLSw/QkQIFCpgACodDDKqkhAKQQ6FRAAnQ5WWwQIEFgmIACWCfmcAAECnQoIgKWDdQEBAgT6FBAAfc5VVwQIEFgqIACWErmAAIGsAr33LQB6n7D+CBAgsEBAACyA8TYBAgR6FxAAvU9Yf8MF3EmgcwEB0PmAtUeAAIFFAgJgkYz3CRAg0LmAAFg4YB8QIECgbwEB0Pd8dUeAAIGFAgJgIY0PCBDIKpClbwGQZdL6JECAwBkBAXAGxEsCBAhkERAAWSatz9UFXEkgiYAASDJobRIgQOCsgAA4K+I1AQIEkggIgB8M2hsECBDIISAAcsxZlwQIEPiBgAD4AYk3CBDIKpCt7+YD4PDoaCtyRT8QT731VolcW5culcgV7dP6/t/cuVMi19+3t0vkat1f/RcLNB8AF7fnUwIECBBYJCAAFsl4P5+AjgkkExAAyQauXQIECDwREABPJHwlQIBAMgEB8O3AfUOAAIFcAgIg17x1S4AAgW8FBMC3FL4hQCCrQNa+BUDWyeubAIH0AgIg/SMAgACBrAICIOvk9f2dgO8IJBUQAEkHr20CBAgIAM8AAQIEkgoIgJJ08tomQCC9gABI/wgAIEAgq4AAyDp5fRMgULITCIDsT4D+CRBIKyAA0o5e4wQIZBcQANmfgMz9651AcgEBkPwB0D4BAnkFBEDe2eucAIHkAokDIPnktU+AQHoBAZD+EQBAgEBWAQGQdfL6JpBYQOuPBATAI4c5/916cHjYunfvXolcn3z4YYlc39y5UyJXZO0ne3/x8sslcv1ra6tErhfffHMrcj149kP/Pzw62opcocVPsLkAmADZEQQIEKhRQADUOBU1xQrYnQCBhwIC4CGDfwgQIJBPQADkm7mOCRAg8FAgYQA87Ns/BAgQSC8gANI/AgAIEMgqIACyTl7fBBIKaPm0gAA47eEVAQIE0ggIgDSj1igBAgROCwiA0x5e9SygNwIETgkIgFMcXhAgQCCPgADIM2udEiBA4JRAogA41bcXBAgQSC8gANI/AgAIEMgqIACyTl7fBBIJaPV8AQFwvot3CRAg0L2AAOh+xBokQIDA+QIC4HwX7/YkoBcCBM4VEADnsniTAAEC/QsIgP5nrEMCBAicK5AgAM7t25sECBBILyAA0j8CAAgQyCogALJOXt8EEgho8WKB7cOjo63IdfHx9X8aaXOy9939/ePIFS18ZW+vRK4fvfpqiVyRtZ/sHe1/7dq1Erkin82TvT/76IOtyBXtH73/ye+IyOUvgOgJ2p8AAQKVCgiASgejrBEEbEGAwIUCAuBCHh8SIECgXwEB0O9sdUaAAIELBToOgAv79iEBAgTSCwiA9I8AAAIEsgoIgKyT1zeBjgW0tpqAAFjNyVUECBDoTkAAdDdSDREgQGA1AQGwmpOrWhJQKwECKwkIgJWYXESAAIH+BARAfzPVEQECBFYS6DAAVurbRQQIEEgvIADSPwIATZ9sxAAABElJREFUCBDIKiAAsk5e3wQ6FNDSegICYD0vVxMgQKAbAQHQzSg1QoAAgfUEBMB6Xq6uWUBtBAisJSAA1uJyMQECBPoREAD9zFInBAgQWEugowBYq28XEyBAIL2AAEj/CAAgQCCrgADIOnl9E+hIQCvDBMID4PDoaCty3d3fP45c9+7dO45cO9evl8g17LFY/a7nf/fH0vL691dflci1umTOKyN/dqfYO/J328ne0U9FeABEN2B/AgQIEBgmIACGubmrJgG1ECAwSEAADGJzEwECBNoXEADtz1AHBAgQGCTQQQAM6ttNBAgQSC8gANI/AgAIEMgqIACyTl7fBDoQ0MJmAgJgMz93EyBAoFkBAdDs6BROgACBzQQEwGZ+7p5TwNkECGwkIAA24nMzAQIE2hUQAO3OTuUECBDYSKDhANiobzcTIEAgvYAASP8IACBAIKuAAMg6eX0TaFhA6eMICIBxHO1CgACB5gQEQHMjUzABAgTGERAA4zjaZUoBZxEgMIqAABiF0SYECBBoT0AAtDczFRMgQGAUgQYDYJS+bUKAAIH0AgIg/SMAgACBrAICIOvk9U2gQQEljysQHgB39/ePI9e4HNPv9uYbb5TIdf/wsESuv/z2Wolcz7zwYolckTZT7B357Jzs/fatWyVyXdnbK5Er+ic68nfbyd7R9YcHQHQD9idAgACBYQICYJibu+YQcCYBAqMKCIBROW1GgACBdgQEQDuzUikBAgRGFWgoAEbt22YECBBILyAA0j8CAAgQyCogALJOXt8EGhJQaoyAAIhxtSsBAgSqFxAA1Y9IgQQIEIgREAAxrnYdU8BeBAiECAiAEFabEiBAoH4BAVD/jFRIgACBEIEGAiCkb5sSIEAgvYAASP8IACBAIKuAAMg6eX0TaEBAibECAiDW1+4ECBCoVkAAVDsahREgQCBWQADE+tp9EwH3EiAQKiAAQnltToAAgXoFBEC9s1EZAQIEQgUqDoDQvm1OgACB9AICIP0jAIAAgawCAiDr5PVNoGIBpU0j0HwAXNnbK5Hr+aefLpEresxv37pVItcf/vG/ErmifSJrP9k70v5k72if1veP/N0wxd539/ePI1fzAdD6A6p+AgQIzCUgAOaSd+5iAZ8QIDCJgACYhNkhBAgQqE9AANQ3ExURIEBgEoEKA2CSvh1CgACB9AICIP0jAIAAgawCAiDr5PVNoEIBJU0rIACm9XYaAQIEqhEQANWMQiEECBCYVkAATOvttIsEfEaAwKQCAmBSbocRIECgHgEBUM8sVEKAAIFJBSoKgEn7dhgBAgTSCwiA9I8AAAIEsgoIgKyT1zeBigSUMo+AAJjH3akECBCYXUAAzD4CBRAgQGAeAQEwj7tTvy/gewIEZhEQALOwO5QAAQLzCwiA+WegAgIECMwiUEEAzNK3QwkQIJBeQACkfwQAECCQVUAAZJ28vglUIKCEeQX+DwAA//+25Zf7AAAABklEQVQDAK8uLU25/m4VAAAAAElFTkSuQmCC",shiyo:"data:image/png;base64,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",teto:"data:image/png;base64,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",tsukuyomi:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAYAAAAGACAYAAACkx7W/AAAQAElEQVR4AezXv4teVRoH8DPDYpoNLAsWYjawAYkQVBBBMGyxnRoxXbrtQmCLtEHSLoibbrFSUm6VLmDM/gNuZWNCQBGEDVjZuNWihbO+mUSdcd55f9z73HvOeT6BMzPv+957zvN8njvzJbvFv1kFbty8tWcxyPoMzPrL5/AiADwEBAgQSCogAJIOXtsECoL0AgIg/SMAgACBrAICIOvk9U2AQHoBAZD2EdA4AQLZBQRA9idA/wQIpBUQAGlHr3ECBLIKPOlbADyR8J0AAQLJBARAsoFrlwABAk8EBMATCd8JZBHQJ4HHAgLgMYRvBAgQyCYgALJNXL8ECBB4LCAAHkPk+aZTAgQI7AsIgH0HXwkQIJBOQACkG7mGCRDIKnC4bwFwWMRrAgQIJBEQAEkGrU0CBAgcFhAAh0W8JtCrgL4IHBIQAIdAvCRAgEAWAQGQZdL6JECAwCEBAXAIpN+XOiNAgMBBAQFw0MMrAgQIpBEQAGlGrVECBLIKLOtbACyTefz+jZu39iLXxQtvFItB1mcg8ndrsffjX2PflggIgCUw3iZAgEDvAgKg9wnrjwABAksEBMASGG8TIECgdwEB0PuE9UeAAIElAgJgCUw/b+uEAAECRwsIgKNdvEuAAIHuBQRA9yPWIAECWQVW9S0AVgn5nAABAp0KCIBOB6stAgQIrBIQAKuEfE6gVQF1E1ghIABWAPmYAAECvQoIgF4nqy8CBAisEBAAK4Da/VjlBAgQOF5AABzv41MCBAh0KyAAuh2txggQyCqwbt8CYF0p1xEgQKAzAQHQ2UC1Q4AAgXUFBMC6Uq4j0IqAOgmsKSAA1oRyGQECBHoTEAC9TVQ/BAgQWFNAAKwJ1c5lKiVAgMB6AgJgPSdXESBAoDsBAdDdSDVEgEBWgU37bj4Abty8tRe5zr7wSolcmw5s0+tv37lbItem9biewC8FLl54o0SuyL8Ni71/2UuLPzcfAC2iq5kAAQI1CAiAGqagBgJjCNiDwIYCAmBDMJcTIECgFwEB0Msk9UGAAIENBQTAhmD1Xq4yAgQIbCYgADbzcjUBAgS6ERAA3YxSIwQIZBXYtm8BsK2c+wgQINC4gABofIDKJ0CAwLYCAmBbOfcRqEVAHQS2FBAAW8K5jQABAq0LCIDWJ6h+AgQIbCkgALaEq+c2lRAgQGA7AQGwnZu7CBAg0LyAAGh+hBogQCCrwNC+BcBQQfcTIECgUQEB0OjglE2AAIGhAgJgqKD7Ccwl4FwCAwUEwEBAtxMgQKBVAQHQ6uTUTYAAgYECAmAg4Hy3O5kAAQLDBATAMD93EyBAoFkBAdDs6BROgEBWgbH6Dg+AGzdv7UWusy+8UiLXWND2qVPg9p27JXLV2bWqCOwLhAfA/jG+EiBAgEBtAgKgtomoh8AqAZ8TGElAAIwEaRsCBAi0JiAAWpuYegkQIDCSgAAYCXK6bZxEgACBcQQEwDiOdiFAgEBzAgKguZEpmACBrAJj9y0Axha1HwECBBoREACNDEqZBAgQGFtAAIwtaj8CUQL2JTCygAAYGdR2BAgQaEVAALQyKXUSIEBgZAEBMDJo3HZ2JkCAwLgCAmBcT7sRIECgGQEB0MyoFEqAQFaBqL4FQJSsfQkQIFC5gACofEDKI0CAQJSAAIiStS+BsQTsQyBIQAAEwdqWAAECtQsIgNonpD4CBAgECQiAINjxtrUTAQIEYgQEQIyrXQkQIFC9gACofkQKJEAgq0B03wIgWnjF/p8//KZErvM/fFsiV2TtU+x99oVXSuS6feduiVwrHq/BH0fPYHCBNhgkIAAG8bmZAAEC7QoIgHZnp/LeBfRHIFhAAAQD254AAQK1CgiAWiejLgIECAQLCIBg4O23dycBAgRiBQRArK/dCRAgUK2AAKh2NAojQCCrwFR9C4CppJ1DgACBygQEQGUDUQ4BAgSmEhAAU0k7h8C6Aq4jMJGAAJgI2jEECBCoTUAA1DYR9RAgQGAiAQEwEfT6x7iSAAEC0wgIgGmcnUKAAIHqBARAdSNREAECWQWm7lsATC3uPAIECFQiIAAqGYQyCBAgMLWAAJha3HkElgl4n8DEAgJgYnDHESBAoBYBAVDLJNRBgACBiQUEwMTgy4/zCQECBKYVEADTejuNAAEC1QgIgGpGoRACBLIKzNV3eAC8/tm5Ern++M//lcj1/OmnS+R6+9mnSuR67c03S+Sa68Ed69wv7n9aItf5H74tkevzh9+UyDWWs33qFAgPgDrbVhUBAgQICADPAIG5BZxPYCYBATATvGMJECAwt4AAmHsCzidAgMBMAgJgJvifj/UTAQIE5hEQAPO4O5UAAQKzCwiA2UegAAIEsgrM3bcAmHsCzidAgMBMAgJgJnjHEiBAYG4BATD3BJyfV0DnBGYWEAAzD8DxBAgQmEtAAMwl71wCBAjMLCAAZhuAgwkQIDCvgACY19/pBAgQmE1AAMxG72ACBLIK1NK3AKhlEuogQIDAxAICYGJwxxEgQKAWAQFQyyTUkUdApwQqERAAlQxCGQQIEJhaQABMLe48AgQIVCIgACYfhAMJECBQh4AAqGMOqiBAgMDkAgJgcnIHEiCQVaC2vpsPgBPXT5fIdfaZkyVy7Zw6VVpebz/7VGl5Xbt8qUSu81eulMh18dUzJXI9f/rpErmi/yC+/tm5ErnuXX2wF7mifZoPgGgg+xMgQKBXAQHQ62T1VZ+AighUJiAAKhuIcggQIDCVgACYSto5BAgQqExAAEw2EAcRIECgLgEBUNc8VEOAAIHJBATAZNQOIkAgq0CtfQuAWiejLgIECAQLCIBgYNsTIECgVgEBUOtk1NWPgE4IVCogACodjLIIECAQLSAAooXtT4AAgUoFBED4YBxAgACBOgUEQJ1zURUBAgTCBQRAOLEDCBDIKlB73wKg9gmpjwABAkECAiAI1rYECBCoXUAA1D4h9bUroHIClQsIgMoHpDwCBAhECQiAKFn7EiBAoHIBARA2IBsTIECgbgEBUPd8VEeAAIEwAQEQRmtjAgSyCrTSd/MBcPaZkyVy7e3tlcj1+5deKy2vVh70ZXVGznaxd8uzXdQe+bu12HvZXFp5/8X3z+1ErntXH+xFruYDoJUHRZ0ECBCoTUAA1DYR9bQvoAMCjQgIgEYGpUwCBAiMLSAAxha1HwECBBoREACjD8qGBAgQaENAALQxJ1USIEBgdAEBMDqpDQkQyCrQWt8CoLWJqZcAAQIjCQiAkSBtQ4AAgdYEBEBrE1NvvQIqI9CYgABobGDKJUCAwFgCAmAsSfsQIECgMQEBMNrAbESAAIG2BARAW/NSLQECBEYTEACjUdqIAIGsAq32LQBanZy6CRAgMFBAAAwEdDsBAgRaFRAArU5O3fUIqIRAowICoNHBKZsAAQJDBQTAUEH3EyBAoFEBATB4cDYgQIBAmwICoM25qZoAAQKDBQTAYEIbECCQVaD1vnfvXX2wF7lOXD9dItePtZfIFT3g377859LyivZpff+WZ7uo/ZMPPyyR67t3H5bIFf38/Pi3J/Tv54vvn9uJXP4HEP2E2J8AAQKVCgiASgejrAYElEigcQEB0PgAlU+AAIFtBQTAtnLuI0CAQOMCAmDrAbqRAAECbQsIgLbnp3oCBAhsLSAAtqZzIwECWQV66VsA9DJJfRAgQGBDAQGwIZjLCRAg0IuAAOhlkvqYTsBJBDoREACdDFIbBAgQ2FRAAGwq5noCBAh0IiAANh6kGwgQINCHgADoY466IECAwMYCAmBjMjcQIJBVoLe+BUBvE9UPAQIE1hQQAGtCuYwAAQK9CQiA3iaqnzgBOxPoTEAAdDZQ7RAgQGBdAQGwrpTrCBAg0JmAAFh7oC4kQIBAXwICoK956oYAAQJrCwiAtalcSIBAVoFe+97910sPSuT67t2HJXJF1r7Y+/sPPiiR68tX/1Ai13/+9tcSuZr/xfj661ICV+Rsp9i79fmeuH66RK7WffwPoPUJqp8AAQJbCgiALeHclkhAqwQ6FRAAnQ5WWwQIEFglIABWCfmcAAECnQoIgJWDdQEBAgT6FBAAfc5VVwQIEFgpIABWErmAAIGsAr33LQB6n7D+CBAgsERAACyB8TYBAgR6FxAAvU9Yf9sLuJNA5wICoPMBa48AAQLLBATAMhnvEyBAoHMBAbB0wD4gQIBA3wICoO/56o4AAQJLBQTAUhofECCQVSBL3wIgy6T1SYAAgUMCAuAQiJcECBDIIiAAskxan+sLuJJAEgEBkGTQ2iRAgMBhAQFwWMRrAgQIJBEQAL8atDcIECCQQ0AA5JizLgkQIPArAQHwKxJvECCQVSBb3+EBcOL66RK5ogf2j9/8vkSup956q0SuaB/7Hy8QOdvF3p/u7pbI9cnu70rkivzbsNj7u3cflsi1OCNy3bh5ay9y7R7/+PqUAAECBHoVEAC9TlZfmwu4g0AyAQGQbODaJUCAwBMBAfBEwncCBAgkExAAPw3cDwQIEMglIAByzVu3BAgQ+ElAAPxE4QcCBLIKZO1bAGSdvL4JEEgvIADSPwIACBDIKiAAsk5e3z8L+IlAUgEBkHTw2iZAgIAA8AwQIEAgqYAAKEknr20CBNILCID0jwAAAgSyCgiArJPXNwECJTuBAMj+BOifAIG0AgIg7eg1ToBAdgEBkP0JyNy/3gkkFxAAyR8A7RMgkFdAAOSdvc4JEEgukDgAkk9e+wQIpBcQAOkfAQAECGQVEABZJ69vAokFtL4vsHvxwhslcu0f0+7Xa5cv7USunVOndiLXvz/+uESu7z/6qLS8Im0We9//+39L5Dp/5cpO5Gr3N3e/8hPXT5fItX9Ku1/9D6Dd2amcAAECgwQEwCA+NzcpoGgCBB4JCIBHDL4QIEAgn4AAyDdzHRMgQOCRQMIAeNS3LwQIEEgvIADSPwIACBDIKiAAsk5e3wQSCmj5oIAAOOjhFQECBNIICIA0o9YoAQIEDgoIgIMeXvUsoDcCBA4ICIADHF4QIEAgj4AAyDNrnRIgQOCAQKIAONC3FwQIEEgvIADSPwIACBDIKiAAsk5e3wQSCWj1aAEBcLSLdwkQINC9gADofsQaJECAwNECAuBoF+/2JKAXAgSOFBAAR7J4kwABAv0LCID+Z6xDAgQIHCmQIACO7NubBAgQSC8gANI/AgAIEMgqIACyTl7fBBIIaPF4AQFwvE/4p/euPtiLXC9f+EuJXF88+FOJXJ/u7pbIdfL++RK5nnvnTIlckc/OYu9rly/tRK7bd+6WyBX+C9z4AQKg8QEqnwABAtsKCIBt5dxXv4AKCRA4VkAAHMvjQwIECPQrIAD6na3OCBAgcKxAxwFwbN8+JECAQHoBAZD+EQBAgEBWAQGQdfL6JtCxgNbWExAA6zm5igABAt0JCIDuRqohAgQIrCcgANZzclVLAmolQGAtAQGwFpOLCBAg0J+AAOhvpjoiQIDAWgIdBsBafbuIAAEC6QUEGfxSpwAABC5JREFUQPpHAAABAlkFBEDWyeubQIcCWtpMQABs5uVqAgQIdCMgALoZpUYIECCwmYAA2MzL1TULqI0AgY0EBMBGXC4mQIBAPwICoJ9Z6oQAAQIbCXQUABv17WICBAikFxAA6R8BAAQIZBUQAFknr28CHQloZTuB8AC4feduiVzXLl/aiVz3rj7Yi1zPvXOmRK7tHov174qsfbH3yfvnS+RanBG51pfc7srI2hd7Rz77i72369pdYwmEB8BYhdqHAAECBMYVEADjetptDgFnEiCwlYAA2IrNTQQIEGhfQAC0P0MdECBAYCuBDgJgq77dRIAAgfQCAiD9IwCAAIGsAgIg6+T1TaADAS0MExAAw/zcTYAAgWYFBECzo1M4AQIEhgkIgGF+7p5TwNkECAwSEACD+NxMgACBdgUEQLuzUzkBAgQGCTQcAIP6djMBAgTSCwiA9I8AAAIEsgoIgKyT1zeBhgWUPo6AABjH0S4ECBBoTkAANDcyBRMgQGAcAQEwjqNdphRwFgECowgIgFEYbUKAAIH2BARAezNTMQECBEYRaDAARunbJgQIEEgvIADSPwIACBDIKiAAsk5e3wQaFFDyuAK7t+/cLZHr2uVLO5FrXA67bSrw5Xtflcj13DtnSuTatF/XE5hSIPJv52Jv/wOYcprOIkCAQEUCAqCiYShlhYCPCRAYVUAAjMppMwIECLQjIADamZVKCRAgMKpAQwEwat82I0CAQHoBAZD+EQBAgEBWAQGQdfL6JtCQgFJjBARAjKtdCRAgUL2AAKh+RAokQIBAjIAAiHG165gC9iJAIERAAISw2pQAAQL1CwiA+mekQgIECIQINBAAIX3blAABAukFBED6RwAAAQJZBQRA1snrm0ADAkqMFRAAsb52J0CAQLUCAqDa0SiMAAECsQICINbX7kME3EuAQKiAAAjltTkBAgTqFRAA9c5GZQQIEAgVqDgAQvu2OQECBNILCID0jwAAAgSyCgiArJPXN4GKBZQ2jcDutcuXdiLXNG04ZZnAl+99VSLXsnPHej+y9in2Hsuh130i//Ys9r59525peUXP3f8AooXtT4AAgUoFBEClg0ldluYJEJhEQABMwuwQAgQI1CcgAOqbiYoIECAwiUCFATBJ3w4hQIBAegEBkP4RAECAQFYBAZB18vomUKGAkqYVEADTejuNAAEC1QgIgGpGoRACBAhMKyAApvV22nECPiNAYFIBATApt8MIECBQj4AAqGcWKiFAgMCkAhUFwKR9O4wAAQLpBQRA+kcAAAECWQUEQNbJ65tARQJKmUdAAMzj7lQCBAjMLiAAZh+BAggQIDCPgACYx92pvxTwMwECswgIgFnYHUqAAIH5BQTA/DNQAQECBGYRqCAAZunboQQIEEgvIADSPwIACBDIKiAAsk5e3wQqEFDCvAL/BwAA//9nWyWoAAAABklEQVQDAH64YK6iXPYhAAAAAElFTkSuQmCC"},tM=["#00e436","#29adff","#ff77a8","#ffec27"],tS=null,tL=new Set,tR={klatt:"軽量ロボ声",...eG},tN=null,tT=null,tU=()=>{tN&&(tN.classList.remove("dtm-player-balloon--visible"),tN=null),tT&&(clearTimeout(tT),tT=null)},tP=e=>{tN===e?tT&&clearTimeout(tT):(tU(),tN=e,e.classList.add("dtm-player-balloon--visible")),tT=setTimeout(()=>{tU()},3e3)},tJ=async(e,t)=>{try{return await navigator.clipboard.writeText(t),!0}catch{try{let o=e.createElement("textarea");o.value=t,o.style.position="fixed",o.style.opacity="0",e.body.appendChild(o),o.select();let a=e.execCommand("copy");return e.body.removeChild(o),a}catch{return!1}}},tK=async e=>{try{if("u">typeof CompressionStream){let t=new CompressionStream("gzip"),o=t.writable.getWriter();o.write((e=>{let t=[];for(let o=0;o<e.length;o++){let a=e.charCodeAt(o);32!==a&&(a<=127?t.push(a):12540===a?t.push(223):a>=12353&&a<=12447?t.push(128+(a-12353)):a>=12449&&a<=12543&&(t.push(255),t.push(128+(a-96-12353))))}return new Uint8Array(t)})(e)),o.close();let a=await new Response(t.readable).arrayBuffer();return`z.${(e=>{let t="";for(let o=0;o<e.length;o++)t+=String.fromCharCode(e[o]);return btoa(t).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")})(new Uint8Array(a))}`}}catch(e){console.warn("[dtm] CompressionStream failed, fallback to encodeURIComponent",e)}return`u.${encodeURIComponent(e)}`},tH=(e,t,o={})=>{tk(e.ownerDocument??document);let{placements:a,bpm:r,tokenTracks:n,lyrics:l,meta:A}=tv(t,{collectTokens:!0,collectLyrics:!0}),u=l??new Map,i=r??o.defaultBpm??120,s=o.drumPatterns??eh,d=A.drum?s[A.drum]??null:null,c=A.volume??o.volume??100,g=A.drumVolume??80,m=o.trackColors??tM,p=o.synth??!o.onPlayNote,C=60/i/48,h=[...new Set(a.map(e=>e.trackIndex))].sort((e,t)=>e-t),B=a.reduce((e,t)=>Math.max(e,t.startStep+t.durationSteps),0),f=a.map(e=>({pitch:e.pitch,when:e.startStep*C,duration:e.durationSteps*C})),Q=[];if(f.length>0){let e=[];try{e=((e,t={})=>{if(!e.length)return{keys:[],chords:[]};let{flat:o=!1,bpm:a,frameSize:r=.5,changePenalty:n=.4,nonChordTonePenalty:l=.55,useKey:A=!0}=t,u=((e,t={})=>{if(!e.length)return[];let{flat:o=!1}=t,a=e.reduce((e,t)=>Math.min(e,t.when),1/0),r=e.reduce((e,t)=>Math.max(e,t.when+Math.max(t.duration,0)),-1/0),n=r-a;if(n<=0){let t=((e,t={})=>{if(!e.length)return[];let{flat:o=!1}=t,a=(e=>{let t=Array(12).fill(0);for(let o of e)"number"==typeof o?t[E(o)]+=1:t[E(o.pitch)]+=o.duration??1;return t})(e);return a.every(e=>0===e)?[]:ea(a,o)})(e.map(e=>({pitch:e.pitch,duration:Math.max(e.duration,1)})),{flat:o})[0];return t?[{key:ee(t),when:a,duration:0}]:[]}let l=t.windowSize??n/4,A=t.hopSize??l/2,u=t.minSegmentDuration??0,i=t.switchMargin??.08,s=[];for(let t=a;t<r-1e-9;t+=A){let n=Math.min(t+A,r),u=Math.min(t+l,r),d=eo(e,Math.max(a,u-l),u),c=s[s.length-1];if(d.every(e=>0===e)){c&&(c.duration=n-c.when);continue}let g=ea(d,o),m=g[0];if(c){let e=g.find(e=>et(e,c.key));e&&m.score-e.score<=i&&(m=e)}c&&et(c.key,m)?c.duration=n-c.when:s.push({key:ee(m),when:t,duration:n-t})}var d=er(s);if(u<=0)return d;let c=d.map(e=>({...e})),g=0;for(;g<c.length&&c.length>1;){if(c[g].duration>=u){g++;continue}g>0?c[g-1].duration+=c[g].duration:(c[g+1].when=c[g].when,c[g+1].duration+=c[g].duration),c.splice(g,1)}return er(c)})(e,t),i=e.reduce((e,t)=>Math.min(e,t.when),1/0),s=e.reduce((e,t)=>Math.max(e,t.when+Math.max(t.duration,0)),-1/0);if(s<=i)return{keys:u,chords:[]};let d=a?60/a:Math.max(r,.001),c=[];for(let t=i;t<s-1e-9;t+=d)c.push(ei(e,t,Math.min(t+d,s)));let g=((e,t)=>{let o=e.length,a=el.length;if(0===o)return[];let r=Array.from({length:o},()=>Array(a).fill(-1)),n=e[0].slice();for(let l=1;l<o;l++){let o=-1/0,A=0;for(let e=0;e<a;e++)n[e]>o&&(o=n[e],A=e);let u=Array(a).fill(0),i=e[l],s=o-t;for(let e=0;e<a;e++)n[e]>=s?(u[e]=i[e]+n[e],r[l][e]=e):(u[e]=i[e]+s,r[l][e]=A);n=u}let l=0;for(let e=1;e<a;e++)n[e]>n[l]&&(l=e);let A=Array(o).fill(0);A[o-1]=l;for(let e=o-1;e>0;e--)A[e-1]=r[e][A[e]];return A})(c.map(e=>{if(e.empty)return Array(el.length).fill(0);let t=A?ec(u,e.when+e.duration/2):null;return el.map(o=>((e,t,o,a)=>{let r=0,n=0;for(let o=0;o<12;o++){let a=e.profile[o];0!==a&&(t.pcs.has(o)?r+=a*t.weights[o]:n+=a)}let l=r-a*n;return 0===e.profile[t.root]&&(l-=.3),-1!==e.bass&&t.root===e.bass&&(l+=.3),o&&(l+=((e,t)=>{let o=new Set(("major"===t.mode?eA:eu).map(e=>E(e+t.tonic))),a=o.has(e.root),r=!0;for(let t of e.pcs)if(!o.has(t)){r=!1;break}let n=0;r?n+=.25:a&&(n+=.1);let l=E(e.root-t.tonic);return(0===l||5===l||7===l)&&(n+=.05),n})(t,o)),l-=.002*t.priority})(e,o,t,l))}),n),m=[];for(let e=0;e<c.length;e++){let t=c[e],a=el[g[e]],r=m[m.length-1];if(r&&r.root===a.root&&r.quality===a.quality){r.duration=t.when+t.duration-r.when;continue}let n=ec(u,t.when+t.duration/2),{symbol:l,rootSymbol:A,inversion:i,bass:s}=eg(a,t.bass,o);m.push({symbol:l,rootSymbol:A,root:a.root,quality:a.quality,bass:s,inversion:i,when:t.when,duration:t.duration,key:n,degree:n?ed(n,a):null})}return{keys:u,chords:m}})(f,{bpm:i}).chords}catch{e=[]}for(let t of e){let e=Math.max(0,Math.round(t.when/C)),o=Math.round((t.when+t.duration)/C);for(let a=e;a<o&&a<=B;a++)Q[a]=t.symbol}let t="";for(let e=0;e<=B;e++)Q[e]?t=Q[e]:Q[e]=t}let I=h.map(e=>{let t=0,o=a.filter(t=>t.trackIndex===e).map(e=>({id:t++,startStep:e.startStep,durationSteps:e.durationSteps,pitch:e.pitch,velocity:100}));return{id:String(e),volume:c,notes:o}}),v=e=>m[e%m.length]??tM[0],y=null,b=()=>(y||(y=new AudioContext),y),w=null,F=()=>(w||(w=((e,t=e.destination)=>({playNote:o=>{let a,r=e.createOscillator(),n=e.createGain();r.type="square",r.frequency.value=(a=o.pitch,440*2**((a-69)/12));let l=e.currentTime+o.when,A=Math.max(1e-4,.06*o.volume*1.5);if(n.gain.setValueAtTime(A,l),n.gain.exponentialRampToValueAtTime(.001,l+o.duration),r.connect(n),"function"==typeof e.createStereoPanner&&o.pan){let a=e.createStereoPanner();a.pan.value=Math.max(-1,Math.min(1,o.pan)),n.connect(a),a.connect(t)}else n.connect(t);r.start(l),r.stop(l+o.duration+.02)},playDrum:o=>{let a=e.currentTime+o.when,r=Math.max(1e-4,Math.min(1,o.velocity)),n=35===o.pitch||36===o.pitch,l=38===o.pitch||39===o.pitch||40===o.pitch;if(n){let o=e.createOscillator(),n=e.createGain();o.frequency.setValueAtTime(150,a),o.frequency.exponentialRampToValueAtTime(50,a+.12),n.gain.setValueAtTime(.9*r,a),n.gain.exponentialRampToValueAtTime(.001,a+.18),o.connect(n).connect(t),o.start(a),o.stop(a+.2),o.onended=()=>o.disconnect();return}let A=l?.18:.05,u=Math.max(1,Math.floor(e.sampleRate*A)),i=e.createBuffer(1,u,e.sampleRate),s=i.getChannelData(0);for(let e=0;e<u;e++)s[e]=2*Math.random()-1;let d=e.createBufferSource();d.buffer=i;let c=e.createBiquadFilter();c.type=l?"bandpass":"highpass",c.frequency.value=l?2e3:8e3;let g=e.createGain();g.gain.setValueAtTime(r*(l?.7:.4),a),g.gain.exponentialRampToValueAtTime(.001,a+A),d.connect(c).connect(g).connect(t),d.start(a),d.stop(a+A),d.onended=()=>{d.disconnect(),c.disconnect(),g.disconnect()}}}))(b())),w),k=null,x=()=>{if(o.singingVoices)return o.singingVoices;if(!k){let e=b();k=e5(e,e.destination)}return k},D=p||!!o.singingVoices,M=e.ownerDocument??document,S=M.createElement("div");S.className="dtm-daw dtm-player";let L=M.createElement("div");L.className="dtm-player-head";let R=M.createElement("button");R.type="button",R.className="dtm-player-play",R.innerHTML=ep("play",12),R.disabled=0===h.length;let N=new Set,T=new Map,U=new Map,P=new Map,J=e=>{N.has(e)?N.delete(e):N.add(e),K(e)},K=e=>{let t=N.has(e),o=P.get(e);o&&o.classList.toggle("is-muted",t);let a=T.get(e);a&&a.classList.toggle("is-muted",t);let r=U.get(e);r&&r.classList.toggle("is-muted",t)},H=M.createElement("div");H.className="dtm-player-mml-header";let O=[];for(let e of h){let t=M.createElement("span");t.className="dtm-player-emoji",t.style.backgroundColor=v(e);let o=M.createElement("span");o.textContent="🥺",t.appendChild(o),t.addEventListener("click",t=>{t.stopPropagation(),J(e)}),H.appendChild(t),O.push(t),U.set(e,t)}let G=M.createElement("div");G.className="dtm-player-more-container";let Y=M.createElement("button");Y.type="button",Y.className="dtm-player-more-btn",Y.innerHTML=ep("more",14),Y.title="メニュー",G.appendChild(Y);let V=M.createElement("div");V.className="dtm-player-menu",V.style.display="none";let q=e=>{let t=M.createElement("button");return t.type="button",t.className="dtm-player-menu-item",t.textContent=e,t},z=q("MMLを表示"),X=q("MML書式とは"),W=q("埋め込む"),j=q("MMLコピー");o._skipInfoModals||(V.appendChild(z),V.appendChild(X),V.appendChild(W)),V.appendChild(j),G.appendChild(V),H.appendChild(G);let Z=e=>{let t=void 0!==e?e:"none"===V.style.display;V.style.display=t?"flex":"none",t?(Y.classList.add("is-active"),M.addEventListener("click",$)):(Y.classList.remove("is-active"),M.removeEventListener("click",$))},$=e=>{G.contains(e.target)||Z(!1)};Y.addEventListener("click",e=>{e.stopPropagation(),Z()});let _=null,en=null,es=()=>{en&&(en.stop(),en.destroy(),en=null),_?.remove(),_=null},em=e=>{es();let t=M.createElement("div");t.className="dtm-modal-overlay";let o=M.createElement("div");o.className="dtm-win dtm-modal";let a=M.createElement("div");a.className="dtm-modal-header";let r=M.createElement("span");r.className="dtm-modal-title",r.textContent=e;let n=M.createElement("button");n.type="button",n.className="dtm-modal-close",n.innerHTML="&times;",n.title="閉じる",a.append(r,n);let l=M.createElement("div");return l.className="dtm-modal-body",o.append(a,l),t.appendChild(o),n.addEventListener("click",e=>{e.stopPropagation(),es()}),t.addEventListener("click",e=>{e.target===t&&es()}),M.body.appendChild(t),_=t,l},eC=(e,t)=>{let o=M.createElement("div");o.style.marginTop="8px";let a=M.createElement("button");a.type="button",a.className="dtm-btn dtm-btn--primary dtm-btn--xs",a.textContent="📋 コピー",a.addEventListener("click",async e=>{e.stopPropagation();let o=await tJ(M,t);a.textContent=o?"✓ コピー完了":"コピー失敗",o&&a.classList.add("dtm-btn--success"),setTimeout(()=>{a.textContent="📋 コピー",a.classList.remove("dtm-btn--success")},1200)}),o.appendChild(a),e.appendChild(o)};o._skipInfoModals||(z.addEventListener("click",e=>{e.stopPropagation(),Z(!1);let a=em("MMLを表示"),r=M.createElement("p");r.textContent="このMMLをコピーして、他のプレイヤーや共有URLに貼り付けて使用できます。",r.style.marginBottom="8px",a.appendChild(r);let n=o.getMml?.()??t,l=n.split(";").map(e=>e.trim()).filter(e=>e.length>0).join(";\n"),A=M.createElement("pre");A.textContent=l,A.style.whiteSpace="pre-wrap",A.style.wordBreak="break-all",A.style.cursor="text",A.addEventListener("click",()=>{let e=M.createRange();e.selectNodeContents(A);let t=M.defaultView?.getSelection();t?.removeAllRanges(),t?.addRange(e)}),a.appendChild(A),eC(a,n)}),X.addEventListener("click",e=>{e.stopPropagation(),Z(!1);let t=em("MMLの書き方解説");t.innerHTML=tC,(e=>{for(let t of e.querySelectorAll(".dtm-modal-sample-copy-btn")){let e=t;e.addEventListener("click",async t=>{t.stopPropagation();let o=e.getAttribute("data-mml")??"",a=e.textContent,r=await tJ(M,o);e.textContent=r?"✓ コピー完了":"コピー失敗",r&&e.classList.add("dtm-btn--success"),setTimeout(()=>{e.textContent=a,e.classList.remove("dtm-btn--success")},1200)})}let t=null,a=e=>{e&&(e.textContent="▶ 試聴",e.classList.remove("dtm-btn--danger"),e.classList.add("dtm-btn--primary"))},r=e=>{e.textContent="■ 停止",e.classList.remove("dtm-btn--primary"),e.classList.add("dtm-btn--danger")};for(let n of e.querySelectorAll(".dtm-modal-sample-play-btn")){let e=n;e.addEventListener("click",n=>{n.stopPropagation();let l=e.getAttribute("data-mml")??"";if(t===e&&en)return void(en.isPlaying()?en.stop():(en.play(),r(e)));en&&(en.stop(),en.destroy(),en=null),a(t),t=e;let A=e.closest(".dtm-modal-sample-box"),u=A?.querySelector(".dtm-modal-sample-player-container");u&&(u.innerHTML="",en=tH(u,l,{onPlayNote:o.onPlayNote,onPlayDrum:o.onPlayDrum,onResumeAudio:o.onResumeAudio,getAudioTime:o.getAudioTime,singingVoices:o.singingVoices,drumPatterns:o.drumPatterns,volume:c,skipConsent:!0,_skipInfoModals:!0,onStop:()=>{t===e&&a(e)}}),r(e),en.play())})}})(t)}),W.addEventListener("click",async e=>{e.stopPropagation(),Z(!1);let a=em("埋め込み"),r=M.createElement("p");r.textContent="生成中...",a.appendChild(r);try{let e=o.embedUrl??"https://onjmin.github.io/dtm/demo/embed.html",n=await tK(t),l=`${e}#${n}`,A=`<iframe src="${l}" width="100%" height="260" frameborder="0" loading="lazy" title="@onjmin/dtm player"></iframe>`;if(!a.isConnected)return;r.remove();let u=M.createElement("p");u.textContent="このHTMLをブログやサイトに貼り付けると、プレイヤーをそのまま埋め込めます。";let i=M.createElement("pre");i.textContent=A,i.style.whiteSpace="pre-wrap",i.style.wordBreak="break-all",a.append(u,i),eC(a,A)}catch(e){console.error("[dtm] failed to generate embed snippet",e),a.isConnected&&(r.textContent="生成に失敗しました")}})),j.addEventListener("click",async e=>{e.stopPropagation(),await tJ(M,o.getMml?.()??t)?j.textContent="コピーしました！":j.textContent="コピー失敗",setTimeout(()=>{j.textContent="MMLコピー"},2e3)});let eB=new Set;for(let[e,t]of u){let o=U.get(e);if(!o)continue;let a=eY[t.model.toLowerCase()],r=a?tD[a]:void 0;if(!r)continue;let n=M.createElement("img");n.src=r,n.width=20,n.height=20,n.style.borderRadius="50%",n.style.objectFit="cover",n.draggable=!1,eB.add(o),o.textContent="",o.appendChild(n);let l=M.createElement("div");l.className="dtm-player-balloon",l.textContent=tR[t.model.toLowerCase()]??t.model,o.appendChild(l),o.addEventListener("mouseenter",()=>{tP(l)}),o.addEventListener("mouseleave",()=>{tN===l&&tU()}),o.addEventListener("click",e=>{e.stopPropagation(),tP(l)})}let eE=new WeakMap,ef=e=>{let t=performance.now(),o=eE.get(e);void 0!==o&&t-o<50||(eE.set(e,t),e.classList.remove("dtm-player-emoji--jump"),e.offsetWidth,e.classList.add("dtm-player-emoji--jump"))},eQ=[],eI=()=>{for(let e of eQ)clearTimeout(e);eQ.length=0},ev=[],ey=e=>{let t=setTimeout(()=>{if(eB.has(e))return;let t=e.querySelector("span");t?t.textContent="😌":e.textContent="😌";let o=setTimeout(()=>{if(eB.has(e))return;let t=e.querySelector("span");t?t.textContent="🥺":e.textContent="🥺",ey(e)},100+50*Math.random());ev.push(o)},2e3+5e3*Math.random());ev.push(t)};for(let e of O)ey(e);let eb=M.createElement("div");for(let e of(eb.className="dtm-player-dots",eb.style.display="none",h)){let t=M.createElement("span");t.className="dtm-player-dot",t.style.backgroundColor=v(e),eb.appendChild(t)}let ew=M.createElement("div");ew.className="dtm-player-beat-row";let eF=[];for(let e=0;e<4;e++){let e=M.createElement("span");e.className="dtm-player-beat-dot",ew.appendChild(e),eF.push(e)}let ek=M.createElement("span");ek.className="dtm-player-bar",ek.textContent="-",ew.appendChild(ek);let ex=M.createElement("span");ex.className="dtm-player-chord",ex.textContent="",ew.appendChild(ex),L.append(R,ew,eb,H),S.appendChild(L);let eD=M.createElement("div");eD.className="dtm-player-message",eD.style.display="none",S.appendChild(eD);let eM=null,eS=0,eL=M.createElement("div");eL.className="dtm-player-body",S.appendChild(eL);let eR=[];for(let e of h){let t=u.get(e),o=!!t&&t.syllables.length>0,r=M.createElement("div");r.className="dtm-player-lane-row",P.set(e,r);let l=M.createElement("div");l.className="dtm-player-lane-label dtm-player-lane-label--btn";let A=M.createElement("span");A.className="dtm-player-dot",A.style.backgroundColor=v(e);let i=M.createElement("span");i.className="dtm-player-lane-no",i.textContent=`@${e}`,l.append(A,i),T.set(e,l),l.addEventListener("click",()=>{J(e)});let s=M.createElement("div");s.className="dtm-player-lane",s.style.setProperty("--tk",v(e));let d=[];if(o){let o=a.filter(t=>t.trackIndex===e).sort((e,t)=>e.startStep-t.startStep),r=(t.gate??100)/100,n=new Set(t.lineBreaks??[]);if(t.metaText){let e=M.createElement("span");e.className="dtm-tk dtm-tk--meta",e.textContent=t.metaText,s.appendChild(e)}let l=Math.min(o.length,t.syllables.length);for(let e=0;e<l;e++){let a=o[e];if(n.has(e)){let e=M.createElement("span");e.className="dtm-tk dtm-tk--break",e.textContent="\\n",s.appendChild(e)}let l=M.createElement("span");l.className="dtm-tk dtm-tk--lyric",l.textContent=t.syllables[e].kana,s.appendChild(l),d.push({el:l,startStep:a.startStep,durationSteps:Math.max(1,Math.round(a.durationSteps*r))})}}else for(let t of n?.get(e)??[]){let e=M.createElement("span");e.className=`dtm-tk dtm-tk--${t.type}`,e.textContent=t.text,s.appendChild(e),t.durationSteps>0&&d.push({el:e,startStep:t.startStep,durationSteps:t.durationSteps})}r.append(l,s),eL.appendChild(r),eR.push({lane:s,tokens:d})}let eN=[...new Set([...u.values()].map(e=>e.model))].filter(e=>eV[e]);if(eN.length>0){let e=M.createElement("div");for(let t of(e.className="dtm-player-terms",e.style.fontSize="10px",e.style.color="var(--dtm-warn)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="4px",e.style.marginTop="4px",e.style.padding="0 4px",eN)){let o=M.createElement("div");o.style.display="flex",o.style.alignItems="center",o.style.gap="4px",o.style.flexWrap="wrap";let a=eG[t]??t,r=eV[t],n=M.createElement("span");n.textContent="使用時には";let l=M.createElement("a");l.textContent=`${a}UTAU\u97F3\u6E90`,l.href=r,l.target="_blank",l.rel="noopener",l.style.color="var(--dtm-primary)",l.style.textDecoration="underline";let A=M.createElement("span");A.textContent="の利用規約に従ってください",o.append(n,l,A),e.appendChild(o)}S.appendChild(e)}e.appendChild(S);let eT=null,eJ=(e,t)=>{if(0===t.offsetWidth||0===e.clientWidth)return;let o=t.offsetLeft+t.offsetWidth/2,a=Math.max(0,e.scrollWidth-e.clientWidth),r=o-e.clientWidth/2;e.scrollLeft=Math.max(0,Math.min(r,a))},eK=tb({getTracks:()=>I,getBpm:()=>i,getPlayStartStep:()=>0,getDrumPattern:()=>d,getSoloTrackId:()=>null,getAudioTime:()=>p?b().currentTime:o.getAudioTime?.()??performance.now()/1e3,onPlayNote:e=>{var t;let a=Number(e.trackId);if(N.has(a))return;let r=U.get(a);r&&((t=e.when)<=0?ef(r):eQ.push(setTimeout(()=>ef(r),1e3*t))),(!u.has(a)||eO)&&(o.onPlayNote?.(e),p&&F().playNote(e))},onPlayDrum:e=>{let t=e.velocity*(g/100)*(c/100);o.onPlayDrum?.({...e,velocity:t}),p&&F().playDrum({...e,velocity:t})},onTick:e=>{(e=>{let t=Math.floor(e),o=Math.floor(e/48)%4;for(let e=0;e<4;e++)eF[e].classList.toggle("dtm-player-beat-dot--on",e===o);ek.textContent=String(Math.floor(e/192)+1);let a=Q[t]??"";for(let o of(ex.textContent!==a&&(ex.textContent=a,a&&console.log(`[dtm-player-chord] Active Chord: ${a} (step: ${t})`)),eR)){let t=null;for(let a of o.tokens){let o=e>=a.startStep&&e<a.startStep+a.durationSteps;a.el.classList.toggle("is-active",o),o&&!t&&(t=a)}t&&eJ(o.lane,t.el)}})(e)},onEnd:e=>ez(),stepsPerBar:192}),eH=!1,eO=!1,eq=e=>{eH=e,R.innerHTML=ep(e?"stop":"play",12),R.classList.toggle("dtm-player-play--stop",e)},ez=()=>{for(let e of(eq(!1),eI(),eF))e.classList.remove("dtm-player-beat-dot--on");for(let e of(ek.textContent="-",ex.textContent="",eR)){for(let t of e.tokens)t.el.classList.remove("is-active");e.lane.scrollLeft=0}tS===eZ&&(tS=null),o.onStop?.()},eX=async()=>{let e=D&&u.size>0,t=e?[...u.entries()].map(([e,t])=>{let o=I.find(t=>Number(t.id)===e),a=[...o?.notes??[]].sort((e,t)=>e.startStep-t.startStep),r=(t.gate??100)/100,n=(t.octave??0)*12,l=Math.min(a.length,t.syllables.length),A=[];for(let e=0;e<l;e++){let o=a[e];A.push({syllable:t.syllables[e],pitch:o.pitch+n,startSec:o.startStep*C,durationSec:o.durationSteps*C*r})}return{id:String(e),model:t.model,volume:eU(t.volume??200)*(c/100),pan:eP(t.pan??64),notes:A}}):[];if(e){let e=x(),o=tx(eL,{skipLabel:"音声合成をスキップ（元のメロディで再生）",onSkip:()=>{eH&&tS===eZ&&(eO=!0,o.remove(),eK.start(0))}});try{if(await e.loadModels(t.map(e=>e.model)),eO)return;let a=performance.now();await e.warm(t,e2,(e,t)=>{if(!eO)if(0===e)o.setProgress(e,t);else{let r=(performance.now()-a)/1e3/e,n=t-e,l=Math.ceil(n*r);o.setProgress(e,t,l)}})}catch(e){console.warn("[dtm] voice preload failed",e)}finally{o.remove()}if(!eH||tS!==eZ||eO)return}eK.start(0),e&&!eO&&x().startStream(t,eK.getStartTime(),{isAudible:e=>!N.has(Number(e.id)),onLateSkip:()=>{let e;(e=performance.now())-eS<1500||(eS=e,eD.textContent="音声合成が間に合わないため、一部の発音をスキップしました",eD.style.display="",eM&&clearTimeout(eM),eM=setTimeout(()=>{eD.style.display="none",eD.textContent="",eM=null},3e3))}})},eW=()=>{eH||0===h.length||(e=>{try{if(o.skipConsent)return!1;let t=eN.filter(e=>{if(tL.has(e))return!1;try{if("u"<typeof localStorage||!localStorage)return!0;return"true"!==localStorage.getItem(`dtm_agreed_terms_${e}`)}catch(e){return console.warn("[dtm-player] localStorage access denied in consent check",e),!0}});if(0===t.length)return!1;let a=M.createElement("div");a.className="dtm-consent-overlay";let r=M.createElement("div");r.className="dtm-win dtm-consent-modal";let n=M.createElement("div");n.className="dtm-consent-header",n.textContent="利用規約の確認";let l=M.createElement("div");l.className="dtm-consent-body";let A='<p style="margin: 0 0 8px 0; line-height: 1.4; font-weight: bold; color: var(--dtm-danger);">本データには UTAU 歌声音源が含まれています。<br>ご利用にあたっては、以下の音源利用規約への同意が必要です。</p>';for(let e of t){let t=eG[e]||e,o=eV[e];A+=`
					<div style="margin-bottom: 8px; padding: 6px 10px; background: var(--dtm-deep); border: 2px solid var(--c-black); box-shadow: 2px 2px 0 var(--c-black);">
						<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 11px; font-weight: bold; color: var(--dtm-gold);">
							<span>\u4F7F\u7528\u6642\u306B\u306F</span>
							<a href="${o}" target="_blank" rel="noopener noreferrer" style="color: var(--dtm-primary); text-decoration: underline;">${t}UTAU\u97F3\u6E90</a>
							<span>\u306E\u5229\u7528\u898F\u7D04\u306B\u5F93\u3063\u3066\u304F\u3060\u3055\u3044</span>
						</div>
					</div>
				`}l.innerHTML=A;let u=M.createElement("div");u.className="dtm-consent-footer";let i=M.createElement("button");return i.type="button",i.className="dtm-btn dtm-btn--success",i.textContent="同意して利用する",i.onclick=()=>{for(let e of t){try{"u">typeof localStorage&&localStorage&&localStorage.setItem(`dtm_agreed_terms_${e}`,"true")}catch(e){}tL.add(e)}a.remove(),eT=null,e&&e()},u.appendChild(i),r.append(n,l,u),a.appendChild(r),M.body.appendChild(a),eT=a,!0}catch(e){return console.error("[dtm-player] Error in checkConsentAndShow:",e),!1}})(()=>eW())||(tS&&tS!==eZ&&tS.stop(),tS=eZ,eO=!1,eq(!0),(async()=>{let e=[],t=o.onResumeAudio?.();if(t&&e.push(t),p){let t=b();"suspended"===t.state&&e.push(t.resume())}e.length>0&&await Promise.all(e),eH&&tS===eZ&&(D&&u.size>0&&x().reset(),await eX())})())},ej=()=>{eH&&(eK.stop(),(o.singingVoices??k)?.stopStream(),ez())};R.addEventListener("click",()=>{eH?ej():eW()});let eZ={play:eW,stop:ej,isPlaying:()=>eH,destroy:()=>{for(let e of(M.removeEventListener("click",$),eK.stop(),(o.singingVoices??k)?.stopStream(),tS===eZ&&(tS=null),y&&(y.close(),y=null),ev))clearTimeout(e);eI(),tN&&S.contains(tN)&&tU(),S.remove(),eT?.remove(),es()}};return eZ},tO=`
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
`,tG=`
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
`,tY=[{id:"melody",name:"メロディー",color:[41,173,255],instrument:0,volume:100},{id:"submelody",name:"サブメロ",color:[255,119,168],instrument:1,volume:95},{id:"bass",name:"ベース",color:[0,228,54],instrument:2,volume:88},{id:"chord",name:"伴奏",color:[255,163,0],instrument:3,volume:76}],tV=[{id:"t0",name:"トラック1",color:[41,173,255],instrument:0,volume:100},{id:"t1",name:"トラック2",color:[0,228,54],instrument:1,volume:100},{id:"t2",name:"トラック3",color:[255,119,168],instrument:2,volume:100},{id:"t3",name:"トラック4",color:[255,163,0],instrument:3,volume:100},{id:"t4",name:"トラック5",color:[255,236,39],instrument:4,volume:100},{id:"t5",name:"トラック6",color:[131,118,156],instrument:5,volume:100},{id:"t6",name:"トラック7",color:[255,0,77],instrument:6,volume:100},{id:"t7",name:"トラック8",color:[255,204,170],instrument:7,volume:100},{id:"t8",name:"トラック9",color:[194,195,199],instrument:8,volume:100},{id:"t9",name:"トラック10",color:[0,135,81],instrument:9,volume:100},{id:"t10",name:"トラック11",color:[171,82,54],instrument:10,volume:100},{id:"t11",name:"トラック12",color:[126,37,83],instrument:11,volume:100},{id:"t12",name:"トラック13",color:[255,241,232],instrument:12,volume:100},{id:"t13",name:"トラック14",color:[120,200,255],instrument:13,volume:100},{id:"t14",name:"トラック15",color:[100,255,160],instrument:14,volume:100}],tq=["klatt",...Object.keys(eO)],tz={klatt:"軽量ロボ声",...eG},tX=e=>tz[e]??e,tW=(e,t,o)=>Math.min(Math.max(e,t),o),tj=e=>{if(!e)return"";let t=e.replace(/\s+/g,"").toLowerCase();return C.find(e=>e.replace(/\s+/g,"").toLowerCase()===t)??e},tZ=void 0===Number.MAX_SAFE_INTEGER?0x1fffffffffffff:Number.MAX_SAFE_INTEGER,t$=new WeakMap,t_=(t=(e,t)=>(t$.set(e,t),t),e=>{let o=t$.get(e),a=void 0===o?e.size:o<0x40000000?o+1:0;if(!e.has(a))return t(e,a);if(e.size<0x20000000){for(;e.has(a);)a=Math.floor(0x40000000*Math.random());return t(e,a)}if(e.size>tZ)throw Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;e.has(a);)a=Math.floor(Math.random()*tZ);return t(e,a)}),t0=(o=new WeakMap,r=e=>{if(o.has(e))return o.get(e);let t=new Map;return o.set(e,t),t},a=new WeakMap,n=e=>({...e,connect:({call:e})=>async()=>{let{port1:t,port2:o}=new MessageChannel,r=await e("connect",{port:t},[t]);return a.set(o,r),o},disconnect:({call:e})=>async t=>{let o=a.get(t);if(void 0===o)throw Error("The given port is not connected.");await e("disconnect",{portId:o})},isSupported:({call:e})=>()=>e("isSupported")}),l=e=>"function"==typeof e.start,e=>{let t=n(e);return e=>{let o=r(e);e.addEventListener("message",({data:e})=>{let{id:t}=e;if(null!==t&&o.has(t)){let{reject:a,resolve:r}=o.get(t);o.delete(t),void 0===e.error?r(e.result):a(Error(e.error.message))}}),l(e)&&e.start();let a=(t,a=null,r=[])=>new Promise((n,l)=>{let A=t_(o);o.set(A,{reject:l,resolve:n}),null===a?e.postMessage({id:A,method:t},r):e.postMessage({id:A,method:t,params:a},r)}),n=(t,o,a=[])=>{e.postMessage({id:null,method:t,params:o},a)},A={};for(let[e,o]of Object.entries(t))A={...A,[e]:o({call:a,notify:n})};return{...A}}})({parseArrayBuffer:({call:e})=>async t=>e("parse",{arrayBuffer:t},[t])}),t3=new Blob(['(()=>{var e={455(e,t){!function(e){"use strict";var t=function(e){return function(t){var n=e(t);return t.add(n),n}},n=function(e){return function(t,n){return e.set(t,n),n}},r=void 0===Number.MAX_SAFE_INTEGER?9007199254740991:Number.MAX_SAFE_INTEGER,o=536870912,s=2*o,i=function(e,t){return function(n){var i=t.get(n),a=void 0===i?n.size:i<s?i+1:0;if(!n.has(a))return e(n,a);if(n.size<o){for(;n.has(a);)a=Math.floor(Math.random()*s);return e(n,a)}if(n.size>r)throw new Error("Congratulations, you created a collection of unique numbers which uses all available integers!");for(;n.has(a);)a=Math.floor(Math.random()*r);return e(n,a)}},a=new WeakMap,f=n(a),c=i(f,a),u=t(c);e.addUniqueNumber=u,e.generateUniqueNumber=c}(t)}},t={};function n(r){var o=t[r];if(void 0!==o)return o.exports;var s=t[r]={exports:{}};return e[r].call(s.exports,s,s.exports,n),s.exports}(()=>{"use strict";const e=-32603,t=-32602,r=-32601,o=(e,t)=>Object.assign(new Error(e),{status:t}),s=t=>o(\'The handler of the method called "\'.concat(t,\'" returned an unexpected result.\'),e),i=(t,n)=>async({data:{id:i,method:a,params:f}})=>{const c=n[a];try{if(void 0===c)throw(e=>o(\'The requested method called "\'.concat(e,\'" is not supported.\'),r))(a);const n=void 0===f?c():c(f);if(void 0===n)throw(t=>o(\'The handler of the method called "\'.concat(t,\'" returned no required result.\'),e))(a);const u=n instanceof Promise?await n:n;if(null===i){if(void 0!==u.result)throw s(a)}else{if(void 0===u.result)throw s(a);const{result:e,transferables:n=[]}=u;t.postMessage({id:i,result:e},n)}}catch(e){const{message:n,status:r=-32603}=e;t.postMessage({error:{code:r,message:n},id:i})}};var a=n(455);const f=new Map,c=(e,n,r)=>({...n,connect:({port:t})=>{t.start();const r=e(t,n),o=(0,a.generateUniqueNumber)(f);return f.set(o,()=>{r(),t.close(),f.delete(o)}),{result:o}},disconnect:({portId:e})=>{const n=f.get(e);if(void 0===n)throw(e=>o(\'The specified parameter called "portId" with the given value "\'.concat(e,\'" does not identify a port connected to this worker.\'),t))(e);return n(),{result:null}},isSupported:async()=>{if(await new Promise(e=>{const t=new ArrayBuffer(0),{port1:n,port2:r}=new MessageChannel;n.onmessage=({data:t})=>e(null!==t),r.postMessage(t,[t])})){const e=r();return{result:e instanceof Promise?await e:e}}return{result:!1}}}),u=(e,t,n=()=>!0)=>{const r=c(u,t,n),o=i(e,r);return e.addEventListener("message",o),()=>e.removeEventListener("message",o)},l=e=>void 0!==e.channel,d=e=>e.toString(16).toUpperCase().padStart(2,"0"),g=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=[],s=new Uint8Array(e.buffer,r,n);for(let e=0;e<n;e+=1)o[e]=d(s[e]);return o.join("")},h=(e,t=0,n=e.byteLength-(t-e.byteOffset))=>{const r=t+e.byteOffset,o=new Uint8Array(e.buffer,r,n);return String.fromCharCode.apply(null,o)},m=e=>{const t=new DataView(e),n=v(t);let r=14;const o=[];for(let e=0,s=n.numberOfTracks;e<s;e+=1){let e;({offset:r,track:e}=b(t,r)),o.push(e)}return{division:n.division,format:n.format,tracks:o}},p=(e,t,n)=>{let r;const{offset:o,value:s}=T(e,t),i=e.getUint8(o);return r=240===i?y(e,o+1):255===i?U(e,o+1):w(i,e,o+1,n),{...r,event:{...r.event,delta:s},eventTypeByte:i}},v=e=>{if(e.byteLength<14)throw new Error("Expected at least 14 bytes instead of ".concat(e.byteLength));if("MThd"!==h(e,0,4))throw new Error(\'Unexpected characters "\'.concat(h(e,0,4),\'" found instead of "MThd"\'));if(6!==e.getUint32(4))throw new Error("The header has an unexpected length of ".concat(e.getUint32(4)," instead of 6"));const t=e.getUint16(8),n=e.getUint16(10);return{division:e.getUint16(12),format:t,numberOfTracks:n}},U=(e,t)=>{let n;const r=e.getUint8(t),{offset:o,value:s}=T(e,t+1);if(1===r)n={text:h(e,o,s)};else if(2===r)n={copyrightNotice:h(e,o,s)};else if(3===r)n={trackName:h(e,o,s)};else if(4===r)n={instrumentName:h(e,o,s)};else if(5===r)n={lyric:h(e,o,s)};else if(6===r)n={marker:h(e,o,s)};else if(7===r)n={cuePoint:h(e,o,s)};else if(8===r)n={programName:h(e,o,s)};else if(9===r)n={deviceName:h(e,o,s)};else if(10===r||11===r||12===r||13===r||14===r||15===r)n={metaTypeByte:d(r),text:h(e,o,s)};else if(32===r)n={channelPrefix:e.getUint8(o)};else if(33===r)n={midiPort:e.getUint8(o)};else if(47===r)n={endOfTrack:!0};else if(81===r)n={setTempo:{microsecondsPerQuarter:(e.getUint8(o)<<16)+(e.getUint8(o+1)<<8)+e.getUint8(o+2)}};else if(84===r){let t;const r=e.getUint8(o);96&r?32==(96&r)?t=25:64==(96&r)?t=29:96&~r||(t=30):t=24,n={smpteOffset:{frame:e.getUint8(o+3),frameRate:t,hour:31&r,minutes:e.getUint8(o+1),seconds:e.getUint8(o+2),subFrame:e.getUint8(o+4)}}}else if(88===r)n={timeSignature:{denominator:Math.pow(2,e.getUint8(o+1)),metronome:e.getUint8(o+2),numerator:e.getUint8(o),thirtyseconds:e.getUint8(o+3)}};else if(89===r)n={keySignature:{key:e.getInt8(o),scale:e.getInt8(o+1)}};else{if(127!==r)throw new Error(\'Cannot parse a meta event with a type of "\'.concat(d(r),\'"\'));n={sequencerSpecificData:g(e,o,s)}}return{event:n,offset:o+s}},w=(e,t,n,r)=>{const o=128&e?null:r,s=(null===o?e:o)>>4;let i,a=null===o?n:n-1;if(8===s)i={noteOff:{noteNumber:t.getUint8(a),velocity:t.getUint8(a+1)}},a+=2;else if(9===s){const e=t.getUint8(a),n=t.getUint8(a+1);i=0===n?{noteOff:{noteNumber:e,velocity:n}}:{noteOn:{noteNumber:e,velocity:n}},a+=2}else if(10===s)i={keyPressure:{noteNumber:t.getUint8(a),pressure:t.getUint8(a+1)}},a+=2;else if(11===s)i={controlChange:{type:t.getUint8(a),value:t.getUint8(a+1)}},a+=2;else if(12===s)i={programChange:{programNumber:t.getUint8(a)}},a+=1;else if(13===s)i={channelPressure:{pressure:t.getUint8(a)}},a+=1;else{if(14!==s)throw new Error(\'Cannot parse a midi event with a type of "\'.concat(d(s),\'"\'));i={pitchBend:t.getUint8(a)|t.getUint8(a+1)<<7},a+=2}return i.channel=15&(null===o?e:o),{event:i,offset:a}},y=(e,t)=>{const{offset:n,value:r}=T(e,t);return{event:{sysex:g(e,n,r)},offset:n+r}},b=(e,t)=>{if("MTrk"!==h(e,t,4))throw new Error(\'Unexpected characters "\'.concat(h(e,t,4),\'" found instead of "MTrk"\'));const n=[],r=e.getUint32(t+4)+t+8;let o=null,s=t+8;for(;s<r;){const t=p(e,s,o),{event:r,eventTypeByte:i}=t;n.push(r),s=t.offset,l(r)&&(128&i)>0&&(o=i)}return{offset:s,track:n}},T=(e,t)=>{let n=t,r=0;for(;;){const t=e.getUint8(n);if(n+=1,!(t>127))return r+=t,{offset:n,value:r};r+=127&t,r<<=7}};u(self,{parse:({arrayBuffer:e})=>({result:m(e)})})})()})();'],{type:"application/javascript; charset=utf-8"}),t1=URL.createObjectURL(t3),t2=t0(new Worker(t1));t2.connect,t2.disconnect,t2.isSupported;var t5=t2.parseArrayBuffer;URL.revokeObjectURL(t1);var t6=class e{constructor(e,t,o){this.zones=e,this.ch=t,this.isDrum=o}static afterTime=.5;static fonts=new Map;static ch=-1;static toURL(e){return`https://surikov.github.io/webaudiofontdata/sound/${e}.js`}static async load({ctx:t,fontName:o,url:a,isDrum:r=!1,pitchs:n}){if(o in window||await new Promise((e,t)=>{let o=document.createElement("script");o.onload=()=>{e(o),o.remove()},o.onerror=t,o.src=a,document.head.append(o)}),!(o in window))throw Error("SoundFont is not found.");let{fonts:l}=e;if(!l.has(o)){let a=new Map,A=-1,u=window;for(let[e,r]of(await t4(t,u[o].zones,n))){if(!r.buffer)continue;let{numberOfChannels:t}=r.buffer;A<t&&(A=t),a.set(Number(e),r)}e.ch<A&&(e.ch=A),l.set(o,new e(a,A,r))}let A=l.get(o);if(!A)throw Error("SoundFont load failed.");return A}play({ctx:t,destination:o,pitch:a=60,volume:r=1,when:n=0,duration:l=1}={}){t??=new AudioContext,o??=t.destination;let{zones:A,isDrum:u}=this;if(!A.has(a))return;let i=A.get(a);if(!i)return;let s=t.createBufferSource(),d=t.createGain(),c=n+t.currentTime,{buffer:g,_param:m}=i;if(!g||!m)return;s.buffer=g,s.playbackRate.setValueAtTime(m.playbackRate,0),Object.assign(s,m.src);let p=l+e.afterTime,C=c+(u?g.duration:s.loop?p:Math.min(p,m.max));d.gain.setValueAtTime(r,t.currentTime),u||d.gain.linearRampToValueAtTime(0,C),s.connect(d).connect(o),s.start(c),s.stop(C)}},t4=(e,t,o=[])=>{if(!o.length)for(let e of t){let t=0|e.keyRangeLow,a=0|e.keyRangeHigh;if(!(t>a))for(let e=t;e<=a;e++)o.push(e)}let a=new Set(o),r=new Map(o.map(e=>[e,t[0]]));for(let e=t.length-1;e>=0;e--)for(let o of a){let n=t[e];o<n.keyRangeLow||o>n.keyRangeHigh+1||(a.delete(o),r.set(o,{...n}))}return Promise.all([...r].map(async([t,o])=>(await t8(e,o),await t9(o,t),[t,o])))},t8=async(e,t)=>{if(!t.buffer){if(t.delay=0,t.sample){let o=atob(t.sample);t.buffer=e.createBuffer(1,o.length/2,t.sampleRate);let a=t.buffer.getChannelData(0);for(let e=0;e<o.length/2;e++){let t=o.charCodeAt(2*e),r=o.charCodeAt(2*e+1);t<0&&(t=256+t),r<0&&(r=256+r);let n=256*r+t;n>=32768&&(n-=65536),a[e]=n/65536}}else if(t.file){let o=Uint8Array.from(atob(t.file),e=>e.charCodeAt(0)).buffer;if("interrupted"===e.state)try{await e.resume()}catch{}try{t.buffer=await e.decodeAudioData(o)}catch(e){throw console.error(`[zone.file format] keyRange: ${t.keyRangeLow}-${t.keyRangeHigh} - Decode failed:`,e),e}}if(t.buffer&&t.loopStart>=1&&t.loopStart<t.loopEnd&&(t.loopEnd-t.loopStart)/t.sampleRate<.03){let o=t.buffer,a=o.sampleRate,r=a/t.sampleRate,n=Math.round(t.loopStart*r),l=Math.round(t.loopEnd*r),A=l-n;if(A>0){let r=Math.ceil(Math.round(.2*a)/A),u=Math.min(n,o.length),i=Math.max(0,o.length-l),s=u+A*r+i,d=0,c=0;if(o.numberOfChannels>0){let e=o.getChannelData(0);for(let t=0;t<e.length;t++){let o=Math.abs(e[t]);o>d&&(d=o),t>=n&&t<l&&o>c&&(c=o)}}let g=1;c>0&&d>0&&c<.8*d&&(g=.75*d/c)>20&&(g=20);try{let d=e.createBuffer(o.numberOfChannels,s,a);for(let e=0;e<o.numberOfChannels;e++){let t=o.getChannelData(e),a=d.getChannelData(e);a.set(t.subarray(0,u),0);let s=u,c=t.subarray(n,l),m=new Float32Array(A);for(let e=0;e<A;e++)m[e]=c[e]*g;for(let e=0;e<r;e++)a.set(m,s),s+=A;if(i>0&&l<o.length){let e=t.subarray(l);if(1!==g){let t=new Float32Array(i);for(let o=0;o<i;o++)t[o]=e[o]*g;a.set(t,s)}else a.set(e,s)}}t.buffer=d,t.loopEnd=t.loopStart+(t.loopEnd-t.loopStart)*r}catch(e){console.warn("[SoundFont.loopExtension] Failed to extend loop buffer:",e)}}}for(let[e,o]of[["loopStart",0],["loopEnd",0],["coarseTune",0],["fineTune",0],["originalPitch",6e3],["sampleRate",44100],["sustain",0]])Number.isNaN(Number(t[e]))&&(t[e]=o)}},t9=(e,t)=>{let{originalPitch:o,loopStart:a,loopEnd:r,coarseTune:n,fineTune:l,sampleRate:A,delay:u,buffer:i}=e,s=2**((100*t-(o-100*n-l))/1200),d=(i?.duration??0)/s,c={loop:a>=1&&a<r};c.loop&&([c.loopStart,c.loopEnd]=[a,r].map(e=>e/A+u)),e._param={playbackRate:s,max:d,src:c}},t7=(e,t,o)=>{e.has(t)||e.set(t,new o);let a=e.get(t);if(void 0===a)throw Error("touch: unexpected undefined");return a},oe=new class{font=null;fonts=new Map;async load({ctx:e,font:t,id:o,keys:a}){let r=t7(t7(this.fonts,t,Map),o,Map);if(!r.size)for(let[n,l]of(await Promise.all([...a].map(async a=>{let r=`${a}_${o}_${t}`;return[Number(a),await t6.load({ctx:e,fontName:`_drum_${r}`,url:`https://surikov.github.io/webaudiofontdata/sound/128${r}.js`,isDrum:!0,pitchs:[a]})]}))))r.set(n,l);this.font=r}play(e){let{font:t}=this;if(!t)return;let o=e?.pitch??60;t.has(o)&&t.get(o)?.play(e)}},ot=(e,t,o)=>{e.has(t)||e.set(t,new o);let a=e.get(t);if(void 0===a)throw Error("touch: unexpected undefined");return a},oo=new class{tone=new Map;drum=new Map;callback=new Set;onload(e){this.callback.add(e)}async init(){let e=await fetch("https://surikov.github.io/webaudiofontdata/sf2/list.txt"),t=await e.text(),{tone:o,drum:a}=this;for(let e of t.trim().split("\n"))if("128"===e.slice(0,3)){let t=e.slice(3).split("_"),[o,r]=t;ot(ot(a,t.slice(2).join("_").slice(0,-3),Map),r,Set).add(o)}else{let t=e.split("_"),[a]=t;ot(o,t.slice(1).join("_").slice(0,-3),Set).add(a)}for(let e of this.callback)e();this.callback.clear()}},oa=["melody","submelody","bass","chord","t4","t5","t6","t7","t8","t9","t10","t11","t12","t13","t14"],or=async(t={})=>{let o,a={midi:!0,chord:!0,presetUI:!0,...t.features},r=t.audioContext??new AudioContext({sampleRate:44100}),n=r.createGain();n.gain.value=t.masterVolume??1,n.connect(r.destination);let l=r.createGain();l.gain.value=t.drumVolume??1,l.connect(r.destination);let m=()=>"closed"===r.state?Promise.resolve():r.resume(),h=t.engines??{},B=h.SoundFont??t6,E=h.SoundFont_drum??oe,f=h.SoundFont_list??oo;a.midi&&(o=h.parseMidi||(e=>{let t=e.buffer;if(t instanceof ArrayBuffer)return t5(t.slice(e.byteOffset,e.byteOffset+e.byteLength));throw Error("SharedArrayBuffer is not supported for MIDI parsing")}));let Q=e5(r,n,{voiceWorkerUrl:null===t.voiceWorkerUrl?void 0:t.voiceWorkerUrl??(()=>{try{return new e.U(e.r(39240)).href}catch{return}})(),voicebanks:t.koeBaseUrl?Object.fromEntries(Object.entries(eO).map(([e,o])=>[e,eq(o,t.koeBaseUrl)])):void 0,worldlineScriptUrl:t.worldlineScriptUrl}),I=new Promise(e=>{f.init(),f.onload(()=>e())}),v=(async()=>{try{await E.load({ctx:r,font:"FluidR3_GM_sf2_file",id:"0",keys:Object.values(eC)})}catch(e){console.error("[dtm] ドラム音源の読み込みに失敗",e)}})(),y={},b=e=>{if(y[e])return y[e];let t=e.replace(/\s+/g,"").toLowerCase(),o=Object.keys(y).find(e=>e.replace(/\s+/g,"").toLowerCase()===t);return o?y[o]:void 0},w=new Map,F=new Map,k=e=>{if(w.has(e))return Promise.resolve();let t=F.get(e);if(t)return t;let o=`${e}_FluidR3_GM_sf2_file`,a=B.load({ctx:r,fontName:`_tone_${o}`,url:B.toURL(o)}).then(t=>{w.set(e,t)}).catch(t=>{console.error(`[dtm] \u697D\u5668 "${e}" \u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557`,t)}).finally(()=>{F.delete(e)});return F.set(e,a),a},x=t.defaultPreset??"retro_game",D=(e,t="simple")=>"simple"!==t?oa[e]??`t${e}`:0===e?"melody":1===e?"submelody":2===e?"bass":"chord",M=(e,t="simple")=>{if("melody"===e||"submelody"===e||"bass"===e||"chord"===e)return e;if(e.startsWith("t")){let o=Number(e.substring(1));if(!Number.isNaN(o))return D(o,t)}return e},S=(e,t)=>e[t]??e.melody,L=(e,t,o="simple")=>{let a=eB[e];if(!a)return;let r=y[S(a,M(t,o))];return r?w.get(r):void 0},R=async(e,t=[...oa],o="simple")=>{let a=eB[e];if(!a)return;await I;let r=new Set;for(let e of t){let t=y[S(a,M(e,o))];t&&r.add(t)}await Promise.all([...r].map(e=>k(e)))},N=async(e,t,o,a,r="simple")=>{let n="playing"===e.getPlaybackState();n&&e.pause();let l=a?tx(a):null;e.setLoading?.(!0);try{e.setInstrument(t),await R(t,o,r)}finally{l?.remove(),e.setLoading?.(!1),n&&e.play()}},T=(e,t)=>{let o=e.ownerDocument,a=o.createElement("div");if(a.className=t.className??"dtm-controlbar",null!==t.label){let e=o.createElement("span");e.className="dtm-controlbar-label",e.textContent=t.label??"楽器プリセット",a.appendChild(e)}let r=o.createElement("select");for(let[e,t]of(r.className="dtm-select dtm-grow",Object.entries(eB))){let a=o.createElement("option");a.value=e,a.textContent=t.displayName,r.appendChild(a)}r.value=t.value&&eB[t.value]?t.value:x,a.appendChild(r);let n=!1,l=async()=>{let e=t.getDaw();if(!e||n)return;n=!0;let o=r.value;t.onChange?.(o);let a=t.getTrackIds?.()??[...oa],l=a.includes("t0");try{await N(e,o,a,t.loadingTarget,l?"advanced":"simple")}finally{n=!1}};return r.addEventListener("change",l),"prepend"===t.position?e.insertBefore(a,e.firstChild):e.appendChild(a),{element:a,select:r,setValue:e=>{eB[e]&&(r.value=e)},getValue:()=>r.value,destroy:()=>{r.removeEventListener("change",l),a.remove()}}};await I,y=await p(),await Promise.all([v,R(x)]);let U=e=>{E.font&&E.play({ctx:r,destination:l,pitch:e.pitch,volume:e.velocity,when:e.when,duration:e.duration})},P=new WeakMap,J=[],K=[],H=[],O=(e,t={})=>{let{preset:l,presetUI:p,onInstrumentChange:h,onTrackInstrumentChange:B,...E}=t,f=E.tracks??tY,v=f.map(e=>e.id),y=l&&eB[l]?l:x,F=t.initialMML?tQ(t.initialMML):{},D=F.instrument&&eB[F.instrument]?F.instrument:y,M=D,S="advanced"===E.mode,N=new Map;if(F.trackInstruments)for(let[e,t]of Object.entries(F.trackInstruments)){let o=Number(e),a=b(t);a&&N.set(o,a)}let K=null,H=async(e,t)=>{if(!t)return void N.delete(e);await I;let o=b(t);o&&(N.set(e,o),await k(o))},O={getAudioTime:()=>r.currentTime,onResumeAudio:m,onPlayNote:e=>{let t,o=f.findIndex(t=>t.id===e.trackId),a=o>=0?N.get(o):void 0;(t=a?w.get(a):L(M,e.trackId,S?"advanced":"simple"))&&t.play({ctx:r,destination:n,pitch:e.pitch,volume:e.volume,when:e.when,duration:e.duration})},onPlayDrum:U,singingVoices:Q,parseMidi:o,onInstrumentChange:e=>{M=e,K&&K.setValue(e),h?.(e)},onTrackInstrumentChange:(e,t)=>{H(e,t),B?.(e,t)},...E},G=((e,t={})=>{let o,a,r,n,l,m,p,h,B,E,f;tk();let Q=t.getAudioTime??(()=>performance.now()/1e3),I=t.tracks??tY,v=t.mode??(I.length>tY.length?"advanced":"simple"),y="advanced"===v,b=t.drumPatterns??eh,w=!!t.parseMidi,F=!y,k=((e,t)=>{let{drumPatternNames:o,defaultDrumPattern:a,defaultBpm:r,showMidi:n}=t,l=['<option value="none">なし</option>'].concat(o.map(e=>`<option value="${e}" ${e===a?"selected":""}>${e}</option>`)).join("");e.innerHTML=`
<div class="dtm-daw" data-dtm="root">
  <div class="dtm-topbar" data-dtm="transport">
    <div class="dtm-topbar-row1">
      <button class="dtm-iconbtn" data-dtm="prev-bar" title="1\u5C0F\u7BC0\u524D">${ep("chevronLeft")}</button>
      <button class="dtm-play" data-dtm="play" disabled>${ep("play")}</button>
      <button class="dtm-iconbtn" data-dtm="next-bar" title="1\u5C0F\u7BC0\u5F8C">${ep("chevronRight")}</button>
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
      <button class="dtm-segbtn dtm-segbtn--active" data-dtm="tool-pen" title="\u30DA\u30F3">${ep("pen")}</button>
      <button class="dtm-segbtn" data-dtm="tool-select" title="\u9078\u629E">${ep("select")}</button>
      <button class="dtm-segbtn" data-dtm="tool-eraser" title="\u6D88\u3057\u30B4\u30E0">${ep("eraser")}</button>
    </div>
    <button class="dtm-iconbtn" data-dtm="undo" title="\u5143\u306B\u623B\u3059" disabled>${ep("undo")}</button>
    <button class="dtm-iconbtn" data-dtm="redo" title="\u3084\u308A\u76F4\u3057" disabled>${ep("redo")}</button>
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
        <select class="dtm-select" data-dtm="drum-select">${l}</select>
      </div>
      <div class="dtm-row">
        <span class="dtm-label">\u97F3\u91CF</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="drum-volume" value="80" min="0" max="100">
        <span class="dtm-label" data-dtm="drum-volume-label">80%</span>
      </div>
    </div>
  </details>

  <details class="dtm-panel ${n?"":"dtm-hidden"}" data-dtm="midi-panel">
    <summary>MIDI / MML \u5165\u529B</summary>
    <div class="dtm-panel-body">
      <div class="dtm-row" style="flex-wrap:nowrap">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; flex-shrink:0;">
          <span class="dtm-label" style="line-height: 1;">MIDI</span>
          <button class="dtm-infobtn" data-dtm="midi-info" title="MIDI\u306E\u8AAD\u307F\u8FBC\u307F\u89E3\u8AAC">${ep("info",12)}</button>
        </div>
        <input type="file" class="dtm-input dtm-grow" accept=".mid,.midi" data-dtm="midi-input" style="min-width:0">
        <button class="dtm-btn dtm-btn--success" data-dtm="midi-load" style="flex-shrink:0">\u8AAD\u8FBC</button>
      </div>
      <div class="dtm-row dtm-hidden" data-dtm="midi-track-selection"></div>
      <div class="dtm-row" style="flex-wrap:nowrap">
        <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; flex-shrink:0;">
          <span class="dtm-label" style="line-height: 1;">MML</span>
          <button class="dtm-infobtn" data-dtm="mml-info" title="MML\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${ep("info",12)}</button>
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
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-full" title="\u30B3\u30D4\u30FC">${ep("copy")}</button>
        </div>
        <div class="dtm-output-label">\uFF11\u884C\u7248</div>
        <div class="dtm-output-row">
          <pre><code data-dtm="output-mini"></code></pre>
          <button class="dtm-btn dtm-btn--primary dtm-btn--icon" data-dtm="copy-mini" title="\u30B3\u30D4\u30FC">${ep("copy")}</button>
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

</div>`;let A=e.querySelector('[data-dtm="root"]'),u=e=>{let t;return t=`[data-dtm="${e}"]`,A.querySelector(t)};return{root:A,topbar:u("transport"),topbarLoading:u("topbar-loading"),playBtn:u("play"),prevBarBtn:u("prev-bar"),nextBarBtn:u("next-bar"),soloCheckbox:u("solo"),toolPen:u("tool-pen"),toolSelect:u("tool-select"),toolEraser:u("tool-eraser"),undoBtn:u("undo"),redoBtn:u("redo"),noteLengthSelect:u("note-length"),bpmInput:u("bpm"),zoomXLabel:u("zoomx-label"),zoomYLabel:u("zoomy-label"),zoomXIn:u("zoomx-in"),zoomXOut:u("zoomx-out"),zoomYIn:u("zoomy-in"),zoomYOut:u("zoomy-out"),rollContainer:u("roll"),wrapper:u("wrapper"),vScroll:u("vscroll"),vScrollThumb:u("vscroll-thumb"),hScroll:u("hscroll"),hScrollThumb:u("hscroll-thumb"),masterVolume:u("master-volume"),masterVolumeLabel:u("master-volume-label"),trackTabs:u("track-tabs"),trackBody:u("track-body"),drumSelect:u("drum-select"),drumVolume:u("drum-volume"),drumVolumeLabel:u("drum-volume-label"),midiInput:u("midi-input"),midiLoadBtn:u("midi-load"),midiInfoBtn:u("midi-info"),midiTrackSelection:u("midi-track-selection"),midiPanel:u("midi-panel"),mmlInput:u("mml-input"),mmlLoadBtn:u("mml-load"),mmlLoadNote:u("mml-load-note"),shiftSelect:u("shift-select"),shiftApplyBtn:u("shift-apply"),macroClear:u("macro-clear"),macroRandom:u("macro-random"),macroHarmonic:u("macro-harmonic"),macroMono:u("macro-mono"),exportMidiBtn:u("export-midi"),generateMmlBtn:u("generate-mml"),decomposeChordToggle:u("decompose-chord"),ignoreChordHeavyToggle:u("ignore-chord-heavy"),barLimitSelect:u("bar-limit"),outputContainer:u("output-container"),outputStatus:u("output-status"),outputFull:u("output-full"),outputMini:u("output-mini"),copyFullBtn:u("copy-full"),copyMiniBtn:u("copy-mini"),overlay:u("overlay"),mmlInfoBtn:u("mml-info"),modalOverlay:u("modal-overlay"),modalTitle:u("modal-title"),modalBody:u("modal-body"),modalClose:u("modal-close")}})(e,{tracks:I,drumPatternNames:Object.keys(b),defaultDrumPattern:b.dance?"dance":Object.keys(b)[0]??"none",defaultBpm:t.defaultBpm??120,showMidi:w,showChord:F}),x={stepsPerBar:192,keyCount:128,pitchRangeStart:0,keyHeight:15,stepWidth:1},D=100,M=100,S=t.defaultBpm??120,L=50,R=80,N=k.drumSelect.value,T="",U=t.initialActiveTrack??I[0].id,P="pen",J=48,K=12,H=0,O=t.initialScrollPitch??48,G=(x.keyCount-1-O)*x.keyHeight-215,Y=0,V=!1,z=new Set,X="stopped",W=0,j=0,Z=!1,$=!1,_=[],ee=null,et=[],eo=[],ea=!1,er=null,en=e=>{if(!t.onLyricsChange)return;let o=e.config.id,a={lyrics:e.lyrics,model:e.lyricModel,vocalVolume:e.vocalVolume,vocalGate:e.vocalGate,vocalPan:e.vocalPan,vocalOctave:e.vocalOctave};er&&clearTimeout(er),er=setTimeout(()=>{t.onLyricsChange?.(o,a),er=null},300)},el=new Set,eA=new Set,eu=()=>eo.find(e=>e.config.id===U)??eo[0],ei=()=>{let e=0;for(let t of eo)for(let o of t.core.getNotes()){let t=o.startStep+o.durationSteps;t>e&&(e=t)}return 0===e?4*x.stepsPerBar:(Math.floor((e-1)/x.stepsPerBar)+2)*x.stepsPerBar},es=()=>{let e=i;return Math.max(0,ei()*x.stepWidth-e.width)},ed=()=>Math.max(0,x.keyCount*x.keyHeight-i.height),ec=()=>{for(let e of(((e=1)=>{ti(),ts(),c.clearRect(0,0,i.width,i.height);let{keyHeight:t,keyCount:o,stepWidth:a,stepsPerBar:r,pitchRangeStart:n}=g,l=Math.floor(tn/t)*t,A=tn+i.height;for(let e=l;e<A;e+=t){let a=o-1-e/t,r=a+n,l=a%12,A=tA.has(l),u=0===l,s=4==Math.floor(r/12)-1,d=e-tn;c.fillStyle=A?"#080b16":"#111628",c.fillRect(0,d,i.width,t),s&&(c.fillStyle="rgba(41,173,255,0.05)",c.fillRect(0,d,i.width,t)),c.beginPath(),c.strokeStyle=u?"#3d405b":"#1a1d30",c.lineWidth=1;let g=d+t;c.moveTo(0,g),c.lineTo(i.width,g),c.stroke()}let u=e||48,s=Math.floor(tr/(a*u))*a*u,d=tr+i.width,m=a*u;for(let e=s;e<=d;e+=m){let t=e/a,o=t%r==0,n=t%u==0,l=e-tr;c.beginPath(),c.strokeStyle=o?"#3d405b":n?"#242840":"#1a1d30",c.lineWidth=o?2:1,c.moveTo(l,0),c.lineTo(l,i.height),c.stroke()}})(48),eo)){if(el.has(e.config.id)||V&&e.config.id!==U)continue;let[t,o,a]=e.config.color,r=e.config.id===U?1:.3;td(e.core.getNotes(),[t,o,a,r])}if("select"===P&&ee){let e=c;e.save(),e.strokeStyle="#ffec27",e.lineWidth=2,e.setLineDash([4,4]),e.strokeRect(ee.x,ee.y,ee.width,ee.height),e.fillStyle="rgba(255,236,39,0.08)",e.fillRect(ee.x,ee.y,ee.width,ee.height),e.restore()}if("select"===P&&_.length>0){let e=new Set(_.map(e=>e.id)),t=eu();((e,t,o=[59,130,246,1])=>{let{keyHeight:a,stepWidth:r,keyCount:n,pitchRangeStart:l}=g;for(let A of e){if(!t.has(A.id))continue;let e=A.startStep*r,u=(n-1-(A.pitch-l))*a,i=A.durationSteps*r,s=e-tr,d=u-tn,g=void 0!==A.velocity?.5+A.velocity/127*.5:1,[m,p,C,h]=o,B=Math.min(255,1.3*m),E=Math.min(255,1.3*p),f=Math.min(255,1.3*C),Q=h*g;c.fillStyle=`rgba(${B},${E},${f},${Q})`,c.fillRect(s+1,d+1,i-2,a-2)}})(t.core.getNotes(),e,[...t.config.color,1])}(()=>{let e=c,t=i;if(!e)return;let o=Y*x.stepWidth-H;o<-10||o>t.width+10||(e.save(),e.strokeStyle="#ffec27",e.lineWidth=2,e.setLineDash([4,4]),e.beginPath(),e.moveTo(o,0),e.lineTo(o,t.height),e.stroke(),e.restore())})(),"playing"===X&&(()=>{let e=c,t=i;if(!e)return;let o=j*x.stepWidth-H;o<0||o>t.width||(e.save(),e.strokeStyle="#ff004d",e.lineWidth=2,e.beginPath(),e.moveTo(o,0),e.lineTo(o,t.height),e.stroke(),e.restore())})(),eg()},eg=()=>{let e=i,t=es(),o=k.hScroll.clientWidth;if(t<=0)k.hScrollThumb.style.width="100%",k.hScrollThumb.style.left="0";else{let a=ei()*x.stepWidth,r=Math.max(40,e.width/a*o),n=H/t;k.hScrollThumb.style.width=`${r}px`,k.hScrollThumb.style.left=`${tW(n*(o-r),0,o-r)}px`}let a=x.keyCount*x.keyHeight,r=k.vScroll.clientHeight;if(a<=e.height)k.vScrollThumb.style.height="100%",k.vScrollThumb.style.top="0";else{let t=Math.max(40,e.height/a*r),o=ed(),n=G/o;k.vScrollThumb.style.height=`${t}px`,k.vScrollThumb.style.top=`${n*(r-t)}px`}},em=!1,eC=!1,eE=null,ef=!1,eQ="rect",eI=null,ev=[],ey=null,eb=e=>{if($)return;t.onResumeAudio?.();let o=eu();eK(o.config.id,e,o.volume,100,0,.5)},eF=(e,t,o=0)=>{let a=eu(),{stepWidth:r,keyHeight:n,keyCount:l,pitchRangeStart:A}=x,u=tl();for(let i of a.core.getNotes()){let a=i.startStep*r,s=(l-1-(i.pitch-A))*n,d=i.durationSteps*r,c=a-u.x,g=s-u.y;if(e>=c-o&&e<=c+d+o&&t>=g-o&&t<=g+n+o)return i}return null},ek=()=>t.lockedTracks?.includes(eu().config.id)??!1,ex=e=>{e.preventDefault(),t.onResumeAudio?.();let{x:o,y:a,step:r,pitch:n}=tc(e),l=eu();if("eraser"===P){if(ek())return;let e=eF(o,a);e&&l.core.deleteNoteById(e.id);return}if("select"===P){if(_.length>0){let e=eF(o,a);if(e&&_.some(t=>t.id===e.id)){ev=_.map(e=>({id:e.id,startStep:e.startStep,pitch:e.pitch})),ef=!0,eQ="move",eI={x:o,y:a,step:r,pitch:n},eC=!1,ey=null;return}_=[],ee=null}let e=eF(o,a);e?(_=[e],ev=[{id:e.id,startStep:e.startStep,pitch:e.pitch}],ef=!0,eQ="move"):(_=[],ee=null,ef=!0,eQ="rect"),eI={x:o,y:a,step:r,pitch:n},eC=!1;return}eC=!1;let A=eF(o,a,6);if(A){eb(A.pitch);let{stepWidth:e}=x,t=tl(),a=A.startStep*e-t.x,l=A.durationSteps*e;eE=o>=a+l-10&&o<=a+l?{noteId:A.id,mode:"resize",dragOffsetStep:0,dragOffsetPitch:0,startStep:A.startStep,durationSteps:A.durationSteps,lastPreviewPitch:A.pitch}:{noteId:A.id,mode:"move",dragOffsetStep:r-A.startStep,dragOffsetPitch:n-A.pitch,startStep:A.startStep,durationSteps:A.durationSteps,lastPreviewPitch:A.pitch},em=!0;return}if(ek())return;let u=Math.floor(r/J)*J,i=u+J;if(!l.core.getNotes().some(e=>e.pitch===n&&u<e.startStep+e.durationSteps&&i>e.startStep)){l.core.addNote(u,n,{noteLengthSteps:J}),eb(n);let e=l.core.getNotes().find(e=>e.startStep===u&&e.pitch===n);e&&(eE={noteId:e.id,mode:"move",dragOffsetStep:0,dragOffsetPitch:0,startStep:e.startStep,durationSteps:e.durationSteps,lastPreviewPitch:e.pitch},eC=!0),em=!0}},eD=e=>{let t=eu();if("pen"===P){if(!eE)return;let{step:a,pitch:r}=tc(e);if(eC=!0,"move"===eE.mode){var o;let e=Math.round((a-eE.dragOffsetStep)/K)*K,n=r-eE.dragOffsetPitch;if(o=eE.noteId,eu().core.getNotes().some(t=>t.id!==o&&t.pitch===n&&e>=t.startStep&&e<t.startStep+t.durationSteps))return;t.core.moveNote(eE.noteId,e,n),n!==eE.lastPreviewPitch&&(eE.lastPreviewPitch=n,eb(n));return}let n=Math.max(Math.round((a-eE.startStep+1)/K)*K,K);t.core.resizeNote(eE.noteId,n),eE.durationSteps=n,J=n,ec();return}if("select"===P&&ef&&eI){let{x:o,y:a,step:r,pitch:n}=tc(e);if("rect"===eQ){let e={x:Math.min(o,eI.x),y:Math.min(a,eI.y),width:Math.abs(o-eI.x),height:Math.abs(a-eI.y)};ee=e;let{stepWidth:r,keyHeight:n,keyCount:l,pitchRangeStart:A}=x,u=tl();_=t.core.getNotes().filter(t=>{let o=t.startStep*r,a=l-1-(t.pitch-A),i=o-u.x,s=a*n-u.y,d=t.durationSteps*r;return e.x<i+d&&e.x+e.width>i&&e.y<s+n&&e.y+e.height>s}),ec()}else{let e=Math.round((r-eI.step)/K)*K,o=n-eI.pitch;if(0!==e||0!==o){for(let a of(eC=!0,t.core.isBatchOperation||t.core.beginBatch(),_)){let r=ev.find(e=>e.id===a.id);if(!r)continue;let n=r.pitch+o;n>=0&&n<128&&t.core.moveNote(a.id,r.startStep+e,n)}if(_.length>0){let e=_[0],t=ev.find(t=>t.id===e.id);if(t){let e=t.pitch+o;e!==ey&&e>=0&&e<128&&(ey=e,eb(e))}}}ec()}}},eS=()=>{if("pen"===P&&eE){if(eC){let e=eu();"move"===eE.mode?e.core.moveNoteEnd(eE.noteId):e.core.resizeNoteEnd(eE.noteId),em=!0}eE=null,eC=!1}"select"===P&&ef&&(eC&&"move"===eQ&&_.length>0&&eu().core.endBatch(),ef=!1,eI=null,eC=!1,ey=null,ee=null,ev=[],ec())},eL=()=>{let e=k.rollContainer.clientWidth||800,t=k.rollContainer.clientHeight||450;((e,t=800,o=450,a)=>{g=a;let r=document.createElement("canvas");A=r,r.width=t-60,r.height=20,r.style.position="absolute",r.style.left="60px",r.style.top="0px";let n=r.getContext("2d");if(!n)throw Error("Failed to get 2D rendering context for header.");s=n;let l=document.createElement("canvas");u=l,l.width=60,l.height=o-20,l.style.position="absolute",l.style.left="0px",l.style.top="20px";let m=l.getContext("2d");if(!m)throw Error("Failed to get 2D rendering context for keyboard.");d=m;let p=document.createElement("canvas");i=p,p.width=t-60,p.height=o-20,p.style.position="absolute",p.style.left="60px",p.style.top="20px",p.style.touchAction="none";let C=p.getContext("2d",{willReadFrequently:!0});if(!C)throw Error("Failed to get 2D rendering context for grid.");c=C,e.innerHTML="",e.style.position="relative",e.style.width=`${t+60}px`,e.style.height=`${o}px`,e.append(r,l,p),(()=>{let e=u.parentElement;if(!e)return;let t=e.querySelector("#header-corner");t||((t=document.createElement("div")).id="header-corner",t.style.position="absolute",t.style.left="0px",t.style.top="0px",t.style.width="60px",t.style.height="20px",t.style.backgroundColor="#0a0f1f",t.style.borderRight="2px solid #29adff",t.style.borderBottom="2px solid #29adff",e.insertBefore(t,A))})()})(k.wrapper,e,t,x);let o=i;o.addEventListener("pointerdown",ex),o.addEventListener("dblclick",e=>{if(e.preventDefault(),ek())return;let{step:t,pitch:o}=tc(e),a=eu(),r=a.core.getNotes().find(e=>e.pitch===o&&t>=e.startStep&&t<e.startStep+e.durationSteps);r&&a.core.deleteNoteById(r.id)}),o.addEventListener("wheel",e=>{e.preventDefault(),G=tW(G+e.deltaY,0,ed()),tg(H=tW(H+e.deltaX,0,es()),G),ec()},{passive:!1}),o.addEventListener("click",()=>{em&&(em=!1)});let a=A;a.addEventListener("click",e=>{if("playing"===X)return;let t=a.getBoundingClientRect();Y=Math.max(0,Math.floor(Math.floor((e.clientX-t.left+H)/x.stepWidth)/K)*K),"paused"===X&&(X="stopped",ez()),ec()}),tg(H,G),ec()},eR=()=>{let e=i,t=(H+e.width/2)/x.stepWidth;x.stepWidth=2*D*.5/100,k.zoomXLabel.textContent=`${D}%`,tg(H=tW(t*x.stepWidth-e.width/2,0,es()),G),ec()},eN=()=>{let e=i,t=(G+e.height/2)/x.keyHeight;x.keyHeight=15*M/100,k.zoomYLabel.textContent=`${M}%`,G=tW(t*x.keyHeight-e.height/2,0,ed()),tg(H,G),ec()},eT=()=>({zoomX:D,zoomY:M,decomposeChord:k.decomposeChordToggle.checked,ignoreChordHeavy:k.ignoreChordHeavyToggle.checked}),eJ=()=>t.onViewStateChange?.(eT()),eK=(e,o,a,r,n,l)=>{let A=a/100*(r/127)*(L/100);t.onPlayNote?.({trackId:e,pitch:o,velocity:r,volume:A,when:n,duration:l})},eH=tb({getTracks:()=>eo.map(e=>({id:e.config.id,volume:e.volume,notes:e.core.getNotes()})),getBpm:()=>S,getPlayStartStep:()=>Y,getDrumPattern:()=>b[N]??null,getSoloTrackId:()=>V?U:null,getAudioTime:Q,onPlayNote:e=>{if(eA.has(e.trackId))return;let o=eo.findIndex(t=>t.config.id===e.trackId);o>=0&&z.has(o)&&t.singingVoices||t.onPlayNote?.({...e,volume:e.volume*(L/100)})},onPlayDrum:e=>{let o=e.velocity*(R/100)*(L/100);t.onPlayDrum?.({...e,velocity:o})},onTick:e=>{j=e;let t=i.width/x.stepWidth,o=H/x.stepWidth+t-4;if(j>o){let e=Math.round(t/x.stepsPerBar);tg(H=tW(H+e*x.stepsPerBar*x.stepWidth,0,es()),G)}ec()},onEnd:e=>{e?(X="paused",W=j):(X="stopped",j=0),ez(),ec()},stepsPerBar:x.stepsPerBar}),eO=async()=>{let e;if("playing"===X)return;await t.onResumeAudio?.();let o="paused"===X?W:Y;t.singingVoices?.reset();let a=(e=new Map,eo.forEach((t,o)=>{let a=t.lyricModel.trim(),r=t.lyrics.trim();if(!a||!r)return;let n=eM(r);0!==n.length&&e.set(o,{trackId:o,model:a.toLowerCase(),volume:t.vocalVolume,gate:t.vocalGate,pan:t.vocalPan,octave:t.vocalOctave,syllables:n})}),e);z=new Set(a.keys());let r=60/S/48,n=t.singingVoices?[...a.values()].map(e=>{let t=eo[e.trackId],a=[...t?.core.getNotes()??[]].sort((e,t)=>e.startStep-t.startStep),n=(e.gate??100)/100,l=(e.octave??0)*12,A=Math.min(a.length,e.syllables.length),u=[];for(let t=0;t<A;t++){let A=a[t];A.startStep<o||u.push({syllable:e.syllables[t],pitch:A.pitch+l,startSec:(A.startStep-o)*r,durationSec:A.durationSteps*r*n})}return{id:t?.config.id,model:e.model,volume:eU(e.volume??200)*(L/100),pan:eP(e.pan??64),notes:u}}):[],l=t.singingVoices,A=!!l&&n.some(e=>e.notes.length>0);if(A&&l){let e=tx(k.rollContainer);tL(!0);try{await l.loadModels(n.map(e=>e.model)),await l.warm(n)}catch(e){console.warn("[dtm] voice preload failed",e)}finally{e.remove(),tL(!1)}}if("paused"!==X){let e=i;tg(H=tW(Y*x.stepWidth-.5*e.width,0,es()),G)}X="playing",eH.start(o),A&&l&&l.startStream(n,eH.getStartTime(),{isAudible:e=>!V||e.id===U}),ez()},eG=()=>{"playing"===X&&(W=j,eH.stop(),t.singingVoices?.stopStream(),X="paused",ez())},eq=()=>{eH.stop(),t.singingVoices?.stopStream(),X="stopped",j=0,ez(),ec()},ez=()=>{let e="playing"===X;k.playBtn.innerHTML=ep(e?"pause":"play"),k.playBtn.classList.toggle("dtm-play--stop",e)},eX=()=>{let e=eu().core;k.undoBtn.disabled=!e.canUndo(),k.redoBtn.disabled=!e.canRedo()},eW=()=>{for(let[e,t]of(k.trackTabs.innerHTML="",eo.entries())){let[o,a,r]=t.config.color,n=document.createElement("button");n.className=`dtm-pill ${t.config.id===U?"dtm-pill--active":""}`,n.style.setProperty("--dtm-pill-color",`rgb(${o},${a},${r})`),n.title=t.config.name,n.textContent=String(e+1),n.addEventListener("click",()=>ej(t.config.id)),k.trackTabs.appendChild(n)}let e=eu();k.trackBody.innerHTML=`
      <div class="dtm-row">
        <span class="dtm-label">\u30D9\u30ED\u30B7\u30C6\u30A3</span>
        <input type="range" class="dtm-range dtm-grow" data-dtm="track-vol" min="0" max="127" value="${e.volume}">
        <span class="dtm-label" data-dtm="track-vol-label">${e.volume}</span>
      </div>`;let a=k.trackBody.querySelector('[data-dtm="track-vol"]'),r=k.trackBody.querySelector('[data-dtm="track-vol-label"]');a.addEventListener("input",()=>{e.volume=Number.parseInt(a.value,10),e.core.setVolume(e.volume),r.textContent=String(e.volume)});let n=document.createElement("div");n.className="dtm-row",n.innerHTML='<span class="dtm-label">楽器</span>';let l=document.createElement("select");l.className="dtm-select dtm-grow";let A=document.createElement("option");A.value="",A.textContent="デフォルト（プリセット）",l.appendChild(A),["ピアノ","クロマティックパーカッション","オルガン","ギター","ベース","ストリングス","アンサンブル","ブラス","リード（木管）","パイプ","シンセリード","シンセパッド","シンセエフェクト","エスニック","パーカッシブ","サウンドエフェクト"].forEach((e,t)=>{let o=document.createElement("optgroup");o.label=e;for(let e=0;e<8;e++){let a=C[8*t+e];if(!a)break;let r=document.createElement("option");r.value=a,r.textContent=a,o.appendChild(r)}l.appendChild(o)}),l.value=tj(e.trackInstrument);let u=()=>{l.disabled=!!e.lyricModel,l.title=e.lyricModel?"歌詞モードのときは楽器を個別指定できません":""};if(u(),l.addEventListener("change",()=>{e.trackInstrument=l.value;let o=eo.indexOf(e);t.onTrackInstrumentChange?.(o,e.trackInstrument)}),n.appendChild(l),k.trackBody.appendChild(n),y||"chord"!==e.config.id){let t=document.createElement("div");t.className="dtm-row",t.style.flexDirection="column",t.style.alignItems="stretch",t.innerHTML=`
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
      </div>`,k.trackBody.appendChild(t);let o=t.querySelector('[data-dtm="lyric-model"]'),a=t.querySelector('[data-dtm="lyric-octave"]'),r=t.querySelector('[data-dtm="lyric-icon"]'),n=t.querySelector('[data-dtm="lyric-body"]'),l=t.querySelector('[data-dtm="lyric-input"]'),A=t.querySelector('[data-dtm="lyric-count"]'),i=t.querySelector('[data-dtm="lyric-vol"]'),s=t.querySelector('[data-dtm="lyric-vol-label"]'),d=t.querySelector('[data-dtm="lyric-pan"]'),c=t.querySelector('[data-dtm="lyric-pan-label"]'),g=t.querySelector('[data-dtm="lyric-terms"]'),m=t.querySelector('[data-dtm="lyric-terms-link"]'),p=e=>64===e?"C":e<64?`L${64-e}`:`R${e-64}`,C=(e,t)=>{let a=document.createElement("option");a.value=e,a.textContent=t,o.appendChild(a)};for(let e of(C("","ボーカルなし"),tq))C(e,tX(e));e.lyricModel&&!tq.includes(e.lyricModel)&&C(e.lyricModel,tX(e.lyricModel)),o.value=e.lyricModel,a.value=String(e.vocalOctave),l.value=e.lyrics,i.value=String(e.vocalVolume),s.textContent=String(e.vocalVolume),d.value=String(e.vocalPan),c.textContent=p(e.vocalPan);let h=()=>{let t=eM(l.value).length;A.textContent=e.lyricModel&&t>0?`${t}\u97F3\u7BC0`:""},B=()=>{let t,o;n.style.display=e.lyricModel?"":"none",a.style.display=e.lyricModel?"":"none",h();let l=e.lyricModel?eV[e.lyricModel]:void 0;if(l){let t=tX(e.lyricModel);m.textContent=`${t}UTAU\u97F3\u6E90`,m.href=l,g.classList.remove("dtm-hidden")}else g.classList.add("dtm-hidden");(o=(t=e.lyricModel?eY[e.lyricModel.toLowerCase()]:void 0)?tD[t]:void 0)?(r.src=o,r.classList.remove("dtm-hidden")):(r.removeAttribute("src"),r.classList.add("dtm-hidden"))};B(),o.addEventListener("change",()=>{e.lyricModel=o.value,B(),u(),en(e)}),a.addEventListener("change",()=>{e.vocalOctave=Number.parseInt(a.value,10),en(e)}),l.addEventListener("input",()=>{e.lyrics=l.value,h(),en(e)}),i.addEventListener("input",()=>{e.vocalVolume=Number.parseInt(i.value,10),s.textContent=i.value,en(e)}),d.addEventListener("input",()=>{e.vocalPan=Number.parseInt(d.value,10),c.textContent=p(e.vocalPan),en(e)}),c.style.cursor="pointer",c.title="タップで中央(C)へ",c.addEventListener("click",()=>{e.vocalPan=64,d.value="64",c.textContent=p(64),en(e)})}if("chord"===e.config.id&&F){let t=document.createElement("div");t.className="dtm-row",t.style.flexDirection="column",t.style.alignItems="stretch",t.innerHTML=`
        <div class="dtm-row" style="justify-content: space-between; align-items: center;">
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="dtm-label">\u548C\u97F3</span>
            <button class="dtm-infobtn" data-dtm="chord-info" title="\u30B3\u30FC\u30C9\u9032\u884C\u306E\u66F8\u304D\u65B9\u89E3\u8AAC">${ep("info",12)}</button>
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
        </div>`,k.trackBody.appendChild(t);let a=t.querySelector('[data-dtm="chord-pattern"]'),r=t.querySelector('[data-dtm="chord-input"]');a.value=e.savedChordPattern;let n=()=>{e.savedChordInput=r.value,e.savedChordPattern=a.value};a.addEventListener("change",n),r.addEventListener("input",n),t.querySelector('[data-dtm="chord-info"]').addEventListener("click",()=>{o("コード進行の自動入力解説",tO)}),t.querySelector('[data-dtm="chord-apply"]').addEventListener("click",()=>{n(),e2()})}},ej=e=>{U=e,eW(),eX(),ec()},eZ=e=>{for(let[t,o]of(P=e,[[k.toolPen,"pen"],[k.toolSelect,"select"],[k.toolEraser,"eraser"]]))t.classList.toggle("dtm-segbtn--active",o===e);"select"!==e&&(ee=null,_=[]),ec()},e$=()=>{let e=Number(k.barLimitSelect.value),t=e>0?e*x.stepsPerBar:1/0,o=e=>t===1/0?e:e.filter(e=>e.startStep<t),a={};eo.forEach((e,t)=>{e.trackInstrument&&(a[t]=e.trackInstrument)});let r=Object.keys(a).length>0?a:void 0,n=tI({instrument:T||void 0,drum:"none"!==N?N:void 0,volume:L,drumVolume:R,mode:v,trackInstruments:r}," "),l=tI({instrument:T||void 0,drum:"none"!==N?N:void 0,volume:L,drumVolume:R,mode:v,trackInstruments:r},"");if(k.decomposeChordToggle.checked){let t=k.ignoreChordHeavyToggle.checked?eo.filter(e=>!((e,t=.6)=>{if(e.length<3)return!1;let o=new Map;for(let t of e)o.set(t.startStep,(o.get(t.startStep)??0)+1);return e.filter(e=>(o.get(e.startStep)??0)>=3).length/e.length>=t})(e.core.getNotes())):eo,a=eo.length-t.length,r=(e=>{let t=[...e].sort((e,t)=>e.startStep-t.startStep||e.pitch-t.pitch),o=[],a=[];for(let e of t){let t=-1,r=1/0;for(let n=0;n<o.length;n++)a[n]<=e.startStep&&a[n]<r&&(r=a[n],t=n);-1===t?(o.push([e]),a.push(e.startStep+e.durationSteps)):(o[t].push(e),a[t]=e.startStep+e.durationSteps)}return o})(o(t.flatMap(e=>e.core.getNotes()))),A=eo[0].core,u=r.map((e,t)=>`@${t} ${A.getMMLFromNotes(e,S,100).trim()}`),i=r.map((e,t)=>`@${t}${A.getMMLFromNotes(e,S,100).trim().replace(/\s+/g,"")}`);return{full:[n,...u,ew].filter(e=>e.length>0).join(";\n"),minified:[l,...i,ew].filter(e=>e.length>0).join(";"),ignoredCount:a,trackCount:r.length,barLimit:e}}let A=[],u=[];eo.forEach((e,t)=>{let a=o(e.core.getNotes());if(a.length>0){let o=e.core.getMMLFromNotes(a,S,e.volume).trim();A.push(`@${t} ${o}`),u.push(`@${t}${o.replace(/\s+/g,"")}`)}});let i=eo.map((e,t)=>({i:t,notes:o(e.core.getNotes()),text:e.lyrics.replace(/[\r\n]+/g," ").trim(),model:e.lyricModel.trim(),vol:e.vocalVolume,gate:e.vocalGate,pan:e.vocalPan,oct:e.vocalOctave})).filter(e=>e.model.length>0&&e.text.length>0&&e.notes.length>0).map(e=>{let t=[200===e.vol?"":`v${e.vol}`,100===e.gate?"":`q${e.gate}`,64===e.pan?"":`p${e.pan}`,0===e.oct?"":`o${e.oct}`].filter(e=>e.length>0).join(" "),o=t?`${e.model} ${t}`:e.model;return`@@${e.i} ${o} ${e.text}`});return{full:[n,...A,...i,ew].filter(e=>e.length>0).join(";\n"),minified:[l,...u,...i,ew].filter(e=>e.length>0).join(";"),ignoredCount:0,trackCount:A.length,barLimit:e}},e_=()=>{let e=Number.MAX_SAFE_INTEGER,t=[];for(let o of eo)for(let a of o.core.getNotes())a.startStep<e?(e=a.startStep,t=[a]):a.startStep===e&&t.push(a);return 0===t.length?null:Math.round(t.reduce((e,t)=>e+t.pitch,0)/t.length)},e0=e=>{let t=i;G=tW((x.keyCount-1-(e-x.pitchRangeStart))*x.keyHeight-(t.height-x.keyHeight)/2,0,ed()),tg(H,G)},e3=()=>{for(let e of eo)e.core.resetHistory(),e.core.clearNotesWithoutHistory();ec()},e1=e=>{if(!e)return;for(let e of(eq(),e3(),eo))e.core.setLoadMode(!0);let{placements:o,bpm:a,lyrics:r,meta:n,mergedTrackCount:l}=tv(e,{stepsPerBar:x.stepsPerBar,collectLyrics:!0,clampTrackCount:eo.length});for(let e of(n.instrument&&eB[n.instrument]&&(T=n.instrument,t.onInstrumentChange?.(n.instrument)),n.drum&&b[n.drum]&&(N=n.drum,k.drumSelect.value=n.drum,t.onDrumChange?.(n.drum)),void 0!==n.volume&&(L=n.volume,k.masterVolume.value=String(n.volume),k.masterVolumeLabel.textContent=`${n.volume}%`),void 0!==n.drumVolume&&(R=n.drumVolume,k.drumVolume.value=String(n.drumVolume),k.drumVolumeLabel.textContent=`${n.drumVolume}%`),eo.forEach((e,o)=>{let a=tj(n.trackInstruments?.[o]??"");e.trackInstrument!==a&&(e.trackInstrument=a,t.onTrackInstrumentChange?.(o,a))}),eo))e.lyrics="",e.lyricModel="",e.vocalVolume=200,e.vocalGate=100,e.vocalPan=64,e.vocalOctave=0;for(let e of(r?.forEach(e=>{let t=eo[e.trackId];t&&(t.lyrics=e.syllables.map(e=>e.kana).join(""),t.lyricModel=e.model,t.vocalVolume=e.volume,t.vocalGate=e.gate,t.vocalPan=e.pan,t.vocalOctave=e.octave??0)}),o)){let t=eo[e.trackIndex];t&&t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps})}for(let e of(a&&tm(a),eo))e.core.setLoadMode(!1),e.core.addHistoryOnce();Y=0,H=0;let A=e_();null!==A?e0(A):e0(48),ec(),eW(),eX(),!y&&l>0?(k.mmlLoadNote.textContent="シンプルモードのため、一部のトラックを合算して読み込みました",k.mmlLoadNote.classList.remove("dtm-hidden")):(k.mmlLoadNote.textContent="",k.mmlLoadNote.classList.add("dtm-hidden"))},e2=()=>{let e=eu(),t=eo.find(e=>"chord"===e.config.id);if(!t)return;let o=(e=>{let{chordStr:t,patternType:o,rootShift:a,bpm:r,stepsPerBar:n}=e,l=[];if(!t.trim())return l;let A=[];try{A=((e,t=120)=>{let o=[],a=60/t*4,r=new Set("ABCDEFG_=%N"),n=0,l=null;for(let t of e.replace(/[！-～]/g,e=>String.fromCharCode(e.charCodeAt(0)-65248)).replace(/　/g," ").split("\n").map(e=>e.trim()))if(!(!t.length||/^#/.test(t)))for(let e of t.split(/[|lｌ→]/)){if(!e.length)continue;let t=n++*a,A=[];for(let t=0;t<e.length;t++){let o=e[t],a=e[t-1],n=e.slice(t-2,t);r.has(o)&&"/"!==a&&"on"!==n&&("N."!==n||"C"!==o)&&A.push(t)}if(!A.length)continue;let u=2**Math.ceil(Math.log2(A.length)),i=a/u;for(let[a,r]of A.entries()){let n=e.slice(r,a===A.length-1?e.length:A[a+1]).replace(/\s+/g,""),u=n[0];if("_"===u||"N"===u){l=null;continue}if("="===u){l&&(l.duration+=i);continue}let s=t+a*i;if("%"===u){if(null===l)continue;l={...l,when:s,duration:i}}else{let e=n.slice(0,"#"===n[1]?2:1),t=n.slice(e.length).replace(/[\s・]/g,"");l={key:e,chord:t,when:s,duration:i}}o.push(l)}null!==l&&u>A.length&&(l.duration+=i*(u-A.length))}return o})(t,r)}catch{A=[]}if(A.length>0){let e=60/r*4/n,t={};for(let o of A){let a=Math.floor(o.when/e),r=Math.floor(o.duration/e);t[a]||(t[a]=[]),t[a].push({key:o.key,chord:o.chord,whenStep:a,durationSteps:r})}for(let e of Object.values(t))for(let t of e){let e;try{e=[...q(`${t.key}${t.chord}`).notes]}catch{continue}let r=t.durationSteps;if("block"===o)for(let o of e)l.push({startStep:t.whenStep,pitch:48+o+a,durationSteps:r,velocity:100});else if("arpeggio"===o){let o=Math.floor(r/e.length);e.forEach((e,n)=>{l.push({startStep:t.whenStep+n*o,pitch:48+e+a,durationSteps:r-n*o,velocity:100})})}else if("arpeggio-fast"===o)e.forEach((e,o)=>{l.push({startStep:t.whenStep+6*o,pitch:48+e+a,durationSteps:Math.max(12,r-6*o),velocity:100})});else if("offbeat"===o){let o=Math.floor(n/4),A=Math.floor(o/2);for(let n=0;n<4;n++){let u=t.whenStep+n*o+A;if(u<t.whenStep+r)for(let t of e)l.push({startStep:u,pitch:48+t+a,durationSteps:Math.min(A,12),velocity:100})}}else if("yatsume"===o){let o=Math.floor(n/4),A=e=>Math.max(1,Math.round(e*o/480)),u=[0,360,960,1320],i=A(360);for(let o of u){let n=t.whenStep+A(o);if(n<t.whenStep+r)for(let t of e)l.push({startStep:n,pitch:48+t+a,durationSteps:i,velocity:100})}}else"alternating"===o&&e.forEach((e,o)=>{let r=o*Math.floor(n/4);l.push({startStep:t.whenStep+r,pitch:48+e+a,durationSteps:Math.max(12,Math.floor(n/4)),velocity:100})})}}else t.split(/[\s,]+/).filter(e=>e).forEach((e,t)=>{let o;try{o=[...q(e).notes]}catch{return}if(0===o.length)return;let r=t*n;o.forEach((e,t)=>{let o=3*t;l.push({startStep:r+o,pitch:48+e+a,durationSteps:n-o,velocity:100})})});return l})({chordStr:e.savedChordInput,patternType:e.savedChordPattern,rootShift:e.savedChordRoot,bpm:S,stepsPerBar:x.stepsPerBar});for(let e of(t.core.clearNotesWithoutHistory(),t.core.beginBatch(),o))t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:Math.max(1,e.durationSteps),velocity:e.velocity});t.core.endBatch(),t.core.addHistoryOnce(),ec()},e5=async e=>{if(!t.parseMidi)return;let o=await t.parseMidi(e),a=e4(o).filter(e=>e.selected).map(e=>e.index);ta(o,a)},ta=(e,t)=>{for(let e of(eq(),e3(),eo))e.core.setLoadMode(!0);for(let e of eo)e.lyrics="",e.lyricModel="",e.vocalVolume=200,e.vocalGate=100,e.vocalPan=64,e.vocalOctave=0;let{placements:o,bpm:a}=y?((e,t,o)=>{let{tracks:a,division:r}=e,n=e8(e),l=r/48,A=[];return t.forEach((e,t)=>{if(t>=o.length)return;let r=a[e];if(!r)return;let n=o[t],u=[],i=0;for(let e of r)if(i+=e.delta,9!==e.channel){if(e.noteOn&&e.noteOn.velocity>0){let t=e.noteOn.noteNumber,o=e.noteOn.velocity;u.push({pitch:t,velocity:o,start:i,end:null})}else if(e.noteOff||e.noteOn&&0===e.noteOn.velocity){let t=e.noteOff||e.noteOn;if(t){let e=t.noteNumber;for(let t=u.length-1;t>=0;t--)if(u[t].pitch===e&&null===u[t].end){u[t].end=i;break}}}}for(let e of u){if(null===e.end)continue;let t=Math.round(e.start/l),o=Math.max(1,Math.round((e.end-e.start)/l));A.push({trackId:n,startStep:t,pitch:e.pitch,durationSteps:o,velocity:e.velocity})}}),{placements:A,bpm:n}})(e,t,eo.map(e=>e.config.id)):((e,t)=>{let{tracks:o,division:a}=e,r=e8(e),n={};for(let e of t){let t=o[e];if(!t)continue;let a=0;for(let e of t)if(a+=e.delta,9!==e.channel){if(e.noteOn&&e.noteOn.velocity>0){let t=e.noteOn.noteNumber,o=e.noteOn.velocity,r=e.channel??0;n[r]||(n[r]=[]),n[r].push({pitch:t,velocity:o,start:a,end:null})}else if(e.noteOff||e.noteOn&&0===e.noteOn.velocity){let t=e.noteOff||e.noteOn;if(t){let o=t.noteNumber,r=e.channel??0;if(n[r])for(let e=n[r].length-1;e>=0;e--){let t=n[r][e];if(t.pitch===o&&null===t.end){t.end=a;break}}}}}}let l=4*a,A=8*l,u={};for(let[e,t]of Object.entries(n)){let o=Number.parseInt(e,10),a=t.filter(e=>null!==e.end);if(0===a.length){u[o]={avgPitch:60,maxSimultaneous:0,hasSubmelodyPattern:!1};continue}let r=a.reduce((e,t)=>e+t.pitch,0)/a.length,n=0,i=[...a].sort((e,t)=>e.start-t.start);for(let e=0;e<i.length;e++){let t=1;for(let o=e+1;o<i.length;o++)i[o].start<i[e].end&&t++;n=Math.max(n,t)}let s=()=>{if(0===i.length)return!1;let e=[],t=i[0].start,o=i[0].end;for(let a=1;a<i.length;a++)i[a].start-i[a-1].end>=l&&(e.push({start:t,end:o}),t=i[a].start),o=i[a].end;return e.push({start:t,end:o}),e.every(e=>e.end-e.start<A)};u[o]={avgPitch:r,maxSimultaneous:n,hasSubmelodyPattern:s()}}let i=Object.keys(n).map(Number).sort((e,t)=>e-t),s=[...i].sort((e,t)=>u[e].avgPitch-u[t].avgPitch),d=u[s[Math.floor(s.length/4)]]?.avgPitch??60,c=i.filter(e=>u[e].avgPitch<=d&&u[e].maxSimultaneous<=2),g=i.filter(e=>u[e].maxSimultaneous<=1&&!c.includes(e)),m=g.filter(e=>u[e].hasSubmelodyPattern),p=g.filter(e=>!u[e].hasSubmelodyPattern),C=i.filter(e=>!c.includes(e)&&!p.includes(e)&&!m.includes(e)),h={melody:p,submelody:m,bass:c,chord:C},B=[],E=a/48;for(let[e,t]of Object.entries(n)){let o=Number.parseInt(e,10),a=null;for(let[e,t]of Object.entries(h))if(t.includes(o)){a=e;break}if(a)for(let e of t){if(null===e.end)continue;let t=Math.round(e.start/E),o=Math.max(1,Math.round((e.end-e.start)/E));B.push({trackId:a,startStep:t,pitch:e.pitch,durationSteps:o,velocity:e.velocity})}}return{placements:B,bpm:r}})(e,t);for(let e of o){let t=eo.find(t=>t.config.id===e.trackId);t&&t.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}for(let e of(tm(Math.round(a)),eo))e.core.setLoadMode(!1),e.core.addHistoryOnce();Y=0,H=0;let r=e_();null!==r?e0(r):e0(48),ec(),eW(),eX()},tu=()=>(e=>{var t;let{tracks:o,drumPattern:a,drumVolume:r=80,bpm:n,stepsPerBar:l}=e,A=[];if(o.forEach((e,t)=>{if(0===e.notes.length)return;let o=t<9?t:t+1&15,a=[];for(let t of e.notes){let r=Math.round(10*t.startStep),n=Math.round((t.startStep+(t.durationSteps||1))*10),l=Math.round((t.velocity??100)*(e.volume??100)/100);a.push({t:r,m:[144|o,t.pitch,l]}),a.push({t:n,m:[144|o,t.pitch,0]})}a.sort((e,t)=>e.t-t.t),A.push(a)}),a&&a.length>0){let e=Math.max(...o.filter(e=>e.notes.length>0).map(e=>Math.max(...e.notes.map(e=>e.startStep+e.durationSteps))),l),t=[],n=Math.ceil(e/l);for(let o=0;o<n;o++){let n=o*l;for(let o of a){let a=n+o.step;if(a>=e)continue;let l=Math.round((o.velocity??1)*(r/100)*127);t.push({t:Math.round(10*a),m:[153,o.pitch,l]}),t.push({t:Math.round((a+1)*10),m:[153,o.pitch,0]})}}t.sort((e,t)=>e.t-t.t),t.length>0&&A.push(t)}let u=[];for(let e of(t=A.length+1,u.push(77,84,104,100),u.push(...te(6)),u.push(...e9(1)),u.push(...e9(t)),u.push(...e9(480)),to(u,e=>{e.push(0,255,81,3,...e7(Math.round(6e7/n)))}),A))to(u,t=>{let o=0;for(let a of e)t.push(...tt(a.t-o),...a.m),o=a.t});return new Blob([new Uint8Array(u).buffer],{type:"audio/midi"})})({tracks:eo.map(e=>({notes:e.core.getNotes(),volume:e.volume})),drumPattern:b[N],drumVolume:R,bpm:S,stepsPerBar:x.stepsPerBar}),tm=e=>{for(let t of(S=e,k.bpmInput.value=String(e),eo))t.core.setTempo(e)},th=0,tB=()=>{let e=Date.now();e-th<100||(th=e,eu().core.undo(),ec(),eX())},tE=()=>{eu().core.redo(),ec(),eX()},tf=e=>{k.overlay.hidden=!1,tL(!0),setTimeout(()=>{e(),k.overlay.hidden=!0,tL(!1)},30)},tQ=e=>new Promise(t=>{let o=document.createElement("div");o.className="dtm-modal-overlay",o.innerHTML=`
				<div class="dtm-modal">
					<div class="dtm-modal-header">
						<span class="dtm-modal-title">\u30E2\u30FC\u30C9\u306E\u78BA\u8A8D</span>
					</div>
					<div class="dtm-modal-body"><p>${e}</p></div>
					<div class="dtm-confirm-footer">
						<button class="dtm-btn dtm-btn--ghost dtm-confirm-no">\u3044\u3044\u3048\uFF08\u3053\u306E\u307E\u307E\u8AAD\u307F\u8FBC\u3080\uFF09</button>
						<button class="dtm-btn dtm-btn--primary dtm-confirm-yes">\u306F\u3044\uFF08\u4E0A\u7D1A\u8005\u30E2\u30FC\u30C9\u306B\u5207\u308A\u66FF\u3048\u308B\uFF09</button>
					</div>
				</div>`;let a=e=>{o.remove(),t(e)};o.querySelector(".dtm-confirm-yes").addEventListener("click",()=>a(!0)),o.querySelector(".dtm-confirm-no").addEventListener("click",()=>a(!1)),o.addEventListener("click",e=>{e.target===o&&a(!1)}),document.body.appendChild(o)}),ty=null,tw=[],tF=e=>{if(e.ctrlKey||e.metaKey)if("KeyZ"!==e.code||e.shiftKey){if("KeyZ"===e.code&&e.shiftKey||"KeyY"===e.code)e.preventDefault(),tE();else if("KeyC"===e.code&&_.length>0)e.preventDefault(),et=[..._];else if("KeyX"===e.code&&_.length>0){if(e.preventDefault(),!ek()){et=[..._];let e=eu().core;for(let t of(e.beginBatch(),_))e.deleteNoteById(t.id);e.endBatch(),_=[]}}else if("KeyV"===e.code&&et.length>0){if(e.preventDefault(),ek())return;let t=eu().core,o=t.getNotes(),a=Math.min(...et.map(e=>e.startStep));for(let e of(t.beginBatch(),et)){let r=Y+(e.startStep-a),n=r+e.durationSteps;o.some(t=>t.pitch===e.pitch&&r<t.startStep+t.durationSteps&&n>t.startStep)||t.addNote(r,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}t.endBatch(),ec()}}else e.preventDefault(),tB()};eL(),eo=I.map(e=>{let o=[];return{config:e,core:new tp({onMMLGenerated:()=>{},onNotesChanged:a=>{if(Z){if(!ea&&t.onNotesPatch){let r=new Map(o.map(e=>[`${e.startStep}_${e.pitch}`,e])),n=new Map(a.map(e=>[`${e.startStep}_${e.pitch}`,e])),l=a.filter(e=>{let t=r.get(`${e.startStep}_${e.pitch}`);return!t||t.durationSteps!==e.durationSteps||t.velocity!==e.velocity}).map(e=>({startStep:e.startStep,pitch:e.pitch,durationSteps:e.durationSteps,velocity:e.velocity})),A=o.filter(e=>!n.has(`${e.startStep}_${e.pitch}`)).map(e=>({startStep:e.startStep,pitch:e.pitch}));(l.length>0||A.length>0)&&t.onNotesPatch(e.id,l,A)}o=a.map(e=>({...e})),ec(),eX()}}},e.volume),volume:e.volume,savedChordInput:"",savedChordPattern:"block",savedChordRoot:0,lyrics:"",lyricModel:"",vocalVolume:200,vocalGate:100,vocalPan:64,vocalOctave:0,trackInstrument:""}}),Z=!0,a=!1,r=!1,n=!1,l=()=>{if(a&&(a=!1,n)){n=!1;let e=Math.max(0,Math.floor(H/x.stepWidth/K)*K);W=e,j=e,eO()}},k.hScroll.addEventListener("pointerdown",e=>{a=!0,(n="playing"===X)&&eG(),e.preventDefault(),k.hScroll.setPointerCapture(e.pointerId),m(e.clientX)}),k.vScroll.addEventListener("pointerdown",e=>{r=!0,e.preventDefault(),k.vScroll.setPointerCapture(e.pointerId),p(e.clientY)}),k.hScroll.addEventListener("pointermove",e=>{a&&m(e.clientX)}),k.vScroll.addEventListener("pointermove",e=>{r&&p(e.clientY)}),k.hScroll.addEventListener("pointerup",l),k.vScroll.addEventListener("pointerup",()=>{r=!1}),document.addEventListener("pointermove",e=>{a&&m(e.clientX),r&&p(e.clientY)}),document.addEventListener("pointerup",()=>{l(),r=!1}),m=e=>{let t=es();if(t<=0)return;let o=k.hScroll.getBoundingClientRect(),a=Number.parseFloat(k.hScrollThumb.style.width)||40,r=tW(e-o.left-a/2,0,o.width-a)/(o.width-a);tg(H=tW(r*t,0,t),G),ec()},p=e=>{let t=ed();if(t<=0)return;let o=k.vScroll.getBoundingClientRect(),a=Number.parseFloat(k.vScrollThumb.style.height)||40,r=tW(e-o.top-a/2,0,o.height-a)/(o.height-a);G=tW(r*t,0,t),tg(H,G),ec()},k.playBtn.addEventListener("click",()=>{"playing"===X?eq():eO()}),k.playBtn.disabled=!1,k.prevBarBtn.addEventListener("click",()=>{tN(Math.max(0,Math.floor((tR()-1)/x.stepsPerBar)*x.stepsPerBar))}),k.nextBarBtn.addEventListener("click",()=>{tN(Math.floor(tR()/x.stepsPerBar+1)*x.stepsPerBar)}),k.soloCheckbox.addEventListener("change",()=>{V=k.soloCheckbox.checked,ec()}),k.toolPen.addEventListener("click",()=>eZ("pen")),k.toolSelect.addEventListener("click",()=>eZ("select")),k.toolEraser.addEventListener("click",()=>eZ("eraser")),k.undoBtn.addEventListener("click",tB),k.redoBtn.addEventListener("click",tE),k.noteLengthSelect.addEventListener("change",()=>{J=K=Number.parseInt(k.noteLengthSelect.value,10),ec()}),k.bpmInput.addEventListener("input",()=>{tm(Number.parseInt(k.bpmInput.value,10)||120)}),k.zoomXIn.addEventListener("click",()=>{D=Math.min(200,D+25),eR(),eJ()}),k.zoomXOut.addEventListener("click",()=>{D=Math.max(25,D-25),eR(),eJ()}),k.zoomYIn.addEventListener("click",()=>{M=Math.min(200,M+25),eN(),eJ()}),k.zoomYOut.addEventListener("click",()=>{M=Math.max(50,M-25),eN(),eJ()}),k.decomposeChordToggle.addEventListener("change",eJ),k.ignoreChordHeavyToggle.addEventListener("change",eJ),k.masterVolume.addEventListener("input",()=>{L=Number.parseInt(k.masterVolume.value,10)||0,k.masterVolumeLabel.textContent=`${L}%`}),k.drumSelect.addEventListener("change",()=>{N=k.drumSelect.value,t.onDrumChange?.(N)}),k.drumVolume.addEventListener("input",()=>{R=Number.parseInt(k.drumVolume.value,10)||0,k.drumVolumeLabel.textContent=`${R}%`}),k.macroClear.addEventListener("click",()=>{let e=eu();e.core.beginBatch(),e.core.clearNotesWithoutHistory(),e.core.endBatch(),e.core.saveHistory(),ec()}),k.macroRandom.addEventListener("click",()=>{((e,t)=>{let{stepsPerBar:o,startStep:a,pitchRangeStart:r}=t,n=r+60,l=e6[Math.floor(Math.random()*e6.length)],A=Math.floor(12*Math.random()),u=[];for(let e=0;e<12;e++){let t=(e-A+12)%12;l.includes(t)&&u.push(n+e)}e.beginBatch();for(let t=0;t<8;t++){let r=a+t*o,n=Math.floor(4*Math.random())+2,l=new Set;for(let t=0;t<n;t++){let t=r+24*Math.floor(o/24*Math.random());if(l.has(t))continue;l.add(t);let a=u[Math.floor(Math.random()*u.length)];e.addNote(t,a,{noteLengthSteps:24})}}e.endBatch(),e.saveHistory()})(eu().core,{stepsPerBar:x.stepsPerBar,startStep:Y,pitchRangeStart:x.pitchRangeStart}),ec()}),k.macroHarmonic.addEventListener("click",()=>{let e=eo.find(e=>"chord"===e.config.id);e&&"chord"!==U&&(((e,t,o)=>{let a=o.stepsPerBar/2,r=e.getNotes().concat(t.getNotes());if(0===r.length)return;let n=Math.ceil(Math.max(...r.map(e=>e.startStep+e.durationSteps))/a),l=new Set;e.beginBatch();for(let o=0;o<n;o++){let r=o*a,n=r+a,A=o%2==0,u=t.getNotes().filter(e=>e.startStep>=r&&e.startStep<n);if(u.length>0?l=new Set(u.map(e=>e.pitch%12)):A&&(l=new Set),0!==l.size)for(let t of e.getNotes().filter(e=>e.startStep>=r&&e.startStep<n))l.has(t.pitch%12)||e.deleteNoteById(t.id)}e.endBatch(),e.saveHistory()})(eu().core,e.core,{stepsPerBar:x.stepsPerBar}),ec())}),k.macroMono.addEventListener("click",()=>{let e=eo.find(e=>"chord"===e.config.id);e&&"chord"!==U&&(((e,t,o)=>{let a=o.stepsPerBar/2,r=e.getNotes().concat(t.getNotes());if(0===r.length)return;let n=Math.ceil(Math.max(...r.map(e=>e.startStep+e.durationSteps))/a),l=new Set;e.beginBatch();for(let o=0;o<n;o++){let r=o*a,n=r+a,A=o%2==0,u=t.getNotes().filter(e=>e.startStep>=r&&e.startStep<n);if(u.length>0?l=new Set(u.map(e=>e.pitch%12)):A&&(l=new Set),0===l.size)continue;let i=e.getNotes().filter(e=>e.startStep>=r&&e.startStep<n),s=i.filter(e=>l.has(e.pitch%12)),d=new Set(s.map(e=>e.id));for(let t of i)d.has(t.id)||e.deleteNoteById(t.id);let c=new Map;for(let e of s)c.has(e.startStep)||c.set(e.startStep,[]),c.get(e.startStep)?.push(e);for(let t of c.values())if(t.length>1){t.sort((e,t)=>t.pitch-e.pitch);let[,...o]=t;for(let t of o)e.deleteNoteById(t.id)}}e.endBatch(),e.saveHistory()})(eu().core,e.core,{stepsPerBar:x.stepsPerBar}),ec())}),k.generateMmlBtn.addEventListener("click",()=>{let{full:e,minified:t,ignoredCount:o,trackCount:a,barLimit:r}=e$();k.outputFull.textContent=e,k.outputMini.textContent=t;let n=k.decomposeChordToggle.checked,l=o>0?` / \u4F34\u594F${o}\u30C8\u30E9\u30C3\u30AF\u9664\u5916`:"",A=r>0?` / \u301C${r}\u5C0F\u7BC0`:"";k.outputStatus.textContent=`[${n?"和音分解":"通常"}] (${a}\u30C8\u30E9\u30C3\u30AF${l}${A}) \u901A\u5E38: ${e.length}\u6587\u5B57 / minify: ${t.length}\u6587\u5B57`,k.outputContainer.classList.remove("dtm-hidden"),eX()}),k.exportMidiBtn.addEventListener("click",()=>{let e=tu(),t=URL.createObjectURL(e),o=document.createElement("a");o.href=t,o.download="dtm.mid",o.click(),URL.revokeObjectURL(t)}),h=(e,t)=>{navigator.clipboard?.writeText(e),t.classList.add("dtm-btn--success"),setTimeout(()=>t.classList.remove("dtm-btn--success"),1200)},k.copyFullBtn.addEventListener("click",()=>h(k.outputFull.textContent??"",k.copyFullBtn)),k.copyMiniBtn.addEventListener("click",()=>h(k.outputMini.textContent??"",k.copyMiniBtn)),k.mmlLoadBtn.addEventListener("click",async()=>{let e=k.mmlInput.value;if(!y&&t.onRequestAdvancedMode){let{mergedTrackCount:o}=tv(e,{stepsPerBar:x.stepsPerBar,clampTrackCount:eo.length});if(o>0&&await tQ("初心者モードで読み込むと、音が崩れる可能性があります。<br>上級者モードに切り替えますか？"))return void t.onRequestAdvancedMode(e)}tf(()=>e1(e))}),B=null,E=null,f=()=>{if(B&&(B.stop(),B.destroy(),B=null),E){E.textContent="▶ 試聴",E.classList.remove("dtm-btn--danger"),E.classList.add("dtm-btn--primary");let e=E.closest(".dtm-modal-sample-box"),t=e?.querySelector(".dtm-modal-sample-player-container");t&&(t.innerHTML=""),E=null}},o=(e,o)=>{for(let t of(f(),k.modalTitle.textContent=e,k.modalBody.innerHTML=o,k.modalOverlay.removeAttribute("hidden"),k.modalBody.querySelectorAll(".dtm-modal-sample-copy-btn")))t.addEventListener("click",()=>{let e=t.getAttribute("data-mml")||"";navigator.clipboard.writeText(e).then(()=>{let e=t.textContent;t.textContent="✓ コピー完了",t.classList.add("dtm-btn--success"),setTimeout(()=>{t.textContent=e,t.classList.remove("dtm-btn--success")},1200)})});for(let e of k.modalBody.querySelectorAll(".dtm-modal-sample-play-btn")){let o=e;o.addEventListener("click",()=>{let e=o.closest(".dtm-modal-sample-box"),a=e?.querySelector(".dtm-modal-sample-player-container"),r=o.getAttribute("data-mml")||"";if(E===o)B?.isPlaying()?B.stop():(eq(),B&&(B.play(),o.textContent="■ 停止",o.classList.remove("dtm-btn--primary"),o.classList.add("dtm-btn--danger")));else if(f(),eq(),E=o,o.textContent="■ 停止",o.classList.remove("dtm-btn--primary"),o.classList.add("dtm-btn--danger"),a){a.innerHTML="";let e=tH(a,r,{onPlayNote:e=>{if(t.onPlayNote){let o=I[Number(e.trackId)],a=o?o.id:e.trackId;t.onPlayNote({...e,trackId:a})}},onPlayDrum:t.onPlayDrum,onResumeAudio:t.onResumeAudio,getAudioTime:t.getAudioTime,singingVoices:t.singingVoices,drumPatterns:t.drumPatterns,volume:L,_skipInfoModals:!0,onStop:()=>{E===o&&(o.textContent="▶ 試聴",o.classList.remove("dtm-btn--danger"),o.classList.add("dtm-btn--primary"))}});B=e,e.play()}})}},k.modalClose.addEventListener("click",()=>{f(),k.modalOverlay.setAttribute("hidden","")}),k.modalOverlay.addEventListener("click",e=>{e.target===k.modalOverlay&&(f(),k.modalOverlay.setAttribute("hidden",""))}),k.mmlInfoBtn.addEventListener("click",()=>{o("MMLの書き方解説",tC)}),k.midiInfoBtn.addEventListener("click",()=>{o("MIDIの読み込み解説",tG)}),k.shiftApplyBtn.addEventListener("click",()=>tf(()=>{((e,t)=>{if(0!==t)for(let o of e)for(let e of[...o.getNotes()]){let a=e.startStep+t;a<0?o.deleteNoteById(e.id):o.moveNote(e.id,a,e.pitch)}})(eo.map(e=>e.core),Number.parseInt(k.shiftSelect.value,10)||0),ec()})),w&&(k.midiInput.addEventListener("change",async()=>{let e=k.midiInput.files?.[0];if(!e||!t.parseMidi)return;k.overlay.hidden=!1,tL(!0);let o=new Uint8Array(await e.arrayBuffer());tw=e4(ty=await t.parseMidi(o)),k.midiTrackSelection.innerHTML='<span class="dtm-label">トラック</span>',tw.forEach((e,t)=>{let o=document.createElement("button");o.className=`dtm-btn ${e.selected?"dtm-btn--primary":"dtm-btn--ghost"}`,o.dataset.selected=String(e.selected),o.textContent=`${e.name} (${e.noteCount})`,o.addEventListener("click",()=>{let e="true"!==o.dataset.selected;o.dataset.selected=String(e),o.classList.toggle("dtm-btn--primary",e),o.classList.toggle("dtm-btn--ghost",!e)}),k.midiTrackSelection.appendChild(o),0===t&&(k.midiTrackSelection.dataset.ready="1")}),k.midiTrackSelection.classList.remove("dtm-hidden"),k.overlay.hidden=!0,tL(!1)}),k.midiLoadBtn.addEventListener("click",async()=>{if(!ty)return;let e=[];if(k.midiTrackSelection.querySelectorAll("button").forEach((t,o)=>{"true"===t.dataset.selected&&e.push(tw[o].index)}),0!==e.length){if(!y&&t.onRequestAdvancedMode&&e.length>eo.length&&await tQ("初心者モードで読み込むと、音が崩れる可能性があります。<br>上級者モードに切り替えますか？")){let o=ty,a=e.slice();t.onRequestAdvancedMode(void 0,e=>{e.applyMidiParsed?.(o,a)});return}tf(()=>ta(ty,e))}})),document.addEventListener("keydown",tF),k.root.addEventListener("keydown",e=>{let t=e.target;"TEXTAREA"!==t.tagName&&"INPUT"!==t.tagName||(e.ctrlKey||e.metaKey)&&["KeyZ","KeyY","KeyV","KeyC","KeyX"].includes(e.code)&&e.stopPropagation()}),tm(S),eW(),ez(),eX(),ec(),t.initialMML&&e1(t.initialMML);let tM=null,tS=new ResizeObserver(()=>{tM&&clearTimeout(tM),tM=setTimeout(()=>eL(),150)});tS.observe(k.rollContainer),document.addEventListener("pointermove",eD),document.addEventListener("pointerup",eS);let tL=e=>{$=e,k.topbar.classList.toggle("is-loading",e)},tR=()=>"playing"===X?j:"paused"===X?W:Y,tN=async e=>{"playing"===X?(eH.stop(),t.singingVoices?.stopStream(),Y=e,W=e,j=e,X="paused",await eO()):tT(e)},tT=e=>{Y=e,W=e,j=e,X="paused";let t=i;tg(H=tW(e*x.stepWidth-.5*t.width,0,es()),G),ez(),ec()};return{play:eO,pause:eG,stop:eq,getMML:e$,setInstrument:e=>{T=e},getDrum:()=>N,setDrum:e=>{("none"===e||b[e])&&(N=e,k.drumSelect.value=e,t.onDrumChange?.(e))},getViewState:eT,setViewState:e=>{"number"==typeof e.zoomX&&(D=tW(e.zoomX,25,200),eR()),"number"==typeof e.zoomY&&(M=tW(e.zoomY,50,200),eN()),"boolean"==typeof e.decomposeChord&&(k.decomposeChordToggle.checked=e.decomposeChord),"boolean"==typeof e.ignoreChordHeavy&&(k.ignoreChordHeavyToggle.checked=e.ignoreChordHeavy)},loadMML:e1,loadMIDI:e5,applyMidiParsed:(e,t)=>{tf(()=>ta(e,t))},exportMIDI:tu,setBpm:tm,getPlaybackState:()=>X,getCurrentPlayStep:tR,forcePauseAt:tT,setLoading:tL,applyPatch:(e,t,o)=>{let a=eo.find(t=>t.config.id===e);if(a){for(let e of(ea=!0,a.core.beginBatch(),t)){let t=a.core.getNotes().find(t=>t.startStep===e.startStep&&t.pitch===e.pitch);t&&a.core.deleteNoteById(t.id),a.core.addNote(e.startStep,e.pitch,{noteLengthSteps:e.durationSteps,velocity:e.velocity})}for(let e of o){let t=a.core.getNotes().find(t=>t.startStep===e.startStep&&t.pitch===e.pitch);t&&a.core.deleteNoteById(t.id)}a.core.endBatch(),ea=!1,ec()}},setTrackVisible:(e,t)=>{t?el.delete(e):el.add(e),ec()},setTrackAudible:(e,t)=>{t?eA.delete(e):eA.add(e)},applyLyrics:(e,t)=>{let o=eo.find(t=>t.config.id===e);o&&(o.lyrics=t.lyrics,o.lyricModel=t.model,o.vocalVolume=t.vocalVolume,o.vocalGate=t.vocalGate,o.vocalPan=t.vocalPan,o.vocalOctave=t.vocalOctave)},applyTrackInstrument:(e,t)=>{let o=eo[e];o&&(o.trackInstrument=tj(t),o.config.id===U&&eW())},noteToCanvas:(e,t)=>{let o=i,a=e*x.stepWidth-H,r=(x.keyCount-1-t)*x.keyHeight-G,n=a>=0&&a<=o.width&&r>=0&&r<=o.height,l=null;return n||(l=a<0?"left":a>o.width?"right":r<0?"top":"bottom"),{x:a,y:r,onScreen:n,side:l}},destroy:()=>{eH.stop(),t.singingVoices?.stopStream(),tS.disconnect(),document.removeEventListener("pointermove",eD),document.removeEventListener("pointerup",eS),document.removeEventListener("keydown",tF),e.innerHTML=""}}})(e,O);J.push(G);let Y=p??a.presetUI,V=e.querySelector('[data-dtm="roll"]');Y&&(P.get(e)?.destroy(),K=T(e,{getDaw:()=>G,getTrackIds:()=>v,value:D,loadingTarget:V??e,position:"prepend",onChange:e=>{M=e}}),P.set(e,K)),G.setInstrument(D);let z=V?tx(V):null;return G.setLoading?.(!0),R(D,v,S?"advanced":"simple").finally(()=>{z?.remove(),G.setLoading?.(!1)}),{...G,setInstrument:e=>{G.setInstrument(e),M=e,K&&K.setValue(e)},applyTrackInstrument:(e,t)=>{G.applyTrackInstrument(e,t),H(e,t)},destroy:()=>{G.destroy(),K?.destroy(),P.get(e)===K&&P.delete(e);let t=J.indexOf(G);t>=0&&J.splice(t,1)}}};return{audioContext:r,singingVoices:Q,mountEditor:O,mountPlayer:(e,t,o={})=>{let a=tv(t,{}),l=a.meta??{},A=l.instrument&&eB[l.instrument]?l.instrument:x,u="advanced"===l.mode,i=[...new Set(a.placements.map(e=>e.trackIndex))].map(e=>D(e,u?"advanced":"simple")),s=i.length>0?i:[...oa],d=new Map,c=async()=>{if(l.trackInstruments)for(let[e,t]of(await I,Object.entries(l.trackInstruments))){let o=b(t);o&&(d.set(Number(e),o),await k(o))}};Promise.all([R(A,s,u?"advanced":"simple"),c()]);let g=tH(e,t,{getAudioTime:()=>r.currentTime,onResumeAudio:m,onPlayNote:e=>{let t,o=Number(e.trackId),a=d.get(o);(t=a?w.get(a):L(A,D(o,u?"advanced":"simple"),u?"advanced":"simple"))&&t.play({ctx:r,destination:n,pitch:e.pitch,volume:e.volume,when:e.when,duration:e.duration})},onPlayDrum:U,singingVoices:Q,...o});return K.push(g),{...g,destroy:()=>{g.destroy();let e=K.indexOf(g);e>=0&&K.splice(e,1)}}},loadPreset:R,defaultPreset:x,mountPresetSelect:T,mountModeSwitch:(e,t)=>{let o=e.ownerDocument,a=t.tracksFor??(e=>"advanced"===e?tV:tY),r={simple:t.labels?.simple??"初心者",advanced:t.labels?.advanced??"上級者"},n=e=>"function"==typeof t.editorOptions?t.editorOptions(e):t.editorOptions??{},l=t.mode??"simple",A=null,u=o.createElement("div");if(u.className=t.className??"dtm-controlbar",null!==t.label){let e=o.createElement("span");e.className="dtm-controlbar-label",e.textContent=t.label??"モード",u.appendChild(e)}let i=o.createElement("div");i.className="dtm-modeseg";let s=new Map,d=()=>{for(let[e,t]of s)t.classList.toggle("dtm-modebtn--active",e===l)};for(let e of["simple","advanced"]){let t=o.createElement("button");t.type="button",t.className="dtm-modebtn",t.textContent=r[e],t.addEventListener("click",()=>m(e)),i.appendChild(t),s.set(e,t)}u.appendChild(i);let c=(o,r)=>{let i=n(o);A=O(t.editorTarget,{...i,mode:o,tracks:a(o),initialMML:r??i.initialMML,onRequestAdvancedMode:(e,o)=>{g(),l="advanced",d(),t.onChange?.("advanced"),c("advanced",e),o&&A&&o(A)}}),"prepend"===t.position?e.insertBefore(u,e.firstChild):e.appendChild(u),t.onMount?.(A,o)},g=()=>{if(!A)return;let e=A.getMML().full;return t.onUnmount?.(A,l),A.destroy(),A=null,e};function m(e){if(e===l&&A)return;let o=g();l=e,d(),t.onChange?.(e),c(e,o)}d(),c(l,n(l).initialMML);let p={element:u,getDaw:()=>A,getMode:()=>l,setMode:m,destroy:()=>{g(),u.remove();let e=H.indexOf(p);e>=0&&H.splice(e,1)}};return H.push(p),p},dispose:()=>{for(let e of[...H])e.destroy();for(let e of K)e.destroy();for(let e of J)e.destroy();H.length=0,K.length=0,J.length=0,r.close()}}};let on=Function("url","return import(url)");async function ol(e,t){let o=await on(e);return o[t]??o.default}let oA=null;e.s(["getStudio",0,()=>(oA||(oA=(async()=>{let[e,t,o]=await Promise.all([ol("https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont.mjs","SoundFont"),ol("https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_drum.mjs","SoundFont_drum"),ol("https://rpgen3.github.io/soundfont/mjs/surikov/SoundFont_list.mjs","SoundFont_list")]);return or({engines:{SoundFont:e,SoundFont_drum:t,SoundFont_list:o}})})()),oA)],48605)}]);