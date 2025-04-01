import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Animated, Platform, NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  ViroErrorEvent,
} from '@reactvision/react-viro';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { BackHandler } from 'react-native';

// Helper function to extract error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
};

// Safe material creation
const safeCreateMaterials = () => {
  try {
    if (ViroMaterials && typeof ViroMaterials.createMaterials === 'function') {
      ViroMaterials.createMaterials({
        defaultMaterial: {
          lightingModel: "Blinn",
          diffuseColor: "#FFFFFF"
        }
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error creating materials:', error);
    return false;
  }
};

// Download model to local file system
const downloadModel = async (
  uri: string, 
  onProgress: (progress: number) => void
): Promise<string> => {
  try {
    // Create a unique filename based on the URI
    const filename = `model_${Date.now()}_${uri.split('/').pop() || 'model.glb'}`;
    const modelDir = `${FileSystem.documentDirectory}models/`;
    const localUri = `${modelDir}${filename}`;

    // Create models directory if it doesn't exist
    const dirInfo = await FileSystem.getInfoAsync(modelDir);
    if (!dirInfo.exists) {
      console.log('Creating models directory:', modelDir);
      await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
    }

    // Check if we already have this model downloaded
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (fileInfo.exists) {
      console.log('Model already exists locally:', localUri);
      return localUri;
    }

    console.log('Downloading model:', uri, 'to', localUri);
    const downloadResumable = FileSystem.createDownloadResumable(
      uri,
      localUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        console.log(`Download progress: ${Math.round(progress * 100)}%`);
        onProgress(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result?.uri) {
      throw new Error('Download failed - no URI in result');
    }

    // Verify the downloaded file
    const downloadedFileInfo = await FileSystem.getInfoAsync(result.uri);
    if (!downloadedFileInfo.exists || downloadedFileInfo.size === 0) {
      throw new Error('Downloaded file is empty or missing');
    }

    console.log('Model downloaded successfully:', result.uri);
    return result.uri;
  } catch (error) {
    console.error('Error downloading model:', error);
    throw error;
  }
};

// ARScene component
interface ARSceneProps {
  sceneNavigator: { 
    viroAppProps: { 
      modelUri: string;
      onLoadStart: () => void;
      onLoadEnd: () => void;
      onError: (error: Error | string) => void;
    } 
  };
}

const ARScene: React.FC<ARSceneProps> = (props) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelScale, setModelScale] = useState<[number, number, number]>([0.1, 0.1, 0.1]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const materialsCreated = useRef(false);
  const materialsTimeout = useRef<NodeJS.Timeout>();
  const mounted = useRef(true);
  const baseScale = useRef(0.1);
  const navigation = useNavigation();

  useEffect(() => {
    console.log('[ARScene] Initializing with props:', {
      modelUri: props.sceneNavigator.viroAppProps.modelUri,
      hasModel: !!props.sceneNavigator.viroAppProps.modelUri,
      modelUriType: typeof props.sceneNavigator.viroAppProps.modelUri
    });
    
    // Verify the model URI is valid
    if (!props.sceneNavigator.viroAppProps.modelUri) {
      console.error('[ARScene] No model URI provided');
      props.sceneNavigator.viroAppProps.onError('No model URI provided');
      return;
    }

    return () => {
      console.log('[ARScene] Unmounting');
      mounted.current = false;
      if (materialsTimeout.current) {
        clearTimeout(materialsTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (modelLoaded && !materialsCreated.current && mounted.current) {
      console.log('[ARScene] Model loaded, creating materials');
      materialsTimeout.current = setTimeout(() => {
        try {
          if (safeCreateMaterials()) {
            console.log('[ARScene] Materials created successfully');
            materialsCreated.current = true;
          } else {
            console.warn('[ARScene] Failed to create materials');
          }
        } catch (error) {
          console.error('[ARScene] Error creating materials:', error);
        }
      }, 500);
    }

    return () => {
      if (materialsTimeout.current) {
        clearTimeout(materialsTimeout.current);
      }
    };
  }, [modelLoaded]);

  // Handle back button and cleanup
  useEffect(() => {
    const backHandler = () => {
      // Clean up and navigate to resources screen
      if (mounted.current) {
        mounted.current = false;
        if (materialsTimeout.current) {
          clearTimeout(materialsTimeout.current);
        }
        router.replace("/(tabs)/ResourcesScreen");
      }
      return true;
    };

    // Add back button handler
    if (Platform.OS === 'android') {
      BackHandler.addEventListener('hardwareBackPress', backHandler);
    }

    // Add navigation event listener
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      mounted.current = false;
      if (materialsTimeout.current) {
        clearTimeout(materialsTimeout.current);
      }
    });

    return () => {
      console.log('[ARScene] Unmounting and cleaning up');
      mounted.current = false;
      if (materialsTimeout.current) {
        clearTimeout(materialsTimeout.current);
      }
      if (Platform.OS === 'android') {
        BackHandler.removeEventListener('hardwareBackPress', backHandler);
      }
      unsubscribe();
    };
  }, [navigation]);

  // Adjust scale based on model load success
  const handleLoadEnd = () => {
    console.log('[Model] Load completed for:', props.sceneNavigator.viroAppProps.modelUri);
    baseScale.current = 0.1;
    setModelScale([baseScale.current, baseScale.current, baseScale.current]);
    setModelLoaded(true);
    props.sceneNavigator.viroAppProps.onLoadEnd();
  };

  const onPinch = (pinchState: any, scaleFactor: number, source: any) => {
    if (pinchState === 3) { // END
      baseScale.current = modelScale[0];
      return;
    }

    const newScale = baseScale.current * scaleFactor;
    // Limit scale between 0.01 and 2.0
    const clampedScale = Math.min(Math.max(newScale, 0.01), 2.0);
    setModelScale([clampedScale, clampedScale, clampedScale]);
  };

  const onRotate = (rotateState: any, rotationFactor: number, source: any) => {
    if (rotateState === 3) { // END
      return;
    }

    setRotation([0, rotation[1] + rotationFactor, 0]);
  };

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" intensity={200} />
      <ViroSpotLight
        innerAngle={5}
        outerAngle={45}
        direction={[0, -1, -.2]}
        position={[0, 3, 1]}
        color="#ffffff"
        castsShadow={true}
        influenceBitMask={2}
        shadowMapSize={2048}
        shadowNearZ={2}
        shadowFarZ={5}
        shadowOpacity={.7}
      />
      <ViroNode 
        position={[0, -0.5, -1]} 
        scale={modelScale}
        rotation={rotation}
        onPinch={onPinch}
        onRotate={onRotate}
        dragType="FixedToWorld"
      >
        <Viro3DObject
          source={{ uri: props.sceneNavigator.viroAppProps.modelUri }}
          type="GLB"
          scale={[1, 1, 1]}
          position={[0, 0, 0]}
          materials={["defaultMaterial"]}
          onLoadStart={() => {
            console.log('[Model] Load started for:', props.sceneNavigator.viroAppProps.modelUri);
            props.sceneNavigator.viroAppProps.onLoadStart();
          }}
          onLoadEnd={handleLoadEnd}
          onError={(errorEvent: NativeSyntheticEvent<ViroErrorEvent>) => {
            const error = errorEvent.nativeEvent.error || 'Failed to load model';
            console.error('[Model] Load error:', error, 'for:', props.sceneNavigator.viroAppProps.modelUri);
            props.sceneNavigator.viroAppProps.onError(error);
          }}
        />
      </ViroNode>
    </ViroARScene>
  );
};

// Custom animated loading indicator
const LoadingIndicator = ({ progress, message }: { progress?: number, message: string }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 0.4,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    ]);

    Animated.loop(pulse).start();

    return () => {
      pulseAnim.stopAnimation();
    };
  }, []);

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={[styles.loadingBox, { opacity: pulseAnim }]}>
        <Ionicons name="cube-outline" size={48} color="#ffffff" />
        <Text style={styles.loadingText}>{message}</Text>
        {progress !== undefined && (
          <Text style={styles.progressText}>
            {Math.round(progress * 100)}%
          </Text>
        )}
      </Animated.View>
    </View>
  );
};

