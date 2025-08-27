// server.mjs
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socket.mjs";
import { arduino } from "./arduino.mjs";


const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;


// crear servidor HTTP y socket.io
const server = http.createServer(app);
const io = new Server(server);


// registrar handlers de socket (usa el arduino interno)
registerSocketHandlers(io);

// por defecto se asume que tu carpeta del frontend está en ../frontend
app.use(express.static(process.env.FRONTEND_PATH || "../frontend"));


// Endpoints HTTP de ejemplo que interactúan con la API del módulo Arduino
app.get("/led-on", (req, res) => {
arduino.turnOn();
// devolver estado actual (objeto)
res.json({ message: "LED encendido desde HTTP", state: arduino.getState() });
});


app.get("/led-off", (req, res) => {
arduino.turnOff();
res.json({ message: "LED apagado desde HTTP", state: arduino.getState() });
});


app.get("/state", (req, res) => {
res.json({ state: arduino.getState() });
});


server.listen(port, () => {
console.log(`Servidor escuchando en http://localhost:${port}`);
});