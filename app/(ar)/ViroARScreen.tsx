import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Dimensions, NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import type { BarcodeScanningResult } from 'expo-camera';
import { useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import {
  ViroARScene,
  ViroARSceneNavigator,
  Viro3DObject,
  ViroAmbientLight,
  ViroSpotLight,
  ViroNode,
  ViroMaterials,
} from '@reactvision/react-viro';
import type { ViroErrorEvent } from '@reactvision/react-viro/dist/components/Types/ViroEvents';

// Important: Globally declare modelLoadingState
declare global {
  var modelLoadingState: {
    setIsLoading?: (isLoading: boolean) => void;
    setLoadingError?: (error: string | null) => void;
  };
}

// Helper function to extract error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
};

// Helper function to ensure model is downloaded locally
const ensureLocalModel = async (uri: string): Promise<string> => {
  console.log('[Model] Ensuring local model for:', uri);
  // For now, just return the URI as is - we'll implement downloading later if needed
  return uri;
};

// Main UnifiedARScreen component
const UnifiedARScreen = () => {
  const [isScanning, setIsScanning] = useState(true);
  const [modelUri, setModelUri] = useState<string | null>(null);
  const hasStartedLoading = useRef(false);
  const isNavigating = useRef(false);
  const errorCount = useRef(0);
  const MAX_ERRORS = 3;

  useEffect(() => {
    console.log('[Lifecycle] UnifiedARScreen mounted');
    return () => {
      console.log('[Lifecycle] UnifiedARScreen unmounted');
      hasStartedLoading.current = false;
      isNavigating.current = false;
      errorCount.current = 0;
    };
  }, []);

  const handleModelScanned = async (scannedUri: string) => {
    console.log('[Navigation] handleModelScanned called with:', scannedUri);
    
    if (isNavigating.current) {
      console.log('[Navigation] Already navigating, ignoring scan');
      return;
    }

    try {
      isNavigating.current = true;
      console.log('[State] Setting isScanning to false');
      setIsScanning(false);
      
      const localUri = await ensureLocalModel(scannedUri);
      console.log('[State] Setting modelUri to:', localUri);
      setModelUri(localUri);
      
      hasStartedLoading.current = true;
      errorCount.current = 0;
    } catch (error) {
      console.error('[Error] Failed to handle scanned model:', error);
      handleBackToScanner();
    } finally {
      isNavigating.current = false;
    }
  };

  const handleBackToScanner = () => {
    console.log('[Navigation] handleBackToScanner called');
    console.log('[State] Current error count:', errorCount.current);
    
    if (errorCount.current >= MAX_ERRORS) {
      console.log('[Error] Max errors reached, forcing scanner');
      hasStartedLoading.current = false;
      errorCount.current = 0;
    }

    if (!hasStartedLoading.current) {
      console.log('[Navigation] Resetting to scanner');
      setModelUri(null);
      setIsScanning(true);
    } else {
      console.log('[Navigation] Model loading started, ignoring back to scanner');
    }
  };

  const handleLoadStart = () => {
    console.log('[AR] Model load started');
    hasStartedLoading.current = true;
  };

  const handleLoadEnd = () => {
    console.log('[AR] Model load ended successfully');
    errorCount.current = 0;
  };

  const handleError = (error: unknown) => {
    console.error('[AR] Error in AR scene:', error);
    errorCount.current += 1;
    
    if (errorCount.current >= MAX_ERRORS) {
      console.log('[Error] Max errors reached in AR scene');
      handleBackToScanner();
    }
  };

  if (isScanning) {
    return (
      <QRScanner onModelScanned={handleModelScanned} />
    );
  }

  return (
    <ViroARSceneNavigator
      initialScene={{
        scene: ARScene as any, // Type assertion needed for Viro's scene prop
      }}
      viroAppProps={{
        modelUri: modelUri || '',
        onError: handleError,
        onLoadStart: handleLoadStart,
        onLoadEnd: handleLoadEnd,
      }}
      style={styles.flex}
    />
  );
};

// QR Scanner Component
const QRScanner = ({ onModelScanned }: { onModelScanned: (modelUri: string) => void }) => {
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
      setError(getErrorMessage(error));
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
      onError: (error: unknown) => void;
      onLoadStart: () => void;
      onLoadEnd: () => void;
    };
  };
}

const ARScene: React.FC<ARSceneProps> = (props) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const modelUri = props.sceneNavigator.viroAppProps.modelUri;
  
  useEffect(() => {
    console.log('[ARScene] Initializing with modelUri:', modelUri);
  }, [modelUri]);

  const onLoadStart = () => {
    console.log('[ARScene] Model load started:', modelUri);
    setModelLoaded(false);
    props.sceneNavigator.viroAppProps.onLoadStart();
  };

  const onLoadEnd = () => {
    console.log('[ARScene] Model load ended:', modelUri);
    setModelLoaded(true);
    props.sceneNavigator.viroAppProps.onLoadEnd();
  };

  const onError = (event: NativeSyntheticEvent<ViroErrorEvent>) => {
    const errorMessage = event.nativeEvent.error || 'Unknown error loading model';
    console.error('[ARScene] Error loading model:', errorMessage);
    props.sceneNavigator.viroAppProps.onError(errorMessage);
  };

  // Initialize materials after model is loaded
  useEffect(() => {
    if (modelLoaded) {
      try {
        ViroMaterials.createMaterials({
          defaultMaterial: {
            lightingModel: "Blinn",
            diffuseColor: '#FFFFFF',
            shininess: 0.5,
          }
        });
        console.log('[ARScene] Materials created successfully');
      } catch (error) {
        console.error('[ARScene] Error creating materials:', getErrorMessage(error));
        props.sceneNavigator.viroAppProps.onError(getErrorMessage(error));
      }
    }
  }, [modelLoaded]);

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" intensity={200} />
      <ViroSpotLight
        innerAngle={5}
        outerAngle={90}
        direction={[0, -1, -0.2]}
        position={[0, 3, 1]}
        color="#ffffff"
        castsShadow={true}
      />
      
      <ViroNode position={[0, 0, -1]} dragType="FixedToWorld">
        <Viro3DObject
          source={{ uri: modelUri }}
          position={[0, 0, 0]}
          scale={[0.2, 0.2, 0.2]}
          type="GLB"
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onError={onError}
        />
      </ViroNode>
    </ViroARScene>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
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
