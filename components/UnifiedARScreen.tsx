import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Dimensions, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView, CameraType } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { ViroARScene, ViroARSceneNavigator, ViroMaterials, ViroAmbientLight, ViroSpotLight, ViroNode, Viro3DObject } from '@reactvision/react-viro';

// Important: Globally declare modelLoadingState
declare global {
  var modelLoadingState: {
    setIsLoading?: (isLoading: boolean) => void;
    setLoadingError?: (error: string | null) => void;
  };
}

// QR Scanner Component
const QRScannerView = ({ onModelScanned }: { onModelScanned: (modelUri: string) => void }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const lastScanTime = useRef(0);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    const getPermissions = async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
    };
    
    getPermissions();
  }, [permission, requestPermission]);

  const handleCapture = useCallback(async () => {
    if (scanned || loading || !cameraRef.current) return;
    
    // Prevent multiple captures within 2 seconds
    const now = Date.now();
    if (now - lastScanTime.current < 2000) return;
    lastScanTime.current = now;
    
    try {
      setLoading(true);
      setError(null);
      
      // Take a picture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        throw new Error('Failed to capture image');
      }
      
      // Scan the image for QR codes
      const results = await Camera.scanFromURLAsync(photo.uri, ['qr']);
      
      if (results.length === 0) {
        throw new Error('No QR code found in image. Please try again.');
      }
      
      // Process the first QR code found
      const { data } = results[0];
      console.log('QR code scanned:', data);
      
      setScanned(true);
      
      // Simple validation - ensure it's a HTTPS URL
      if (!data.startsWith('https://')) {
        throw new Error('Invalid QR code. Please scan a QR code with a valid HTTPS URL.');
      }
      
      // Extract model URL from QR code
      const modelUrl = data.trim();
      
      setDownloadProgress(0);
      // Prepare model (download if needed)
      const preparedUri = await validateAndPrepareModel(modelUrl, (progress) => {
        setDownloadProgress(progress);
      });
      
      // Save to AsyncStorage
      await AsyncStorage.setItem('currentModelUri', preparedUri);
      console.log('Saved model URI to AsyncStorage:', preparedUri);
      
      // Notify parent component with a small delay for smooth transition
      setTimeout(() => {
        onModelScanned(preparedUri);
      }, 500);
    } catch (error) {
      console.error('Error processing QR code:', error);
      setError(error instanceof Error ? error.message : 'Failed to process QR code');
      // Keep scanned state true to prevent auto-retrying
    } finally {
      setLoading(false);
    }
  }, [scanned, loading, onModelScanned]);

  const handleScanAgain = useCallback(() => {
    setScanned(false);
    setError(null);
    setDownloadProgress(0);
  }, []);

  // Validate and potentially download the model
  const validateAndPrepareModel = async (uri: string, progressCallback?: (progress: number) => void): Promise<string> => {
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
      
      // For remote URIs, always download them first for better reliability
      if (uri.startsWith('https://')) {
        // Create a local filename based on the URL
        const filename = `model_${Date.now()}_${uri.split('/').pop() || 'model.glb'}`;
        const modelDir = `${FileSystem.documentDirectory}models/`;
        const localUri = `${modelDir}${filename}`;
        
        // Create directory if it doesn't exist
        const dirInfo = await FileSystem.getInfoAsync(modelDir);
        if (!dirInfo.exists) {
          console.log('Creating models directory:', modelDir);
          await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
        }
        
        // Download the file with proper progress tracking
        console.log('Downloading model to cache:', uri, 'to', localUri);
        
        const downloadResumable = FileSystem.createDownloadResumable(
          uri,
          localUri,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            console.log(`Download progress: ${Math.round(progress * 100)}%`);
            progressCallback?.(progress);
          }
        );
        
        try {
          const result = await downloadResumable.downloadAsync();
          
          if (result && result.uri) {
            console.log('Model downloaded successfully:', result.uri);
            // Verify the file exists and has content
            const fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (fileInfo.exists && fileInfo.size > 0) {
              console.log('Downloaded file size:', fileInfo.size);
              return result.uri;
            } else {
              throw new Error('Downloaded file is empty or missing');
            }
          } else {
            throw new Error('Download completed but file URI is missing');
          }
        } catch (downloadError: any) {
          console.error('Error downloading model:', downloadError);
          throw new Error(`Failed to download model: ${downloadError.message || 'Unknown error'}`);
        }
      }
      
      // If it's neither a file:// nor https:// URI, return as is
      return uri;
    } catch (error) {
      console.error('Error in validateAndPrepareModel:', error);
      throw error; // Re-throw to be handled by caller
    }
  };

  if (!permission) {
    return (
      <View style={styles.scannerContainer}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.scannerContainer}>
        <Text style={styles.text}>No access to camera</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.scannerContainer}>
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#bcba40" />
          <Text style={styles.loadingText}>
            {downloadProgress > 0 
              ? `Downloading model... ${Math.round(downloadProgress * 100)}%` 
              : 'Processing QR code...'}
          </Text>
        </View>
      ) : (
        <>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerMarker} />
            </View>
            
            <View style={styles.scannerTextContainer}>
              <Text style={styles.scannerTitle}>Scan QR Code</Text>
              <Text style={styles.scannerInstructions}>
                Position the QR code in the center of the screen and tap the scan button
              </Text>
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>
            
            {!scanned && !loading && (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleCapture}
              >
                <Ionicons name="scan-circle" size={64} color="#bcba40" />
              </TouchableOpacity>
            )}
            
            {scanned && (
              <TouchableOpacity
                style={styles.scanAgainButton}
                onPress={handleScanAgain}
              >
                <Text style={styles.scanAgainButtonText}>Tap to Scan Again</Text>
              </TouchableOpacity>
            )}
          </CameraView>
        </>
      )}
    </View>
  );
};

