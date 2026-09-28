(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  const scenarioSel = document.getElementById('scenario');
  const btnPlay = document.getElementById('btnPlay');
  const btnReset = document.getElementById('btnReset');
  const controlsCard = document.getElementById('controlsCard');

  const batteryBar = document.getElementById('batteryBar');
  const batteryText = document.getElementById('batteryText');
  const statusPill = document.getElementById('statusPill');
  const readout = document.getElementById('readout');

  let running = false;
  let last = performance.now();

  // mini-map coordinates
  const map = { x: 20, y: 20, w: 420, h: 280 };
  const world = { x: 500, y: 50, w: 360, h: 420 };

  const state = {
    scenario: 'hover',

    // drone state in world coordinates (mini-map coordinate space)
    x: 120, y: 120,
    vx: 0, vy: 0,

    altitude: 0, // meters (0..120)
    vz: 0,

    yaw: 0,
    pitch: 0, // visual tilt
    roll: 0,

    windX: 0,
    gust: 0,

    battery: 100,
    landed: false,
    crashed: false,

    // hover target
    hoverTarget: 40,
    stabilityMode: 'beginner',

    // waypoints
    waypoints: [],
    currentWP: 0,
    autoRoute: true,
    speed: 0.55, // normalized

    // obstacles
    obstacles: [],
    reserveTarget: 20,
    homeX: 120, homeY: 120,
    autopilot: true,

    // particles
    particles: [],
    // predicted path visual
    predicted: []
  };

  // ---------- UI ----------
  function mkRow(label, el) {
    const div = document.createElement('div');
    div.className = 'row';
    const lab = document.createElement('label');
    lab.textContent = label;
    lab.style.width = '150px';
    div.appendChild(lab);
    div.appendChild(el);
    return div;
  }

  function buildControls() {
    const s = scenarioSel.value;
    controlsCard.innerHTML = '';

    const mkBtn = (text, id, klass) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.id = id;
      if (klass) b.className = klass;
      return b;
    };

    if (s === 'hover') {
      const takeoffBtn = mkBtn('Takeoff', 'takeoffBtn');
      const hover = document.createElement('input');
      hover.type='range'; hover.min='10'; hover.max='110'; hover.value='50';
      const hoverVal = document.createElement('div');
      hoverVal.innerHTML = `<label>Hover Height: <b id="hoverVal">50</b> m</label>`;
      hover.oninput = () => hoverVal.querySelector('b').textContent = hover.value;

      const stab = document.createElement('select');
      stab.innerHTML = `<option value="beginner">Beginner</option><option value="expert" selected>Expert</option>`;
      const gust = document.createElement('input');
      gust.type='checkbox';
      gust.checked = true;

      controlsCard.appendChild(mkRow('Takeoff Button', takeoffBtn));
      controlsCard.appendChild(hoverVal);
      controlsCard.appendChild(hover);
      controlsCard.appendChild(mkRow('Stability Mode', stab));
      controlsCard.appendChild(mkRow('Wind Gusts', gust));
    }

    if (s === 'waypoints') {
      const speed = document.createElement('input');
      speed.type='range'; speed.min='0'; speed.max='100'; speed.value='55';
      const speedVal = document.createElement('div');
      speedVal.innerHTML = `<label>Flight Speed: <b id="speedVal">55</b></label>`;
      speed.oninput = () => speedVal.querySelector('b').textContent = speed.value;

      const wind = document.createElement('input');
      wind.type='range'; wind.min='0'; wind.max='100'; wind.value='25';
      const windVal = document.createElement('div');
      windVal.innerHTML = `<label>Wind Strength: <b id="windVal">25</b></label>`;
      wind.oninput = () => windVal.querySelector('b').textContent = wind.value;

      const auto = document.createElement('select');
      auto.innerHTML = `<option value="true" selected>Auto-route ON</option><option value="false">Auto-route OFF</option>`;

      controlsCard.appendChild(speedVal);
      controlsCard.appendChild(speed);
      controlsCard.appendChild(windVal);
      controlsCard.appendChild(wind);
      controlsCard.appendChild(mkRow('Routing', auto));

      const info = document.createElement('div');
      info.className='hint';
      info.style.marginTop='10px';
      info.innerHTML = `🖱️ Click on the mini-map to add waypoints.<br/>Dotted path shows predicted route.`;
      controlsCard.appendChild(info);
    }

    if (s === 'avoid') {
      const gen = mkBtn('Generate Obstacles', 'genObs');
      const ap = document.createElement('select');
      ap.innerHTML = `<option value="true" selected>Autopilot ON</option><option value="false">Autopilot OFF</option>`;

      const reserve = document.createElement('input');
      reserve.type='range'; reserve.min='5'; reserve.max='50'; reserve.value='20';
      const reserveVal = document.createElement('div');
      reserveVal.innerHTML = `<label>Land at Battery: <b id="reserveVal">20</b>%</label>`;
      reserve.oninput = () => reserveVal.querySelector('b').textContent = reserve.value;

      const wind = document.createElement('input');
      wind.type='range'; wind.min='0'; wind.max='100'; wind.value='30';
      const windVal = document.createElement('div');
      windVal.innerHTML = `<label>Wind Strength: <b id="windVal">30</b></label>`;
      wind.oninput = () => windVal.querySelector('b').textContent = wind.value;

      controlsCard.appendChild(mkRow('Obstacles', gen));
      controlsCard.appendChild(mkRow('Control', ap));
      controlsCard.appendChild(reserveVal);
      controlsCard.appendChild(reserve);
      controlsCard.appendChild(windVal);
      controlsCard.appendChild(wind);

      const info = document.createElement('div');
      info.className='hint';
      info.style.marginTop='10px';
      info.innerHTML = `Autopilot tries to avoid obstacles.<br/>When battery hits the reserve target, it returns home and lands.`;
      controlsCard.appendChild(info);
    }
  }

  function reset() {
    state.x = 120; state.y = 120;
    state.vx = 0; state.vy = 0;
    state.altitude = 0; state.vz = 0;
    state.pitch = 0; state.roll = 0; state.yaw = 0;
    state.windX = 0; state.gust = 0;
    state.battery = 100;
    state.landed = false;
    state.crashed = false;
    state.waypoints = [];
    state.currentWP = 0;
    state.obstacles = [];
    state.predicted = [];
    state.homeX = 120; state.homeY = 120;
    state.particles.length = 0;
    statusPill.textContent = 'Ready';
    readout.textContent = '';
    batteryBar.style.width = '100%';
    batteryText.textContent = '100%';
  }

  function addParticle(x,y,vx,vy,life,color,size) {
    state.particles.push({x,y,vx,vy,life,max:life,color,size});
  }

  function stepParticles(dt) {
    for (let i=state.particles.length-1;i>=0;i--){
      const p=state.particles[i];
      p.life -= dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vx *= Math.pow(0.98, dt*60);
      p.vy *= Math.pow(0.98, dt*60);
      if (p.life<=0) state.particles.splice(i,1);
    }
  }

  function drawParticles() {
    for (const p of state.particles){
      const a = Math.max(0, p.life/p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.size*(0.5+a),0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  scenarioSel.onchange = () => {
    buildControls();
    reset();
  };

  btnReset.onclick = () => reset();

  btnPlay.onclick = () => {
    running = !running;
    btnPlay.textContent = running ? 'Pause' : 'Play';
    statusPill.textContent = running ? 'Running' : 'Paused';
    if (running) last = performance.now();
  };

  buildControls();
  reset();

  // ---------- Click to place waypoints ----------
  canvas.addEventListener('pointerdown', (e) => {
    if (!running && scenarioSel.value !== 'waypoints') return;
    if (state.crashed || state.landed) return;

    const s = scenarioSel.value;
    if (s !== 'waypoints') return;

    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);

    // must be inside mini-map
    if (mx>=map.x && mx<=map.x+map.w && my>=map.y && my<=map.y+map.h) {
      state.waypoints.push({
        x: mx, y: my
      });
      // reset waypoint index if starting new
      if (state.currentWP >= state.waypoints.length) state.currentWP = 0;
    }
  });

  // ---------- Rendering Helpers ----------
  function drawMiniMap() {
    // background
    ctx.save();
    ctx.fillStyle = '#071a33';
    ctx.fillRect(map.x,map.y,map.w,map.h);

    // grid
    ctx.strokeStyle='rgba(255,255,255,.05)';
    ctx.lineWidth=1;
    for (let i=0;i<12;i++){
      const y = map.y + i*(map.h/12);
      ctx.beginPath(); ctx.moveTo(map.x,y); ctx.lineTo(map.x+map.w,y); ctx.stroke();
    }
    for (let i=0;i<10;i++){
      const x = map.x + i*(map.w/10);
      ctx.beginPath(); ctx.moveTo(x,map.y); ctx.lineTo(x,map.y+map.h); ctx.stroke();
    }

    // obstacles
    if (scenarioSel.value === 'avoid') {
      for (const o of state.obstacles) {
        ctx.fillStyle = 'rgba(255,170,70,.22)';
        ctx.strokeStyle = 'rgba(255,170,70,.65)';
        ctx.lineWidth = 2;
        ctx.fillRect(o.x-o.r, o.y-o.r, o.r*2, o.r*2);
        ctx.strokeRect(o.x-o.r, o.y-o.r, o.r*2, o.r*2);
      }
    }

    // 
    if (scenarioSel.value === 'waypoints' && state.predicted.length>1) {
      ctx.strokeStyle = 'rgba(0,220,255,.55)';
      ctx.setLineDash([6,6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i=0;i<state.predicted.length;i++){
        const p = state.predicted[i];
        if (i===0) ctx.moveTo(p.x,p.y);
        else ctx.lineTo(p.x,p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // waypoints
    for (let i=0;i<state.waypoints.length;i++){
      const wp = state.waypoints[i];
      const isCurrent = i === state.currentWP;
      ctx.fillStyle = isCurrent ? 'rgba(0,255,190,.9)' : 'rgba(255,255,255,.75)';
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, isCurrent ? 7 : 5, 0, Math.PI*2);
      ctx.fill();

      // pulse ring for current
      if (isCurrent) {
        const pulse = 3 + 2*Math.sin(performance.now()/170);
        ctx.strokeStyle='rgba(0,255,190,.55)';
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 10+pulse, 0, Math.PI*2);
        ctx.stroke();
      }
    }

    // home
    ctx.fillStyle='rgba(200,200,255,.85)';
    ctx.beginPath(); ctx.arc(state.homeX, state.homeY, 4, 0, Math.PI*2); ctx.fill();

    // wind indicator arrow
    if (scenarioSel.value !== 'hover') {
      ctx.save();
      const windLen = Math.min(110, Math.abs(state.windX)*120);
      ctx.translate(map.x+map.w-30, map.y+20);
      ctx.rotate(state.windX >= 0 ? 0 : Math.PI);
      ctx.strokeStyle='rgba(120,200,255,.8)';
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(-windLen,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0,-6); ctx.lineTo(10,0); ctx.lineTo(0,6); ctx.stroke();
      ctx.restore();
    }

    // drone
    const r = 8;
    ctx.fillStyle = state.crashed ? 'rgba(255,60,60,.95)' : 'rgba(120,200,255,.95)';
    ctx.beginPath();
    ctx.arc(state.x,state.y,r,0,Math.PI*2);
    ctx.fill();

    // trail (if not crashed)
    if (!state.crashed) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle='rgba(0,220,255,.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(state.x - state.vx*18, state.y - state.vy*18);
      ctx.lineTo(state.x, state.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawWorldView() {
    // simple "camera view"
    const {x,y,w,h} = world;

    ctx.save();
    // background horizon
    ctx.fillStyle='#081a3a';
    ctx.fillRect(x,y,w,h);

    // horizon tilt based on roll/pitch
    const tilt = state.roll*0.25 + state.pitch*0.18;
    const horizonY = y + h*0.55 + state.pitch*0.18;

    ctx.fillStyle='#0b2b55';
    ctx.beginPath();
    ctx.moveTo(x, horizonY);
    ctx.lineTo(x+w, horizonY + tilt*10);
    ctx.lineTo(x+w, y+h);
    ctx.lineTo(x, y+h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle='rgba(255,255,255,.06)';
    ctx.beginPath();
    ctx.moveTo(x, horizonY);
    ctx.lineTo(x+w, horizonY + tilt*10);
    ctx.stroke();

    // altitude effect: ground dots density
    const alt01 = Math.max(0, Math.min(1, state.altitude/120));
    ctx.fillStyle='rgba(0,255,200,.08)';
    for (let i=0;i<140*(1-alt01+0.15);i++){
      const px = x + Math.random()*w;
      const py = y + h*Math.random();
      ctx.fillRect(px,py,1,1);
    }

    // drone icon
    ctx.save();
    const camCenterX = x+w/2;
    const camCenterY = y+h*0.48;
    // rotor spin blur effect by battery usage
    const spin = 8 + (1-state.battery/100)*30 + Math.abs(state.vx)*0.05;
    ctx.translate(camCenterX, camCenterY);
    ctx.rotate(tilt);

    // rotor blur circles
    for (let i=0;i<3;i++){
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle='rgba(220,255,250,.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0,0, 16+i*6, 0, Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // body
    ctx.fillStyle = state.crashed ? 'rgba(255,60,60,.95)' : 'rgba(120,220,255,.95)';
    ctx.beginPath();
    ctx.roundRect(-18,-10,36,20,6);
    ctx.fill();

    // camera view tilt warning if unstable
    if (scenarioSel.value==='hover' && state.stabilityMode==='expert') {
      // wobbly shake already via roll/pitch
      if (state.gustOn) {
        ctx.strokeStyle='rgba(255,255,255,.12)';
        ctx.beginPath();
        ctx.moveTo(-30,-30); ctx.lineTo(30,30); ctx.stroke();
      }
    }

    ctx.restore();

    // altitude meter
    ctx.fillStyle='rgba(255,255,255,.85)';
    ctx.font='14px system-ui';
    ctx.fillText(`Altitude: ${Math.round(state.altitude)} m`, x+12, y+22);
    ctx.fillText(`Battery: ${Math.round(state.battery)}%`, x+12, y+44);

    ctx.restore();
  }

  function drawHUD() {
    const {x,y,w,h} = world;
    ctx.save();
    // altitude bar
    const barX = x+12, barY = y+70, barW = w-24, barH = 14;

    // background
    ctx.fillStyle='rgba(255,255,255,.08)';
    ctx.fillRect(barX, barY, barW, barH);

    const alt01 = Math.max(0, Math.min(1, state.altitude/120));
    ctx.fillStyle = 'rgba(0,220,255,.85)';
    ctx.fillRect(barX, barY, barW*alt01, barH);

    // battery tint
    const b01 = state.battery/100;
    const battCol = b01 < 0.2 ? 'rgba(255,70,70,.95)' : 'rgba(0,255,190,.85)';
    ctx.fillStyle = battCol;
    ctx.fillRect(barX, barY+18, barW*b01, 10);

    ctx.fillStyle='rgba(255,255,255,.7)';
    ctx.font='12px system-ui';
    ctx.fillText('Altitude meter + battery level', barX, barY+38);
    ctx.restore();
  }

  function explodeAt(x,y) {
    for (let i=0;i<40;i++){
      const ang = Math.random()*Math.PI*2;
      const sp = 120 + Math.random()*160;
      addParticle(x,y,Math.cos(ang)*sp,Math.sin(ang)*sp,0.7+Math.random()*0.5,
        'rgba(255,170,70,1)', 1.5+Math.random()*3);
    }
  }

  function updateBatteryUI() {
    const b = Math.max(0, Math.min(100, state.battery));
    batteryBar.style.width = `${b}%`;
    batteryText.textContent = `${Math.round(b)}%`;
    statusPill.textContent = state.crashed ? 'CRASHED!' : (state.landed ? 'LANDED' : (b<20 ? 'LOW BATTERY' : 'OK'));
  }

  // ---------- Obstacles ----------
  function generateObstacles() {
    state.obstacles = [];
    const count = 6 + Math.floor(Math.random()*4);
    for (let i=0;i<count;i++){
      const r = 14 + Math.random()*18;
      const ox = map.x + 30 + Math.random()*(map.w-60);
      const oy = map.y + 30 + Math.random()*(map.h-60);
      // avoid spawning too close to home
      const dx = ox-state.homeX, dy = oy-state.homeY;
      if (Math.hypot(dx,dy) < 70) { i--; continue; }
      state.obstacles.push({x:ox,y:oy,r});
    }
  }

  // ---------- Physics / Control ----------
  function step(dt) {
    state.scenario = scenarioSel.value;

    // read controls each frame (simple)
    const s = scenarioSel.value;

    // global wind (used in waypoints & avoid; for hover gust is toggle)
    let windStrength = 0;

    if (s === 'hover') {
      const takeoffBtn = document.getElementById('takeoffBtn');
      // read sliders
      const hoverRange = controlsCard.querySelector('input[type="range"]');
      if (hoverRange) state.hoverTarget = Number(hoverRange.value);

      const stabSel = controlsCard.querySelector('select');
      state.stabilityMode = stabSel ? stabSel.value : 'beginner';

      const gustChk = controlsCard.querySelector('input[type="checkbox"]');
      state.gustOn = gustChk ? gustChk.checked : true;

      // takeoff button behavior
      // handled by click/press event:
      // (we just keep altitude control here)

      windStrength = 20; // base
    }

    if (s === 'waypoints') {
      const ranges = controlsCard.querySelectorAll('input[type="range"]');
      const speedRange = ranges[0];
      const windRange = ranges[1];
      const speedVal = speedRange ? Number(speedRange.value)/100 : 0.55;
      state.speed = 0.2 + speedVal*0.8;
      windStrength = windRange ? Number(windRange.value) : 0;
      const autoSel = controlsCard.querySelector('select');
      state.autoRoute = autoSel ? autoSel.value === 'true' : true;
    }

    if (s === 'avoid') {
      const ranges = controlsCard.querySelectorAll('input[type="range"]');
      // reserve is first, wind is second
      const reserveRange = ranges[0];
      const windRange = ranges[1];
      state.reserveTarget = reserveRange ? Number(reserveRange.value) : 20;
      windStrength = windRange ? Number(windRange.value) : 0;
      const sel = controlsCard.querySelector('select');
      state.autopilot = sel ? sel.value === 'true' : true;

      // if no obstacles, keep them empty until generated
    }

    // windX - convert strength to px/s on mini-map
    state.windX = (windStrength/100) * 70; // px/s drift

    // gust jitter for hover
    if (s === 'hover') {
      const gustAmt = state.gustOn ? (Math.sin(tNow()/250) + Math.random()*0.4) : 0;
      state.gust = gustAmt * (windStrength/100) * 40;
    }

    // battery drain
    // drain depends on thrust / control effort and wind
    const effort =
      (Math.abs(state.vx)+Math.abs(state.vy))*0.0008 +
      Math.abs(state.vz)*0.02 +
      (s==='avoid' && state.autopilot ? 0.06 : 0.03) +
      (windStrength/100)*0.08;

    state.battery -= (0.06 + effort)*dt*2.4;
    state.battery = Math.max(0, state.battery);

    if (state.crashed || state.landed) { stepParticles(dt); updateBatteryUI(); return; }
    if (state.battery <= 0.05) {
      // forced landing
      state.altitude -= 40*dt;
      if (state.altitude <= 0) { state.landed = true; }
      updateBatteryUI();
      stepParticles(dt);
      return;
    }

    // controls per scenario
    if (s === 'hover') {
      // takeoff button sets altitude target quickly (handled by event)
      // altitude controller:
      const err = state.hoverTarget - state.altitude;
      const kP = state.stabilityMode === 'beginner' ? 1.15 : 1.45;
      const kD = state.stabilityMode === 'beginner' ? 0.75 : 0.95;

      // gust affects lateral drift
      const wind = state.windX + state.gust;

      // altitude dynamics
      state.vz += (kP*err - kD*state.vz) * dt * 2.2;
      state.altitude += state.vz * dt;

      state.altitude = Math.max(0, Math.min(120, state.altitude));

      // lateral stability: target is homeX/homeY
      const tx = state.homeX;
      const ty = state.homeY;

      const ax = (tx - state.x) * (0.8*kP) - state.vx*kD;
      const ay = (ty - state.y) * (0.8*kP) - state.vy*kD;

      // apply wind drift
      state.vx += (ax + wind*0.18) * dt;
      state.vy += (ay + (Math.sin(tNow()/140)*0.25*wind)*dt*0.02) * dt;

      // if expert, add slightly underdamped wobble
      if (state.stabilityMode === 'expert') {
        state.roll = Math.sin(tNow()/85)*0.25 + state.vx*0.002;
        state.pitch = Math.cos(tNow()/110)*0.18 + state.vz*0.03;
      } else {
        state.roll *= 0.95; state.pitch *= 0.95;
      }

      state.x += state.vx * dt;
      state.y += state.vy * dt;

      // boundaries
      state.x = Math.max(map.x+10, Math.min(map.x+map.w-10, state.x));
      state.y = Math.max(map.y+10, Math.min(map.y+map.h-10, state.y));

      // propeller "visual" particles
      if (Math.random() < 0.4) {
        const px = state.x + (Math.random()*2-1)*4;
        const py = state.y + 12 + Math.random()*6;
        addParticle(px,py,0, -30 - Math.random()*30, 0.25 + Math.random()*0.2,
          'rgba(0,255,190,1)', 1.2 + Math.random()*1.6);
      }

    } else if (s === 'waypoints') {
      // if no waypoints, just hover at current altitude
      if (state.waypoints.length === 0) {
        // slight drift from wind
        state.vx += state.windX*0.02*dt;
        state.x += state.vx*dt;
      } else {
        const wp = state.waypoints[state.currentWP] || state.waypoints[0];
        const tx = wp.x, ty = wp.y;

        const dirX = tx - state.x;
        const dirY = ty - state.y;
        const dist = Math.hypot(dirX, dirY) + 1e-6;

        // predicted trajectory (simple forward integration)
        state.predicted = [];
        if (state.autoRoute) {
          let px = state.x, py = state.y;
          const steps = 18;
          for (let i=0;i<steps;i++){
            const ddx = (tx - px), ddy = (ty - py);
            const d2 = Math.hypot(ddx,ddy) + 1e-6;
            const ux = ddx/d2, uy = ddy/d2;
            const sp = state.speed * 85; // px/s
            px += (ux*sp + state.windX*0.25) * (dt*0.8);
            py += (uy*sp + Math.sin(tNow()/160)*state.windX*0.03) * (dt*0.8);
            state.predicted.push({x:px,y:py});
          }
        }

        // altitude control (keep in safe mid band)
        const desiredAlt = 55 + 15*Math.sin(tNow()/900);
        const errAlt = desiredAlt - state.altitude;
        state.vz += (errAlt*0.9 - state.vz*0.8) * dt;
        state.altitude += state.vz*dt;
        state.altitude = Math.max(0, Math.min(120, state.altitude));

        // movement controller
        const sp = state.speed * 85;
        const ux = dirX/dist, uy = dirY/dist;

        // if autoRoute false, use weaker correction
        const control = state.autoRoute ? 1.0 : 0.55;

        state.vx = (ux*sp + state.windX*0.35)*control;
        state.vy = (uy*sp + Math.sin(tNow()/170)*state.windX*0.08)*control;

        state.x += state.vx*dt;
        state.y += state.vy*dt;

        // waypoint acceptance radius
        if (dist < 18) {
          state.currentWP = (state.currentWP + 1) % state.waypoints.length;

          // pulse effect
          explodeAt(tx,ty);
        }
      }

      // wind trail particles
      if (Math.random()<0.25) {
        addParticle(state.x, state.y, -state.windX*0.01, 20+Math.random()*30,
          0.25+Math.random()*0.25, 'rgba(0,220,255,1)', 1.1+Math.random()*1.7);
      }

    } else if (s === 'avoid') {
      // maintain altitude around 60 until landing
      if (state.battery <= state.reserveTarget) {
        // return home and land
        const dx = state.homeX - state.x;
        const dy = state.homeY - state.y;
        const d = Math.hypot(dx,dy)+1e-6;
        const ux = dx/d, uy = dy/d;

        const sp = 65;
        state.vx = ux*sp + state.windX*0.25;
        state.vy = uy*sp + Math.sin(tNow()/140)*state.windX*0.07;

        state.altitude -= 55*dt; // descend faster
        if (state.altitude <= 0) state.landed = true;

      } else {
        // obstacle avoidance
        const desiredAlt = 70;
        const errAlt = desiredAlt - state.altitude;
        state.vz += (errAlt*1.1 - state.vz*0.8)*dt;
        state.altitude += state.vz*dt;
        state.altitude = Math.max(0, Math.min(120, state.altitude));

        // basic target: go towards a point (center) with wind drift
        const targetX = map.x + map.w*0.55;
        const targetY = map.y + map.h*0.4;

        let dx = targetX - state.x;
        let dy = targetY - state.y;
        let d = Math.hypot(dx,dy)+1e-6;
        let ux = dx/d, uy = dy/d;

        // if near obstacle -> sidestep
        let avoidVX = 0, avoidVY = 0;
        for (const o of state.obstacles) {
          const ox = state.x - o.x;
          const oy = state.y - o.y;
          const dist = Math.hypot(ox,oy)+1e-6;
          const safe = o.r + 28;
          if (dist < safe) {
            const push = (safe - dist)/safe;
            avoidVX += (ox/dist) * push * 110;
            avoidVY += (oy/dist) * push * 110;
            // collision check
            if (dist < o.r + 10) {
              state.crashed = true;
              explodeAt(state.x, state.y);
              statusPill.textContent = 'CRASHED!';
              break;
            }
          }
        }

        const sp = 70;
        const baseVX = ux*sp + state.windX*0.25;
        const baseVY = uy*sp + Math.sin(tNow()/180)*state.windX*0.08;

        if (state.autopilot) {
          state.vx = baseVX + avoidVX;
          state.vy = baseVY + avoidVY;
        } else {
          // manual mode: weaker avoidance
          state.vx = baseVX + avoidVX*0.15;
          state.vy = baseVY + avoidVY*0.15;
        }

        state.x += state.vx*dt;
        state.y += state.vy*dt;

        // bounds
        state.x = Math.max(map.x+10, Math.min(map.x+map.w-10, state.x));
        state.y = Math.max(map.y+10, Math.min(map.y+map.h-10, state.y));

        // radar ring when near obstacles
        // drawn in render (visual)
      }

      // particles
      if (Math.random()<0.3) {
        addParticle(state.x, state.y, (Math.random()*2-1)*30, -60 - Math.random()*30,
          0.25+Math.random()*0.2, 'rgba(0,255,190,1)', 1.2+Math.random()*1.8);
      }
    }

    // crash overlay decay
    stepParticles(dt);

    // readout
    updateBatteryUI();
    readout.textContent =
      `Alt: ${Math.round(state.altitude)} m\n`+
      `X,Y: ${Math.round(state.x)}, ${Math.round(state.y)}\n`+
      `WindX: ${Math.round(state.windX)} px/s\n`+
      `State: ${state.crashed ? 'CRASHED' : (state.landed ? 'LANDED' : 'FLYING')}`;
  }

  function tNow() { return performance.now(); }

  // ---------- Render ----------
  function render() {
    // clear
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // draw mini-map + world
    // bounds background
    ctx.fillStyle='rgba(0,0,0,.0)';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    drawMiniMap();

    // radar circle for avoid scenario
    if (scenarioSel.value === 'avoid' && !state.crashed) {
      // proximity radar - based on closest obstacle
      let closest = Infinity;
      for (const o of state.obstacles) {
        const d = Math.hypot(state.x-o.x, state.y-o.y);
        closest = Math.min(closest, d - o.r);
      }
      const alert = Math.max(0, Math.min(1, (80 - closest)/80));
      const rad = 28 + 90*alert;
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,70,${0.15+0.3*alert})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.x, state.y, rad, 0, Math.PI*2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,70,70,${0.04+0.08*alert})`;
      ctx.beginPath();
      ctx.arc(state.x, state.y, rad, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    drawWorldView();
    drawHUD();

    // particles overlay
    drawParticles();

    // render "camera wobble" shake if crashed
    if (state.crashed) {
      const shake = 6 + 6*Math.sin(tNow()/30);
      ctx.save();
      ctx.translate((Math.random()*2-1)*shake, (Math.random()*2-1)*shake);
      ctx.restore();
    }

    // battery UI is updated in step; but ensure if paused
    if (!running) updateBatteryUI();
    requestAnimationFrame(render);
  }

  // Takeoff button wiring
  function wireSpecialButtons() {
    const s = scenarioSel.value;
    if (s !== 'hover') return;
    const takeoffBtn = document.getElementById('takeoffBtn');
    if (!takeoffBtn) return;

    takeoffBtn.onclick = () => {
      // set altitude target and give lateral stabilization burst
      state.hoverTarget = state.hoverTarget || 50;
      // instant climb feel
      state.altitude = Math.max(state.altitude, 5);
      // spin particle burst
      explodeAt(state.x, state.y);
      statusPill.textContent = 'Taking off...';
      // climb speed bump
      state.vz += 20;
      running = running; // no change
    };
  }

  // Keep controls/events updated after rebuild
  const controlsObserver = new MutationObserver(() => wireSpecialButtons());
  controlsObserver.observe(controlsCard, { childList:true, subtree:true });

  // Obstacles generator
  function wireObstacleGenerator() {
    if (scenarioSel.value !== 'avoid') return;
    const gen = document.getElementById('genObs');
    if (!gen) return;
    gen.onclick = () => generateObstacles();
  }
  const obs2 = new MutationObserver(() => wireObstacleGenerator());
  obs2.observe(controlsCard, { childList:true, subtree:true });

  // initial wiring
  wireSpecialButtons();
  wireObstacleGenerator();

  // Main loop timing
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.033, (now - last)/1000);
    last = now;

    if (running) {
      step(dt);
    } else {
      // still animate particles slowly if any exist
      stepParticles(dt*0.6);
      // keep predicted path fresh
      if (scenarioSel.value === 'waypoints') {
        if (state.waypoints.length>0) {
          // light update: keep predicted stale
        }
      }
    }
    // also update some visuals like roll decay
    state.roll *= 0.98; state.pitch *= 0.98;

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(render);
  requestAnimationFrame(loop);
})();
