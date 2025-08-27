// socket.mjs
import { arduino } from "./arduino.mjs";


export function registerSocketHandlers(io) {
console.log("Registrando handlers socket.io");


// reenviar mensajes crudos y estado completo cuando el arduino los emite
arduino.onMessageCallback((msg) => {
io.emit("arduino-message", msg);
});


arduino.onStateCallback((state) => {
io.emit("semaforo-state", state);
});


io.on("connection", (socket) => {
console.log("🔌 Cliente conectado por socket");

socket.on('semaforo-cmd', (cmd) => {
  // cmd = 'ROJO'|'AMARILLO'|'VERDE'|'CICLO'|'OFF'
  const c = String(cmd).trim().toUpperCase();
  console.log('Comando semaforo desde cliente:', c);

  if (c === 'ROJO') arduino.rojo?.() || arduino.write?.('ROJO');
  else if (c === 'AMARILLO') arduino.amarillo?.() || arduino.write?.('AMARILLO');
  else if (c === 'VERDE') arduino.verde?.() || arduino.write?.('VERDE');
  else if (c === 'CICLO') arduino.ciclo?.() || arduino.write?.('CICLO');
  else if (c === 'OFF' || c === 'APAGAR') arduino.apagar?.() || arduino.write?.('OFF');
  else {
    // fallback: escribir comando crudo
    arduino.write ? arduino.write(c) : console.warn('arduino.write no disponible');
  }
});

// enviar estado inicial al cliente que se conecta
socket.emit("semaforo-state", arduino.getState());


// reenviar comandos de UI al Arduino
socket.on("led-on", () => {
arduino.turnOn();
});
socket.on("led-off", () => {
arduino.turnOff();
});
socket.on("toggle-mode", () => {
arduino.toggleMode();
});


socket.on("disconnect", () => console.log("❌ Cliente desconectado"));
});
}