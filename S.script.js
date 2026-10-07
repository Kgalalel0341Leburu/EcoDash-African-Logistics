// --- Audio Engine (Web Audio API) ---
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.motorOsc = null;
    this.motorGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.setupMotor();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupMotor() {
    this.motorOsc = this.ctx.createOscillator();
    this.motorGain = this.ctx.createGain();
    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.setValueAtTime(60, this.ctx.currentTime);
    this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.motorOsc.connect(this.motorGain);
    this.motorGain.connect(this.ctx.destination);
    this.motorOsc.start();
  }

  updateMotor(thrustActive, speed) {
    if (!this.ctx || this.isMuted) return;
    const baseFreq = 70 + speed * 15;
    const targetGain = thrustActive ? 0.08 : 0.02;
    this.motorOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
    this.motorGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
  }

  playBeep() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playCrash() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.motorGain) {
      this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    return !this.isMuted;
  }
}

// --- Player Pilot Profiles ---
const PILOT_PROFILES = {
  cadet: { name: 'Aero Cadet', thrustForce: 0.35, drainMult: 1.25, drag: 0.96, color: '#38bdf8' },
  veteran: { name: 'Logistics Veteran', thrustForce: 0.25, drainMult: 1.0, drag: 0.97, color: '#0284c7' },
  hauler: { name: 'Heavy Hauler', thrustForce: 0.20, drainMult: 0.70, drag: 0.98, color: '#f59e0b' }
};

let selectedPilot = 'cadet';

// --- Simulation State Variables ---
let canvas, ctx;
const soundEngine = new SoundEngine();

let isRunning = false;
let isPaused = false;
let currentScore = 0;
let highScore = parseInt(localStorage.getItem('ecoDash_highScore') || '0', 10);
let lastTimeStamp = 0;

let dronePositionX = 100;
let dronePositionY = 500;
let droneVelocityX = 0;
let droneVelocityY = 0;
let droneTiltAngle = 0;
let droneAltitude = 100;
let droneVerticalVelocity = 0;
let droneBatteryLevel = 100;

let windVelocityX = 0.4;
let activeHazards = [];
let deliveryWaypoints = [];
let particleEffects = [];

// Navigation Base Coordinates
const BASE_STATION = { x: 100, y: 500 };

const flightControls = {
  up: false,
  down: false,
  left: false,
  right: false,
  brake: false
};

let playerSelectScreen, startScreen, pauseScreen, gameOverScreen, batteryFill, batteryText;
let altDisplay, windDisplay, scoreDisplay, highScoreDisplay, finalScoreDisplay;
let gameOverTitle, gameOverReason;

function init() {
  canvas = document.getElementById('simCanvas');
  ctx = canvas.getContext('2d');

  playerSelectScreen = document.getElementById('playerSelectScreen');
  startScreen = document.getElementById('startScreen');
  pauseScreen = document.getElementById('pauseScreen');
  gameOverScreen = document.getElementById('gameOverScreen');
  batteryFill = document.getElementById('batteryFill');
  batteryText = document.getElementById('batteryText');
  altDisplay = document.getElementById('altDisplay');
  windDisplay = document.getElementById('windDisplay');
  scoreDisplay = document.getElementById('scoreDisplay');
  highScoreDisplay = document.getElementById('highScoreDisplay');
  finalScoreDisplay = document.getElementById('finalScoreDisplay');
  gameOverTitle = document.getElementById('gameOverTitle');
  gameOverReason = document.getElementById('gameOverReason');

  highScoreDisplay.textContent = highScore;
  setupEventListeners();
  setupRemoteController();
  resetSimulation();
  requestAnimationFrame(gameLoop);
}

function resetSimulation() {
  dronePositionX = BASE_STATION.x;
  dronePositionY = BASE_STATION.y;
  droneVelocityX = 0;
  droneVelocityY = 0;
  droneTiltAngle = 0;
  droneAltitude = 100;
  droneVerticalVelocity = 0;
  droneBatteryLevel = 100;
  currentScore = 0;
  particleEffects = [];
  scoreDisplay.textContent = '0';

  generateWorldEntities();
}

