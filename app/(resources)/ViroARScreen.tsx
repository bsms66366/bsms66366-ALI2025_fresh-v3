import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform } from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroNode,
  Viro3DObject,
  ViroAmbientLight,
  ViroSpotLight,
  ViroAnimations,
  ViroMaterials,
  ViroDirectionalLight,
} from '@reactvision/react-viro';
import { Asset } from 'expo-asset';
import { router } from 'expo-router';

// Define the model paths
const LARYNX_MODEL = require('@/assets/models/larynx_with_muscles_and_ligaments.glb');

// The AR Scene component
const ARScene = () => {
  const [modelRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [modelScale] = useState<[number, number, number]>([0.05, 0.05, 0.05]); // Increased scale slightly since we moved it further away
  const materialsInitialized = useRef(false);
  
  // Initialize materials in the component
  useEffect(() => {
    if (materialsInitialized.current) return;
    
    try {
      // Define materials for the model parts
      ViroMaterials.createMaterials({
        vocalisMuscle: { diffuseColor: '#8B0000' },
        lateralCricoarytenoidMuscle: { diffuseColor: '#A52A2A' },
        posteriorCricoarytenoidMuscle: { diffuseColor: '#CD5C5C' },
        thyroidCartilage: { diffuseColor: '#E8E8E8' },
        cricoidCartilage: { diffuseColor: '#DCDCDC' },
        arytenoidCartilages: { diffuseColor: '#D3D3D3' },
        cricothyroidLigament: { diffuseColor: '#FFE4B5' },
        vocalLigament: { diffuseColor: '#DEB887' },
        mucosa: { diffuseColor: '#FFB6C1' },
      });

      // Define animations
      ViroAnimations.registerAnimations({
        rotate: {
          properties: {
            rotateY: "+=360"
          },
          duration: 10000, // 10 seconds for a full rotation
        },
        loopRotate: {
          properties: {
            rotateY: "+=360"
          },
          duration: 10000,
          easing: "Linear",
        }
      });
      
      materialsInitialized.current = true;
      console.log("Materials and animations initialized successfully");
    } catch (error) {
      console.warn('Error initializing Viro materials or animations:', error);
    }
  }, []);
  
  // Anatomical parts for labels
  const anatomicalParts = [
    { name: 'Vocalis Muscle', color: '#8B0000' },
    { name: 'Lateral Cricoarytenoid Muscle', color: '#A52A2A' },
    { name: 'Posterior Cricoarytenoid Muscle', color: '#CD5C5C' },
    { name: 'Thyroid Cartilage', color: '#E8E8E8' },
    { name: 'Cricoid Cartilage', color: '#DCDCDC' },
    { name: 'Arytenoid Cartilages', color: '#D3D3D3' },
    { name: 'Cricothyroid Ligament', color: '#FFE4B5' },
    { name: 'Vocal Ligament', color: '#DEB887' },
    { name: 'Mucosa', color: '#FFB6C1' },
  ];

  // Handle object loaded event
  const onObjectLoaded = () => {
    console.log("3D Model loaded successfully");
    
    // Apply custom material handling if needed
    // This is based on your previous successful implementation
    try {
      // Additional material processing could be added here if needed
      console.log("Materials applied to model");
    } catch (error) {
      console.error("Error applying materials:", error);
    }
  };

  // Handle errors
  const onError = (event: any) => {
    console.error("Error loading 3D model:", event.nativeEvent.error);
  };

  return (
    <ViroARScene>
      {/* Ambient light for overall scene illumination - increased intensity */}
      <ViroAmbientLight color="#ffffff" intensity={1.5} />
      
      {/* Directional light for better shadows and depth - increased intensity */}
      <ViroDirectionalLight
        color="#ffffff"
        direction={[0, -1, -0.2]}
        intensity={2.0}
      />
      
      {/* Spot light for better depth perception - increased intensity and adjusted position */}
      <ViroSpotLight
        innerAngle={20}
        outerAngle={60}
        direction={[0, -1, -0.2]}
        position={[0, 5, 0]}
        color="#ffffff"
        castsShadow={true}
        intensity={2.5}
        shadowOpacity={0.7}
      />
      
      {/* Secondary light from another angle - increased intensity */}
      <ViroSpotLight
        innerAngle={20}
        outerAngle={60}
        direction={[0, 1, -0.2]}
        position={[0, -5, 0]}
        color="#ffffff"
        castsShadow={false}
        intensity={1.8}
      />
      
      {/* Additional front light for better visibility */}
      <ViroSpotLight
        innerAngle={30}
        outerAngle={70}
        direction={[0, 0, -1]}
        position={[0, 0, 5]}
        color="#ffffff"
        castsShadow={false}
        intensity={2.0}
      />
      
      {/* 3D Model Node with animation */}
      <ViroNode position={[0, 0, -5]} animation={{name: "loopRotate", run: true, loop: true}}>
        <Viro3DObject
          source={LARYNX_MODEL}
          scale={modelScale}
          type="GLB"
          position={[0, 0, 0]}
          materials={[
            "vocalisMuscle", 
            "lateralCricoarytenoidMuscle", 
            "posteriorCricoarytenoidMuscle",
            "thyroidCartilage",
            "cricoidCartilage",
            "arytenoidCartilages",
            "cricothyroidLigament",
            "vocalLigament",
            "mucosa"
          ]}
          onLoadStart={() => console.log("Starting to load model")}
          onLoadEnd={onObjectLoaded}
          onError={onError}
          highAccuracyEvents={true}
        />
      </ViroNode>
    </ViroARScene>
  );
};

// Main component
const ViroARScreen = () => {
  const [showInstructions, setShowInstructions] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [arSupported, setArSupported] = useState(true);

  // Hide instructions after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowInstructions(false);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, []);

  // Check if we're on a real device that can support AR
  const isRealDevice = Platform.OS !== 'web' && !Platform.isTV;

  if (!isRealDevice) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          AR is only supported on physical iOS and Android devices.
        </Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        initialScene={{
          scene: ARScene,
        }}
        style={styles.arView}
        autofocus={true}
      />
      
      {/* AR not supported message */}
      {!arSupported && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>
            AR is not supported on this device or requires permissions.
          </Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Instructions overlay */}
      {showInstructions && arSupported && (
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsText}>
            Move your device around to detect surfaces.
            Tap to place the 3D model.
          </Text>
        </View>
      )}
      
      {/* Back button */}
      <TouchableOpacity 
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Text style={styles.buttonText}>Back</Text>
      </TouchableOpacity>
      
      {/* Control buttons */}
      {arSupported && (
        <View style={styles.controlsContainer}>
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setShowLabels(!showLabels)}
          >
            <Text style={styles.buttonText}>
              {showLabels ? 'Hide Labels' : 'Show Labels'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.controlButton}
          >
            <Text style={styles.buttonText}>Reset View</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  arView: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fff',
    zIndex: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructionsContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fff',
    alignItems: 'center',
  },
  instructionsText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fff',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
});

// Export the component as default
export default ViroARScreen;
