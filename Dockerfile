# Serves the same files as tools.whosane.dev, with no Cloudflare involved.
# docker build -t tools . && docker run --rm -p 8080:80 tools
FROM nginx:1.31.6-alpine
COPY . /usr/share/nginx/html/
