FROM node:18-alpine

# Establecemos el directorio raíz de la aplicación en el contenedor
WORKDIR /app

# 1. Copiamos el package.json a una carpeta 'backend' explícita
# Esto crea /app/backend/package.json
COPY backend/package*.json ./backend/

# 2. Nos movemos a esa carpeta para instalar dependencias
WORKDIR /app/backend
RUN npm install --production

# 3. Copiamos el código del backend DENTRO de la carpeta backend
COPY backend .

# 4. Subimos un nivel para copiar el frontend
WORKDIR /app
COPY frontend ./frontend

# 5. IMPORTANTE: Volvemos a entrar a backend para ejecutar el servidor
# Así 'server.js' estará en /app/backend/server.js
# y el '../frontend' apuntará correctamente a /app/frontend
WORKDIR /app/backend

EXPOSE 3000
CMD ["node", "server.js"]