function generateWorldEntities() {
  activeHazards = [
    { type: 'LOAD_SHEDDING', x: 300, y: 150, width: 180, height: 250, label: 'Load-Shedding Zone' },
    { type: 'CROSSWIND_GUST', x: 550, y: 100, width: 160, height: 350, label: 'Gale Crosswind' },
    { type: 'FLOOD_HAZARD', x: 250, y: 420, width: 220, height: 140, label: 'Flash Flood Hazard' }
  ];

  // Sequenced waypoints making a logical flight path across the terrain
  deliveryWaypoints = [
    { id: 1, x: 400, y: 220, radius: 25, active: true },
    { id: 2, x: 750, y: 180, radius: 25, active: true },
    { id: 3, x: 850, y: 480, radius: 25, active: true }
  ];
}

function setupRemoteController() {
  const bindControl = (btnId, controlKey) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const startAction = (e) => {
      e.preventDefault();
      flightControls[controlKey] = true;
      btn.classList.add('active');
    };
    const stopAction = (e) => {
      e.preventDefault();
      flightControls[controlKey] = false;
      btn.classList.remove('active');
    };

    btn.addEventListener('mousedown', startAction);
    btn.addEventListener('mouseup', stopAction);
    btn.addEventListener('mouseleave', stopAction);
    btn.addEventListener('touchstart', startAction);
    btn.addEventListener('touchend', stopAction);
  };

  bindControl('btnUp', 'up');
  bindControl('btnDown', 'down');
  bindControl('btnLeft', 'left');
  bindControl('btnRight', 'right');
  bindControl('btnBrake', 'brake');
}

function setupEventListeners() {
  document.querySelectorAll('.pilot-card').forEach(card => {
    card.addEventListener('click', (evt) => {
      document.querySelectorAll('.pilot-card').forEach(c => c.classList.remove('active'));
      const targetCard = evt.currentTarget;
      targetCard.classList.add('active');
      selectedPilot = targetCard.dataset.pilot;
    });
  });

  document.getElementById('confirmPlayerBtn').addEventListener('click', () => {
    playerSelectScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });

  window.addEventListener('keydown', (evt) => {
    if (evt.code === 'KeyW' || evt.code === 'ArrowUp') flightControls.up = true;
    if (evt.code === 'KeyS' || evt.code === 'ArrowDown') flightControls.down = true;
    if (evt.code === 'KeyA' || evt.code === 'ArrowLeft') flightControls.left = true;
    if (evt.code === 'KeyD' || evt.code === 'ArrowRight') flightControls.right = true;
    if (evt.code === 'Space') flightControls.brake = true;

    if (evt.code === 'Escape' && isRunning) {
      togglePause();
    }
  });

  window.addEventListener('keyup', (evt) => {
    if (evt.code === 'KeyW' || evt.code === 'ArrowUp') flightControls.up = false;
    if (evt.code === 'KeyS' || evt.code === 'ArrowDown') flightControls.down = false;
    if (evt.code === 'KeyA' || evt.code === 'ArrowLeft') flightControls.left = false;
    if (evt.code === 'KeyD' || evt.code === 'ArrowRight') flightControls.right = false;
    if (evt.code === 'Space') flightControls.brake = false;
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    soundEngine.init();
    startScreen.classList.add('hidden');
    isRunning = true;
    isPaused = false;
  });

  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('resumeBtn').addEventListener('click', togglePause);
  
  document.getElementById('restartBtn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    playerSelectScreen.classList.remove('hidden');
    resetSimulation();
  });

  document.getElementById('restartPauseBtn').addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    playerSelectScreen.classList.remove('hidden');
    resetSimulation();
    isRunning = false;
    isPaused = false;
  });

  document.getElementById('audioToggleBtn').addEventListener('click', (evt) => {
    const state = soundEngine.toggleMute();
    evt.target.textContent = `Sound: ${state ? 'ON' : 'OFF'}`;
  });
}

function togglePause() {
  if (!isRunning) return;
  isPaused = !isPaused;
  if (isPaused) {
    pauseScreen.classList.remove('hidden');
  } else {
    pauseScreen.classList.add('hidden');
  }
}

