import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, Torus, Ring } from '@react-three/drei';
import { Eye, Play, Pause, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { playTwinkleSound } from '../utils/sound';

// Pre-allocated module-scope vectors to avoid GC allocations inside useFrame
const _planetWorldPos = new THREE.Vector3();
const _starToCam = new THREE.Vector3();
const _starToPlanet = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();

const STAR_CORONA_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const STAR_CORONA_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform vec3 glowColor;
  void main() {
    float rim = pow(max(0.0, 1.0 - dot(vNormal, vViewDir)), 2.1);
    gl_FragColor = vec4(glowColor, rim * 0.72);
  }
`;

const ATMOSPHERE_FRESNEL_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const ATMOSPHERE_FRESNEL_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform vec3 rimColor;
  void main() {
    float fresnel = pow(max(0.0, 1.0 - dot(vNormal, vViewDir)), 2.25);
    gl_FragColor = vec4(rimColor, fresnel * 0.92);
  }
`;

function detectSoftwareWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createProceduralStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#fde047');
  grad.addColorStop(0.5, '#facc15');
  grad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % 512;
    const y = (i * 41) % 256;
    const r = 4 + (i % 14);
    ctx.fillStyle =
      i % 5 === 0
        ? 'rgba(254, 249, 195, 0.45)'
        : 'rgba(217, 119, 6, 0.28)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createProceduralRockyPlanetTexture(regime) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (regime === 'binary') {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#fb923c');
    grad.addColorStop(0.5, '#ea580c');
    grad.addColorStop(1, '#9a3412');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(254, 215, 170, 0.35)' : 'rgba(124, 45, 18, 0.35)';
      ctx.beginPath();
      ctx.arc((i * 89) % 512, (i * 53) % 256, 6 + (i % 10), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Rocky cratered Super-Earth / terrestrial exoplanet surface with silicate continents & polar caps
    const baseGrad = ctx.createLinearGradient(0, 0, 0, 256);
    baseGrad.addColorStop(0, '#1e293b');
    baseGrad.addColorStop(0.22, '#0c4a6e');
    baseGrad.addColorStop(0.5, '#155e75');
    baseGrad.addColorStop(0.78, '#0c4a6e');
    baseGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 256);

    for (let i = 0; i < 220; i++) {
      const cx = (i * 97) % 512;
      const cy = 22 + ((i * 61) % 212);
      const r = 7 + (i % 22);
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(20, 184, 166, 0.46)'
          : 'rgba(148, 163, 184, 0.44)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Polar ice caps
    ctx.fillStyle = 'rgba(241, 245, 249, 0.75)';
    ctx.fillRect(0, 0, 512, 16);
    ctx.fillRect(0, 240, 512, 16);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Software WebGL safe frame pacer: ensures @react-three/fiber renders immediately
 * on mount and paces frames via fenceSync on CPU-bound software WebGL (SwiftShader/llvmpipe)
 * so headless browsers never starve the main event loop.
 */
function SoftwareGlFramePacer({ enabled }) {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    invalidate();
    if (!enabled) return undefined;

    let timerId = 0;
    let isDisposed = false;

    const scheduleNext = () => {
      if (isDisposed) return;
      const ctx = gl.getContext();
      const sync =
        ctx && ctx.fenceSync ? ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (ctx && ctx.flush) ctx.flush();

      const poll = () => {
        if (isDisposed) return;
        const status = sync && ctx ? ctx.getSyncParameter(sync, ctx.SYNC_STATUS) : null;
        if (ctx && status === ctx.UNSIGNALED) {
          timerId = window.setTimeout(poll, 6);
        } else {
          if (sync && ctx) ctx.deleteSync(sync);
          timerId = window.setTimeout(() => {
            if (!isDisposed) {
              invalidate();
              scheduleNext();
            }
          }, 85);
        }
      };

      timerId = window.setTimeout(poll, 6);
    };

    scheduleNext();

    return () => {
      isDisposed = true;
      window.clearTimeout(timerId);
    };
  }, [enabled, gl, invalidate]);

  return null;
}

/**
 * 3D Orbital Transit Scene rendered inside @react-three/fiber <Canvas>
 * using @react-three/drei primitives (Stars, Sphere, Torus, Ring, OrbitControls).
 */
