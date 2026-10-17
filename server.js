const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const multer = require('multer');
const AdmZip = require('adm-zip');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Carpeta fija de uploads en el repositorio para que los sonidos no se pierdan
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SOUNDS_DIR = UPLOADS_DIR;
const BUTTONS_FILE = path.join(__dirname, 'buttons.json');

// Asegurar que existe la carpeta uploads
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuración de Multer para guardar en uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
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
// Servir audios desde uploads/ y desde public/sounds/
app.use('/sounds', express.static(UPLOADS_DIR));
app.use('/sounds', express.static(path.join(__dirname, 'public', 'sounds')));
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
function saveButtons(buttonsData) {
  try {
    fs.writeFileSync(BUTTONS_FILE, JSON.stringify(buttonsData, null, 2), 'utf8');
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

// Descargar copia de seguridad completa (ZIP con sonidos y configuración)
app.get('/api/backup/export', (req, res) => {
  try {
    const zip = new AdmZip();

    // Agregar buttons.json actual
    if (fs.existsSync(BUTTONS_FILE)) {
      zip.addLocalFile(BUTTONS_FILE);
    } else if (fs.existsSync(INITIAL_BUTTONS_FILE)) {
      zip.addLocalFile(INITIAL_BUTTONS_FILE);
    }

    // Agregar carpeta de sonidos persistentes
    if (fs.existsSync(SOUNDS_DIR)) {
      const files = fs.readdirSync(SOUNDS_DIR);
      files.forEach(f => {
        const fullPath = path.join(SOUNDS_DIR, f);
        if (fs.statSync(fullPath).isFile()) {
          zip.addLocalFile(fullPath, 'sounds');
        }
      });
    }

    const zipBuffer = zip.toBuffer();
    const filename = `botonera-backup-${new Date().toISOString().slice(0, 10)}.zip`;

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': zipBuffer.length
    });

    res.send(zipBuffer);
  } catch (err) {
    console.error('Error al exportar backup:', err);
    res.status(500).json({ error: 'Error generando la copia de seguridad' });
  }
});

// Restaurar copia de seguridad desde un archivo ZIP
app.post('/api/backup/import', upload.single('backupZip'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes seleccionar un archivo .zip' });
    }

    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(STORAGE_ROOT, true);

    // Borrar el zip temporal subido
    fs.unlink(req.file.path, () => {});

    // Recargar botones
    buttons = loadButtons();
    io.emit('buttons_updated', buttons);

    res.json({ success: true, count: buttons.length });
  } catch (err) {
    console.error('Error al restaurar backup:', err);
    res.status(500).json({ error: 'Error al procesar el archivo zip de respaldo' });
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

// Editar botón existente (nombre, color, emoticón o archivo de audio)
app.put('/api/buttons/:id', upload.single('audio'), (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon } = req.body;
    const btn = buttons.find(b => b.id === id);

    if (!btn) {
      return res.status(404).json({ error: 'Botón no encontrado' });
    }

    if (name && name.trim()) btn.name = name.trim();
    if (color) btn.color = color;
    if (icon) btn.icon = icon;

    // Si se subió un nuevo archivo de audio
    if (req.file) {
      const oldSound = btn.sound;
      btn.sound = req.file.filename;

      // Si el archivo anterior ya no se usa en ningún otro botón, eliminarlo
      if (oldSound && oldSound !== btn.sound) {
        const stillUsed = buttons.some(b => b.sound === oldSound && b.id !== id);
        if (!stillUsed) {
          const oldPath = path.join(SOUNDS_DIR, oldSound);
          if (fs.existsSync(oldPath)) {
            fs.unlink(oldPath, () => {});
          }
        }
      }
    }

    saveButtons(buttons);
    io.emit('buttons_updated', buttons);

    res.json({ success: true, button: btn });
  } catch (err) {
    console.error('Error al actualizar botón:', err);
    res.status(500).json({ error: 'Error al actualizar el botón' });
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
  });

  // Evento: Alguien pulsó un botón en su teléfono -> reproducir en la PC
  socket.on('press_button', (data) => {
    const { buttonId } = data;
    const button = buttons.find(b => b.id === buttonId);
    if (!button) return;

    const deviceName = data.deviceName || deviceInfo.name || 'Teléfono';

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
