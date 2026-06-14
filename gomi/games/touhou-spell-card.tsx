import React, { useState } from 'react';
import { PlayCircle, User, Skull } from 'lucide-react';

// プレイヤー用の初期設定
const defaultPlayer = {
    imageUrl: 'https://i.imgur.com/4M92pLV.png',
    startX: -150,
    startY: 80,
    scale: 2.5,
    charName: 'プレイヤー',
    spellName: '霊符「夢想封印」'
};

// ボス用の初期設定
const defaultBoss = {
    imageUrl: 'https://i.imgur.com/lf3x8xR.png',
    startX: 50,
    startY: 0,
    scale: 4,
    charName: 'ボスキャラクター',
    spellName: '禁忌「レーヴァテイン」'
};

// カットイン演出本体のコンポーネント
const Cutin = ({ mode, config }) => {
    const { imageUrl, startX, startY, scale, charName, spellName } = config;

    // テキストを読みやすくするための縁取りスタイル
    const strokeStyle = {
        textShadow: '2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
    };

    return (
        <div className={`absolute inset-0 overflow-hidden pointer-events-none cutin-wrapper ${mode}`}>
            <style>
                {
                    `

            /* CSS変数で柔軟に位置や拡大率を指定 */
            .cutin-wrapper {
                --start-x: $ {
                    startX
                }

                px;

                --start-y: $ {
                    startY
                }

                px;

                --scale: $ {
                    scale
                }

                ;
            }

            .anim-dim {
                animation: fade-dim 3.5s ease-in-out forwards;
            }

            .anim-boss-char {
                animation: boss-char-slide 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            }

            .anim-player-char {
                animation: player-char-slide 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
            }

            .anim-boss-banner {
                animation: boss-banner-slide 3.5s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
            }

            .anim-player-banner {
                animation: player-banner-slide 3.5s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
            }

            /* 背景の暗転アニメーション */
            @keyframes fade-dim {
                0% {
                    opacity: 0;
                }

                10% {
                    opacity: 0.7;
                }

                85% {
                    opacity: 0.7;
                }

                100% {
                    opacity: 0;
                }
            }

            /* ボスキャラのスライドイン（大きく移動） */
            @keyframes boss-char-slide {
                0% {
                    transform: translate(calc(-50% + var(--start-x) - 100px), calc(-50% + var(--start-y))) scale(var(--scale));
                    opacity: 0;
                    filter: brightness(2) drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
                }

                10% {
                    opacity: 1;
                    filter: brightness(1) drop-shadow(0 0 0px transparent);
                }

                90% {
                    transform: translate(calc(-50% + var(--start-x) + 50px), calc(-50% + var(--start-y))) scale(var(--scale));
                    opacity: 1;
                }

                100% {
                    transform: translate(calc(-50% + var(--start-x) + 100px), calc(-50% + var(--start-y))) scale(var(--scale));
                    opacity: 0;
                }
            }

            /* プレイヤーキャラのスライドイン（下からサッと入る） */
            @keyframes player-char-slide {
                0% {
                    transform: translate(calc(-50% + var(--start-x) - 50px), calc(-50% + var(--start-y) + 30px)) scale(var(--scale));
                    opacity: 0;
                    filter: brightness(2);
                }

                10% {
                    opacity: 1;
                    filter: brightness(1);
                }

                90% {
                    transform: translate(calc(-50% + var(--start-x) + 20px), calc(-50% + var(--start-y) - 10px)) scale(var(--scale));
                    opacity: 1;
                }

                100% {
                    transform: translate(calc(-50% + var(--start-x) + 50px), calc(-50% + var(--start-y) - 30px)) scale(var(--scale));
                    opacity: 0;
                }
            }

            /* ボスのスペルカード帯 */
            @keyframes boss-banner-slide {
                0% {
                    transform: translateX(100%) skewX(-15deg);
                    opacity: 0;
                }

                10% {
                    transform: translateX(0) skewX(-15deg);
                    opacity: 1;
                }

                90% {
                    transform: translateX(0) skewX(-15deg);
                    opacity: 1;
                }

                100% {
                    transform: translateX(100%) skewX(-15deg);
                    opacity: 0;
                }
            }

            /* プレイヤーのスペルカード帯 */
            @keyframes player-banner-slide {
                0% {
                    transform: translateX(-100%);
                    opacity: 0;
                }

                10% {
                    transform: translateX(0);
                    opacity: 1;
                }

                90% {
                    transform: translateX(0);
                    opacity: 1;
                }

                100% {
                    transform: translateX(-100%);
                    opacity: 0;
                }
            }

            `
                }
            </style>

            {/* 背景ディム層（ボスは赤み、プレイヤーは青み） */}
            <div className={`absolute inset-0 anim-dim ${mode === 'boss' ? 'bg-red-950/60' : 'bg-blue-950/60'}`}></div>

            {/* キャラクター画像（imageRenderingでドットをくっきりさせる） */}
            <img src={imageUrl} alt={charName} className={`absolute top-1/2 left-1/2 object-contain ${mode === 'boss'
                ? 'anim-boss-char' : 'anim-player-char'}`} style={{ imageRendering: 'pixelated' }} onError={(e) => {
                    e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"
                    fill = "white" > <text x="10" y="50">Error</text></svg>' }}
                        />

                        {/* スペルカード宣言用の帯とテキスト */ }
    {
        mode === 'boss' ? (
            <div className="absolute top-[20%] right-0 w-[120%] h-32 flex items-center justify-end pr-[20%] md:pr-[25%] anim-boss-banner"
                style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(153, 27, 27, 0.8) 50%, rgba(220, 38, 38, 0.9) 100%)',
                    borderTop: '3px solid #fca5a5', borderBottom: '3px solid #fca5a5',
                    boxShadow: '0 0 30px rgba(220, 38, 38, 0.6)'
                }}>
                <div className="flex flex-col items-end" style={{ transform: 'skewX(15deg)' }}>
                    <span className="text-lg md:text-xl text-red-100 font-serif mb-1 tracking-widest"
                        style={strokeStyle}>{charName}</span>
                    <span
                        className="text-3xl md:text-5xl text-white font-bold font-serif tracking-widest border-b-2 border-white/50 pb-1"
                        style={strokeStyle}>{spellName}</span>
                </div>
            </div>
        ) : (
            <div className="absolute bottom-[10%] left-0 w-[90%] md:w-[70%] h-24 flex items-center justify-start pl-[5%] md:pl-[10%] anim-player-banner"
                style={{
                    background: 'linear-gradient(90deg, rgba(30, 58, 138, 0.9) 0%, rgba(29, 78, 216, 0.8) 70%, transparent 100%)',
                    borderTop: '2px solid #93c5fd', borderBottom: '2px solid #93c5fd',
                    boxShadow: '0 0 20px rgba(29, 78, 216, 0.6)'
                }}>
                <div className="flex flex-col items-start">
                    <span className="text-xs md:text-sm text-blue-100 font-serif mb-1 tracking-wider"
                        style={strokeStyle}>{charName}</span>
                    <span className="text-xl md:text-3xl text-white font-bold font-serif tracking-widest"
                        style={strokeStyle}>{spellName}</span>
                </div>
            </div>
        )
    }
</div >
);
};