// Main ViroARScreen component
export default function ViroARScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localModelUri, setLocalModelUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useLocalSearchParams<{ modelUri: string }>();
  const mounted = useRef(true);

  useEffect(() => {
    console.log('[ViroARScreen] Mounted with params:', params);
    console.log('[ViroARScreen] Current state:', {
      isLoading,
      isDownloading,
      localModelUri,
      error
    });

    const prepareModel = async () => {
      if (!params.modelUri) return;

      try {
        console.log('[ViroARScreen] Preparing model from:', params.modelUri);
        setIsDownloading(true);
        setError(null);

        // Check if the file exists first
        const fileInfo = await FileSystem.getInfoAsync(params.modelUri);
        console.log('[ViroARScreen] File info:', fileInfo);

        if (params.modelUri.startsWith('http')) {
          console.log('[ViroARScreen] Downloading remote model');
          const localUri = await downloadModel(params.modelUri, setDownloadProgress);
          if (mounted.current) {
            // Verify the downloaded file exists
            const downloadedFileInfo = await FileSystem.getInfoAsync(localUri);
            console.log('[ViroARScreen] Downloaded file info:', downloadedFileInfo);
            
            if (!downloadedFileInfo.exists) {
              throw new Error('Downloaded file does not exist');
            }
            
            // Use file:// prefix for local files
            const properUri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
            console.log('[ViroARScreen] Setting model URI to:', properUri);
            setLocalModelUri(properUri);
          }
        } else {
          // It's already a local file
          console.log('[ViroARScreen] Using local model file');
          if (!fileInfo.exists) {
            throw new Error('Local model file does not exist');
          }
          
          // Use file:// prefix for local files
          const properUri = params.modelUri.startsWith('file://') ? params.modelUri : `file://${params.modelUri}`;
          console.log('[ViroARScreen] Setting model URI to:', properUri);
          if (mounted.current) {
            setLocalModelUri(properUri);
          }
        }
      } catch (error) {
        console.error('[ViroARScreen] Error preparing model:', error);
        if (mounted.current) {
          setError(getErrorMessage(error));
        }
      } finally {
        if (mounted.current) {
          setIsDownloading(false);
        }
      }
    };

    prepareModel();

    return () => {
      console.log('[ViroARScreen] Unmounted');
      mounted.current = false;
    };
  }, [params.modelUri]);

  const handleError = (error: Error | string) => {
    console.error('[ViroARScreen] Error:', error);
    setError(error.toString());
  };

  const handleLoadStart = () => {
    console.log('[ViroARScreen] Model load starting');
    setIsLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    console.log('[ViroARScreen] Model load completed');
    setIsLoading(false);
  };

  const handleBack = () => {
    router.replace("/(tabs)/ResourcesScreen");
  };

  if (!params.modelUri) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No model URI provided</Text>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {localModelUri && (
        <View style={styles.flex}>
          <ViroARSceneNavigator
            autofocus={true}
            initialScene={{
              scene: ARScene as any
            }}
            viroAppProps={{
              modelUri: localModelUri,
              onLoadStart: handleLoadStart,
              onLoadEnd: handleLoadEnd,
              onError: handleError,
            }}
            style={styles.flex}
          />
        </View>
      )}

      {/* Overlay for loading and error states */}
      {(isDownloading || isLoading || error) && (
        <View style={styles.overlay}>
          {isDownloading && !error && (
            <LoadingIndicator 
              progress={downloadProgress} 
              message="Downloading 3D Model" 
            />
          )}
          {isLoading && !isDownloading && !error && (
            <LoadingIndicator message="Loading 3D Model" />
          )}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="white" />
                <Text style={styles.buttonText}>Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Back button */}
      <TouchableOpacity 
        onPress={handleBack} 
        style={[styles.backButton, styles.backButtonPosition]}
      >
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  flex: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingBox: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    width: Dimensions.get('window').width * 0.8,
    maxWidth: 300,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 15,
    textAlign: 'center',
  },
  progressText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  errorContainer: {
    padding: 20,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    width: Dimensions.get('window').width * 0.8,
    maxWidth: 300,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 20,
  },
  backButtonPosition: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 1,
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontSize: 16,
  },
});
