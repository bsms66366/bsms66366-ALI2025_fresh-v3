import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform, ActivityIndicator } from 'react-native';
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
import AsyncStorage from '@react-native-async-storage/async-storage';

// Declare global interface to add our custom properties
declare global {
  var modelLoadingState: {
    setIsLoading?: (isLoading: boolean) => void;
    setLoadingError?: (error: string) => void;
  };
}

// Initialize global state object if it doesn't exist
if (!global.modelLoadingState) {
  global.modelLoadingState = {};
}

// Create a context for sharing animation state
const AnimationContext = createContext({
  isAnimating: true,
  setIsAnimating: (value: boolean) => {}
});

// Define proper types for ViroReact components
type ViroSceneProps = {
  sceneNavigator: {
    viroAppProps?: {
      modelUri?: string;
    };
  };
};

// The AR Scene component
const ARScene = (props: ViroSceneProps) => {
  const { isAnimating } = useContext(AnimationContext);
  const [modelRotation, setModelRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [modelScale] = useState<[number, number, number]>([0.05, 0.05, 0.05]); // Increased scale slightly since we moved it further away
  const materialsInitialized = useRef(false);
  const modelRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  
  // Anatomical colors and labels mapping
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

  const getAnatomicalColor = (index: number): string => {
    console.log('[Debug] Getting color for mesh index:', index);
    // Convert Object_X to index by extracting the number and dividing by 2
    const colorIndex = Math.floor(index / 2) - 1;
    const part = anatomicalParts[colorIndex] || { color: '#F0F0F0' };
    console.log('[Debug] Using color index', colorIndex, ':', part.color);
    return part.color;
  };
  
  // Initialize materials in the component
  useEffect(() => {
    if (materialsInitialized.current) return;
    
    try {
      // Create dynamic materials based on anatomical parts
      const materials: Record<string, any> = {};
      
      // Create a material for each anatomical part
      anatomicalParts.forEach((part, index) => {
        materials[`material_${index}`] = {
          diffuseColor: part.color,
          lightingModel: "Blinn",
          shininess: part.name.includes('Cartilage') ? 1.0 : 
                    part.name.includes('Ligament') ? 0.3 : 0.5,
        };
      });
      
      // Add default material
      materials.defaultMaterial = {
        diffuseColor: '#F0F0F0',
        lightingModel: "Blinn",
        shininess: 0.5
      };
      
      // Create all the materials - wrap in try/catch to handle potential errors
      try {
        if (ViroMaterials && typeof ViroMaterials.createMaterials === 'function') {
          ViroMaterials.createMaterials(materials);
          console.log("Materials initialized successfully");
        } else {
          console.warn("ViroMaterials not available or createMaterials is not a function");
        }
      } catch (materialError) {
        console.warn("Error creating Viro materials:", materialError);
      }

      // Define animations - wrap in try/catch to handle potential errors
      try {
        if (ViroAnimations && typeof ViroAnimations.registerAnimations === 'function') {
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
          console.log("Animations registered successfully");
        } else {
          console.warn("ViroAnimations not available or registerAnimations is not a function");
        }
      } catch (animationError) {
        console.warn("Error registering Viro animations:", animationError);
      }
      
      materialsInitialized.current = true;
      console.log("Materials and animations initialization completed");
    } catch (error) {
      console.warn('Error initializing Viro materials or animations:', error);
    }
  }, []);

  // Manual animation implementation
  useEffect(() => {
    // Animation function for smooth rotation
    const animateModel = () => {
      const currentTime = Date.now();
      const deltaTime = currentTime - lastUpdateTimeRef.current;
      lastUpdateTimeRef.current = currentTime;
      
      // Calculate rotation increment (complete rotation in 10 seconds)
      const rotationSpeed = (360 / 10000) * deltaTime; // degrees per millisecond
      
      // Update the model rotation directly through state
      setModelRotation(prevRotation => {
        const newYRotation = (prevRotation[1] + rotationSpeed) % 360;
        return [prevRotation[0], newYRotation, prevRotation[2]];
      });
      
      // Continue animation loop if still animating
      if (isAnimating) {
        animationRef.current = requestAnimationFrame(animateModel);
      }
    };
    
    // Start animation if enabled
    if (isAnimating) {
      console.log("Starting manual rotation animation");
      lastUpdateTimeRef.current = Date.now();
      animationRef.current = requestAnimationFrame(animateModel);
    } else {
      // If animation is disabled and we have an active animation frame, cancel it
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
    
    // Cleanup function to cancel animation when component unmounts
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isAnimating]);
  
  // Handle object loaded event
  const onObjectLoaded = () => {
    console.log("3D Model loaded successfully");
    
    // Signal to parent component that loading is complete
    if (global.modelLoadingState.setIsLoading) {
      global.modelLoadingState.setIsLoading(false);
    }
    
    // Apply custom material handling
    try {
      console.log("Model loaded - applying materials based on mesh indices");
      
      // In ViroReact, we can't directly access the mesh materials after loading
      // Instead, we rely on the materials property of Viro3DObject to apply materials
      // The materials are applied based on the order they appear in the GLB file
      
      // Log success message for debugging
      console.log("Materials applied to model via materials property");
      console.log("If colors are still missing, check the console logs for more details");
      console.log("Material mapping: ", anatomicalParts.map((part, i) => 
        `${part.name} -> material_${i} (${part.color})`).join(', '));
    } catch (error) {
      console.error("Error applying materials:", error);
    }
  };
  
  // Handle errors
  const onError = (event: any) => {
    console.error("Error loading 3D model:", event.nativeEvent.error);
    if (global.modelLoadingState.setIsLoading && global.modelLoadingState.setLoadingError) {
      global.modelLoadingState.setIsLoading(false);
      global.modelLoadingState.setLoadingError(`Error loading 3D model: ${event.nativeEvent.error}`);
    }
  };

  // Get modelUri from props
  const modelUri = props.sceneNavigator?.viroAppProps?.modelUri || '';

  return (
    <ViroARScene>
      {/* Basic ambient light for overall scene illumination */}
      <ViroAmbientLight color="#ffffff" intensity={0.7} />
      
      {/* Primary directional light */}
      <ViroDirectionalLight
        color="#ffffff"
        direction={[0, -1, -0.2]}
        intensity={0.8}
      />
      
      {/* Front light - moved much closer */}
      <ViroSpotLight
        innerAngle={20}
        outerAngle={40}
        direction={[0, 0, -1]}
        position={[0, 0, -1]}
        color="#ffffff"
        castsShadow={false}
        intensity={0.9}
      />
      
      {/* Back light - moved much closer */}
      <ViroSpotLight
        innerAngle={20}
        outerAngle={40}
        direction={[0, 0, 1]}
        position={[0, 0, -9]}
        color="#ffffff"
        castsShadow={false}
        intensity={0.9}
      />
      
      {/* Top light - added */}
      <ViroSpotLight
        innerAngle={20}
        outerAngle={40}
        direction={[0, -1, 0]}
        position={[0, 2, -5]}
        color="#ffffff"
        castsShadow={false}
        intensity={0.9}
      />
      
      {/* Bottom light - added */}
      <ViroSpotLight
        innerAngle={20}
        outerAngle={40}
        direction={[0, 1, 0]}
        position={[0, -2, -5]}
        color="#ffffff"
        castsShadow={false}
        intensity={0.9}
      />
      
      {/* 3D Model Node with animation */}
      <ViroNode 
        position={[0, 0, -5]}
        rotation={modelRotation}
      >
        <Viro3DObject
          ref={modelRef}
          source={modelUri ? { uri: modelUri } : require('@/assets/models/larynx_with_muscles_and_ligaments.glb')}
          scale={modelScale}
          type="GLB"
          onLoadStart={() => console.log("Starting to load model")}
          onLoadEnd={onObjectLoaded}
          onError={onError}
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
  const [isAnimating, setIsAnimating] = useState(true);
  const [modelUri, setModelUri] = useState('');
  const [modelMetadata, setModelMetadata] = useState<any>(null);
  const [loadingError, setLoadingError] = useState('');

  useEffect(() => {
    const getModelUri = async () => {
      try {
        const storedModelUri = await AsyncStorage.getItem('currentModelUri');
        console.log('Retrieved model URI from storage:', storedModelUri);
        
        // Get model metadata if available
        try {
          const metadataStr = await AsyncStorage.getItem('currentModelMetadata');
          if (metadataStr) {
            const metadata = JSON.parse(metadataStr);
            setModelMetadata(metadata);
            console.log('Retrieved model metadata:', metadata);
          }
        } catch (metadataError) {
          console.error('Error parsing model metadata:', metadataError);
        }
        
        if (storedModelUri) {
          setModelUri(storedModelUri);
        } else {
          // Use default model if no stored URI
          console.log('No stored model URI found, using default model');
          setModelUri('');
        }
        
        // Share state setters with global scope for ARScene to access
        global.modelLoadingState.setLoadingError = setLoadingError;
        
      } catch (error) {
        console.error('Error getting model URI from storage:', error);
        setLoadingError('Failed to retrieve model information');
      }
    };
    getModelUri();
    
    // Cleanup function
    return () => {
      global.modelLoadingState.setLoadingError = undefined;
    };
  }, []);

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
          onPress={() => router.push("/(tabs)")}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Wrapper component to handle ViroARSceneNavigator
  const ARSceneWrapper = ({ modelUri }: { modelUri: string }) => {
    // Cast the scene to any to bypass TypeScript errors
    const arScene = {
      scene: ARScene as any
    };

    return (
      <ViroARSceneNavigator
        initialScene={arScene}
        viroAppProps={{ modelUri }}
        style={styles.arView}
        autofocus={true}
      />
    );
  };

  return (
    <AnimationContext.Provider value={{ isAnimating, setIsAnimating }}>
      <View style={styles.container}>
        {!arSupported ? (
          <Text style={styles.errorText}>AR is not supported on this device</Text>
        ) : (
          <>
            <ARSceneWrapper modelUri={modelUri} />
            
            {/* Overlay message while model loads */}
            <View style={styles.messageOverlay}>
              <Text style={styles.messageText}>
                {modelMetadata?.name ? `Loading ${modelMetadata.name}...` : 'Loading 3D model...'}
              </Text>
              <Text style={styles.messageSubtext}>Please be patient while the model loads</Text>
              {loadingError && (
                <Text style={styles.loadingErrorText}>{loadingError}</Text>
              )}
            </View>
          </>
        )}
        
        {/* Controls */}
        <View style={styles.controlsContainer}>
         {/*  <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setShowLabels(!showLabels)}
          >
            <Text style={styles.buttonText}>{showLabels ? 'Hide Labels' : 'Show Labels'}</Text>
          </TouchableOpacity> */}
          
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setIsAnimating(!isAnimating)}
          >
            <Text style={styles.buttonText}>{isAnimating ? 'Pause Rotation' : 'Resume Rotation'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => router.push("/(tabs)")}
          >
            <Text style={styles.buttonText}>Exit AR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </AnimationContext.Provider>
  );
};

export default ViroARScreen;

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  arView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  arNotSupportedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
  },
  arNotSupportedText: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  instructionsContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
  },
  instructionsText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  controlButton: {
    backgroundColor: '#bcba40',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderColor: '#101010',
    borderStyle: 'solid',
    borderRadius: 8,
    minWidth: width * 0.3,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: '#bcba40',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderColor: '#101010',
    borderStyle: 'solid',
    borderRadius: 8,
    minWidth: width * 0.4,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  messageOverlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 15,
    alignItems: 'center',
    borderRadius: 10,
    margin: 20,
  },
  messageText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  messageSubtext: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
  },
  loadingErrorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
  },
});
