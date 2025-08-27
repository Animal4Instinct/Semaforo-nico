// arduino.mjs (actualizado - manejo MANT_BLINK)
import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const SERIAL_PATH = process.env.SERIAL_PORT || "COM2";
const BAUD = parseInt(process.env.SERIAL_BAUD || "9600", 10);

class Arduino {
  constructor(path = SERIAL_PATH, baudRate = BAUD) {
    this.path = path;
    this.baudRate = baudRate;
    this.state = {
      rojo: false,
      amarillo: false,
      verde: false,
      mantenimiento: false,
      boton: false,
      ledState: "apagado",
      estado: "normal"
    };
    this.onMessage = null;
    this.onState = null;

    this._openPort();
    this._startPeriodicEmit(500);
  }

  _openPort() {
    try {
      this.port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });
      this.port.open((err) => {
        if (err) {
          console.error(`❌ Error al abrir el puerto serial (${this.path}): ${err.message}`);
          return;
        }
        console.log(`✅ Conexión serial con Arduino abierta en ${this.path} @ ${this.baudRate}`);
      });

      this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

      this.parser.on("data", (data) => {
        const msg = String(data).trim();
        if (!msg) return;
        console.log("Arduino dice:", msg);
        if (this.onMessage) this.onMessage(msg);
        this._parseLine(msg);
      });

      this.port.on("error", (err) => {
        console.error(`❌ Error en puerto serial: ${err}`);
      });
    } catch (e) {
      console.error("❌ Excepción inicializando puerto serial:", e);
    }
  }

  _parseLine(raw) {
    const L = String(raw).trim().toUpperCase();

    // 0) MANT_BLINK: mensajes de visual (no tocan la bandera mantenimiento)
    if (L.includes("MANT_BLINK") || L.includes("MANT BLINK") || L.includes("MANTENIMIENTO BLINK")) {
      if (/ON/.test(L)) {
        this.state.rojo = true;
        this.state.amarillo = true;
        this.state.verde = true;
      } else {
        this.state.rojo = false;
        this.state.amarillo = false;
        this.state.verde = false;
      }
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    // 1) MANTENIMIENTO explícito: cambia la bandera y no hace blink toggles
    if (L.includes("MANTENIMIENTO") || L.includes("MODO MANTENIMIENTO")) {
      if (/ON|SI|ACTIVADO|ACTIVAR/.test(L) || L.includes("MODO MANTENIMIENTO")) {
        this.state.mantenimiento = true;
        this.state.estado = "mantenimiento";
        // Opcional: mantener colores tal como estaban; no forzamos here.
      } else if (/OFF|NO|DESACTIVADO|DESACTIVAR/.test(L)) {
        this.state.mantenimiento = false;
        this.state.estado = "normal";
        // apagar visual al salir (opcional)
        this.state.rojo = false;
        this.state.amarillo = false;
        this.state.verde = false;
      }
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    // 2) BOTON: PULSADO / LIBRE
    if (L.includes("BOTON") || L.includes("PULSADO") || L.includes("PRESSED") || L.includes("LIBRE") || L.includes("RELEASED")) {
      if (/PULSADO|PRESSED|1|ON/.test(L)) this.state.boton = true;
      else if (/LIBRE|RELEASED|0|OFF|NO/.test(L)) this.state.boton = false;

      if (this.onState) this.onState({ ...this.state });
      return;
    }

    // 3) Colors: si llega "ROJO ON" -> rojo true, otros false.
    if (L.includes("ROJO")) {
      if (/ON|ENCENDIDO|HIGH|1/.test(L)) {
        this.state.rojo = true;
        this.state.verde = false;
        this.state.amarillo = false;
        this.state.estado = this.state.mantenimiento ? "mantenimiento" : "normal";
      } else if (/OFF|APAGADO|0|LOW/.test(L)) {
        this.state.rojo = false;
      }
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    if (L.includes("VERDE")) {
      if (/ON|ENCENDIDO|HIGH|1/.test(L)) {
        this.state.verde = true;
        this.state.rojo = false;
        this.state.amarillo = false;
        this.state.estado = this.state.mantenimiento ? "mantenimiento" : "normal";
      } else if (/OFF|APAGADO|0|LOW/.test(L)) {
        this.state.verde = false;
      }
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    if (L.includes("AMARILLO")) {
      if (/ON|ENCENDIDO|HIGH|1/.test(L)) {
        this.state.amarillo = true;
        this.state.rojo = false;
        this.state.verde = false;
        this.state.estado = this.state.mantenimiento ? "mantenimiento" : "normal";
      } else if (/OFF|APAGADO|0|LOW/.test(L)) {
        this.state.amarillo = false;
      }
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    // 4) ALL OFF / apagar todo
    if (/ALL OFF|ALL_OFF|APAGADO|ALLOFF/.test(L)) {
      this.state.rojo = false;
      this.state.verde = false;
      this.state.amarillo = false;
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    // 5) legacy ledState (si usas)
    if (L.includes("LED ENCENDIDO") || L.includes("LED ON")) {
      this.state.ledState = "encendido";
      if (this.onState) this.onState({ ...this.state });
      return;
    }
    if (L.includes("LED APAGADO") || L.includes("LED OFF")) {
      this.state.ledState = "apagado";
      if (this.onState) this.onState({ ...this.state });
      return;
    }

    // Si no matcheó nada importante, emitimos estado
    if (this.onState) this.onState({ ...this.state });
  }

  write(txt) {
    if (!this.port || !this.port.writable || !this.port.isOpen) {
      console.warn("⚠️ Puerto serial no disponible para escribir");
      return;
    }
    this.port.write(String(txt) + "\n", (err) => {
      if (err) console.error("Error escribiendo al serial:", err);
    });
  }

  // Comandos convenientes
  turnOn() { this.write("ON"); }
  turnOff() { this.write("OFF"); }
  toggleMode() { this.write("TOGGLE_MODE"); }
  rojo() { this.write("ROJO"); }
  amarillo() { this.write("AMARILLO"); }
  verde() { this.write("VERDE"); }
  ciclo() { this.write("CICLO"); }

  getState() { return { ...this.state }; }
  getLegacyLedState() { return this.state.ledState; }

  onMessageCallback(cb) { this.onMessage = cb; }
  onStateCallback(cb) { this.onState = cb; }

  _startPeriodicEmit(ms = 500) {
    this._periodicTimer = setInterval(() => {
      if (this.onState) this.onState({ ...this.state });
    }, ms);
  }

  close() {
    if (this._periodicTimer) clearInterval(this._periodicTimer);
    if (this.port && this.port.isOpen) this.port.close();
  }
}

export const arduino = new Arduino();
