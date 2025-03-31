import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
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
import * as FileSystem from 'expo-file-system';
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

// AR Scene component - simplified version
const ARScene = (props: any) => {
  const [modelRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [modelScale] = useState<[number, number, number]>([0.05, 0.05, 0.05]);
  const [modelLoaded, setModelLoaded] = useState(false);
  const modelUri = props.arSceneNavigator?.viroAppProps?.modelUri || '';
  
  // Safe material creation function
  const safeCreateMaterials = useCallback(() => {
    if (!modelLoaded) return;
    
    console.log('Model loaded, initializing materials');
    
    // Check if ViroMaterials is available
    if (typeof ViroMaterials !== 'undefined' && ViroMaterials !== null) {
      try {
        // Use a timeout to ensure ViroMaterials is fully initialized
        const timeoutId = setTimeout(() => {
          try {
            // Create a simple material set for testing
            ViroMaterials.createMaterials({
              defaultMaterial: {
                lightingModel: "Blinn",
                diffuseColor: '#FFFFFF',
                shininess: 0.5,
              }
            });
            console.log('Materials created successfully');
          } catch (error) {
            console.error('Error creating materials:', error);
          }
        }, 500);
        
        // Cleanup function to prevent memory leaks
        return () => clearTimeout(timeoutId);
      } catch (error) {
        console.error('Error in safeCreateMaterials:', error);
      }
    } else {
      console.warn('ViroMaterials not available yet');
    }
  }, [modelLoaded]);
  
  // Initialize materials after model is loaded
  useEffect(() => {
    if (modelLoaded) {
      safeCreateMaterials();
    }
  }, [modelLoaded, safeCreateMaterials]);
  
  // Handle model load events
  const onLoadStart = () => {
    console.log('Model load started');
    setModelLoaded(false);
    if (global.modelLoadingState?.setIsLoading) {
      global.modelLoadingState.setIsLoading(true);
    }
  };
  
  const onLoadEnd = () => {
    console.log('Model load completed');
    setModelLoaded(true);
    if (global.modelLoadingState?.setIsLoading) {
      global.modelLoadingState.setIsLoading(false);
    }
  };
  
  const onError = (event: any) => {
    console.error('Error loading model:', event);
    if (global.modelLoadingState?.setLoadingError) {
      global.modelLoadingState.setLoadingError('Failed to load 3D model');
    }
  };

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" intensity={200} />
      <ViroSpotLight
        innerAngle={5}
        outerAngle={25}
        direction={[0, -1, -0.2]}
        position={[0, 3, 1]}
        color="#ffffff"
        castsShadow={true}
        shadowMapSize={2048}
        shadowNearZ={2}
        shadowFarZ={5}
        shadowOpacity={0.7}
      />
      
      <ViroNode position={[0, 0, 0]} dragType="FixedToWorld">
        <Viro3DObject
          source={modelUri ? { uri: modelUri } : require('@/assets/models/larynx_with_muscles_and_ligaments.glb')}
          position={[0, 0, -0.5]}
          scale={modelScale}
          rotation={modelRotation}
          type="GLB"
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
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
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  
  // Check if we're on a real device that can support AR
  const isRealDevice = Platform.OS !== 'web' && !Platform.isTV;

  // Validate and potentially download the model
  const validateAndPrepareModel = async (uri: string): Promise<string> => {
    try {
      console.log('Validating model URI:', uri);
      
      // Check if the URI is valid
      if (!uri || typeof uri !== 'string') {
        throw new Error('Invalid model URI');
      }
      
      // If it's a local file URI, verify it exists
      if (uri.startsWith('file://')) {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists) {
          throw new Error('Local model file not found');
        }
        return uri;
      }
      
      // For remote URIs, consider downloading them first
      if (uri.startsWith('http')) {
        // Create a local filename based on the URL
        const filename = uri.split('/').pop() || 'model.glb';
        const localUri = `${FileSystem.documentDirectory}models/${filename}`;
        
        // Create directory if it doesn't exist
        const modelDir = `${FileSystem.documentDirectory}models/`;
        const dirInfo = await FileSystem.getInfoAsync(modelDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
        }
        
        // Check if we already have this file cached
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists) {
          console.log('Using cached model file:', localUri);
          return localUri;
        }
        
        // Download the file
        console.log('Downloading model to cache:', uri);
        setIsDownloading(true);
        
        const downloadResumable = FileSystem.createDownloadResumable(
          uri,
          localUri,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setDownloadProgress(progress);
          }
        );
        
        const result = await downloadResumable.downloadAsync();
        setIsDownloading(false);
        
        if (result && result.uri) {
          console.log('Model downloaded successfully:', result.uri);
          return result.uri;
        } else {
          // If download fails, fall back to the remote URI
          console.warn('Download failed, falling back to remote URI');
          return uri;
        }
      }
      
      // If it's neither a file:// nor http(s):// URI, return as is
      return uri;
    } catch (error) {
      console.error('Error validating model:', error);
      // Fall back to the original URI
      return uri;
    }
  };

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
          
          // Validate and prepare the model before setting it
          const preparedUri = await validateAndPrepareModel(storedModelUri);
          setModelUri(preparedUri);
          
          // Hide scanner since we have a valid model
          setShowScanner(false);
        } else {
          // Use default model if no stored URI
          console.log('No stored model URI found, using default model');
          setModelUri('');
          setShowScanner(false); // Hide scanner and use default model
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
      
      try {
        console.log('Fetching model from URL:', modelUrl);
        
        // Validate URL
        if (!modelUrl || !modelUrl.startsWith('http')) {
          setLoadingError('Invalid model URL');
          setScanning(false);
          return;
        }
        
        // Save model URL to AsyncStorage
        const saved = await saveModelUrl(modelUrl);
        
        if (!saved) {
          setLoadingError('Failed to save model information');
          setScanning(false);
          return;
        }
        
        console.log('Successfully saved model URL, loading model');
        
        // Add a delay to ensure AsyncStorage is updated
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Important: Stop any ongoing animations before updating state
        progressAnim.stopAnimation();
        
        // First hide the scanner, then update the model URI
        setShowScanner(false);
        
        // Add a delay before setting the model URI
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Now set the model URI
        setModelUri(modelUrl);
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
        ) : loading || isDownloading ? (
          <View style={styles.loadingContainer}>
            {isDownloading ? (
              <>
                <Text style={styles.loadingText}>Downloading 3D model...</Text>
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      { width: `${downloadProgress * 100}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>{`${Math.round(downloadProgress * 100)}%`}</Text>
              </>
            ) : (
              <Text style={styles.loadingText}>Loading 3D model...</Text>
            )}
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
  progressBarContainer: {
    width: width * 0.7,
    height: 10,
    backgroundColor: '#333',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressText: {
    color: 'white',
    fontSize: 16,
    marginTop: 5,
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
