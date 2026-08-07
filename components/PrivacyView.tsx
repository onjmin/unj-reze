"use client";

export default function PrivacyView() {
	return (
		<div className="max-w-2xl mx-auto px-4 py-5 space-y-5 text-gray-200 text-sm font-sans leading-relaxed">
			<div className="border-b border-gray-800 pb-3">
				<h1 className="text-xl font-bold text-white tracking-tight">
					プライバシーポリシー
				</h1>
				<p className="text-xs text-gray-500 mt-1">更新日: 2026年7月20日</p>
			</div>

			<div className="space-y-4">
				<section className="space-y-1">
					<h2 className="font-bold text-white border-b border-gray-800/80 pb-1">
						1. 保存・取得するデータ
					</h2>
					<ul className="list-disc list-inside space-y-1 text-gray-300 pl-1">
						<li>ブラウザ識別用セッションID</li>
						<li>投稿されたデータ（本文・画像・ゲームデータ等）</li>
						<li>表示モードや鍵設定などのアプリ設定</li>
						<li>アクセスログ（IPアドレス・日時等）</li>
					</ul>
				</section>

				<section className="space-y-1">
					<h2 className="font-bold text-white border-b border-gray-800/80 pb-1">
						2. データの利用目的
					</h2>
					<p className="text-gray-300">
						投稿の表示、設定保持、スパム・荒らし対策、サービス改善のためにのみ使用します。法令に基づく場合を除き、第三者に個人情報を手交・販売することはありません。
					</p>
				</section>

				<section className="space-y-1">
					<h2 className="font-bold text-white border-b border-gray-800/80 pb-1">
						3. プライバシー設定
					</h2>
					<p className="text-gray-300">
						設定画面から「鍵アカウント（フォロワー限定公開）」や「検索除外」などの設定変更が可能です。
					</p>
				</section>

				<section className="space-y-1">
					<h2 className="font-bold text-white border-b border-gray-800/80 pb-1">
						4. EU/EEA地域からのアクセス制限
					</h2>
					<p className="text-gray-300">
						EU等の法規制（GDPR等）に伴い、当サービスはEUおよびEEA地域からのアクセスを遮断しており、同地域からのデータ収集・利用は行なっておりません。
					</p>
				</section>
			</div>
		</div>
	);
}
