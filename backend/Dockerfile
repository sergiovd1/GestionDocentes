FROM node:18-alpine

# Creo directorio de trabajo
WORKDIR /app

COPY backend/package*.json ./backend/

# Entro a backend e instalo
WORKDIR /app/backend
RUN npm install --production

# Vuelvo a la raíz del contenedor
WORKDIR /app

# Copio TODO el proyecto
COPY . .

EXPOSE 3000

# Comando de arranque: entra a backend y ejecuta server.js
CMD ["node", "backend/server.js"]