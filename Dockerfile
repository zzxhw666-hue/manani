FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./
COPY game.js ./lib/game.js
COPY index.html ./public/index.html
COPY style.css ./public/css/style.css
COPY data.js ./public/js/data.js
COPY api.js ./public/js/api.js
COPY ui.js ./public/js/ui.js
COPY main.js ./public/js/main.js

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173 \
    DATA_DIR=/data

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
