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

// Main UnifiedARScreen component
const UnifiedARScreen = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(true);

  // Set up global loading state handlers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      globalThis.modelLoadingState = {
        setIsLoading,
        setLoadingError
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        globalThis.modelLoadingState = {};
      }
    };
  }, []);

  // Handle successful model scan
  const handleModelScanned = useCallback((uri: string) => {
    console.log('Model scanned, transitioning to AR view with URI:', uri);
    setModelUri(uri);
    setShowScanner(false);
    setIsLoading(false);
    setLoadingError(null);
  }, []);

  // If there's an error or user wants to scan again
  const handleBackToScanner = useCallback(() => {
    setShowScanner(true);
    setModelUri(null);
    setIsLoading(false);
    setLoadingError(null);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#bcba40" />
        <Text style={styles.loadingText}>Loading model...</Text>
      </View>
    );
  }

  if (loadingError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{loadingError}</Text>
        <TouchableOpacity style={styles.button} onPress={handleBackToScanner}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showScanner) {
    return <QRScannerView onModelScanned={handleModelScanned} />;
  }

  if (modelUri) {
    return (
      <ViroARSceneNavigator
        initialScene={{
          scene: ARScene as unknown as () => JSX.Element,
        }}
        viroAppProps={{
          modelUri,
          onError: (error: string) => {
            console.error('AR Scene Error:', error);
            setLoadingError(error);
            handleBackToScanner();
          },
          onLoadStart: () => {
            console.log('Model load started');
            setIsLoading(true);
          },
          onLoadEnd: () => {
            console.log('Model load completed');
            setIsLoading(false);
          },
        }}
        style={styles.arView}
      />
    );
  }

  // Fallback to scanner
  return <QRScannerView onModelScanned={handleModelScanned} />;
};

// QR Scanner Component
const QRScannerView = ({ onModelScanned }: { onModelScanned: (modelUri: string) => void }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const lastScanTime = useRef(0);
  const cameraRef = useRef<CameraView>(null);
  const isNavigating = useRef(false);

  useEffect(() => {
    const getPermissions = async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
    };
    
    getPermissions();
  }, [permission, requestPermission]);

  const handleCapture = useCallback(async () => {
    if (scanned || loading || !cameraRef.current || isNavigating.current) return;
    
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
      
      // Save to AsyncStorage and navigate only if we haven't already started navigating
      if (!isNavigating.current) {
        isNavigating.current = true;
        await AsyncStorage.setItem('currentModelUri', preparedUri);
        console.log('Saved model URI to AsyncStorage:', preparedUri);
        
        // Notify parent component
        onModelScanned(preparedUri);
      }
    } catch (error) {
      console.error('Error processing QR code:', error);
      setError(error instanceof Error ? error.message : 'Failed to process QR code');
      isNavigating.current = false;
      setScanned(false);
    } finally {
      setLoading(false);
    }
  }, [scanned, loading, onModelScanned]);

  const handleScanAgain = useCallback(() => {
    setScanned(false);
    setError(null);
    setDownloadProgress(0);
    isNavigating.current = false;
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

interface ARSceneProps {
  sceneNavigator: {
    viroAppProps: {
      modelUri: string;
      onError: (error: string) => void;
      onLoadStart: () => void;
      onLoadEnd: () => void;
    };
  };
}

const ARScene = (props: ARSceneProps) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelLoadAttempted, setModelLoadAttempted] = useState(false);
  const modelUri = props.sceneNavigator.viroAppProps.modelUri;
  
  useEffect(() => {
    console.log('AR Scene received modelUri:', modelUri);
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
    return <ARScene sceneNavigator={{ viroAppProps: { modelUri, onError: () => {}, onLoadStart: () => {}, onLoadEnd: () => {} } }} />;
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333',
  },
  errorText: {
    color: '#ff0000',
    fontSize: 16,
    textAlign: 'center',
    margin: 20,
  },
  button: {
    backgroundColor: '#bcba40',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  arView: {
    flex: 1,
  },
  scannerContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  arContainer: {
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
