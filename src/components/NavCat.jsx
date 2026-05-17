import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';

function CatModel({ screenWidth = 8, screenHeight = 6 }) {
  const groupRef = useRef();
  const { scene, animations } = useGLTF('/cat.glb');
  const { actions } = useAnimations(animations, groupRef);
  const stateRef = useRef({
    x: 0,
    y: 0,
    directionX: 1,
    directionY: 1,
    speedX: Math.random() * 0.4 + 0.3,
    speedY: Math.random() * 0.4 + 0.3,
    tX: 0,
    tY: 0,
    nextDirectionChangeTimeX: Math.random() * 3 + 2,
    nextDirectionChangeTimeY: Math.random() * 3 + 2,
    currentAction: null,
    nextActionTime: Math.random() * 4 + 1,
    actionT: 0,
  });

  const animationNames = Object.keys(actions || {});

  useFrame((state, delta) => {
    const s = stateRef.current;
    s.tX += delta;
    s.tY += delta;
    s.actionT += delta;

    s.x += s.directionX * s.speedX * delta;
    s.y += s.directionY * s.speedY * delta;

    const boundaryX = screenWidth / 2 - 0.5;
    const boundaryY = screenHeight / 2 - 0.5;

    if (Math.abs(s.x) > boundaryX) {
      s.x = Math.max(-boundaryX, Math.min(boundaryX, s.x));
      s.directionX *= -1;
    }

    if (Math.abs(s.y) > boundaryY) {
      s.y = Math.max(-boundaryY, Math.min(boundaryY, s.y));
      s.directionY *= -1;
    }

    if (s.tX > s.nextDirectionChangeTimeX) {
      s.directionX = Math.random() > 0.5 ? 1 : -1;
      s.speedX = Math.random() * 0.4 + 0.3;
      s.nextDirectionChangeTimeX = Math.random() * 3 + 2;
      s.tX = 0;
    }

    if (s.tY > s.nextDirectionChangeTimeY) {
      s.directionY = Math.random() > 0.5 ? 1 : -1;
      s.speedY = Math.random() * 0.4 + 0.3;
      s.nextDirectionChangeTimeY = Math.random() * 3 + 2;
      s.tY = 0;
    }

    if (s.actionT > s.nextActionTime && animationNames.length > 0) {
      const action = animationNames[Math.floor(Math.random() * animationNames.length)];
      if (actions[action] && actions[action] !== s.currentAction) {
        if (s.currentAction) {
          actions[s.currentAction].fadeOut(0.3);
        }
        s.currentAction = action;
        actions[action].reset().fadeIn(0.3).play();
      }
      s.nextActionTime = Math.random() * 5 + 2;
      s.actionT = 0;
    }

    if (groupRef.current) {
      groupRef.current.position.x = s.x;
      groupRef.current.position.y = s.y;
      groupRef.current.scale.x = s.directionX;
    }
  });

  return <primitive ref={groupRef} object={scene} />;
}

export default function NavCat() {
  const [navWidth, setNavWidth] = useState(400);
  const containerRef = useRef(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current?.parentElement) {
        setNavWidth(containerRef.current.parentElement.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none', overflow: 'visible' }}
    >
      <Canvas
        orthographic
        camera={{ zoom: 50, position: [0, 0, 10] }}
        style={{
          position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none'}}
      >
        <ambientLight intensity={1} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <CatModel screenWidth={navWidth / 50} screenHeight={100 / 50} />
      </Canvas>
    </div>
  );
}

export function ScreenCat() {
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const worldWidth = dims.w / 50;
  const worldHeight = dims.h / 50;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
      <Canvas
        orthographic
        camera={{ zoom: 50, position: [0, 0, 10] }}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      >
        <ambientLight intensity={1} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <CatModel screenWidth={worldWidth} screenHeight={worldHeight} />
      </Canvas>
    </div>
  );
}
