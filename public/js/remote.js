// Estado del cliente Móvil
let currentButtons = [];
let myDeviceName = localStorage.getItem('botonera_username') || '';

// Elementos del DOM
const buttonsContainer = document.getElementById('buttonsContainer');
const userNameDisplay = document.getElementById('userNameDisplay');
const btnChangeName = document.getElementById('btnChangeName');
const nameModal = document.getElementById('nameModal');
const nameForm = document.getElementById('nameForm');
const nameInput = document.getElementById('nameInput');
const socketDot = document.getElementById('socketDot');
const socketText = document.getElementById('socketText');

// Inicialización de Nombre
if (!myDeviceName) {
  nameModal.classList.add('open');
  nameInput.focus();
} else {
  userNameDisplay.textContent = myDeviceName;
}

btnChangeName.addEventListener('click', () => {
  nameInput.value = myDeviceName;
  nameModal.classList.add('open');
  nameInput.focus();
});

nameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = nameInput.value.trim();
  if (val) {
    myDeviceName = val;
    localStorage.setItem('botonera_username', myDeviceName);
    userNameDisplay.textContent = myDeviceName;
    nameModal.classList.remove('open');
    registerDevice();
  }
});

// Socket.io
const socket = io();

function registerDevice() {
  if (socket.connected) {
    socket.emit('register_device', {
      type: 'remote',
      name: myDeviceName || 'Teléfono Móvil'
    });
  }
}

socket.on('connect', () => {
  socketDot.classList.remove('offline');
  socketText.textContent = 'En Línea';
  registerDevice();
});

socket.on('disconnect', () => {
  socketDot.classList.add('offline');
  socketText.textContent = 'Reconectando...';
});

// Cargar botones iniciales
async function fetchButtons() {
  try {
    const res = await fetch('/api/buttons');
    currentButtons = await res.json();
    renderButtons();
  } catch (err) {
    console.error('Error cargando botones:', err);
  }
}

// Renderizar botones táctiles en el móvil
function renderButtons() {
  buttonsContainer.innerHTML = '';

  currentButtons.forEach(btn => {
    const btnElem = document.createElement('button');
    btnElem.type = 'button';
    btnElem.className = 'mobile-sound-btn';
    btnElem.dataset.id = btn.id;
    btnElem.style.setProperty('--btn-color', btn.color || '#3b82f6');
    btnElem.style.background = `linear-gradient(145deg, #131b2e 50%, ${btn.color}45)`;
    btnElem.style.borderColor = `${btn.color}90`;

    btnElem.innerHTML = `
      <div class="btn-icon">${btn.icon || '🎵'}</div>
      <div class="btn-name">${escapeHtml(btn.name)}</div>
    `;

    // Manejo de toques inteligente: permite deslizar (scroll) sin presionar el botón
    let startX = 0;
    let startY = 0;
    let hasMoved = false;
    let touchStartTime = 0;

    btnElem.addEventListener('pointerdown', (e) => {
      // Guardar posición inicial del dedo/cursor
      startX = e.clientX;
      startY = e.clientY;
      hasMoved = false;
      touchStartTime = Date.now();

      // Efecto visual leve mientras mantiene el dedo
      btnElem.classList.add('pressed');
    });

    btnElem.addEventListener('pointermove', (e) => {
      if (hasMoved) return;
      // Calcular distancia recorrida desde el toque inicial
      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);

      // Si se movió más de 8 píxeles en cualquier dirección, es un deslizamiento/scroll
      if (diffX > 8 || diffY > 8) {
        hasMoved = true;
        btnElem.classList.remove('pressed');
      }
    });

    btnElem.addEventListener('pointercancel', () => {
      // El navegador inició un desplazamiento nativo
      hasMoved = true;
      btnElem.classList.remove('pressed');
    });

    btnElem.addEventListener('pointerup', (e) => {
      btnElem.classList.remove('pressed');

      // Si no hubo deslizamiento y el toque fue rápido/intencional (menos de 1.5s), es un tap real
      if (!hasMoved && (Date.now() - touchStartTime < 1500)) {
        handlePressButton(btn, btnElem, e);
      }
    });

    buttonsContainer.appendChild(btnElem);
  });
}

// Acción al pulsar un botón
function handlePressButton(btn, element, event) {
  // Vibración táctil háptica (si el móvil lo permite)
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(60);
    } catch (e) {}
  }

  // Efecto visual en el botón
  element.classList.add('pressed');
  setTimeout(() => element.classList.remove('pressed'), 250);

  // Crear ripple effect visual en la posición del dedo
  createRipple(event, element);

  // Enviar evento al servidor para que suene en la PC
  socket.emit('press_button', {
    buttonId: btn.id,
    deviceName: myDeviceName || 'Teléfono Móvil'
  });
}

function createRipple(event, element) {
  const rect = element.getBoundingClientRect();
  const circle = document.createElement('span');
  const diameter = Math.max(rect.width, rect.height);
  const radius = diameter / 2;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${(event.clientX || rect.left + radius) - rect.left - radius}px`;
  circle.style.top = `${(event.clientY || rect.top + radius) - rect.top - radius}px`;
  circle.classList.add('ripple');

  const ripple = element.querySelector('.ripple');
  if (ripple) ripple.remove();

  element.appendChild(circle);
}

// Actualizaciones de botones en caliente
socket.on('buttons_updated', (newButtons) => {
  currentButtons = newButtons;
  renderButtons();
});

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

// Cargar botones
fetchButtons();
