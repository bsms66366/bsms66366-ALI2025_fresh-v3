import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform, Animated, Image } from 'react-native';
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
import {
  CameraMode,
  CameraType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { AntDesign, FontAwesome } from "@expo/vector-icons";
import { Asset } from 'expo-asset';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Easing } from 'react-native';

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
  const [modelScale] = useState<[number, number, number]>([0.05, 0.05, 0.05]);
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
    
    // We'll defer material initialization until we're sure ViroMaterials is available
    // This will be checked again in onObjectLoaded
    console.log("Material initialization deferred until model loads");
    
    // Mark as initialized to prevent repeated attempts
    materialsInitialized.current = true;

    // Add a small delay to ensure ViroMaterials is initialized
    setTimeout(() => {
      try {
        if (ViroMaterials && typeof ViroMaterials.createMaterials === 'function') {
          console.log("Initializing default materials");
          ViroMaterials.createMaterials({
            defaultMaterial: {
              diffuseColor: '#F0F0F0',
              lightingModel: "Blinn",
              shininess: 0.5
            }
          });
        }
      } catch (error) {
        console.log("Error initializing default materials:", error);
      }
    }, 1000);
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
    
    // Initialize and apply materials now that the model is loaded
    try {
      // Create dynamic materials based on anatomical parts
      if (ViroMaterials && typeof ViroMaterials.createMaterials === 'function') {
        console.log("Model loaded - initializing materials");
        
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
        
        // Create all the materials now that the model is loaded
        ViroMaterials.createMaterials(materials);
        console.log("Materials initialized successfully after model load");
        
        // Log success message for debugging
        console.log("Materials applied to model via materials property");
        console.log("Material mapping: ", anatomicalParts.map((part, i) => 
          `${part.name} -> material_${i} (${part.color})`).join(', '));
      } else {
        console.warn("ViroMaterials not available or createMaterials is not a function");
      }
      
      // Register animations after model is loaded
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
        console.log("Animations registered successfully after model load");
      } else {
        console.warn("ViroAnimations not available or registerAnimations is not a function");
      }
    } catch (error) {
      console.error("Error initializing materials or animations:", error);
    }
  };

  // Handle errors
  const onError = (event: any) => {
    console.error("Error loading 3D model:", event.nativeEvent.error);
    if (global.modelLoadingState.setLoadingError) {
      global.modelLoadingState.setLoadingError(`Error loading 3D model: ${event.nativeEvent.error}`);
    }
  };

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
      
      {/* Secondary fill light */}
      <ViroDirectionalLight
        color="#ffffff"
        direction={[0, 1, -1]}
        intensity={0.5}
      />
      
      {/* Spotlight for dramatic highlighting */}
      <ViroSpotLight
        innerAngle={5}
        outerAngle={25}
        direction={[0, -1, -0.2]}
        position={[0, 3, 1]}
        color="#ffffff"
        castsShadow={true}
        intensity={0.8}
      />
      
      {/* 3D Model Node with animation */}
      <ViroNode rotation={modelRotation}>
        <Viro3DObject
          ref={modelRef}
          source={props.sceneNavigator?.viroAppProps?.modelUri ? 
            { uri: props.sceneNavigator.viroAppProps.modelUri } : 
            require('@/assets/models/larynx_with_muscles_and_ligaments.glb')}
          position={[0, 0, -0.5]} // Position the model in front of the camera
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
const UnifiedARScreen = () => {
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);
  const [showScanner, setShowScanner] = useState(true); // Start with scanner view
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const progressAnim = useRef(new Animated.Value(0)).current;
  
  // Check if we're on a real device that can support AR
  const isRealDevice = Platform.OS !== 'web' && !Platform.isTV;

  useEffect(() => {
    const getModelUri = async () => {
      try {
        setLoading(true);
        setLoadingError(null);
        
        // Add a small delay to ensure AsyncStorage is ready
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const storedModelUri = await AsyncStorage.getItem('currentModelUri');
        console.log('Retrieved model URI from storage:', storedModelUri);
        
        if (storedModelUri) {
          console.log('Setting model URI:', storedModelUri);
          setModelUri(storedModelUri);
        } else {
          // Use default model if no stored URI
          console.log('No stored model URI found, using default model');
          setModelUri('');
        }
        
        // Initialize global state handlers only once
        if (!global.modelLoadingState) {
          global.modelLoadingState = {};
        }
        
        // Set handlers
        global.modelLoadingState.setLoadingError = (error: string | null) => setLoadingError(error);
        global.modelLoadingState.setIsLoading = (isLoading: boolean) => setLoading(isLoading);
        
        setLoading(false);
      } catch (error) {
        console.error('Error getting model URI from storage:', error);
        setLoadingError('Failed to retrieve model information');
        setLoading(false);
      }
    };
    
    getModelUri();
  }, []);

  useEffect(() => {
    const getBarCodeScannerPermissions = async () => {
      try {
        if (permission?.granted !== true) {
          const permissionResult = await requestPermission();
          console.log('Camera permission result:', permissionResult.granted);
        }
      } catch (error) {
        console.error('Error requesting camera permission:', error);
      }
    };
    
    getBarCodeScannerPermissions();
  }, [permission, requestPermission]);

  useEffect(() => {
    // Cleanup function
    return () => {
      // Clear all animation frames and timers
      const animationFrameIds = Object.keys(window).filter(key => key.startsWith('__reactIdleCallback'));
      animationFrameIds.forEach(id => {
        const numId = Number(id.replace('__reactIdleCallback', ''));
        if (!isNaN(numId)) {
          cancelAnimationFrame(numId);
        }
      });
      
      // Clear global handlers
      if (global.modelLoadingState) {
        global.modelLoadingState.setLoadingError = undefined;
        global.modelLoadingState.setIsLoading = undefined;
      }
    };
  }, []);

  // Start progress animation when scanning
  useEffect(() => {
    if (scanning) {
      // Reset animation value
      progressAnim.setValue(0);
      
      // Start animation with a longer duration to give more time for loading
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 5000, // Increased from 3000 to 5000ms
        useNativeDriver: false,
        easing: Easing.linear
      }).start();
    }
  }, [scanning, progressAnim]);

  // Extract model URL from QR code data
  const extractModelUrl = (data: string): string | null => {
    try {
      // If the data is already a URL, return it
      if (data.startsWith('http') && (data.endsWith('.glb') || data.endsWith('.gltf'))) {
        return data;
      }
      
      // Try to extract URL from JSON if the QR code contains JSON data
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.url && typeof jsonData.url === 'string' && 
            (jsonData.url.endsWith('.glb') || jsonData.url.endsWith('.gltf'))) {
          return jsonData.url;
        }
      } catch (e) {
        // Not JSON data, continue with other extraction methods
      }
      
      // Try to extract URL using regex
      const urlRegex = /(https?:\/\/[^\s]+\.(?:glb|gltf))/i;
      const match = data.match(urlRegex);
      if (match && match[0]) {
        return match[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting model URL:', error);
      return null;
    }
  };

  // Save model URL to AsyncStorage
  const saveModelUrl = async (modelUrl: string): Promise<boolean> => {
    try {
      // Save the model URL
      await AsyncStorage.setItem('currentModelUri', modelUrl);
      
      // Save metadata (timestamp, etc.)
      const metadata = {
        url: modelUrl,
        timestamp: new Date().toISOString(),
        source: 'qr_scan'
      };
      
      await AsyncStorage.setItem('modelMetadata', JSON.stringify(metadata));
      
      console.log('Model URL and metadata saved to AsyncStorage:', modelUrl);
      return true;
    } catch (error) {
      console.error('Error saving model URL to AsyncStorage:', error);
      return false;
    }
  };

  // Handle QR code scanning
  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    try {
      if (scanned || scanning || !data) return;
      
      console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
      
      // Set scanned to true to prevent multiple scans
      setScanned(true);
      setScanning(true);
      setLoadingError(null);
      
      // Extract model URL from QR code data
      const modelUrl = extractModelUrl(data);
      
      if (!modelUrl) {
        setLoadingError('Invalid QR code. Please scan a valid model QR code.');
        setScanning(false);
        return;
      }
      
      console.log('Extracted model URL:', modelUrl);
      
      // Add a small delay to ensure UI updates before fetching
      await new Promise(resolve => setTimeout(resolve, 300));
      
      try {
        console.log('Fetching model from URL:', modelUrl);
        
        // Validate URL
        if (!modelUrl || !modelUrl.startsWith('http')) {
          setLoadingError('Invalid model URL');
          setScanning(false);
          return;
        }
        
        // Save model URL to AsyncStorage - do this first before any UI updates
        const saved = await saveModelUrl(modelUrl);
        
        if (!saved) {
          setLoadingError('Failed to save model information');
          setScanning(false);
          return;
        }
        
        console.log('Successfully saved model URL, loading model');
        
        // Add a delay to ensure AsyncStorage is updated before transitioning
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Important: Stop any ongoing animations before updating state
        progressAnim.stopAnimation();
        
        // Update model URI first, then hide scanner after a small delay
        setModelUri(modelUrl);
        
        // Add a delay before hiding the scanner to prevent UI transition issues
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Now it's safe to hide the scanner and stop scanning
        setShowScanner(false);
        setScanning(false);
      } catch (error) {
        console.error('Error loading model:', error);
        setLoadingError('Failed to load model. Please try again.');
        setScanning(false);
      }
    } catch (error) {
      console.error('Error in handleBarCodeScanned:', error);
      setLoadingError('An error occurred. Please try again.');
      setScanning(false);
      setScanned(false);
    }
  };

  if (!isRealDevice) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          AR is only supported on physical iOS and Android devices.
        </Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.push("/")}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // QR Scanner component
  const renderQRScanner = () => {
    // If permission is still being requested, show loading
    if (permission === null) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>Requesting camera permission...</Text>
        </View>
      );
    }
    
    // If permission was denied, show error
    if (permission?.granted === false) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>No access to camera</Text>
          <Text style={styles.subText}>Camera permission is required to scan QR codes.</Text>
          <TouchableOpacity 
            style={styles.button}
            onPress={() => requestPermission()}
          >
            <Text style={styles.buttonText}>Request Permission Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <View style={styles.camera}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={scanned && !scanning ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        >
          <View style={styles.overlay}>
            {/* QR code frame guide */}
            <View style={styles.scanArea}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
            
            {/* Instructions */}
            <Text style={styles.instructionText}>
              Position QR code within the frame
            </Text>
            
            {/* Loading indicator with progress bar */}
            {scanning && (
              <View style={styles.loadingContainer}>
                <View style={styles.progressContainer}>
                  <Animated.View 
                    style={[
                      styles.progressBar, 
                      { 
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        }) 
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.loadingText}>Processing QR code...</Text>
              </View>
            )}
            
            {/* Error message */}
            {loadingError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{loadingError}</Text>
                <TouchableOpacity 
                  style={styles.button}
                  onPress={() => {
                    setScanned(false);
                    setLoadingError(null);
                  }} 
                >
                  <Text style={styles.buttonText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Controls */}
            <View style={styles.controlsContainer}>
              {scanned && !scanning && !loadingError && (
                <TouchableOpacity 
                  style={styles.button}
                  onPress={() => setScanned(false)} 
                >
                  <Text style={styles.buttonText}>Scan Again</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => {
                  setShowScanner(false);
                  setModelUri(''); // Use default model
                }}
              >
                <FontAwesome name="arrow-left" size={24} color="white" />
                <Text style={styles.backButtonText}>Use Default Model</Text>
              </TouchableOpacity>
            </View>
          </View>
        </CameraView>
      </View>
    );
  };

  // Main AR view with controls
  return (
    <AnimationContext.Provider value={{ isAnimating, setIsAnimating }}>
      <View style={styles.container}>
        {showScanner ? (
          renderQRScanner()
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading 3D model...</Text>
          </View>
        ) : loadingError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{loadingError}</Text>
            <TouchableOpacity 
              style={styles.button}
              onPress={() => setShowScanner(true)}
            >
              <Text style={styles.buttonText}>Scan QR Code</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.button}
              onPress={() => {
                setLoadingError(null);
                setModelUri(''); // Use default model
              }}
            >
              <Text style={styles.buttonText}>Use Default Model</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ViroARSceneNavigator
              initialScene={{
                scene: ARScene as any
              }}
              viroAppProps={{ modelUri }}
              style={styles.arView}
              autofocus={true}
            />
            
            {/* Controls */}
            <View style={styles.controlsContainer}>
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={() => setShowScanner(true)}
              >
                <Text style={styles.buttonText}>Scan QR Code</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={() => setIsAnimating(!isAnimating)}
              >
                <Text style={styles.buttonText}>
                  {isAnimating ? "Pause Animation" : "Resume Animation"}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={() => router.push("/")}
              >
                <Text style={styles.buttonText}>Exit AR</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </AnimationContext.Provider>
  );
};

export default UnifiedARScreen;

const { width, height } = Dimensions.get('window');
const scanAreaSize = width * 0.35; // Reduced from 0.5 to 0.35 (30% smaller)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  arView: {
    flex: 1,
  },
  camera: {
    flex: 1,
    width: "100%",
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
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
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
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  text: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  subText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#bcba40',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: width * 0.4,
    alignItems: 'center',
    marginTop: 10,
  },
  loadingContainer: {
    padding: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 10,
  },
  progressContainer: {
    width: width * 0.7,
    height: 10,
    backgroundColor: '#333',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#bcba40',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: scanAreaSize,
    height: scanAreaSize,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#bcba40',
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#bcba40',
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#bcba40',
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#bcba40',
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
  },
});
