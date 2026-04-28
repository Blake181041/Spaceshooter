/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Award, Zap, Shield, Cpu, Github } from 'lucide-react';

// --- Constants ---
const PLAYER_SIZE = 30;
const INITIAL_SPEED = 5;
const SPEED_INCREMENT = 0.001;
const SPAWN_RATE = 0.02; // Chance per frame
const MAX_SPEED = 15;

// --- Types ---
type GameStatus = 'START' | 'PLAYING' | 'GAME_OVER';

interface Point {
  x: number;
  y: number;
}

interface Obstacle extends Point {
  id: number;
  size: number;
  speed: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
}

interface Particle extends Point {
  id: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export default function App() {
  // --- State ---
  const [status, setStatus] = useState<GameStatus>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('neon-void-highscore');
    return saved ? parseInt(saved, 10) : 0;
  });

  // --- Refs for game state (avoiding React state for 60fps loop) ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Point>({ x: 0, y: 0 });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const gameSpeedRef = useRef(INITIAL_SPEED);
  const frameIdRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimeRef = useRef<number>(0);

  // --- Utilities ---
  const spawnObstacle = useCallback((width: number) => {
    const size = 30 + Math.random() * 50;
    return {
      id: Math.random(),
      x: Math.random() * (width - size),
      y: -size,
      size,
      speed: gameSpeedRef.current * (0.8 + Math.random() * 0.4),
      color: Math.random() > 0.5 ? '#22d3ee' : '#e879f9',
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
    };
  }, []);

  const createExplosion = (x: number, y: number, color: string) => {
    const count = 20;
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random(),
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
      });
    }
  };

  const updateHighScore = useCallback((currentScore: number) => {
    if (currentScore > highScore) {
      setHighScore(currentScore);
      localStorage.setItem('neon-void-highscore', currentScore.toString());
    }
  }, [highScore]);

  // --- Game Loop ---
  const update = useCallback((time: number) => {
    if (status !== 'PLAYING') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Time handling
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    // Resize canvas to container
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        playerRef.current.y = height * 0.8;
      }
    }

    const { width, height } = canvas;

    // Update Speed
    gameSpeedRef.current = Math.min(MAX_SPEED, gameSpeedRef.current + SPEED_INCREMENT);
    setScore(prev => prev + 1);

    // Spawn obstacles
    if (Math.random() < SPAWN_RATE) {
      obstaclesRef.current.push(spawnObstacle(width));
    }

    // Clear Screen
    ctx.fillStyle = '#030303';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid (Atmosphere)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const scrollOffset = (time * 0.1) % gridSize;
    
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = scrollOffset; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Update & Draw Particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Update & Draw Obstacles
    obstaclesRef.current = obstaclesRef.current.filter(obs => obs.y < height + obs.size);
    obstaclesRef.current.forEach(obs => {
      obs.y += obs.speed;
      obs.rotation += obs.rotationSpeed;

      ctx.save();
      ctx.translate(obs.x + obs.size / 2, obs.y + obs.size / 2);
      ctx.rotate(obs.rotation);
      
      // Glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = obs.color;
      ctx.strokeStyle = obs.color;
      ctx.lineWidth = 2;
      
      ctx.strokeRect(-obs.size / 2, -obs.size / 2, obs.size, obs.size);
      
      // Inner detail
      ctx.lineWidth = 1;
      ctx.strokeRect(-obs.size / 4, -obs.size / 4, obs.size / 2, obs.size / 2);
      
      ctx.restore();

      // Collision Detection (Circle based approximation)
      const dx = (obs.x + obs.size / 2) - playerRef.current.x;
      const dy = (obs.y + obs.size / 2) - playerRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < (obs.size / 2 + PLAYER_SIZE / 2)) {
        createExplosion(playerRef.current.x, playerRef.current.y, '#ffffff');
        setStatus('GAME_OVER');
      }
    });

    // Draw Player
    ctx.save();
    ctx.translate(playerRef.current.x, playerRef.current.y);
    
    // Player Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ffffff';
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    // Delta shape craft
    ctx.moveTo(0, -PLAYER_SIZE / 2);
    ctx.lineTo(PLAYER_SIZE / 2, PLAYER_SIZE / 2);
    ctx.lineTo(0, PLAYER_SIZE / 4);
    ctx.lineTo(-PLAYER_SIZE / 2, PLAYER_SIZE / 2);
    ctx.closePath();
    ctx.fill();

    // Engine flames
    const flameSize = 10 + Math.random() * 10;
    ctx.fillStyle = '#22d3ee';
    ctx.shadowColor = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(-PLAYER_SIZE/4, PLAYER_SIZE/2);
    ctx.lineTo(0, PLAYER_SIZE/2 + flameSize);
    ctx.lineTo(PLAYER_SIZE/4, PLAYER_SIZE/2);
    ctx.fill();

    ctx.restore();

    frameIdRef.current = requestAnimationFrame(update);
  }, [status, spawnObstacle]);

  // --- Effects ---
  useEffect(() => {
    if (status === 'PLAYING') {
      frameIdRef.current = requestAnimationFrame(update);
    }
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [status, update]);

  useEffect(() => {
    if (status === 'GAME_OVER') {
      updateHighScore(score);
    }
  }, [status, score, updateHighScore]);

  // Input Handling
  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== 'PLAYING' || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    let clientX: number;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = (e as React.MouseEvent).clientX;
    }
    
    playerRef.current.x = clientX - rect.left;
  };

  const startGame = () => {
    setScore(0);
    gameSpeedRef.current = INITIAL_SPEED;
    obstaclesRef.current = [];
    particlesRef.current = [];
    lastTimeRef.current = performance.now();
    
    // Position player initially
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      playerRef.current = { x: width / 2, y: height * 0.8 };
    }
    
    setStatus('PLAYING');
  };

  return (
    <div 
      id="game-container"
      ref={containerRef}
      className="relative w-screen h-screen bg-[#030303] flex items-center justify-center overflow-hidden font-sans select-none touch-none"
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
    >
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* --- HUD --- */}
      {status === 'PLAYING' && (
        <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/40">Operational Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-display font-bold text-xl tracking-tighter">PHASE {Math.floor(gameSpeedRef.current)}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/40">Score Tracking</span>
            <span className="font-display font-extrabold text-4xl tracking-tighter tabular-nums text-white">
              {score.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* --- Overlay (Menus) --- */}
      <AnimatePresence>
        {status === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="z-10 flex flex-col items-center gap-12"
          >
            <div className="relative text-center">
              <motion.div
                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0 bg-cyan-500/20 blur-3xl -z-10"
              />
              <h1 className="font-display font-black text-7xl md:text-9xl tracking-[ -0.05em] uppercase italic leading-none drop-shadow-2xl">
                Neon<br />Void
              </h1>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Cpu size={16} className="text-cyan-400" />
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-cyan-400">Atmospheric Survival Engine 1.0</span>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startGame}
              className="group relative flex items-center gap-4 px-12 py-5 glass-morphism rounded-full overflow-hidden transition-all hover:bg-white hover:text-black"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-magenta-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Play size={24} fill="currentColor" />
              <span className="font-display font-bold text-2xl tracking-tight uppercase">Initiate Leap</span>
            </motion.button>

            <div className="flex gap-8">
              <div className="flex flex-col items-center gap-1">
                <Award size={20} className="text-white/40" />
                <span className="text-[10px] font-mono uppercase text-white/40">Record: {highScore}</span>
              </div>
            </div>
          </motion.div>
        )}

        {status === 'GAME_OVER' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="z-10 glass-morphism p-12 rounded-[40px] flex flex-col items-center gap-8 max-w-sm w-full mx-4"
          >
            <div className="text-center">
              <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-white/40">Containment Failure</span>
              <h2 className="font-display font-black text-5xl uppercase tracking-tighter mt-2">Vessel Lost</h2>
            </div>

            <div className="w-full h-px bg-white/10" />

            <div className="flex flex-col items-center gap-1 w-full">
              <span className="text-sm font-mono text-cyan-400 uppercase">Final Data Score</span>
              <span className="font-display font-black text-7xl tracking-tighter">{score.toLocaleString()}</span>
            </div>

            {score >= highScore && score > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-4 py-2 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 border border-yellow-400/30 rounded-lg flex items-center gap-2"
              >
                <Award size={16} className="text-yellow-400" />
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider italic">New System Record</span>
              </motion.div>
            )}

            <button
              onClick={startGame}
              className="w-full flex items-center justify-center gap-3 py-5 bg-white text-black rounded-2xl font-display font-bold text-xl uppercase tracking-tighter hover:bg-cyan-400 transition-colors"
            >
              <RotateCcw size={20} />
              Reboot Matrix
            </button>
            
            <button
              onClick={() => setStatus('START')}
              className="text-white/40 hover:text-white font-mono text-[10px] uppercase tracking-widest transition-colors"
            >
              Return to Terminal
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Visual Accents --- */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-[#030303] to-transparent z-0 opacity-80" />
        <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-[#030303] to-transparent z-0 opacity-80" />
      </div>

      {/* CRT Scanlines effect */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_100%),linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_100%,100%_2px,3px_100%] z-20 opacity-30" />
    </div>
  );
}