// Simplified AR View Component
const ARView = ({ modelUri }: { modelUri: string }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Log the modelUri to help with debugging
  useEffect(() => {
    console.log('ARView received modelUri:', modelUri);
  }, [modelUri]);

  // Setup global handlers for model loading state
  useEffect(() => {
    if (!global.modelLoadingState) {
      global.modelLoadingState = {};
    }
    
    global.modelLoadingState.setIsLoading = (isLoading: boolean) => setLoading(isLoading);
    global.modelLoadingState.setLoadingError = (error: string | null) => setError(error);
    
    return () => {
      if (global.modelLoadingState) {
        global.modelLoadingState.setIsLoading = undefined;
        global.modelLoadingState.setLoadingError = undefined;
      }
    };
  }, []);

  // Simplified initialization of ViroARScene - no complex logic
  const initScene = () => {
    return <ARScene modelUri={modelUri} />;
  };

  return (
    <View style={styles.arContainer}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#bcba40" />
          <Text style={styles.loadingText}>Loading 3D model...</Text>
        </View>
      )}
      
      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => setError(null)}
          >
            <Text style={styles.errorButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
      
      <ViroARSceneNavigator
        autofocus={true}
        initialScene={{
          scene: initScene,
        }}
        viroAppProps={{ modelUri: modelUri }}
        style={styles.arView}
      />
    </View>
  );
};

