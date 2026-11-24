# ============================================================
# Dockerfile - RCUMC Normalização Acadêmica
# ------------------------------------------------------------
# Imagem com Node.js + LibreOffice para conversão fiel
# do modelo DOCX oficial para PDF.
# ============================================================

FROM node:20-bookworm-slim

# Instala LibreOffice (headless) e fontes necessárias
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-common \
    fonts-liberation \
    fonts-dejavu-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

# Diretório da aplicação
WORKDIR /app

# Dependências
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Código e modelos
COPY . .

# Build Next.js
RUN npm run build

# Ambiente
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Inicia o servidor
CMD ["npm", "run", "start"]
