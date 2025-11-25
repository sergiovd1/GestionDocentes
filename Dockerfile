FROM node:18-alpine
WORKDIR /app

# instalar backend
COPY backend/package*.json ./
RUN npm install --production

# copiar backend
COPY backend ./

# copiar frontend
COPY frontend ./frontend

EXPOSE 3000
CMD ["node", "server.js"]