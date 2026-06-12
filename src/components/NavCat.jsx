import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';

function CatModel({ screenWidth = 8, screenHeight = 6 }) {
  const groupRef = useRef();
  const { scene, animations } = useGLTF('/oiiaioooooiai_cat.glb');
  const { actions } = useAnimations(animations, groupRef);
  const mousePos = useRef({ x: 0, y: 0 });
  const stateRef = useRef({
    x: 0,
    y: 0,
    directionX: 1,
    directionY: 1,
    speedX: Math.random() * 0.15 + 0.08,
    speedY: Math.random() * 0.15 + 0.08,
    tX: 0,
    tY: 0,
    nextDirectionChangeTimeX: Math.random() * 4 + 2,
    nextDirectionChangeTimeY: Math.random() * 4 + 2,
    currentAction: null,
    nextActionTime: Math.random() * 3 + 1,
    actionT: 0,
    scale: 3.5,
  });

  const animationNames = Object.keys(actions || {});

  useEffect(() => {
    const handleMouseMove = (e) => {
      mousePos.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

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
      s.speedX = Math.random() * 0.2 + 0.03;
      s.nextDirectionChangeTimeX = Math.random() * 4 + 1.5;
      s.tX = 0;
    }

    if (s.tY > s.nextDirectionChangeTimeY) {
      s.directionY = Math.random() > 0.5 ? 1 : -1;
      s.speedY = Math.random() * 0.2 + 0.03;
      s.nextDirectionChangeTimeY = Math.random() * 4 + 1.5;
      s.tY = 0;
    }

    if (s.actionT > s.nextActionTime && animationNames.length > 0) {
      const action = animationNames[Math.floor(Math.random() * animationNames.length)];
      if (actions[action] && actions[action] !== s.currentAction) {
        if (s.currentAction) {
          actions[s.currentAction].fadeOut(0.2);
        }
        s.currentAction = action;
        actions[action].reset().fadeIn(0.2).play();
      }
      s.nextActionTime = Math.random() * 4 + 1;
      s.actionT = 0;
    }

    if (groupRef.current) {
      groupRef.current.position.x = s.x;
      groupRef.current.position.y = s.y;
      groupRef.current.scale.set(s.scale * s.directionX, s.scale, s.scale);
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
        gl={{ alpha: true }}
        style={{
          position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none',
          background: 'transparent' }}
      >
        <ambientLight intensity={1} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <CatModel screenWidth={navWidth / 50} screenHeight={100 / 50} />
      </Canvas>
    </div>
  );
}

const GUIDE_CONTENT = `
📚 使用指南

1️⃣ 注册与登陆
   • 点击"登陆"按钮
   • 输入 1 = 注册新账号
   • 输入 2 = 用现有账号登陆
   • 输入 3 = 重置忘记的密码

2️⃣ 添加句子
   • 📚 从书籍导入：快速导入 5 本精选书籍
   • ✏️ 自行添加：粘贴文本或导入 Excel

3️⃣ 学习流程
   • 进入"✏️ 练习"页面开始背诵
   • 输入答案、查看提示、朗读
   • 给出评分：会/模糊/不会

4️⃣ 查看进度
   • "📊 仪表盘"显示学习统计
   • 连续打卡、复习进度、掌握情况

5️⃣ 数据管理
   • 💾 备份与恢复：导出和导入数据
   • 自动同步到云端，不用担心丢失

6️⃣ 其他功能
   • 修改密码：登陆后点击"登陆"→输入 1
   • 当前状态：右上角显示登陆账号和同步状态

💡 小贴士：点击小猫可以再次查看此指南！

📧 反馈邮箱：juejiangfm@gmail.com
`.trim();

export function ScreenCat() {
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setDims({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const worldWidth = dims.w / 50;
  const worldHeight = dims.h / 50;

  const handleCanvasClick = () => {
    setShowGuide(!showGuide);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas
        orthographic
        camera={{ zoom: 50, position: [0, 0, 10] }}
        gl={{ alpha: true }}
        style={{ width: '100%', height: '100%', cursor: 'pointer', background: 'transparent' }}
        onClick={handleCanvasClick}
      >
        <ambientLight intensity={1} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <CatModel screenWidth={worldWidth} screenHeight={worldHeight} />
      </Canvas>

      {showGuide && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowGuide(false)}
        >
          <div
            style={{
              background: '#0a0c14',
              border: '2px solid #7c3aed',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
              color: '#e2e8f0',
              fontSize: '13px',
              lineHeight: '1.8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {GUIDE_CONTENT}
            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
              点击外侧关闭 | 点击小猫再次打开
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
