const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const multer = require('multer');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const BUTTONS_FILE = path.join(__dirname, 'buttons.json');
const SOUNDS_DIR = path.join(__dirname, 'public', 'sounds');

// Asegurar que existe el directorio de sonidos
if (!fs.existsSync(SOUNDS_DIR)) {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
}

// Configuración de Multer para subir sonidos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SOUNDS_DIR);
  },
  filename: (req, file, cb) => {
    const cleanName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, cleanName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // Hasta 25MB
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cargar botones
function loadButtons() {
  try {
    if (fs.existsSync(BUTTONS_FILE)) {
      const data = fs.readFileSync(BUTTONS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error al leer buttons.json:', err);
  }
  return [];
}

// Guardar botones
function saveButtons(buttons) {
  try {
    fs.writeFileSync(BUTTONS_FILE, JSON.stringify(buttons, null, 2), 'utf8');
  } catch (err) {
    console.error('Error al guardar buttons.json:', err);
  }
}

let buttons = loadButtons();

// Obtener IPs locales de la PC
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Filtrar IPv4 y no loopback (127.0.0.1) ni APIPA (169.254.x.x) de ser posible
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          interface: name,
          ip: iface.address,
          isApipa: iface.address.startsWith('169.254.')
        });
      }
    }
  }
  // Priorizar interfaces Wi-Fi o que no sean APIPA
  ips.sort((a, b) => {
    if (a.isApipa && !b.isApipa) return 1;
    if (!a.isApipa && b.isApipa) return -1;
    if (a.interface.toLowerCase().includes('wi-fi') || a.interface.toLowerCase().includes('wlan')) return -1;
    return 0;
  });
  return ips;
}

// Estado del juego / Buzzer
const buzzerState = {
  mode: 'free', // 'free' o 'quiz' (bloqueo al primero)
  isLocked: false,
  winner: null,
  lockTimestamp: null
};

// Mapa de dispositivos conectados
const connectedDevices = new Map();

// Rutas principales
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pc.html'));
});

app.get('/pc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pc.html'));
});

app.get('/remote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'remote.html'));
});

app.get('/m', (req, res) => {
  res.redirect('/remote');
});

