# Koyeb はコンテナでデプロイするので、このサービス単体でビルドできるようにしておく。
# ビルドコンテキストは services/realtime（リポジトリルートではない）。
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# lock が無くても動くように npm install にフォールバックする
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.mjs ./

# root で動かさない
USER node

EXPOSE 8000

# Koyeb のヘルスチェックは /healthz を見る（koyeb.yaml 参照）。
# コンテナ単体で docker run したときにも落ちたことが分かるように HEALTHCHECK を入れておく。
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
