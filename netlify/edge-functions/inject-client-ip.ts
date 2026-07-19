// Next.js の API Route (edge/nodeどちらのランタイムでも) は Netlify の Context を直接受け取れず、
// x-nf-client-connection-ip ヘッダ経由での橋渡しに頼っている。だが一部のルートではこのヘッダが
// 内部ロードバランサー（AWSのEC2アドレス）を指してしまい、本来のクライアントIPが失われる不具合が
// 確認された。そこで Netlify Edge Function として本物の context.ip を先読みし、
// 専用ヘッダに詰め替えてから Next.js へ引き継ぐことで、経路によらず確実にクライアントIPを渡す。

interface NetlifyEdgeContext {
  ip: string;
  next: (request?: Request) => Promise<Response> | Response;
}

export default async (request: Request, context: NetlifyEdgeContext) => {
  const headers = new Headers(request.headers);
  headers.set('x-nf-real-client-ip', context.ip);
  return context.next(new Request(request, { headers }));
};

export const config = {
  path: '/api/*',
};