// メインアプリケーション
export default function App() {
    const [mode, setMode] = useState('boss');
    const [config, setConfig] = useState(defaultBoss);

    // playCountを更新することで、ReactのKeyが変わりCutinコンポーネントが再マウント・アニメーション再生される
    const [playCount, setPlayCount] = useState(1);

    // モード切替ハンドラ
    const handleModeSwitch = (newMode) => {
        setMode(newMode);
        setConfig(newMode === 'boss' ? defaultBoss : defaultPlayer);
        setPlayCount(prev => prev + 1); // 切り替え時に自動再生
    };

    // 各種設定の変更ハンドラ
    const handleChange = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    // 再生ボタンハンドラ
    const handlePlay = () => {
        setPlayCount(prev => prev + 1);
    };

    return (
        <div className="min-h-screen p-4 md:p-8 font-sans flex flex-col items-center">
            <div
                className="w-full max-w-4xl flex flex-col gap-6 border border-gray-300 rounded-md overflow-hidden bg-gray-100/10 p-6 shadow-sm">

                <div className="text-center mb-2">
                    <h1 className="text-2xl font-bold mb-2">東方風 スペルカードカットインメーカー</h1>
                    <p className="text-sm text-gray-500">キャラの立ち絵とスペルカード名を設定して演出を確認できます</p>
                </div>

                {/* プレビュー画面エリア */}
                <div className="relative w-full aspect-[16/9] bg-slate-900 border border-gray-300/50 rounded-md overflow-hidden shadow-inner mx-auto"
                    style={{ backgroundImage: 'radial-gradient(circle at center, #1e293b 0%, #020617 100%)' }}>
                    {playCount > 0 &&
                        <Cutin key={playCount} mode={mode} config={config} />}
                </div>

                {/* 設定パネル */}
                <div className="mt-2">
                    {/* モード切替タブ */}
                    <div className="flex gap-2 mb-6 border-b border-gray-300/30 pb-4">
                        <button className={`flex-1 py-2 rounded-md flex justify-center items-center gap-2 transition-colors
                    border ${mode === 'player' ? 'bg-blue-600/30 border-blue-400/50'
                                : 'bg-gray-100/10 border-transparent hover:bg-gray-100/20'}`} onClick={() =>
                                    handleModeSwitch('player')}
                        >
                            <User size={18} />
                            自機 (Player)
                        </button>
                        <button className={`flex-1 py-2 rounded-md flex justify-center items-center gap-2 transition-colors
                    border ${mode === 'boss' ? 'bg-red-600/30 border-red-400/50'
                                : 'bg-gray-100/10 border-transparent hover:bg-gray-100/20'}`} onClick={() =>
                                    handleModeSwitch('boss')}
                        >
                            <Skull size={18} />
                            ボス (Boss)
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-gray-500 text-sm mb-1">画像URL (ドット絵対応)</label>
                            <input type="text"
                                className="w-full bg-gray-100/10 border border-gray-300/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:bg-gray-100/20 transition-colors"
                                value={config.imageUrl} onChange={(e) => handleChange('imageUrl', e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-gray-500 text-sm mb-1">キャラクター名</label>
                            <input type="text"
                                className="w-full bg-gray-100/10 border border-gray-300/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:bg-gray-100/20 transition-colors"
                                value={config.charName} onChange={(e) => handleChange('charName', e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-gray-500 text-sm mb-1">スペルカード名</label>
                            <input type="text"
                                className="w-full bg-gray-100/10 border border-gray-300/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:bg-gray-100/20 transition-colors"
                                value={config.spellName} onChange={(e) => handleChange('spellName', e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-gray-500 text-sm mb-1">開始位置 X (画面中央からのオフセット)</label>
                            <input type="number"
                                className="w-full bg-gray-100/10 border border-gray-300/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:bg-gray-100/20 transition-colors"
                                value={config.startX} onChange={(e) => handleChange('startX', Number(e.target.value))}
                            />
                        </div>

                        <div>
                            <label className="block text-gray-500 text-sm mb-1">開始位置 Y (画面中央からのオフセット)</label>
                            <input type="number"
                                className="w-full bg-gray-100/10 border border-gray-300/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:bg-gray-100/20 transition-colors"
                                value={config.startY} onChange={(e) => handleChange('startY', Number(e.target.value))}
                            />
                        </div>

                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-gray-500 text-sm mb-1">画像の拡大率</label>
                            <div className="flex items-center gap-3">
                                <input type="range" min="0.5" max="10" step="0.1" className="flex-1 accent-gray-500"
                                    value={config.scale} onChange={(e) => handleChange('scale', Number(e.target.value))}
                                />
                                <span
                                    className="w-16 text-center text-sm bg-gray-100/10 rounded py-1 border border-gray-300/50">
                                    x {config.scale.toFixed(1)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-center pt-2">
                        <button
                            className="bg-gray-100/10 hover:bg-gray-100/20 border border-gray-300/50 rounded-md py-3 px-8 transition-colors font-bold flex items-center gap-2 shadow-sm"
                            onClick={handlePlay}>
                            <PlayCircle size={24} />
                            カットイン発動
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}