// APIs
app.get('/api/server-info', async (req, res) => {
  const ips = getLocalIps();
  const primaryIp = ips[0] ? ips[0].ip : 'localhost';
  
  // Detectar el host real de la petición actual (ej: botonera.up.railway.app)
  const reqHost = req.query.host || req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const isPrivateHost = reqHost.includes('localhost') || 
                        reqHost.includes('127.0.0.1') || 
                        reqHost.startsWith('192.168.') || 
                        reqHost.startsWith('10.') || 
                        reqHost.startsWith('172.');

  let remoteUrl = `http://${primaryIp}:${PORT}/remote`;

  // PRIORIDAD 1: Si la petición viene por un dominio público real (personalizado o de Railway), usarlo
  if (reqHost && !isPrivateHost) {
    remoteUrl = `${proto}://${reqHost}/remote`;
  } else if (process.env.PUBLIC_URL) {
    remoteUrl = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/remote`;
  } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    remoteUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/remote`;
  }
  
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(remoteUrl, {
      margin: 2,
      scale: 8,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Error generando QR:', err);
  }

  res.json({
    port: PORT,
    ips,
    primaryIp,
    remoteUrl,
    qrDataUrl,
    buzzerState,
    connectedCount: connectedDevices.size
  });
});

// Endpoint para generar QR dinámicamente si el cliente tiene un dominio personalizado
app.get('/api/qr', async (req, res) => {
  const text = req.query.url || req.query.text || '';
  if (!text) return res.status(400).json({ error: 'Falta parámetro url' });
  try {
    const qrDataUrl = await QRCode.toDataURL(text, {
      margin: 2,
      scale: 8,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.json({ qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Error generando QR' });
  }
});

app.get('/api/buttons', (req, res) => {
  res.json(buttons);
});

// Subida de nuevo sonido + botón
app.post('/api/buttons', upload.single('audio'), (req, res) => {
  try {
    const { name, color, icon } = req.body;
    let soundFilename = '';

    if (req.file) {
      soundFilename = req.file.filename;
    } else if (req.body.sound) {
      soundFilename = req.body.sound;
    } else {
      return res.status(400).json({ error: 'Debes proporcionar un archivo de audio' });
    }

    const newBtn = {
      id: 'btn-' + Date.now(),
      name: name || path.parse(req.file ? req.file.originalname : soundFilename).name,
      sound: soundFilename,
      color: color || '#3b82f6',
      icon: icon || '🎵',
      volume: 1.0
    };

    buttons.push(newBtn);
    saveButtons(buttons);

    // Notificar a todos los clientes (PC y Móviles)
    io.emit('buttons_updated', buttons);

    res.json({ success: true, button: newBtn });
  } catch (err) {
    console.error('Error al subir sonido:', err);
    res.status(500).json({ error: 'Error procesando el archivo' });
  }
});

// Eliminar un botón de forma definitiva
app.delete('/api/buttons/:id', (req, res) => {
  const { id } = req.params;
  const btnToDelete = buttons.find(b => b.id === id);
  
  if (btnToDelete) {
    buttons = buttons.filter(b => b.id !== id);
    saveButtons(buttons);

    // Si el archivo físico de sonido existe y ningún otro botón lo usa, borrarlo del disco
    if (btnToDelete.sound) {
      const stillUsed = buttons.some(b => b.sound === btnToDelete.sound);
      if (!stillUsed) {
        const filePath = path.join(SOUNDS_DIR, btnToDelete.sound);
        if (fs.existsSync(filePath)) {
          fs.unlink(filePath, (err) => {
            if (err) console.error('Error al eliminar archivo físico:', err);
          });
        }
      }
    }

    // Notificar inmediatamente a la PC y a todos los teléfonos conectados
    io.emit('buttons_updated', buttons);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Botón no encontrado' });
});

// Socket.io Comunicación en Tiempo Real
io.on('connection', (socket) => {
  let deviceInfo = {
    id: socket.id,
    type: 'unknown',
    name: 'Dispositivo',
    joinedAt: new Date().toLocaleTimeString()
  };

  // Identificación del dispositivo
  socket.on('register_device', (data) => {
    deviceInfo.type = data.type || 'remote';
    deviceInfo.name = data.name || (deviceInfo.type === 'pc' ? 'PC Base' : `Teléfono ${connectedDevices.size + 1}`);
    connectedDevices.set(socket.id, deviceInfo);

    // Notificar lista de dispositivos a la PC
    io.emit('devices_updated', Array.from(connectedDevices.values()));
    socket.emit('buzzer_state', buzzerState);
  });

  // Evento: Alguien pulsó un botón en su teléfono
  socket.on('press_button', (data) => {
    const { buttonId } = data;
    const button = buttons.find(b => b.id === buttonId);
    if (!button) return;

    const deviceName = data.deviceName || deviceInfo.name || 'Teléfono';

    // Si está en modo Quiz y ya está bloqueado
    if (buzzerState.mode === 'quiz' && buzzerState.isLocked) {
      socket.emit('buzzer_blocked', {
        winner: buzzerState.winner
      });
      return;
    }

    // Si está en modo Quiz y es el primero
    if (buzzerState.mode === 'quiz' && !buzzerState.isLocked) {
      buzzerState.isLocked = true;
      buzzerState.winner = {
        name: deviceName,
        buttonName: button.name,
        time: new Date().toLocaleTimeString()
      };
      buzzerState.lockTimestamp = Date.now();
      
      io.emit('buzzer_locked', buzzerState.winner);
    }

    // Notificar a la PC para que reproduzca el sonido
    io.emit('play_sound_on_pc', {
      button,
      device: {
        id: socket.id,
        name: deviceName
      },
      timestamp: new Date().toLocaleTimeString()
    });

    // Feedback al emisor
    socket.emit('button_pressed_ack', {
      buttonId,
      status: 'played'
    });
  });

  // Control desde la PC: Reiniciar Quiz/Buzzer
  socket.on('reset_buzzer', () => {
    buzzerState.isLocked = false;
    buzzerState.winner = null;
    buzzerState.lockTimestamp = null;
    io.emit('buzzer_reset');
  });

  // Control desde la PC: Cambiar modo ('free' o 'quiz')
  socket.on('set_buzzer_mode', (mode) => {
    buzzerState.mode = mode;
    buzzerState.isLocked = false;
    buzzerState.winner = null;
    io.emit('buzzer_mode_changed', buzzerState);
  });

  // Parar todos los sonidos en la PC
  socket.on('stop_all_sounds', () => {
    io.emit('stop_sounds');
  });

  socket.on('disconnect', () => {
    connectedDevices.delete(socket.id);
    io.emit('devices_updated', Array.from(connectedDevices.values()));
  });
});

// Iniciar servidor
server.listen(PORT, '0.0.0.0', async () => {
  const ips = getLocalIps();
  const primaryIp = ips[0] ? ips[0].ip : 'localhost';
  const remoteUrl = `http://${primaryIp}:${PORT}/remote`;
  const pcUrl = `http://localhost:${PORT}/pc`;

  console.log('====================================================');
  console.log('🎉 BOTONERA INTERACTIVA INICIADA CON ÉXITO');
  console.log('====================================================');
  console.log(`🖥️  Panel de la PC (Reproductor): ${pcUrl}`);
  console.log(`📱 Enlace para los teléfonos:    ${remoteUrl}`);
  console.log('----------------------------------------------------');
  console.log('Escanea este código QR con la cámara de tu teléfono:');
  
  try {
    const qrTerminal = await QRCode.toString(remoteUrl, { type: 'terminal', small: true });
    console.log(qrTerminal);
  } catch (e) {}

  console.log('====================================================');
  console.log('Esperando conexiones...');
});
