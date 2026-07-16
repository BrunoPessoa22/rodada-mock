FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY proposal/index.html /usr/share/nginx/html/proposal/index.html
COPY proposal/league-proposal-v2.md /usr/share/nginx/html/proposal/league-proposal-v2.md
EXPOSE 80