// --- Physics Engine & Responsive Navigation ---
function updatePhysics(deltaTime) {
  if (!isRunning || isPaused) return;

  const profile = PILOT_PROFILES[selectedPilot];
  const thrustForce = profile.thrustForce;
  let isThrustActive = false;

  if (flightControls.up) {
    droneVelocityY -= thrustForce;
    droneVerticalVelocity += 0.3;
    isThrustActive = true;
  }
  if (flightControls.down) {
    droneVelocityY += thrustForce;
    droneVerticalVelocity -= 0.3;
    isThrustActive = true;
  }
  if (flightControls.left) {
    droneVelocityX -= thrustForce;
    isThrustActive = true;
  }
  if (flightControls.right) {
    droneVelocityX += thrustForce;
    isThrustActive = true;
  }

  // Smooth responsive tilt physics
  const targetTilt = droneVelocityX * 0.08;
  droneTiltAngle += (targetTilt - droneTiltAngle) * 0.15;

  if (flightControls.brake) {
    droneVelocityX *= 0.85;
    droneVelocityY *= 0.85;
    droneBatteryLevel -= 0.04 * profile.drainMult;
  }

  droneVelocityX += windVelocityX * 0.1;

  // Interactions with the Obstacles
  activeHazards.forEach(hazard => {
    if (dronePositionX > hazard.x && dronePositionX < hazard.x + hazard.width &&
        dronePositionY > hazard.y && dronePositionY < hazard.y + hazard.height) {
      
      if (hazard.type === 'CROSSWIND_GUST') {
        droneVelocityX += 0.35;
      } else if (hazard.type === 'LOAD_SHEDDING') {
        droneBatteryLevel -= 0.08 * profile.drainMult;
      }
    }
  });

  // Responsive Damping
  droneVelocityX *= profile.drag;
  droneVelocityY *= profile.drag;
  droneVerticalVelocity *= 0.92;

  dronePositionX += droneVelocityX;
  dronePositionY += droneVelocityY;
  droneAltitude = Math.max(0, droneAltitude + droneVerticalVelocity);

  if (dronePositionX < 20) { dronePositionX = 20; droneVelocityX = 0; }
  if (dronePositionX > canvas.width - 20) { dronePositionX = canvas.width - 20; droneVelocityX = 0; }
  if (dronePositionY < 20) { dronePositionY = 20; droneVelocityY = 0; }
  if (dronePositionY > canvas.height - 20) { dronePositionY = canvas.height - 20; droneVelocityY = 0; }

  const currentSpeed = Math.hypot(droneVelocityX, droneVelocityY);
  const baseConsumption = 0.02 * profile.drainMult;
  const speedConsumption = currentSpeed * 0.015 * profile.drainMult;
  droneBatteryLevel -= (baseConsumption + speedConsumption);

  soundEngine.updateMotor(isThrustActive, currentSpeed);

  if (isThrustActive) {
    createParticles(dronePositionX, dronePositionY, 2, profile.color);
  }

  deliveryWaypoints.forEach(waypoint => {
    if (waypoint.active) {
      const dist = Math.hypot(dronePositionX - waypoint.x, dronePositionY - waypoint.y);
      if (dist < waypoint.radius + 15) {
        waypoint.active = false;
        currentScore += 150;
        soundEngine.playBeep();
        createParticles(waypoint.x, waypoint.y, 25, '#4ade80');
        
        if (currentScore > highScore) {
          highScore = currentScore;
          localStorage.setItem('ecoDash_highScore', highScore.toString());
          highScoreDisplay.textContent = highScore;
        }
      }
    }
  });

  if (droneBatteryLevel <= 0) {
    triggerGameOver(false, "Battery Depleted! Drone lost power over harsh terrain.");
  }

  updateHUD(currentSpeed);
  updateParticles();
}

function triggerGameOver(isSuccess, reasonMessage) {
  isRunning = false;
  soundEngine.playCrash();

  gameOverTitle.textContent = isSuccess ? "Mission Completed!" : "Mission Failed";
  gameOverTitle.style.color = isSuccess ? "#4ade80" : "#ef4444";
  gameOverReason.textContent = reasonMessage;
  finalScoreDisplay.textContent = currentScore;

  gameOverScreen.classList.remove('hidden');
}

