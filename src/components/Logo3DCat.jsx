import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useRef, useEffect } from 'react';

function LogoCatModel({ screenWidth = 1.5, screenHeight = 1.5 }) {
  const groupRef = useRef();
  const { scene, animations } = useGLTF('/oiiaioooooiai_cat.glb');
  const { actions } = useAnimations(animations, groupRef);
  const stateRef = useRef({
    x: 0,
    y: 0,
    directionX: 1,
    directionY: 1,
    speedX: 0.1,
    speedY: 0.1,
    scale: 1.2,
    currentAction: null,
  });

  const animationNames = Object.keys(actions || {});

  useEffect(() => {
    if (animationNames.length > 0 && actions) {
      const action = animationNames[0];
      if (actions[action]) {
        actions[action].play();
        stateRef.current.currentAction = action;
      }
    }
  }, [animationNames, actions]);

  useFrame((state, delta) => {
    const s = stateRef.current;
    s.x += s.directionX * s.speedX * delta;
    s.y += s.directionY * s.speedY * delta;

    const boundaryX = screenWidth / 2 - 0.2;
    const boundaryY = screenHeight / 2 - 0.2;

    if (Math.abs(s.x) > boundaryX) {
      s.directionX *= -1;
    }

    if (Math.abs(s.y) > boundaryY) {
      s.directionY *= -1;
    }

    if (groupRef.current) {
      groupRef.current.position.x = s.x;
      groupRef.current.position.y = s.y;
      groupRef.current.scale.set(s.scale * s.directionX, s.scale, s.scale);
    }
  });

  return <primitive ref={groupRef} object={scene} />;
}

export default function Logo3DCat() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Canvas
        orthographic
        camera={{ zoom: 50, position: [0, 0, 10] }}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '8px',
        }}
      >
        <ambientLight intensity={1} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <LogoCatModel screenWidth={0.8} screenHeight={0.8} />
      </Canvas>
    </div>
  );
}
