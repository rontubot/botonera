// Estado del cliente PC
let buttons = [];
let audioMap = new Map(); // Cache de elementos Audio
let activeAudios = [];
let masterVolume = 0.9;
let audioUnlocked = false;

// Elementos del DOM
const buttonsGrid = document.getElementById('buttonsGrid');
const buttonsCount = document.getElementById('buttonsCount');
const masterVolumeSlider = document.getElementById('masterVolume');
const btnStopAll = document.getElementById('btnStopAll');
const qrImage = document.getElementById('qrImage');
const remoteUrlText = document.getElementById('remoteUrlText');
const btnCopyUrl = document.getElementById('btnCopyUrl');
const ipSelector = document.getElementById('ipSelector');
const devicesList = document.getElementById('devicesList');
const devicesCount = document.getElementById('devicesCount');
const activityList = document.getElementById('activityList');
const btnClearLog = document.getElementById('btnClearLog');
const audioUnlockBanner = document.getElementById('audioUnlockBanner');
const btnUnlockAudio = document.getElementById('btnUnlockAudio');
const socketDot = document.getElementById('socketDot');
const socketStatusText = document.getElementById('socketStatusText');
const modeFreeBtn = document.getElementById('modeFreeBtn');
const modeQuizBtn = document.getElementById('modeQuizBtn');
const buzzerBanner = document.getElementById('buzzerBanner');
const buzzerWinnerName = document.getElementById('buzzerWinnerName');
const buzzerWinnerDetails = document.getElementById('buzzerWinnerDetails');
const btnResetBuzzer = document.getElementById('btnResetBuzzer');

// Modal Elements
const addModal = document.getElementById('addModal');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelAdd = document.getElementById('btnCancelAdd');
const addSoundForm = document.getElementById('addSoundForm');
const colorPicker = document.getElementById('colorPicker');
const iconPicker = document.getElementById('iconPicker');

let selectedColor = '#3b82f6';
let selectedIcon = '🎵';

// Socket.io
const socket = io();

socket.on('connect', () => {
  socketDot.classList.remove('offline');
  socketStatusText.textContent = 'En Línea';
  socket.emit('register_device', { type: 'pc', name: 'PC Central' });
});

socket.on('disconnect', () => {
  socketDot.classList.add('offline');
  socketStatusText.textContent = 'Desconectado';
});

// Desbloqueo de Audio en navegador
function unlockAudio() {
  audioUnlocked = true;
  audioUnlockBanner.style.display = 'none';
  // Reproducir un sonido silencioso para iniciar el contexto de audio
  const silent = new Audio();
  silent.play().catch(() => {});
}

btnUnlockAudio.addEventListener('click', unlockAudio);
document.body.addEventListener('click', () => {
  if (!audioUnlocked) unlockAudio();
}, { once: true });

// Cargar información de red y QR
async function loadServerInfo() {
  try {
    const isCustomDomain = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const currentHost = window.location.host;
    const res = await fetch(`/api/server-info?host=${encodeURIComponent(currentHost)}`);
    const data = await res.json();

    let targetRemoteUrl = data.remoteUrl;
    
    // Si la PC está corriendo en un dominio en la nube (como botonera.up.railway.app),
    // la URL para los teléfonos SIEMPRE es el origen actual del navegador
    if (isCustomDomain) {
      targetRemoteUrl = `${window.location.origin}/remote`;
    }

    remoteUrlText.textContent = targetRemoteUrl;

    // Si la URL objetivo no coincide con el QR que mandó el servidor, pedimos el QR exacto
    if (data.remoteUrl !== targetRemoteUrl) {
      try {
        const qrRes = await fetch(`/api/qr?url=${encodeURIComponent(targetRemoteUrl)}`);
        const qrData = await qrRes.json();
        qrImage.src = qrData.qrDataUrl;
      } catch (e) {
        qrImage.src = data.qrDataUrl;
      }
    } else {
      qrImage.src = data.qrDataUrl;
    }

    // Llenar selector de IPs y dominios
    ipSelector.innerHTML = '';

    if (isCustomDomain) {
      const publicOpt = document.createElement('option');
      publicOpt.value = targetRemoteUrl;
      publicOpt.textContent = `🌐 Dominio Público: ${window.location.host}`;
      publicOpt.selected = true;
      ipSelector.appendChild(publicOpt);
    }

    // Mostrar interfaces de red locales solo si no son IPs privadas de Docker o si es localhost
    data.ips.forEach((item) => {
      // Filtrar IPs de cluster interno tipo railnet0 o 10.x.x.x si estamos en dominio
      if (isCustomDomain && (item.interface.includes('railnet') || item.ip.startsWith('10.'))) {
        return;
      }
      const opt = document.createElement('option');
      opt.value = `http://${item.ip}:${data.port}/remote`;
      opt.textContent = `${item.interface}: ${item.ip}`;
      if (!isCustomDomain && item.ip === data.primaryIp) opt.selected = true;
      ipSelector.appendChild(opt);
    });

    updateBuzzerUI(data.buzzerState);
  } catch (err) {
    console.error('Error cargando info del servidor:', err);
  }
}

