# 🎛️ Botonera Virtual Multi-Dispositivo (PC + Teléfonos)

Sistema de botonera y soundboard en tiempo real que permite enlazar cualquier teléfono móvil conectado a la misma red Wi-Fi con la computadora base. Al pulsar un botón en el teléfono, el sonido se reproduce inmediatamente a través de los parlantes de la PC.

---

## 🚀 Inicio Rápido

### Opción 1 (Doble Clic en Windows)
Haz doble clic sobre el archivo:
```text
iniciar.bat
```
Esto abrirá el servidor y tu navegador automáticamente en la interfaz de la PC.

### Opción 2 (Por Terminal)
```bash
npm start
```
o
```bash
node server.js
```

---

## 📱 ¿Cómo Conectar los Teléfonos?

1. Asegúrate de que la PC y los teléfonos estén conectados a la **misma red Wi-Fi**.
2. Abre en la PC: `http://localhost:3000/pc` (se abre sola al ejecutar `iniciar.bat`).
3. En la pantalla de la PC verás un **Código QR gigante**:
   - Escanéalo directamente con la cámara del celular.
   - O entra manualmente desde el navegador del móvil a:
     `http://192.168.0.110:3000/remote` *(o la IP que indique el panel)*.
4. En el celular:
   - Ingresa tu nombre o apodo (ej: "Juan", "Mica", "Equipo A").
   - ¡Toca cualquier botón y sonará al instante en los parlantes de la PC!

---

## ✨ Características Principales

- **Baja Latencia con WebSockets (Socket.io):** Respuesta táctil inmediata al presionar en el teléfono.
- **Feedback Háptico en Móviles:** Vibración y efecto visual táctil al pulsar cada botón.
- **10 Sonidos Preinstalados:**
  - 🍻 Chinchín / Brindis
  - 📢 Airhorn de Fiesta
  - ❌ Buzzer de Error
  - 🏆 Victoria / Fanfarria
  - 🎺 Trompeta Triste (Fail wah-wah)
  - 🛎️ Campanilla / Ding
  - 👏 Aplausos
  - 🪙 Moneda Retro 8-bit
  - 🥊 Golpe Punch cómico
  - 🥁 Redoble de tambores (Ba-dum-tss)
- **Sube tus Propios Sonidos:**
  - Botón **"➕ Nuevo Sonido"** en la PC para subir cualquier archivo MP3, WAV u OGG, asignarle un nombre, color y emoji. Se sincroniza al instante en todos los celulares conectados sin recargar la página.
- **Modo Libre vs Modo Concurso / Buzzer (Trivia):**
  - **Modo Libre:** Todos pueden tocar sonidos a la vez como un soundboard interactivo.
  - **Modo Quiz / Buzzer:** Cuando alguien pulsa primero, el sistema bloquea a los demás teléfonos y muestra en la pantalla de la PC quién fue el más rápido. El moderador en la PC puede pulsar *"Nueva Ronda"* para desbloquearlos.
- **Control Maestro en PC:**
  - Deslizador de volumen master.
  - Botón de pánico **"🛑 Parar Audios"** para cortar cualquier reproducción en curso.
  - Registro de actividad en vivo (quién presionó qué botón y a qué hora).
  - Lista de teléfonos conectados en tiempo real.
