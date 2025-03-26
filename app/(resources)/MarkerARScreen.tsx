import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform, ActivityIndicator, Image } from 'react-native';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroNode,
  Viro3DObject,
  ViroAmbientLight,
  ViroSpotLight,
  ViroDirectionalLight,
  ViroARImageMarker,
  ViroARTrackingTargets,
  ViroAnimations,
  ViroBox,
  ViroText,
} from '@reactvision/react-viro';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define proper types for ViroReact components
type ViroSceneProps = {
  sceneNavigator: {
    viroAppProps?: {
      modelUri?: string;
      markerImage?: string;
    };
  };
};

// The AR Scene component
const MarkerARScene = (props: ViroSceneProps) => {
  const [modelRotation, setModelRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [modelScale] = useState<[number, number, number]>([0.05, 0.05, 0.05]);
  const [markerFound, setMarkerFound] = useState(false);
  const modelRef = useRef<any>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());
  const animationRef = useRef<number | null>(null);
  
  // Get modelUri and markerImage from props
  const modelUri = props.sceneNavigator?.viroAppProps?.modelUri || '';
  const markerImage = props.sceneNavigator?.viroAppProps?.markerImage || '';
  
  // Register the tracking target (marker image)
  useEffect(() => {
    if (markerImage) {
      console.log('Registering tracking target with image:', markerImage);
      
      // Register the target image
      ViroARTrackingTargets.createTargets({
        "markerTarget": {
          source: { uri: markerImage },
          orientation: "Up",
          physicalWidth: 0.1 // real world width in meters - adjust as needed
        },
      });
    } else {
      // Use a default marker if none is provided
      console.log('Using default marker image');
      ViroARTrackingTargets.createTargets({
        "defaultMarker": {
          source: require('@/assets/images/ar-marker.png'),
          orientation: "Up",
          physicalWidth: 0.1 // real world width in meters - adjust as needed
        },
      });
    }
    
    // Register animations
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
    
    // Cleanup function
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [markerImage]);
  
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
      
      // Continue animation loop
      animationRef.current = requestAnimationFrame(animateModel);
    };
    
    // Start animation if marker is found
    if (markerFound) {
      console.log("Starting manual rotation animation");
      lastUpdateTimeRef.current = Date.now();
      animationRef.current = requestAnimationFrame(animateModel);
    } else {
      // If marker is lost and we have an active animation frame, cancel it
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }
  }, [markerFound]);
  
  // Handle marker found event
  const onMarkerFound = () => {
    console.log("Marker found!");
    setMarkerFound(true);
    
    // Signal to parent component that marker is found
    if (global.modelLoadingState?.setIsLoading) {
      global.modelLoadingState.setIsLoading(false);
    }
  };
  
  // Handle marker lost event
  const onMarkerLost = () => {
    console.log("Marker lost!");
    setMarkerFound(false);
  };
  
  // Handle model loaded event
  const onObjectLoaded = () => {
    console.log("3D Model loaded successfully");
  };
  
  // Handle errors
  const onError = (event: any) => {
    console.error("Error loading 3D model:", event.nativeEvent.error);
    if (global.modelLoadingState?.setLoadingError) {
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
      
      {/* Image marker */}
      <ViroARImageMarker
        target={markerImage ? "markerTarget" : "defaultMarker"}
        onAnchorFound={onMarkerFound}
        onAnchorUpdated={() => console.log("Marker updated")}
        onAnchorRemoved={onMarkerLost}
      >
        {/* 3D Model Node with animation */}
        <ViroNode rotation={modelRotation}>
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
        
        {/* Text that appears above the marker */}
        <ViroText
          text="AR Model"
          scale={[0.1, 0.1, 0.1]}
          position={[0, 0.1, 0]}
          style={{ fontFamily: 'Arial', fontSize: 20, color: '#ffffff', textAlignVertical: 'center', textAlign: 'center' }}
        />
      </ViroARImageMarker>
    </ViroARScene>
  );
};

// Main component
const MarkerARScreen = () => {
  const [showInstructions, setShowInstructions] = useState(true);
  const [arSupported, setArSupported] = useState(true);
  const [modelUri, setModelUri] = useState('');
  const [markerImage, setMarkerImage] = useState('');
  const [modelMetadata, setModelMetadata] = useState<any>(null);
  const [loadingError, setLoadingError] = useState('');
  const [markerFound, setMarkerFound] = useState(false);

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
        
        // Get marker image if available
        try {
          const storedMarkerImage = await AsyncStorage.getItem('currentMarkerImage');
          if (storedMarkerImage) {
            setMarkerImage(storedMarkerImage);
            console.log('Retrieved marker image from storage:', storedMarkerImage);
          }
        } catch (markerError) {
          console.error('Error getting marker image from storage:', markerError);
        }
        
        if (storedModelUri) {
          setModelUri(storedModelUri);
        } else {
          // Use default model if no stored URI
          console.log('No stored model URI found, using default model');
          setModelUri('');
        }
        
        // Share state setters with global scope for ARScene to access
        if (!global.modelLoadingState) {
          global.modelLoadingState = {};
        }
        global.modelLoadingState.setLoadingError = setLoadingError;
        global.modelLoadingState.setIsLoading = (isLoading: boolean) => {
          // This is a placeholder for now
          console.log('Model loading state:', isLoading ? 'loading' : 'loaded');
        };
        
      } catch (error) {
        console.error('Error getting model URI from storage:', error);
        setLoadingError('Failed to retrieve model information');
      }
    };
    getModelUri();
    
    // Hide instructions after 5 seconds
    const timer = setTimeout(() => {
      setShowInstructions(false);
    }, 5000);
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
      global.modelLoadingState.setLoadingError = undefined;
      global.modelLoadingState.setIsLoading = undefined;
    };
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
  const ARSceneWrapper = ({ modelUri, markerImage }: { modelUri: string, markerImage: string }) => {
    // Cast the scene to any to bypass TypeScript errors
    const arScene = {
      scene: MarkerARScene as any
    };

    return (
      <ViroARSceneNavigator
        initialScene={arScene}
        viroAppProps={{ modelUri, markerImage }}
        style={styles.arView}
        autofocus={true}
      />
    );
  };

  return (
    <View style={styles.container}>
      {!arSupported ? (
        <Text style={styles.errorText}>AR is not supported on this device</Text>
      ) : (
        <>
          <ARSceneWrapper modelUri={modelUri} markerImage={markerImage} />
          
          {/* Instructions overlay */}
          {showInstructions && (
            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsText}>
                Point your camera at the marker image to display the 3D model.
              </Text>
            </View>
          )}
          
          {/* Marker not found message */}
          {!markerFound && !showInstructions && (
            <View style={styles.messageOverlay}>
              <Text style={styles.messageText}>
                Looking for marker...
              </Text>
              <Text style={styles.messageSubtext}>
                Point your camera at the marker image
              </Text>
            </View>
          )}
          
          {/* Loading error message */}
          {loadingError && (
            <View style={styles.messageOverlay}>
              <Text style={styles.loadingErrorText}>{loadingError}</Text>
            </View>
          )}
        </>
      )}
      
      {/* Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={styles.controlButton}
          onPress={() => router.push("/(tabs)")}
        >
          <Text style={styles.buttonText}>Exit AR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MarkerARScreen;

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
    justifyContent: 'center',
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