// Cambio de IP seleccionada
ipSelector.addEventListener('change', async (e) => {
  const newUrl = e.target.value;
  remoteUrlText.textContent = newUrl;
  try {
    const qrRes = await fetch(`/api/qr?url=${encodeURIComponent(newUrl)}`);
    const qrData = await qrRes.json();
    if (qrData.qrDataUrl) {
      qrImage.src = qrData.qrDataUrl;
    }
  } catch (e) {
    console.error('Error actualizando QR:', e);
  }
});

btnCopyUrl.addEventListener('click', () => {
  navigator.clipboard.writeText(remoteUrlText.textContent).then(() => {
    const original = btnCopyUrl.textContent;
    btnCopyUrl.textContent = '¡Copiado!';
    setTimeout(() => btnCopyUrl.textContent = original, 1500);
  });
});

// Cargar y renderizar botones
async function loadButtons() {
  try {
    const res = await fetch('/api/buttons');
    buttons = await res.json();
    renderButtons();
  } catch (err) {
    console.error('Error cargando botones:', err);
  }
}

function renderButtons() {
  buttonsCount.textContent = buttons.length;
  buttonsGrid.innerHTML = '';

  buttons.forEach(btn => {
    const card = document.createElement('div');
    card.className = 'sound-btn-card';
    card.id = `pc-btn-${btn.id}`;
    card.style.setProperty('--btn-color', btn.color || '#3b82f6');
    card.style.background = `linear-gradient(145deg, #131b2e 60%, ${btn.color}35)`;
    card.style.borderColor = `${btn.color}60`;

    card.innerHTML = `
      <button class="btn-delete" title="Eliminar botón" data-id="${btn.id}">&times;</button>
      <div class="btn-icon">${btn.icon || '🎵'}</div>
      <div class="btn-name">${btn.name}</div>
    `;

    // Click para reproducir sonido desde la PC directamente
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete')) return;
      playSound(btn, { name: 'PC Base (Local)' });
    });

    // Eliminar botón
    const delBtn = card.querySelector('.btn-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteButton(btn.id, btn.name);
    });

    buttonsGrid.appendChild(card);
  });
}

// Reproducir Sonido
function playSound(btn, device) {
  if (!btn || !btn.sound) return;

  const audioPath = `/sounds/${btn.sound}`;
  const audio = new Audio(audioPath);
  audio.volume = masterVolume * (btn.volume || 1.0);

  activeAudios.push(audio);
  audio.addEventListener('ended', () => {
    const index = activeAudios.indexOf(audio);
    if (index > -1) activeAudios.splice(index, 1);
  });

  audio.play().catch(err => {
    console.warn('Reproducción de audio bloqueada o con error:', err);
    if (!audioUnlocked) {
      audioUnlockBanner.style.display = 'flex';
    }
  });

  // Animación en la tarjeta de botón en la PC
  const card = document.getElementById(`pc-btn-${btn.id}`);
  if (card) {
    card.classList.add('playing');
    setTimeout(() => card.classList.remove('playing'), 350);
  }

  // Registrar en el log de actividad
  addActivityLog(device.name, btn.name, btn.icon);
}

// Detener todos los audios activos
btnStopAll.addEventListener('click', () => {
  stopAllAudios();
  socket.emit('stop_all_sounds');
});

function stopAllAudios() {
  activeAudios.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
  activeAudios = [];
}

// Control de Volumen Master
masterVolumeSlider.addEventListener('input', (e) => {
  masterVolume = parseFloat(e.target.value);
  activeAudios.forEach(audio => {
    audio.volume = masterVolume;
  });
});

