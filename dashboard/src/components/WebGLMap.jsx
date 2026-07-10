import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Box, Sphere } from '@react-three/drei';

function Rack({ position, rackId, selectedRack, setSelectedRack, rackData }) {
  const isSelected = selectedRack === rackId;
  const isHot = rackData && rackData.temperature_c > 28.0;
  const acOn = rackData && rackData.ac_on;

  const color = isHot ? '#ef4444' : isSelected ? '#3b82f6' : '#1e293b';
  
  return (
    <group position={position} onClick={() => setSelectedRack(rackId)}>
      <Box args={[1, 2.5, 1]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.5} />
      </Box>
      <Text
        position={[0, 1.5, 0.51]}
        fontSize={0.2}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {rackId.replace('_', ' ').toUpperCase()}
      </Text>
      <Text
        position={[0, 1.2, 0.51]}
        fontSize={0.2}
        color={isHot ? "#ef4444" : "#10b981"}
        anchorX="center"
        anchorY="middle"
      >
        {rackData ? `${rackData.temperature_c.toFixed(1)}°C` : '--°C'}
      </Text>
      
      {/* Visual AC Fan representation */}
      {acOn && (
        <mesh position={[0, -0.8, 0.52]}>
          <planeGeometry args={[0.5, 0.5]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
      )}
    </group>
  );
}

export default function WebGLMap({ telemetry, selectedRack, setSelectedRack }) {
  return (
    <div style={{ width: '100%', height: '300px', borderRadius: '12px', overflow: 'hidden', background: '#0f172a' }}>
      <Canvas shadows camera={{ position: [0, 5, 8], fov: 40 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
        <pointLight position={[-5, 5, -5]} intensity={0.5} color="#3b82f6" />
        
        <Rack 
          position={[-2, 0, 0]} 
          rackId="rack_A" 
          selectedRack={selectedRack} 
          setSelectedRack={setSelectedRack} 
          rackData={telemetry['rack_A']} 
        />
        <Rack 
          position={[0, 0, 0]} 
          rackId="rack_B" 
          selectedRack={selectedRack} 
          setSelectedRack={setSelectedRack} 
          rackData={telemetry['rack_B']} 
        />
        <Rack 
          position={[2, 0, 0]} 
          rackId="rack_C" 
          selectedRack={selectedRack} 
          setSelectedRack={setSelectedRack} 
          rackData={telemetry['rack_C']} 
        />

        {/* Floor */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.25, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#020617" roughness={0.8} />
        </mesh>
        
        <OrbitControls 
          enablePan={false} 
          minPolarAngle={Math.PI / 6} 
          maxPolarAngle={Math.PI / 2.5} 
          minDistance={5} 
          maxDistance={12} 
        />
      </Canvas>
    </div>
  );
}
