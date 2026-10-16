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
const modalTitle = document.getElementById('modalTitle');
const editButtonId = document.getElementById('editButtonId');
const soundNameInput = document.getElementById('soundName');
const soundFileInput = document.getElementById('soundFile');
const currentAudioHint = document.getElementById('currentAudioHint');
const btnSubmitAdd = document.getElementById('btnSubmitAdd');
const btnOpenAddModal = document.getElementById('btnOpenAddModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelAdd = document.getElementById('btnCancelAdd');
const addSoundForm = document.getElementById('addSoundForm');
const colorPicker = document.getElementById('colorPicker');

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
      <div class="card-actions">
        <button class="btn-card-action btn-edit" title="Editar botón (emoticón, nombre, audio)" data-id="${btn.id}">✏️</button>
        <button class="btn-card-action btn-delete" title="Eliminar botón" data-id="${btn.id}">&times;</button>
      </div>
      <div class="btn-icon">${btn.icon || '🎵'}</div>
      <div class="btn-name">${escapeHtml(btn.name)}</div>
    `;

    // Click para reproducir sonido desde la PC directamente
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      playSound(btn, { name: 'PC Base (Local)' });
    });

    // Botón Editar
    const editBtn = card.querySelector('.btn-edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn);
    });

    // Botón Eliminar
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

// Modal Agregar / Editar Sonido
function openCreateModal() {
  editButtonId.value = '';
  modalTitle.textContent = '➕ Agregar Botón de Sonido';
  btnSubmitAdd.textContent = 'Guardar Botón';
  soundNameInput.value = '';
  soundFileInput.value = '';
  soundFileInput.required = true;
  currentAudioHint.style.display = 'none';

  selectedColor = '#3b82f6';
  colorPicker.querySelectorAll('.color-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.color === selectedColor);
  });

  selectedIcon = '🎵';
  if (selectedEmojiPreview) selectedEmojiPreview.textContent = selectedIcon;
  renderEmojiPicker();

  addModal.classList.add('open');
}

function openEditModal(btn) {
  editButtonId.value = btn.id;
  modalTitle.textContent = '✏️ Editar Botón de Sonido';
  btnSubmitAdd.textContent = 'Actualizar Cambios';
  soundNameInput.value = btn.name;
  soundFileInput.value = '';
  soundFileInput.required = false; // Opcional al editar

  currentAudioHint.textContent = `🎵 Audio actual: "${btn.sound}" (sube uno nuevo solo si quieres cambiarlo)`;
  currentAudioHint.style.display = 'block';

  selectedColor = btn.color || '#3b82f6';
  colorPicker.querySelectorAll('.color-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.color === selectedColor);
  });

  selectedIcon = btn.icon || '🎵';
  if (selectedEmojiPreview) selectedEmojiPreview.textContent = selectedIcon;
  renderEmojiPicker();

  addModal.classList.add('open');
}

btnOpenAddModal.addEventListener('click', openCreateModal);
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

// Base de datos amplia de emoticones organizados para la botonera
const EMOJIS_DATA = [
  // Golpes & Acción
  { emoji: '💥', name: 'Explosión', cat: 'action', tags: 'golpe impacto boom choque bomba fuego dbz' },
  { emoji: '👊', name: 'Puño / Puñetazo', cat: 'action', tags: 'pelea golpe punch mano piña puñetazo combo' },
  { emoji: '🥊', name: 'Guante Boxeo', cat: 'action', tags: 'box boxeo pelea punch golpe ring' },
  { emoji: '⚡', name: 'Rayo / Trueno', cat: 'action', tags: 'electricidad energia rayo trueno shock descarga' },
  { emoji: '💣', name: 'Bomba', cat: 'action', tags: 'explosion dinamita kaboom bomba mecha peligro' },
  { emoji: '🔥', name: 'Fuego / Llama', cat: 'action', tags: 'fuego calor quemar incendio candela hot' },
  { emoji: '🗡️', name: 'Espada', cat: 'action', tags: 'cuchillo filo combate espadazo acero corte' },
  { emoji: '🥋', name: 'Artes Marciales', cat: 'action', tags: 'karate judo taekwondo pelea ninja golpe' },
  { emoji: '🔫', name: 'Pistola / Disparo', cat: 'action', tags: 'disparo bala tiro arma laser revolver bang' },
  { emoji: '🧨', name: 'Dinamita / Petardo', cat: 'action', tags: 'fuegos artificiales petardo mecha pirotecnia boom' },
  { emoji: '🔨', name: 'Martillo', cat: 'action', tags: 'golpe mazo martillazo construccion bonk' },
  { emoji: '🏹', name: 'Arco y Flecha', cat: 'action', tags: 'flechazo tiro punteria diana flecha' },
  { emoji: '🛡️', name: 'Escudo', cat: 'action', tags: 'defensa bloqueo proteccion armadura parry' },
  { emoji: '🌪️', name: 'Tornado / Viento', cat: 'action', tags: 'huracan torbellino aire viento tempestad' },
  { emoji: '☄️', name: 'Cometa / Meteorito', cat: 'action', tags: 'espacio impacto caida fuego meteorito smash' },
  { emoji: '🪓', name: 'Hacha', cat: 'action', tags: 'corte leña machetazo hachazo filo' },
  { emoji: '🥷', name: 'Ninja', cat: 'action', tags: 'sigilo asesino artes marciales sombra rapidez' },
  { emoji: '🤸', name: 'Caída / Acrobacia', cat: 'action', tags: 'tropezon pirueta salto voltereta caida resbalon' },
  { emoji: '💢', name: 'Furia / Enojo', cat: 'action', tags: 'ira rabia anime golpe venas bronca' },
  { emoji: '🐉', name: 'Dragón', cat: 'action', tags: 'dragon ball goku bestia criatura fuego magico saiyan' },

  // Risas & Memes
  { emoji: '🤣', name: 'Risas a carcajadas', cat: 'fun', tags: 'risa meme gracioso chiste lmfao divertido' },
  { emoji: '😂', name: 'Llorar de la risa', cat: 'fun', tags: 'risa carcajada divertido lagrimas lol' },
  { emoji: '🤡', name: 'Payaso', cat: 'fun', tags: 'clown circo broma chiste tonto bobo meme' },
  { emoji: '💀', name: 'Calavera / Muerto', cat: 'fun', tags: 'rip muerte mori tumba fantasma esqueleto dead' },
  { emoji: '😱', name: 'Grito / Pánico', cat: 'fun', tags: 'susto miedo grito wilhelm shock terror alarma' },
  { emoji: '🤪', name: 'Loco / Broma', cat: 'fun', tags: 'locura chistoso lengua bizco raro tonto' },
  { emoji: '🤦', name: 'Facepalm / Decepción', cat: 'fun', tags: 'mano cara pena ajena error verguenza fail' },
  { emoji: '💩', name: 'Caca / Crap', cat: 'fun', tags: 'popo caca bosta asco broma mierda shit' },
  { emoji: '🥳', name: 'Festejo', cat: 'fun', tags: 'cumpleaños gorrito trompeta fiesta celebracion party' },
  { emoji: '😈', name: 'Diablo bromista', cat: 'fun', tags: 'maldad diablillo travesura risa malevola demonio' },
  { emoji: '🤖', name: 'Robot', cat: 'fun', tags: 'tecnologia mecanico beep boop futurista ia' },
  { emoji: '👽', name: 'Alien / Marciano', cat: 'fun', tags: 'extraterrestre ovni ufo espacio misterio marciano' },
  { emoji: '👻', name: 'Fantasma', cat: 'fun', tags: 'boo susto halloween espiritu miedo espectro' },
  { emoji: '🤫', name: 'Silencio / Shhh', cat: 'fun', tags: 'callate secreto silencio shhh misterio calla' },
  { emoji: '🤓', name: 'Nerd', cat: 'fun', tags: 'estudioso lentes inteligente empollon saber friki' },
  { emoji: '🤠', name: 'Vaquero', cat: 'fun', tags: 'cowboy sombrero oeste pistolero yeehaw' },
  { emoji: '🤯', name: 'Cabeza explotando', cat: 'fun', tags: 'mente mindblown explosion sorpresa shock increible' },
  { emoji: '🗿', name: 'Moai / Chad', cat: 'fun', tags: 'estatua isla de pascua meme piedra sigilo chad serio' },
  { emoji: '🤐', name: 'Boca cerrada', cat: 'fun', tags: 'cremallera mudo callado cerrar boca secreto' },
  { emoji: '🥱', name: 'Bostezo / Aburrido', cat: 'fun', tags: 'sueño cansancio aburrimiento flojera pereza' },

  // Alertas & Sonidos
  { emoji: '📢', name: 'Megáfono / Airhorn', cat: 'sound', tags: 'grito anuncio fiesta sirena claxon bocina' },
  { emoji: '🚨', name: 'Sirena Policía / Alarma', cat: 'sound', tags: 'emergencia peligro patrulla sirena alerta wiu' },
  { emoji: '🔔', name: 'Campana', cat: 'sound', tags: 'timbre campanada aviso ding dong iglesia alerta' },
  { emoji: '🛎️', name: 'Campanilla Hotel / Ding', cat: 'sound', tags: 'servicio recepcion ding llamado orden campana' },
  { emoji: '🔊', name: 'Altavoz Fuerte', cat: 'sound', tags: 'volumen audio sonido maximo parlante speaker' },
  { emoji: '📣', name: 'Corneta / Anuncio', cat: 'sound', tags: 'megafono mensaje voz llamado grito altoparlante' },
  { emoji: '🎺', name: 'Trompeta / Fanfarria', cat: 'sound', tags: 'fail tristeza marcha corneta musica wah wah' },
  { emoji: '🥁', name: 'Tambor / Rimshot', cat: 'sound', tags: 'bateria badumtss chiste percusion redoble platillo' },
  { emoji: '🎸', name: 'Guitarra Eléctrica', cat: 'sound', tags: 'rock metal solo cuerda musica acorde solo' },
  { emoji: '🎹', name: 'Piano / Teclado', cat: 'sound', tags: 'melodia teclas clasica musica acordes piano' },
  { emoji: '🎙️', name: 'Micrófono de Estudio', cat: 'sound', tags: 'canto podcast locutor radio voz micro' },
  { emoji: '📻', name: 'Radio Retro', cat: 'sound', tags: 'transmisor emisora sintonizador cassette vieja fm' },
  { emoji: '🎷', name: 'Saxofón', cat: 'sound', tags: 'jazz sensual melodia viento musica saxo' },
  { emoji: '🎻', name: 'Violín triste', cat: 'sound', tags: 'tristeza lagrimas clasico drama orquesta violin' },
  { emoji: '📯', name: 'Cuerno de caza', cat: 'sound', tags: 'trompa llamada castillo edad media aviso' },
  { emoji: '🎵', name: 'Nota Musical', cat: 'sound', tags: 'musica cancion tono audio melodia sonido' },
  { emoji: '🎶', name: 'Notas Musicales', cat: 'sound', tags: 'sinfonia ritmo cancion tarareo armonia' },

  // Juegos & Victoria
  { emoji: '🏆', name: 'Trofeo / Copa', cat: 'gaming', tags: 'ganador victoria win campeon premio oro primer puesto' },
  { emoji: '🥇', name: 'Medalla de Oro', cat: 'gaming', tags: 'primer puesto victoria record numero 1 medalla' },
  { emoji: '👑', name: 'Corona / Rey', cat: 'gaming', tags: 'realeza emperador victoria boss jefe champion' },
  { emoji: '⭐', name: 'Estrella', cat: 'gaming', tags: 'nivel subida item especial mario poder star' },
  { emoji: '🎯', name: 'Diana / Blanco', cat: 'gaming', tags: 'punteria acierto perfecto centro diana tiro' },
  { emoji: '🎲', name: 'Dado', cat: 'gaming', tags: 'azar suerte juego de mesa tirada casino dados' },
  { emoji: '🕹️', name: 'Joystick Arcade', cat: 'gaming', tags: 'retro arcade fichines gamer mando juego palanca' },
  { emoji: '🎮', name: 'Mando / Control', cat: 'gaming', tags: 'playstation xbox consola gaming videojuego gamer' },
  { emoji: '👾', name: 'Monstruo 8-Bit', cat: 'gaming', tags: 'space invader pixel retro alien enemigo videojuego' },
  { emoji: '🪙', name: 'Moneda / Coin', cat: 'gaming', tags: 'mario dinero puntos comprar level up cash' },
  { emoji: '🎰', name: 'Tragamonedas / Jackpot', cat: 'gaming', tags: 'casino premio slots fortuna jackpot ruleta' },
  { emoji: '🪄', name: 'Varita Mágica', cat: 'gaming', tags: 'magia hechizo truco aparicion milagro magic' },
  { emoji: '🎳', name: 'Bolos / Strike', cat: 'gaming', tags: 'bolera chuza derribar tiro strike' },
  { emoji: '🚩', name: 'Bandera / Flag', cat: 'gaming', tags: 'meta punto control captura victoria final' },

  // Fiesta & Brindis
  { emoji: '🍻', name: 'Chinchín / Cervezas', cat: 'party', tags: 'brindis chopp birra cerveza fiesta bar chinchin salud' },
  { emoji: '🥂', name: 'Copas Champán', cat: 'party', tags: 'brindis año nuevo boda festejo brindis salud' },
  { emoji: '🍺', name: 'Jarra de Cerveza', cat: 'party', tags: 'alcohol bebida espuma bar birra chopp' },
  { emoji: '🍾', name: 'Descorche Champán', cat: 'party', tags: 'corcho explotar espumante celebrar fiesta champan' },
  { emoji: '🍕', name: 'Pizza', cat: 'party', tags: 'comida queso mordisco cena delivery pizzeria' },
  { emoji: '🍔', name: 'Hamburguesa', cat: 'party', tags: 'fast food carne pan comida almuerzo burger' },
  { emoji: '🌮', name: 'Taco', cat: 'party', tags: 'mexicano picante comida fiesta tortilla tacos' },
  { emoji: '🍿', name: 'Palomitas / Pochoclos', cat: 'party', tags: 'cine pelicula drama pochoclos pop corn maiz' },
  { emoji: '🎂', name: 'Torta / Pastel', cat: 'party', tags: 'cumpleaños velas fiesta sorpresa dulce pastel' },
  { emoji: '☕', name: 'Café caliente', cat: 'party', tags: 'despertar desayuno taza energia mañana cafe' },
  { emoji: '🎉', name: 'Cañón Confeti', cat: 'party', tags: 'celebracion fiesta cotillon feliz sorpresa fieston' },
  { emoji: '🎈', name: 'Globo', cat: 'party', tags: 'inflable cumpleaños fiesta flotar globo' },

  // Animales & Naturaleza
  { emoji: '🐶', name: 'Perro / Ladrido', cat: 'animals', tags: 'perrito guau canino mascota ladrido perrito' },
  { emoji: '🐱', name: 'Gato / Maullido', cat: 'animals', tags: 'gatito miau felino mascota ronroneo gato' },
  { emoji: '🦁', name: 'León / Rugido', cat: 'animals', tags: 'selva rey fiera safari rugido leon' },
  { emoji: '🐸', name: 'Rana / Sapo', cat: 'animals', tags: 'croac anfibio salto laguna sapo' },
  { emoji: '🐵', name: 'Mono / Chimpancé', cat: 'animals', tags: 'uha mono selva risa banana simio' },
  { emoji: '🐔', name: 'Pollo / Gallina', cat: 'animals', tags: 'cocoroco granja ave plumas huevo pollo gallo' },
  { emoji: '🦆', name: 'Pato / Cuac', cat: 'animals', tags: 'cuac graznido lago plumas patito pato' },
  { emoji: '🐺', name: 'Lobo / Aullido', cat: 'animals', tags: 'auuu luna salvaje bosque aullido lobo' },
  { emoji: '🐝', name: 'Abeja / Zumbido', cat: 'animals', tags: 'bzz picadura miel aguijon insecto abeja' },
  { emoji: '🦖', name: 'T-Rex Dinosaurio', cat: 'animals', tags: 'dino jurasico fiera gigante monstruo trex' },
  { emoji: '🦈', name: 'Tiburón', cat: 'animals', tags: 'mar aleta mandibula peligro depredador tiburon' },
  { emoji: '🐮', name: 'Vaca / Muuu', cat: 'animals', tags: 'granja leche campo muge vaca mu' },
  { emoji: '🐷', name: 'Cerdo / Chanchito', cat: 'animals', tags: 'oink granja chancho cochino cerdo marrano' },
  { emoji: '🦉', name: 'Búho / Lechuza', cat: 'animals', tags: 'noche ojos sabiduria misterio bosque buho' },
  { emoji: '🦅', name: 'Águila', cat: 'animals', tags: 'vuelo presa rapaz grito aire aguila' },

  // Vehículos
  { emoji: '🏎️', name: 'Auto de Carreras / F1', cat: 'vehicles', tags: 'velocidad f1 motor carrera acelerar auto formula 1' },
  { emoji: '🚗', name: 'Coche / Bocina', cat: 'vehicles', tags: 'auto manejar transito bocina beep carro' },
  { emoji: '🏍️', name: 'Moto / Rugido Motor', cat: 'vehicles', tags: 'motocicleta velocidad escape dos ruedas moto' },
  { emoji: '🚂', name: 'Tren / Locomotora', cat: 'vehicles', tags: 'choo choo vapor vias chuchu estacion tren' },
  { emoji: '🚁', name: 'Helicóptero', cat: 'vehicles', tags: 'helices aspas rescate vuelo militar helicoptero' },
  { emoji: '🚀', name: 'Cohete Espacial', cat: 'vehicles', tags: 'despegue propulsor luna astronauta marte cohete' },
  { emoji: '🚑', name: 'Ambulancia', cat: 'vehicles', tags: 'hospital emergencia sirena medicos rescate auxilio' },
  { emoji: '🚒', name: 'Camión de Bomberos', cat: 'vehicles', tags: 'fuego agua sirena rescate alarma bomberos' },
  { emoji: '🚓', name: 'Patrulla Policial', cat: 'vehicles', tags: 'policia arresto sirena ley persecucion patrullero' },
  { emoji: '🛸', name: 'Platillo Volador', cat: 'vehicles', tags: 'ovni nave alienigena misterio laser ufo' },

  // Varios & Gestos
  { emoji: '👏', name: 'Aplausos', cat: 'other', tags: 'ovacion bravo felicitaciones palmas palmadas claps' },
  { emoji: '👍', name: 'Pulgar Arriba / Like', cat: 'other', tags: 'ok bien positivo aprobado si correcto like' },
  { emoji: '👎', name: 'Pulgar Abajo / Dislike', cat: 'other', tags: 'mal no error negativo desaprobado buuu dislike' },
  { emoji: '👀', name: 'Ojos mirón', cat: 'other', tags: 'mirar atento espiar sospecha atento chisme' },
  { emoji: '🧙', name: 'Mago / Hechicero', cat: 'other', tags: 'magia conjuro varita poderes fantasia gandalf' },
  { emoji: '🦸', name: 'Superhéroe', cat: 'other', tags: 'capa poder heroe salvar rescate marvel' },
  { emoji: '🧟', name: 'Zombie', cat: 'other', tags: 'muerto viviente terror horda cerebro apocalipsis' },
  { emoji: '💃', name: 'Bailarina', cat: 'other', tags: 'baile salsa tango ritmo fiesta mover musica' },
  { emoji: '🛑', name: 'Señal Stop / Alto', cat: 'other', tags: 'parar alto freno detencion peligro stop' },
  { emoji: '⚠️', name: 'Advertencia / Peligro', cat: 'other', tags: 'cuidado alerta precaucion atencion warning' },
  { emoji: '❓', name: 'Signo Pregunta', cat: 'other', tags: 'duda trivia quiz acertijo que pregunta' },
  { emoji: '❗', name: 'Exclamación / Alerta', cat: 'other', tags: 'metal gear sorpresa atencion golpe impacto' },
  { emoji: '💯', name: 'Cien Puntos', cat: 'other', tags: 'perfecto cien aprobado excelente maximo 100' }
];

// Elementos del selector de emoticones
const emojiGrid = document.getElementById('emojiGrid');
const emojiSearchInput = document.getElementById('emojiSearchInput');
const btnClearEmojiSearch = document.getElementById('btnClearEmojiSearch');
const emojiCategoryTabs = document.getElementById('emojiCategoryTabs');
const selectedEmojiPreview = document.getElementById('selectedEmojiPreview');

let currentEmojiCat = 'all';
let currentEmojiSearch = '';

// Renderizar emojis filtrados
function renderEmojiPicker() {
  if (!emojiGrid) return;
  emojiGrid.innerHTML = '';

  const search = currentEmojiSearch.toLowerCase().trim();

  const filtered = EMOJIS_DATA.filter(item => {
    // Filtro por categoría
    const matchCat = currentEmojiCat === 'all' || item.cat === currentEmojiCat;
    if (!matchCat) return false;

    // Filtro por búsqueda
    if (!search) return true;
    const textToSearch = `${item.name} ${item.tags} ${item.emoji}`.toLowerCase();
    return textToSearch.includes(search);
  });

  if (filtered.length === 0) {
    emojiGrid.innerHTML = `<div class="emoji-empty-msg">No se encontraron emoticones con "<strong>${escapeHtml(search)}</strong>"</div>`;
    return;
  }

  filtered.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-item';
    if (item.emoji === selectedIcon) {
      btn.classList.add('selected');
    }
    btn.textContent = item.emoji;
    btn.title = item.name;

    btn.addEventListener('click', () => {
      selectedIcon = item.emoji;
      if (selectedEmojiPreview) selectedEmojiPreview.textContent = item.emoji;

      // Actualizar selección visual
      emojiGrid.querySelectorAll('.emoji-item').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
    });

    emojiGrid.appendChild(btn);
  });
}

// Búsqueda en tiempo real
if (emojiSearchInput) {
  emojiSearchInput.addEventListener('input', (e) => {
    currentEmojiSearch = e.target.value;
    if (btnClearEmojiSearch) {
      btnClearEmojiSearch.style.display = currentEmojiSearch ? 'block' : 'none';
    }
    renderEmojiPicker();
  });
}

if (btnClearEmojiSearch) {
  btnClearEmojiSearch.addEventListener('click', () => {
    emojiSearchInput.value = '';
    currentEmojiSearch = '';
    btnClearEmojiSearch.style.display = 'none';
    renderEmojiPicker();
    emojiSearchInput.focus();
  });
}

// Cambio de categoría
if (emojiCategoryTabs) {
  emojiCategoryTabs.addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if (!chip) return;

    emojiCategoryTabs.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    currentEmojiCat = chip.dataset.cat;
    renderEmojiPicker();
  });
}

// Inicializar selector de emojis
renderEmojiPicker();

// Enviar formulario de nuevo o editar sonido
addSoundForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = soundNameInput.value.trim();
  const isEditing = Boolean(editButtonId.value);
  const editId = editButtonId.value;

  if (!isEditing && (!soundFileInput.files || soundFileInput.files.length === 0)) {
    alert('Por favor selecciona un archivo de audio');
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  if (soundFileInput.files && soundFileInput.files.length > 0) {
    formData.append('audio', soundFileInput.files[0]);
  }
  formData.append('color', selectedColor);
  formData.append('icon', selectedIcon);

  try {
    const url = isEditing ? `/api/buttons/${editId}` : '/api/buttons';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      addModal.classList.remove('open');
      addSoundForm.reset();
      editButtonId.value = '';
    } else {
      alert('Error: ' + (data.error || 'No se pudo guardar el botón'));
    }
  } catch (err) {
    console.error('Error al guardar sonido:', err);
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