// Registro de Actividad
function addActivityLog(userName, soundName, icon = '🎵') {
  const time = new Date().toLocaleTimeString();
  const li = document.createElement('li');
  li.className = 'activity-item';
  li.innerHTML = `
    <div>
      <span class="activity-user">📱 ${escapeHtml(userName)}</span>
      <span class="activity-sound">activó ${icon} <strong>${escapeHtml(soundName)}</strong></span>
    </div>
    <span class="activity-time">${time}</span>
  `;

  // Remover mensaje vacío si existe
  if (activityList.querySelector('li') && activityList.querySelector('li').style.color) {
    activityList.innerHTML = '';
  }

  activityList.insertBefore(li, activityList.firstChild);

  // Mantener máximo 50 registros
  if (activityList.children.length > 50) {
    activityList.removeChild(activityList.lastChild);
  }
}

btnClearLog.addEventListener('click', () => {
  activityList.innerHTML = '<li style="color: var(--text-muted); font-size: 0.8rem;">Registro limpiado</li>';
});

// Dispositivos Conectados
socket.on('devices_updated', (devices) => {
  const remotes = devices.filter(d => d.type === 'remote');
  devicesCount.textContent = remotes.length;
  devicesList.innerHTML = '';

  if (remotes.length === 0) {
    devicesList.innerHTML = '<span style="color:var(--text-muted); font-size:0.8rem;">Ningún teléfono conectado aún</span>';
    return;
  }

  remotes.forEach(dev => {
    const badge = document.createElement('div');
    badge.className = 'device-badge';
    badge.innerHTML = `<span class="dot"></span> 📱 ${escapeHtml(dev.name)}`;
    devicesList.appendChild(badge);
  });
});

// Evento: Teléfono pulsó un botón -> REPRODUCIR EN LA PC
socket.on('play_sound_on_pc', (data) => {
  playSound(data.button, data.device);
});

// Evento: Botones actualizados
socket.on('buttons_updated', (newButtons) => {
  buttons = newButtons;
  renderButtons();
});

// Modo Quiz / Buzzer
modeFreeBtn.addEventListener('click', () => {
  socket.emit('set_buzzer_mode', 'free');
});

modeQuizBtn.addEventListener('click', () => {
  socket.emit('set_buzzer_mode', 'quiz');
});

socket.on('buzzer_mode_changed', (state) => {
  updateBuzzerUI(state);
});

socket.on('buzzer_locked', (winner) => {
  buzzerBanner.classList.add('active');
  buzzerWinnerName.textContent = winner.name;
  buzzerWinnerDetails.textContent = `fue el primero con "${winner.buttonName}" (${winner.time})`;
});

socket.on('buzzer_reset', () => {
  buzzerBanner.classList.remove('active');
});

btnResetBuzzer.addEventListener('click', () => {
  socket.emit('reset_buzzer');
});

function updateBuzzerUI(state) {
  if (!state) return;
  if (state.mode === 'quiz') {
    modeQuizBtn.classList.add('active');
    modeFreeBtn.classList.remove('active');
  } else {
    modeFreeBtn.classList.add('active');
    modeQuizBtn.classList.remove('active');
    buzzerBanner.classList.remove('active');
  }

  if (state.isLocked && state.winner) {
    buzzerBanner.classList.add('active');
    buzzerWinnerName.textContent = state.winner.name;
    buzzerWinnerDetails.textContent = `fue el primero con "${state.winner.buttonName}"`;
  } else {
    buzzerBanner.classList.remove('active');
  }
}

// Modal Agregar Sonido
btnOpenAddModal.addEventListener('click', () => addModal.classList.add('open'));
btnCloseModal.addEventListener('click', () => addModal.classList.remove('open'));
btnCancelAdd.addEventListener('click', () => addModal.classList.remove('open'));

// Selector de Colores
colorPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.color-btn');
  if (!btn) return;
  colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedColor = btn.dataset.color;
});

// Selector de Íconos
iconPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  iconPicker.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedIcon = btn.dataset.icon;
});

// Enviar formulario de nuevo sonido
addSoundForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('soundName').value.trim();
  const fileInput = document.getElementById('soundFile');

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Por favor selecciona un archivo de audio');
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('audio', fileInput.files[0]);
  formData.append('color', selectedColor);
  formData.append('icon', selectedIcon);

  try {
    const res = await fetch('/api/buttons', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      addModal.classList.remove('open');
      addSoundForm.reset();
    } else {
      alert('Error: ' + (data.error || 'No se pudo guardar el botón'));
    }
  } catch (err) {
    console.error('Error al subir sonido:', err);
    alert('Error al comunicarse con el servidor');
  }
});

// Eliminar Botón
async function deleteButton(id, name) {
  if (!confirm(`¿Eliminar el botón "${name}"?`)) return;
  try {
    const res = await fetch(`/api/buttons/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) {
      alert('Error al eliminar el botón');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// Inicializar
loadServerInfo();
loadButtons();
