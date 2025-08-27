// semaforo_uno_nonblocking_with_button.ino (actualizado)
// Pines
const int ledRojo = 8;
const int ledAmarillo = 9;
const int ledVerde = 10;
const int botonPin = 2;

// Modos
#define MODE_AUTO 0
#define MODE_MANUAL 1
#define MODE_CYCLE 2

int modo = MODE_AUTO;
int prevModo = MODE_AUTO;

// Secuencia automática (duraciones en ms)
const unsigned long autoDuraciones[] = {5000, 3000, 1000}; // rojo, verde, amarillo
const unsigned long cycleDuraciones[] = {3000, 3000, 1500}; // para comando CICLO

// Estado de la secuencia
int etapa = 0;            // 0 = rojo, 1 = verde, 2 = amarillo
int etapaAnterior = -1;
unsigned long etapaInicio = 0;

// Mantenimiento (parpadeo)
bool mantenimiento = false;
unsigned long lastBlink = 0;
const unsigned long blinkInterval = 500;
bool blinkState = false;

// Botón debounce
int lastBotonLectura = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;
int botonEstadoEstable = HIGH;

// Serial read buffer (usamos String para simplicidad)
String lineaSerial = "";

void setup() {
  pinMode(ledRojo, OUTPUT);
  pinMode(ledAmarillo, OUTPUT);
  pinMode(ledVerde, OUTPUT);
  pinMode(botonPin, INPUT_PULLUP);

  Serial.begin(9600);
  apagarTodos();
  etapa = 0;
  etapaInicio = millis();

  Serial.println("SEMAFORO BOOT");
  activarEtapaAutomatico(etapa);
}

// ------------------- loop principal -------------------
void loop() {
  unsigned long now = millis();

  // 1) Leer serial (si hay)
  if (Serial.available()) {
    lineaSerial = Serial.readStringUntil('\n');
    lineaSerial.trim();
    lineaSerial.toUpperCase();
    procesarComandoSerial(lineaSerial);
    lineaSerial = "";
  }

  // 2) Leer botón con debounce (detecta flanco de pulsado)
  int lectura = digitalRead(botonPin);
  if (lectura != lastBotonLectura) {
    lastDebounceTime = now;
  }
  if ((now - lastDebounceTime) > debounceDelay) {
    if (lectura != botonEstadoEstable) {
      botonEstadoEstable = lectura;
      if (botonEstadoEstable == LOW) {
        // pulsado (flanco)
        Serial.println("BOTON PULSADO");
        toggleMantenimiento();
      } else {
        // liberado
        Serial.println("BOTON LIBRE");
      }
    }
  }
  lastBotonLectura = lectura;

  // 3) Si estamos en mantenimiento: parpadeo visual y nada más
  if (mantenimiento) {
    if (now - lastBlink >= blinkInterval) {
      lastBlink = now;
      blinkState = !blinkState;
      if (blinkState) {
        // prender las tres visualmente
        digitalWrite(ledRojo, HIGH);
        digitalWrite(ledAmarillo, HIGH);
        digitalWrite(ledVerde, HIGH);
        // mensaje DOMINANTE: blink ON (no cambia bandera mantenimiento)
        Serial.println("MANT_BLINK ON");
      } else {
        // apagar las tres
        digitalWrite(ledRojo, LOW);
        digitalWrite(ledAmarillo, LOW);
        digitalWrite(ledVerde, LOW);
        Serial.println("MANT_BLINK OFF");
      }
    }
    // mientras mantenimiento está activo evitamos cualquier secuencia
    return;
  }

  // 4) Si estamos en modo CICLO (comando CICLO): avanzar etapas no bloqueante
  if (modo == MODE_CYCLE) {
    unsigned long dur = cycleDuraciones[etapa];
    if (now - etapaInicio >= dur) {
      etapa = (etapa + 1) % 3;
      etapaInicio = now;
      activarEtapaCiclo(etapa);
      // si llegamos otra vez a etapa 0 => ciclo completo (termina)
      if (etapa == 0) {
        Serial.println("CICLO COMPLETE");
        modo = MODE_AUTO;
        etapa = 0;
        etapaInicio = now;
        activarEtapaAutomatico(etapa);
      }
    }
    return;
  }

  // 5) Modo automático (no bloqueante)
  if (modo == MODE_AUTO) {
    unsigned long durAuto = autoDuraciones[etapa];
    if (now - etapaInicio >= durAuto) {
      etapa = (etapa + 1) % 3;
      etapaInicio = now;
      activarEtapaAutomatico(etapa);
    }
  }
}