// AR Scene component - simplified version
const ARScene = (props: any) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelLoadAttempted, setModelLoadAttempted] = useState(false);
  const modelUri = props.sceneNavigator?.viroAppProps?.modelUri || props.modelUri || '';
  
  useEffect(() => {
    // Log the modelUri to help with debugging
    console.log('ARScene received modelUri:', modelUri);
    
    // Verify the model file exists if it's a local file
    const checkModelFile = async () => {
      if (modelUri && modelUri.startsWith('file://')) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(modelUri);
          console.log('Model file info:', fileInfo);
          if (!fileInfo.exists) {
            console.error('Model file does not exist:', modelUri);
            if (global.modelLoadingState?.setLoadingError) {
              global.modelLoadingState.setLoadingError('Model file not found');
            }
          } else if (fileInfo.size === 0) {
            console.error('Model file is empty:', modelUri);
            if (global.modelLoadingState?.setLoadingError) {
              global.modelLoadingState.setLoadingError('Model file is empty');
            }
          }
        } catch (error) {
          console.error('Error checking model file:', error);
        }
      }
    };
    
    checkModelFile();
  }, [modelUri]);
  
  // Handle model load events
  const onLoadStart = () => {
    console.log('Model load started for:', modelUri);
    setModelLoadAttempted(true);
    setModelLoaded(false);
    if (global.modelLoadingState?.setIsLoading) {
      global.modelLoadingState.setIsLoading(true);
    }
  };
  
  const onLoadEnd = () => {
    console.log('Model load completed for:', modelUri);
    setModelLoaded(true);
    if (global.modelLoadingState?.setIsLoading) {
      global.modelLoadingState.setIsLoading(false);
    }
    
    // Try to initialize materials after a delay
    setTimeout(() => {
      try {
        if (typeof ViroMaterials !== 'undefined' && ViroMaterials !== null) {
          ViroMaterials.createMaterials({
            defaultMaterial: {
              lightingModel: "Blinn",
              diffuseColor: '#FFFFFF',
              shininess: 0.5,
            }
          });
          console.log('Materials created successfully');
        }
      } catch (error) {
        console.error('Error creating materials:', error);
      }
    }, 1000);
  };
  
  const onError = (event: any) => {
    console.error('Error loading model:', event, 'modelUri:', modelUri);
    if (global.modelLoadingState?.setLoadingError) {
      global.modelLoadingState.setLoadingError(`Failed to load 3D model: ${event.nativeEvent?.error || 'Unknown error'}`);
    }
  };

  // Scale settings based on model type - adjust as needed
  const getModelScale = () => {
    // Default scale for most models
    return [0.05, 0.05, 0.05] as [number, number, number];
  };

  // Determine whether to use fallback model
  const shouldUseFallbackModel = !modelUri || modelLoadAttempted && !modelLoaded;
  
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
      />
      
      <ViroNode position={[0, 0, 0]} dragType="FixedToWorld">
        {modelUri && !shouldUseFallbackModel ? (
          <Viro3DObject
            source={{ uri: modelUri }}
            position={[0, 0, -0.5]}
            scale={getModelScale()}
            rotation={[0, 0, 0]}
            type="GLB"
            onLoadStart={onLoadStart}
            onLoadEnd={onLoadEnd}
            onError={onError}
          />
        ) : (
          <Viro3DObject
            source={require('@/assets/models/larynx_with_muscles_and_ligaments.glb')}
            position={[0, 0, -0.5]}
            scale={[0.05, 0.05, 0.05]}
            rotation={[0, 0, 0]}
            type="GLB"
            onLoadStart={onLoadStart}
            onLoadEnd={onLoadEnd}
            onError={onError}
          />
        )}
      </ViroNode>
    </ViroARScene>
  );
};

// Types
interface UnifiedARScreenProps {
  startWithScanner?: boolean;
}

// Main Component - now just switches between different views
const UnifiedARScreen: React.FC<UnifiedARScreenProps> = ({ startWithScanner = true }) => {
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(startWithScanner);

  // Handle successful QR code scan
  const handleModelScanned = (uri: string) => {
    console.log('Model scanned, setting URI:', uri);
    setModelUri(uri);
    setShowScanner(false);
  };

  // Reset to scanner view
  const resetToScanner = () => {
    setShowScanner(true);
    setModelUri(null);
  };

  // Check if there's a saved model URI
  useEffect(() => {
    if (!startWithScanner) {
      const checkModelUri = async () => {
        try {
          const uri = await AsyncStorage.getItem('currentModelUri');
          if (uri) {
            console.log('Loaded saved model URI from AsyncStorage:', uri);
            setModelUri(uri);
            setShowScanner(false);
          }
        } catch (error) {
          console.error('Error checking saved model URI:', error);
        }
      };
      
      checkModelUri();
    }
  }, [startWithScanner]);

  return (
    <View style={styles.container}>
      {showScanner ? (
        <QRScannerView onModelScanned={handleModelScanned} />
      ) : modelUri ? (
        <>
          <ARView modelUri={modelUri} />
          <TouchableOpacity 
            style={styles.backButton}
            onPress={resetToScanner}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#bcba40" />
          <Text style={styles.text}>Preparing AR experience...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  arContainer: {
    flex: 1,
  },
  arView: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  scannerMarker: {
    width: Dimensions.get('window').width * 0.35,
    height: Dimensions.get('window').width * 0.35,
    borderWidth: 2,
    borderColor: '#bcba40',
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  scannerTextContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 20,
  },
  scannerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  scannerInstructions: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scanAgainButton: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: '#bcba40',
    padding: 15,
    borderRadius: 8,
  },
  scanAgainButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 20,
  },
  text: {
    color: 'white',
    fontSize: 18,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 20,
  },
  errorText: {
    color: '#ff5252',
    fontSize: 18,
    textAlign: 'center',
    marginVertical: 10,
  },
  errorButton: {
    backgroundColor: '#bcba40',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  errorButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  permissionButton: {
    backgroundColor: '#bcba40',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 25,
    zIndex: 10,
  },
  captureButton: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    padding: 16,
  },
});

export default UnifiedARScreen;