function OrbitalTransitScene({
  planetRegime,
  planetRadiusEarth,
  maxAttenuationPct,
  cameraPreset,
  orbitPaused,
  orbitSpeed,
  userInteractingRef,
  isSoftwareGl,
  onTransitTelemetryChange,
}) {
  const hostStarRef = useRef(null);
  const planetGroupRef = useRef(null);
  const controlsRef = useRef(null);
  const orbitalAngleRef = useRef(0.14); // Start near transit chord so occultation is immediately visible
  const lastTimeRef = useRef(performance.now());
  const lastReportRef = useRef({ inTransit: null, atten: -1 });

  const starRadius = 1.45;
  const orbitRadiusX = 3.9;
  const orbitRadiusZ = 3.65;

  const bodyRadius = useMemo(() => {
    if (planetRegime === 'binary') return 0.64;
    if (planetRegime === 'gas') return 0.42;
    return Math.max(0.26, Math.min(0.36, 0.21 + Math.sqrt(planetRadiusEarth) * 0.065));
  }, [planetRegime, planetRadiusEarth]);

  const starTexture = useMemo(() => createProceduralStarTexture(), []);
  const planetTexture = useMemo(
    () => createProceduralRockyPlanetTexture(planetRegime),
    [planetRegime]
  );

  useEffect(() => {
    return () => {
      starTexture.dispose();
    };
  }, [starTexture]);

  useEffect(() => {
    return () => {
      planetTexture.dispose();
    };
  }, [planetTexture]);

  const coronaUniforms = useMemo(
    () => ({
      glowColor: { value: new THREE.Color(0xfbbf24) },
    }),
    []
  );

  const atmosphereUniforms = useMemo(
    () => ({
      rimColor: {
        value:
          planetRegime === 'binary'
            ? new THREE.Color(0xf97316)
            : new THREE.Color(0x38bdf8),
      },
    }),
    [planetRegime]
  );

  useFrame(({ camera }) => {
    const nowMs = performance.now();
    const dt = Math.min(Math.max(0.008, (nowMs - lastTimeRef.current) / 1000), 0.1);
    lastTimeRef.current = nowMs;

    if (hostStarRef.current) {
      hostStarRef.current.rotation.y += dt * 0.22;
    }

    if (!orbitPaused) {
      orbitalAngleRef.current += dt * 0.52 * orbitSpeed;
      if (orbitalAngleRef.current > Math.PI * 2) {
        orbitalAngleRef.current -= Math.PI * 2;
      }
    }

    const px = Math.sin(orbitalAngleRef.current) * orbitRadiusX;
    const pz = Math.cos(orbitalAngleRef.current) * orbitRadiusZ;

    if (planetGroupRef.current) {
      planetGroupRef.current.position.set(px, 0, pz);
      planetGroupRef.current.rotation.y += dt * 0.85;
    }

    // Smooth camera preset damping when user is not manually dragging OrbitControls
    if (!userInteractingRef.current && controlsRef.current) {
      if (cameraPreset === 'transit') {
        _targetCamPos.set(0, 0.28, 8.9);
        _targetLookAt.set(0, -0.35, 0);
      } else if (cameraPreset === 'closeup' && planetGroupRef.current) {
        _planetWorldPos.copy(planetGroupRef.current.position);
        _targetCamPos.set(
          _planetWorldPos.x + 1.35,
          0.55,
          _planetWorldPos.z + 1.75
        );
        _targetLookAt.copy(_planetWorldPos);
      } else {
        _targetCamPos.set(0, 2.35, 9.2);
        _targetLookAt.set(0, -0.45, 0);
      }
      const dampFactor = 1 - Math.exp(-4.5 * dt);
      camera.position.lerp(_targetCamPos, dampFactor);
      controlsRef.current.target.lerp(_targetLookAt, dampFactor);
      controlsRef.current.update();
    }

    // Camera-perspective transit occultation & live flux attenuation calculation
    if (planetGroupRef.current) {
      _starToCam.copy(camera.position).normalize();
      _starToPlanet.copy(planetGroupRef.current.position);
      const alongCamDepth = _starToPlanet.dot(_starToCam);
      _projVec.copy(_starToCam).multiplyScalar(alongCamDepth);
      const impactDist = _starToPlanet.sub(_projVec).length();

      const occultationThreshold = starRadius + bodyRadius * 0.75;
      const isPassingInFront =
        alongCamDepth > 0 && impactDist < occultationThreshold;

      let currentAtten = 0;
      if (isPassingInFront) {
        const chordFactor = Math.max(
          0,
          1 - Math.pow(impactDist / occultationThreshold, 2)
        );
        currentAtten = Number(
          (maxAttenuationPct * Math.sqrt(chordFactor)).toFixed(4)
        );
      }

      if (
        isPassingInFront !== lastReportRef.current.inTransit ||
        Math.abs(currentAtten - lastReportRef.current.atten) > 0.0005
      ) {
        lastReportRef.current.inTransit = isPassingInFront;
        lastReportRef.current.atten = currentAtten;
        onTransitTelemetryChange(isPassingInFront, currentAtten);
      }
    }
  });

  return (
    <>
      <color attach="background" args={['#030712']} />
      <fogExp2 attach="fog" args={['#030712', 0.015]} />

      {/* Lighting Rig */}
      <ambientLight intensity={0.58} />
      <hemisphereLight args={[0x38bdf8, 0x090d16, 0.85]} />
      <pointLight position={[0, 0, 0]} color={0xfef08a} intensity={5.2} distance={42} decay={1.1} />
      <directionalLight position={[-6, 5, 5]} color={0x22d3ee} intensity={1.45} />

      {/* @react-three/drei Starry Background Particle Field (2,000 twinkling points) */}
      <Stars
        radius={42}
        depth={36}
        count={2000}
        factor={3.4}
        saturation={0.35}
        fade
        speed={0.9}
      />

      {/* Host Star with Warm Emissive Surface + Fresnel Corona Glow + Solar Flare Ring */}
      <group ref={hostStarRef}>
        <Sphere args={[starRadius, 48, 32]}>
          <meshStandardMaterial
            map={starTexture}
            emissive="#fbbf24"
            emissiveMap={starTexture}
            emissiveIntensity={1.65}
            roughness={0.28}
            metalness={0.05}
          />
        </Sphere>

        <Sphere args={[starRadius * 1.18, 36, 24]}>
          <shaderMaterial
            uniforms={coronaUniforms}
            vertexShader={STAR_CORONA_VERTEX_SHADER}
            fragmentShader={STAR_CORONA_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </Sphere>

        <Torus args={[starRadius * 1.24, 0.022, 12, 64]} rotation={[Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color="#fde047" transparent opacity={0.32} />
        </Torus>
      </group>

      {/* Elliptical Orbital Path Track */}
      <Torus
        args={[orbitRadiusX, 0.015, 10, 96]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, orbitRadiusZ / orbitRadiusX, 1]}
      >
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.36} />
      </Torus>

      {/* Orbiting Rocky Exoplanet + Outer Atmospheric Fresnel Glow Mesh */}
      <group ref={planetGroupRef} position={[Math.sin(0.14) * orbitRadiusX, 0, Math.cos(0.14) * orbitRadiusZ]}>
        {/* Rocky / Exoplanet Core Sphere */}
        <Sphere args={[bodyRadius, 40, 28]}>
          <meshPhysicalMaterial
            map={planetTexture}
            roughness={planetRegime === 'rocky' ? 0.74 : 0.42}
            metalness={planetRegime === 'rocky' ? 0.2 : 0.06}
            clearcoat={0.22}
            emissive={planetRegime === 'binary' ? '#ea580c' : '#082f49'}
            emissiveIntensity={planetRegime === 'binary' ? 0.9 : 0.18}
          />
        </Sphere>

        {/* Outer Atmospheric Rim Glow Mesh (Fresnel Shader) */}
        <Sphere args={[bodyRadius * 1.2, 32, 24]} renderOrder={2}>
          <shaderMaterial
            uniforms={atmosphereUniforms}
            vertexShader={ATMOSPHERE_FRESNEL_VERTEX_SHADER}
            fragmentShader={ATMOSPHERE_FRESNEL_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </Sphere>

        {/* Orbital Accretion / Telemetry Ring */}
        <Ring
          args={[
            bodyRadius * 1.4,
            bodyRadius * (planetRegime === 'gas' ? 2.1 : 1.62),
            48,
          ]}
          rotation={[Math.PI / 2.25, 0.2, 0]}
        >
          <meshStandardMaterial
            color={planetRegime === 'binary' ? '#fb923c' : '#38bdf8'}
            side={THREE.DoubleSide}
            transparent
            opacity={planetRegime === 'gas' ? 0.54 : 0.26}
            roughness={0.4}
            metalness={0.3}
            depthWrite={false}
          />
        </Ring>
      </group>

      {/* @react-three/drei Responsive OrbitControls with Damping */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!isSoftwareGl}
        dampingFactor={0.055}
        enablePan
        enableZoom
        minDistance={2.6}
        maxDistance={17}
        onStart={() => {
          userInteractingRef.current = true;
        }}
      />

      <SoftwareGlFramePacer enabled={isSoftwareGl} />
    </>
  );
}

export const ExoplanetTransitViewer = ({
  features,
  prediction,
  activeSampleMeta,
  metrics,
}) => {
  const [cameraPreset, setCameraPreset] = useState('transit');
  const [orbitPaused, setOrbitPaused] = useState(false);
  const [orbitSpeed, setOrbitSpeed] = useState(1);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isTransitingNow, setIsTransitingNow] = useState(true);
  const [liveAttenuationPct, setLiveAttenuationPct] = useState(() =>
    Number((features?.transitDepthPercent || 0.1789).toFixed(4))
  );

  const userInteractingRef = useRef(false);
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);

  const isBinary =
    Boolean(features?.secondaryEclipseDetected) ||
    (metrics?.planetRadiusEarth ?? 1.5) >= 20;
  const planetRegime = isBinary
    ? 'binary'
    : (metrics?.planetRadiusEarth ?? 1.5) >= 2.2
    ? 'gas'
    : 'rocky';

  const targetDisplayName = activeSampleMeta
    ? `${activeSampleMeta.koiId.toUpperCase()} [3D VIZ]`
    : 'KEPLER-452b [3D VIZ]';

  const maxAttenuationPct = Math.max(
    0.045,
    Number((features?.transitDepthPercent || 0.1789).toFixed(4))
  );

  const handleTransitTelemetryChange = (inTransit, attenPct) => {
    setIsTransitingNow(inTransit);
    setLiveAttenuationPct(attenPct);
  };

  return (
    <div
      data-testid="three-exoplanet-viewer"
      className="xl:col-span-7 cyber-glass spring-enter-1 rounded-lg p-4 flex flex-col justify-between gap-3 relative"
    >
      {/* Top Header with Target Name & Dynamic System Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400">
            <span data-testid="three-target-badge">{targetDisplayName}</span>
            <span className="text-slate-600">·</span>
            <span className="text-amber-300">
              {planetRegime === 'binary'
                ? 'ECLIPSING BINARY PAIR'
                : planetRegime === 'gas'
                ? 'GAS GIANT / SUB-NEPTUNE'
                : 'ROCKY TERRESTRIAL WORLD'}
            </span>
          </div>
          <h3 className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              3D Exoplanet & Host Star Transit Simulation —{' '}
              {activeSampleMeta?.name ?? 'Kepler-452b'}
            </span>
          </h3>
        </div>

        {/* Dynamic System Status Badge: TRANSIT IN PROGRESS vs STELLAR FLUX NOMINAL */}
        <div
          data-testid="three-system-status"
          className={`text-[10px] font-mono font-semibold px-2.5 py-1 rounded border ${
            isTransitingNow
              ? 'bg-amber-950/80 border-amber-400/60 text-amber-300'
              : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
          }`}
        >
          {isTransitingNow ? 'TRANSIT IN PROGRESS' : 'STELLAR FLUX NOMINAL'}
        </div>
      </div>

      {/* 3D Viewport Container with Real-Time Transit Telemetry HUD & Collapsible Bottom Dock */}
      <div className="relative w-full h-[290px] bg-[#030712] border border-cyan-500/20 rounded-md overflow-hidden">
        {/* Corner Bracket Reticles */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2 w-3 h-3 border-t border-l border-cyan-400/60 z-10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-2 w-3 h-3 border-t border-r border-cyan-400/60 z-10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-2 w-3 h-3 border-b border-l border-cyan-400/60 z-10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 right-2 w-3 h-3 border-b border-r border-cyan-400/60 z-10"
        />

        {/* Real-Time Transit Telemetry HUD Overlay */}
        <div
          data-testid="three-telemetry-hud-overlay"
          className="pointer-events-none absolute top-2.5 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-300"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span>
              TARGET: <strong className="text-cyan-300">{targetDisplayName}</strong>
            </span>
            <span>
              RADIUS:{' '}
              <strong className="text-slate-100">
                {metrics?.planetRadiusEarth ?? 1.6} R⊕
              </strong>
            </span>
            <span>
              TEMP:{' '}
              <strong className="text-amber-300">
                {metrics?.equilibriumTempK ?? 265} K
              </strong>
            </span>
          </div>

          <div
            data-testid="live-flux-attenuation"
            className="bg-[#070b14] border border-slate-800 px-2 py-0.5 rounded text-[10px] font-mono"
          >
            FLUX ATTENUATION:{' '}
            <strong
              className={
                liveAttenuationPct > 0 ? 'text-amber-300' : 'text-emerald-300'
              }
            >
              {liveAttenuationPct > 0
                ? `-${liveAttenuationPct.toFixed(4)}%`
                : '0.0000%'}
            </strong>
          </div>
        </div>

        {/* @react-three/fiber + @react-three/drei WebGL Canvas */}
        <div data-testid="three-canvas-mount" className="w-full h-full">
          <Canvas
            frameloop={isSoftwareGl ? 'demand' : 'always'}
            dpr={isSoftwareGl ? 1 : [1, 2]}
            camera={{ position: [0, 0.28, 8.9], fov: 40, near: 0.1, far: 220 }}
            gl={{
              antialias: !isSoftwareGl,
              preserveDrawingBuffer: true,
              powerPreference: 'high-performance',
            }}
          >
            <OrbitalTransitScene
              planetRegime={planetRegime}
              planetRadiusEarth={metrics?.planetRadiusEarth ?? 1.6}
              maxAttenuationPct={maxAttenuationPct}
              cameraPreset={cameraPreset}
              orbitPaused={orbitPaused}
              orbitSpeed={orbitSpeed}
              userInteractingRef={userInteractingRef}
              isSoftwareGl={isSoftwareGl}
              onTransitTelemetryChange={handleTransitTelemetryChange}
            />
          </Canvas>
        </div>

        {/* Unified Collapsible Bottom Control Dock */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[96%] w-auto">
          <button
            type="button"
            onClick={() => {
              playTwinkleSound('toggle');
              setDockCollapsed((prev) => !prev);
            }}
            className="px-2 py-0.5 text-[9px] font-mono bg-[#070b14] text-slate-300 hover:text-cyan-300 border border-slate-800 rounded-t flex items-center gap-1"
          >
            <span>{dockCollapsed ? 'Show Controls' : 'Hide Controls'}</span>
            {dockCollapsed ? (
              <ChevronUp className="w-2.5 h-2.5 text-cyan-400" />
            ) : (
              <ChevronDown className="w-2.5 h-2.5 text-cyan-400" />
            )}
          </button>

          {!dockCollapsed && (
            <div
              data-testid="three-bottom-dock"
              className="bg-[#070b14] border border-slate-800 rounded px-2 py-1 flex items-center justify-center gap-1.5 text-[10px] font-mono whitespace-nowrap"
            >
              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  userInteractingRef.current = false;
                  setCameraPreset('transit');
                }}
                className={`px-1.5 py-0.5 rounded border transition-colors ${
                  cameraPreset === 'transit'
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Edge-On
              </button>
              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  userInteractingRef.current = false;
                  setCameraPreset('oblique');
                }}
                className={`px-1.5 py-0.5 rounded border transition-colors ${
                  cameraPreset === 'oblique'
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Orbital
              </button>
              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  userInteractingRef.current = false;
                  setCameraPreset('closeup');
                }}
                className={`px-1.5 py-0.5 rounded border transition-colors ${
                  cameraPreset === 'closeup'
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                Planet
              </button>

              <span aria-hidden="true" className="text-slate-700">
                |
              </span>

              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  setOrbitSpeed((s) => (s === 1 ? 2 : 1));
                }}
                className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700"
              >
                {orbitSpeed}x
              </button>

              <button
                type="button"
                data-testid="three-pause-resume-button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  setOrbitPaused((p) => !p);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800 hover:border-slate-700"
              >
                {orbitPaused ? (
                  <>
                    <Play className="w-2.5 h-2.5" />
                    <span>Resume Orbit</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-2.5 h-2.5" />
                    <span>Pause Orbit</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  playTwinkleSound('toggle');
                  userInteractingRef.current = false;
                  setCameraPreset('transit');
                }}
                title="Reset Camera"
                className="p-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 hover:text-cyan-300"
              >
                <RotateCcw className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
        <span>
          [TELEMETRY // TARGET: {activeSampleMeta?.koiId ?? 'KEPLER-452b'} // SNR:{' '}
          {features?.snrProxy ?? 40.5}×]
        </span>
        <span className="text-cyan-300">
          {prediction?.predictedClass === 'Planet candidate'
            ? '● 3D Planetary Twin Synchronized'
            : '▲ 3D False-Positive Twin Synchronized'}
        </span>
      </div>
    </div>
  );
};

export default ExoplanetTransitViewer;