// ------------------- funciones de utilidad -------------------

void procesarComandoSerial(String cmd) {
  if (cmd.length() == 0) return;
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "ROJO") {
    mantenimientoOffIfNeeded();
    modo = MODE_MANUAL;
    setRojo(true);
  } else if (cmd == "AMARILLO") {
    mantenimientoOffIfNeeded();
    modo = MODE_MANUAL;
    setAmarillo(true);
  } else if (cmd == "VERDE") {
    mantenimientoOffIfNeeded();
    modo = MODE_MANUAL;
    setVerde(true);
  } else if (cmd == "OFF" || cmd == "APAGAR" || cmd == "ALL OFF") {
    mantenimientoOffIfNeeded();
    modo = MODE_MANUAL;
    apagarTodos();
    Serial.println("ALL OFF");
  } else if (cmd == "CICLO") {
    mantenimientoOffIfNeeded();
    modo = MODE_CYCLE;
    etapa = 0;
    etapaInicio = millis();
    activarEtapaCiclo(etapa);
    Serial.println("CICLO START");
  } else if (cmd == "TOGGLE_MODE" || cmd == "TOGGLE_MAINT" || cmd == "MANTENIMIENTO" || cmd == "TOGGLE_MAINTENANCE") {
    // comando remoto para alternar mantenimiento
    toggleMantenimiento();
  } else {
    Serial.print("RCV: ");
    Serial.println(cmd);
  }
}

void mantenimientoOffIfNeeded() {
  if (mantenimiento) {
    mantenimiento = false;
    blinkState = false;
    apagarTodos();
    Serial.println("MANTENIMIENTO OFF");
    modo = prevModo;
    etapaInicio = millis();
  }
}

void toggleMantenimiento() {
  mantenimiento = !mantenimiento;
  if (mantenimiento) {
    prevModo = modo;
    modo = MODE_MANUAL;
    blinkState = false;
    lastBlink = millis();
    // enviamos sólo un mensaje indicando que entramos en modo mantenimiento
    Serial.println("MANTENIMIENTO ON");
  } else {
    // salir de mantenimiento y restaurar modo anterior
    Serial.println("MANTENIMIENTO OFF");
    modo = prevModo;
    etapaInicio = millis();
    apagarTodos();
    if (modo == MODE_AUTO) activarEtapaAutomatico(etapa);
    else if (modo == MODE_CYCLE) activarEtapaCiclo(etapa);
  }
}

void activarEtapaAutomatico(int e) {
  if (e == etapaAnterior && modo == MODE_AUTO) return;
  etapaAnterior = e;
  if (e == 0) setRojo(true);
  else if (e == 1) setVerde(true);
  else if (e == 2) setAmarillo(true);
}

void activarEtapaCiclo(int e) {
  if (e == etapaAnterior) return;
  etapaAnterior = e;
  if (e == 0) setRojo(true);
  else if (e == 1) setVerde(true);
  else if (e == 2) setAmarillo(true);
}

void setRojo(bool report) {
  digitalWrite(ledRojo, HIGH);
  digitalWrite(ledAmarillo, LOW);
  digitalWrite(ledVerde, LOW);
  if (report) Serial.println("ROJO ON");
}
void setAmarillo(bool report) {
  digitalWrite(ledRojo, LOW);
  digitalWrite(ledAmarillo, HIGH);
  digitalWrite(ledVerde, LOW);
  if (report) Serial.println("AMARILLO ON");
}
void setVerde(bool report) {
  digitalWrite(ledRojo, LOW);
  digitalWrite(ledAmarillo, LOW);
  digitalWrite(ledVerde, HIGH);
  if (report) Serial.println("VERDE ON");
}

void apagarTodos() {
  digitalWrite(ledRojo, LOW);
  digitalWrite(ledAmarillo, LOW);
  digitalWrite(ledVerde, LOW);
}
