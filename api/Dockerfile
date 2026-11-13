FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

ENV NODE_ENV=production PORT=8080 DOSSIER_DONNEES=/data
WORKDIR /app
COPY serveur.js package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/sante || exit 1
CMD ["node", "serveur.js"]
