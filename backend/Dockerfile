FROM node:18-alpine

# Establezco el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copio los archivos de definición de dependencias
COPY package*.json ./

# Instalo las dependencias
RUN npm install --production

# Copio el resto del código de la aplicación
COPY . .

# El puerto que usa la app
EXPOSE 3000

# Comando para arrancar la aplicación
CMD ["node", "server.js"]