function updateHUD(speed) {
  const batPercentage = Math.max(0, Math.floor(droneBatteryLevel));
  batteryFill.style.width = `${batPercentage}%`;
  batteryText.textContent = `${batPercentage}%`;

  if (batPercentage < 20) {
    batteryFill.style.backgroundColor = '#ef4444';
  } else if (batPercentage < 50) {
    batteryFill.style.backgroundColor = '#f59e0b';
  } else {
    batteryFill.style.backgroundColor = '#22c55e';
  }

  altDisplay.textContent = Math.floor(droneAltitude);
  windDisplay.textContent = (windVelocityX * 25).toFixed(1);
  scoreDisplay.textContent = currentScore;
}

function createParticles(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    particleEffects.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      life: 1.0,
      color: color
    });
  }
}

function updateParticles() {
  for (let i = particleEffects.length - 1; i >= 0; i--) {
    const p = particleEffects[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.03;
    if (p.life <= 0) {
      particleEffects.splice(i, 1);
    }
  }
}

function render() {
  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawNavigationPath();
  drawBackgroundTerrain();

  activeHazards.forEach(hazard => {
    ctx.save();
    if (hazard.type === 'LOAD_SHEDDING') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.strokeStyle = '#ef4444';
    } else if (hazard.type === 'CROSSWIND_GUST') {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.strokeStyle = '#f59e0b';
    } else {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.strokeStyle = '#38bdf8';
    }
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
    ctx.strokeRect(hazard.x, hazard.y, hazard.width, hazard.height);
    
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px Segoe UI';
    ctx.fillText(hazard.label, hazard.x + 8, hazard.y + 18);
    ctx.restore();
  });

  deliveryWaypoints.forEach((waypoint, idx) => {
    if (waypoint.active) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(waypoint.x, waypoint.y, waypoint.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(74, 222, 128, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(waypoint.x, waypoint.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText(`Waypoint ${idx + 1}`, waypoint.x, waypoint.y - 30);
      ctx.restore();
    }
  });

  particleEffects.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  drawDrone();
}

// Draw sequence vector path pointing to active objectives
function drawNavigationPath() {
  const activeTargets = deliveryWaypoints.filter(w => w.active);
  if (activeTargets.length === 0) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);

  ctx.beginPath();
  ctx.moveTo(dronePositionX, dronePositionY);
  
  activeTargets.forEach(target => {
    ctx.lineTo(target.x, target.y);
  });

  ctx.stroke();
  ctx.restore();
}

function drawBackgroundTerrain() {
  ctx.save();
  ctx.fillStyle = '#334155';
  ctx.fillRect(BASE_STATION.x - 30, BASE_STATION.y - 30, 60, 60);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(BASE_STATION.x - 30, BASE_STATION.y - 30, 60, 60);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 12px Segoe UI';
  ctx.fillText('BASE', BASE_STATION.x - 16, BASE_STATION.y + 5);
  ctx.restore();
}

function drawDrone() {
  const profile = PILOT_PROFILES[selectedPilot];

  ctx.save();
  ctx.translate(dronePositionX, dronePositionY);
  ctx.rotate(droneTiltAngle);

  // Flight Path Navigation Arrow (Points to next active waypoint)
  const nextTarget = deliveryWaypoints.find(w => w.active);
  if (nextTarget) {
    const angle = Math.atan2(nextTarget.y - dronePositionY, nextTarget.x - dronePositionX) - droneTiltAngle;
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(20, -5);
    ctx.lineTo(20, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Altitude shadow
  const shadowOffset = Math.min(40, droneAltitude * 0.3);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, shadowOffset, 18, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rotor arms
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-16, -16); ctx.lineTo(16, 16);
  ctx.moveTo(16, -16); ctx.lineTo(-16, 16);
  ctx.stroke();

  // Rotor blades
  ctx.fillStyle = profile.color;
  [[-16,-16], [16,-16], [-16,16], [16,16]].forEach(pos => {
    ctx.beginPath();
    ctx.arc(pos[0], pos[1], 7, 0, Math.PI * 2);
    ctx.fill();
  });

  // Central body
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();

  // Direction light
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(0, -6, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function gameLoop(timeStamp) {
  const deltaTime = (timeStamp - lastTimeStamp) / 1000;
  lastTimeStamp = timeStamp;

  updatePhysics(deltaTime);
  render();

  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', init);
