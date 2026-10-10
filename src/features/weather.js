// On-demand rainfall with camera-facing world-space ribbon streaks, collision splash rings,
// drifting storm clouds (created by the main scene), and wet-material hooks.
// This is a real-time visual weather effect, not a full fluid-dynamics solver.
export function createWeatherSystem({
  THREE, scene, camera, terrainHeight, riverCenterX,
  riverStart = -34, riverEnd = 34, waterHalfWidth = 1.775, waterLevel = 0.285, mobile = false
}) {
  const group = new THREE.Group();
  group.name = 'Rainfall, drops and surface splashes';
  group.visible = false;
  scene.add(group);

  const maxDrops = mobile ? 1050 : 2800;
  const positionData = new Float32Array(maxDrops * 4 * 3);
  const indices = new Uint32Array(maxDrops * 6);
  for (let i = 0; i < maxDrops; i++) {
    const v = i * 4, ix = i * 6;
    indices[ix] = v; indices[ix + 1] = v + 2; indices[ix + 2] = v + 1;
    indices[ix + 3] = v + 1; indices[ix + 4] = v + 2; indices[ix + 5] = v + 3;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(positionData, 3).setUsage(THREE.DynamicDrawUsage));
  rainGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  rainGeometry.setDrawRange(0, 0);
  const rainMaterial = new THREE.MeshBasicMaterial({
    color: '#e8f5ff', transparent: true, opacity: 0.80,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: true, toneMapped:false
  });
  const rainMesh = new THREE.Mesh(rainGeometry, rainMaterial);
  rainMesh.name = 'Visible falling rain streaks';
  rainMesh.frustumCulled = false; rainMesh.renderOrder = 7;
  group.add(rainMesh);

  let seed = 592019;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const surfaceAt = (x, z) => Math.abs(x - riverCenterX(z)) < waterHalfWidth - 0.035
    ? waterLevel + 0.012 : terrainHeight(x, z) + 0.012;
  const drops = new Array(maxDrops);
  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);

  function writeRibbon(i, d, gust = 0, view = cameraForward) {
    const topX = d.x, topY = d.y, topZ = d.z;
    const bottomX = d.x - (d.wind + gust) * 0.062;
    const bottomY = d.y - d.len;
    const bottomZ = d.z + 0.055;
    const dx = bottomX - topX, dy = bottomY - topY, dz = bottomZ - topZ;
    let wx = dy * view.z - dz * view.y;
    let wy = dz * view.x - dx * view.z;
    let wz = dx * view.y - dy * view.x;
    let norm = Math.hypot(wx, wy, wz);
    if (norm < 1e-5) { wx = 1; wy = 0; wz = 0; norm = 1; }
    wx /= norm; wy /= norm; wz /= norm;
    const half = d.width * 0.5;
    const k = i * 12;
    positionData[k] = topX - wx * half; positionData[k + 1] = topY - wy * half; positionData[k + 2] = topZ - wz * half;
    positionData[k + 3] = topX + wx * half; positionData[k + 4] = topY + wy * half; positionData[k + 5] = topZ + wz * half;
    positionData[k + 6] = bottomX - wx * half; positionData[k + 7] = bottomY - wy * half; positionData[k + 8] = bottomZ - wz * half;
    positionData[k + 9] = bottomX + wx * half; positionData[k + 10] = bottomY + wy * half; positionData[k + 11] = bottomZ + wz * half;
  }

  function resetDrop(i, initial = false) {
    const x = -21.5 + rand() * 43, z = -22.5 + rand() * 45;
    const y = initial ? 5 + rand() * 22 : 17 + rand() * 12;
    const d = {
      x, z, y,
      len: 0.55 + rand() * 1.15,
      wind: 0.45 + rand() * 2.4,
      speed: 19 + rand() * 13,
      width: 0.009 + rand() * 0.012,
      phase: rand() * Math.PI * 2
    };
    drops[i] = d;
    writeRibbon(i, d, 0);
  }
  for (let i = 0; i < maxDrops; i++) resetDrop(i, true);
  rainGeometry.attributes.position.needsUpdate = true;

  // Fading rings for impacts on the meadow and river. Instancing keeps the effect to one draw call.
  const maxRipples = mobile ? 84 : 180;
  const rippleGeometry = new THREE.RingGeometry(0.48, 1, 18);
  rippleGeometry.rotateX(-Math.PI / 2);
  const instanceOpacity = new Float32Array(maxRipples);
  rippleGeometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(instanceOpacity, 1));
  const rippleMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    vertexShader: `attribute float instanceOpacity; varying float vOpacity;
      void main(){ vOpacity=instanceOpacity; vec4 p=vec4(position,1.0);
      #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      #endif
      gl_Position=projectionMatrix*modelViewMatrix*p; }`,
    fragmentShader: `varying float vOpacity; void main(){ gl_FragColor=vec4(0.72,0.88,0.97,vOpacity); }`
  });
  const ripples = new THREE.InstancedMesh(rippleGeometry, rippleMaterial, maxRipples);
  ripples.name = 'Rain impact rings';
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(ripples);
  const states = [];
  const dummy = new THREE.Object3D();
  let activeRippleCount = maxRipples, splashCursor = 0;
  for (let i = 0; i < maxRipples; i++) {
    const x = -30 + rand() * 60, z = -30 + rand() * 60;
    states.push({ x, z, y: surfaceAt(x, z), age: rand() * .3, duration: .34 + rand() * .35,
      phase: rand() * Math.PI * 2, base: .07 + rand() * .19, active: i < 90 });
    instanceOpacity[i] = i < 90 ? rand() * .20 : 0;
    dummy.position.set(x, surfaceAt(x, z) + .008, z);
    dummy.scale.set(.001, 1, .001); dummy.rotation.y = rand() * Math.PI * 2; dummy.updateMatrix();
    ripples.setMatrixAt(i, dummy.matrix);
  }
  rippleGeometry.attributes.instanceOpacity.needsUpdate = true;
  ripples.count = activeRippleCount;

  function burstSplash(x, z) {
    const r = states[splashCursor];
    splashCursor = (splashCursor + 1) % activeRippleCount;
    r.x = clamp(x, -34, 34); r.z = clamp(z, -34, 34);
    r.y = surfaceAt(r.x, r.z); r.age = 0;
    r.duration = .34 + rand() * .36; r.phase = rand() * Math.PI * 2;
    r.base = .07 + rand() * .20; r.active = true;
  }

  function updateRipples(dt) {
    const attr = rippleGeometry.attributes.instanceOpacity;
    for (let i = 0; i < activeRippleCount; i++) {
      const r = states[i];
      if (!r.active) { attr.array[i] = 0; continue; }
      r.age += dt;
      if (r.age >= r.duration) {
        r.active = false; attr.array[i] = 0;
        dummy.position.set(r.x, r.y + .008, r.z); dummy.scale.set(.001, 1, .001);
        dummy.rotation.y = r.phase; dummy.updateMatrix(); ripples.setMatrixAt(i, dummy.matrix); continue;
      }
      const t = r.age / r.duration;
      const radius = r.base * (.18 + t * 2.8);
      attr.array[i] = (1 - t) * .55;
      dummy.position.set(r.x, r.y + .008, r.z); dummy.scale.set(radius, 1, radius);
      dummy.rotation.y = r.phase; dummy.updateMatrix(); ripples.setMatrixAt(i, dummy.matrix);
    }
    attr.needsUpdate = true;
    ripples.instanceMatrix.needsUpdate = true;
  }

  let activeCount = maxDrops;
  function setQuality(mode) {
    activeCount = mobile ? (mode === 'performance' ? 380 : mode === 'balanced' ? 680 : 1020) : (mode === 'performance' ? 620 : mode === 'balanced' ? 1320 : 2350);
    rainGeometry.setDrawRange(0, activeCount * 6);
    rainMaterial.opacity = mode === 'performance' ? .72 : mode === 'balanced' ? .80 : .84;
    activeRippleCount = mobile ? (mode === 'performance' ? 36 : mode === 'balanced' ? 58 : maxRipples) : (mode === 'performance' ? 64 : mode === 'balanced' ? 112 : maxRipples);
    ripples.count = activeRippleCount;
    splashCursor %= activeRippleCount;
  }

  function setRain(enabled) {
    group.visible = enabled;
    if (enabled) {
      for (let i = 0; i < Math.min(95, activeRippleCount); i++) {
        const z = -26 + rand() * 52;
        const x = riverCenterX(z) + (rand() - .5) * Math.min(2.0, waterHalfWidth * 1.6);
        burstSplash(x, z);
      }
      // Starts all streaks in the visible fall zone immediately, avoiding a long empty delay.
      for (let i = 0; i < activeCount; i++) { const d=drops[i]; if (d.y < 11) d.y = 11 + rand() * 15; if(Math.abs(d.x)>22 || Math.abs(d.z)>24){d.x=-21.5+rand()*43;d.z=-22.5+rand()*45;} writeRibbon(i, d); }
      rainGeometry.attributes.position.needsUpdate = true;
    } else {
      for (const r of states) r.active = false;
      instanceOpacity.fill(0); rippleGeometry.attributes.instanceOpacity.needsUpdate = true;
    }
  }

  function update(dt, elapsed) {
    if (!group.visible) return;
    camera.getWorldDirection(cameraForward);
    for (let i = 0; i < activeCount; i++) {
      const d = drops[i], gust = Math.sin(elapsed * .8 + d.phase) * .55;
      d.y -= d.speed * dt;
      d.x += (d.wind + gust) * dt;
      d.z += (.65 + gust * .18) * dt;
      const surface = surfaceAt(d.x, d.z);
      if (d.y < surface) {
        if (rand() < .28) burstSplash(d.x, d.z);
        resetDrop(i, false);
      } else {
        writeRibbon(i, d, gust, cameraForward);
      }
    }
    rainGeometry.attributes.position.needsUpdate = true;
    updateRipples(dt);
  }

  return {
    setRain, setQuality, update,
    dispose() {
      scene.remove(group); rainGeometry.dispose(); rainMaterial.dispose();
      rippleGeometry.dispose(); rippleMaterial.dispose(); ripples.dispose();
    }
  };
}
