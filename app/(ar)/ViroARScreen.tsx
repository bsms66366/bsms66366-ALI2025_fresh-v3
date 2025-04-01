import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Animated, Platform, NativeSyntheticEvent, Pressable } from 'react-native';
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
import { ActivityIndicator } from 'react-native';

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

// Type for ViroARSceneNavigator scene
type SceneType = {
  scene: () => JSX.Element;
};

// Type for ARScene props
interface ARSceneProps {
  modelUri: string;
  onError?: (error: string) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

// ARScene component
const ARScene: React.FC<ARSceneProps> = (props) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelScale, setModelScale] = useState<[number, number, number]>([0.1, 0.1, 0.1]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const materialsCreated = useRef(false);
  const materialsTimeout = useRef<NodeJS.Timeout>();
  const mounted = useRef(true);
  const baseScale = useRef(0.1);
  const navigation = useNavigation();
  const { modelUri, onError, onLoadStart, onLoadEnd } = props;

  useEffect(() => {
    console.log('[ARScene] Initializing with props:', {
      modelUri: modelUri,
      hasModel: !!modelUri,
      modelUriType: typeof modelUri
    });
    
    // Verify the model URI is valid
    if (!modelUri) {
      console.error('[ARScene] No model URI provided');
      onError && onError('No model URI provided');
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
    console.log('[Model] Load completed for:', modelUri);
    baseScale.current = 0.1;
    setModelScale([baseScale.current, baseScale.current, baseScale.current]);
    setModelLoaded(true);
    onLoadEnd && onLoadEnd();
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
          source={{ uri: modelUri }}
          type="GLB"
          scale={[1, 1, 1]}
          position={[0, 0, 0]}
          materials={["defaultMaterial"]}
          onLoadStart={() => {
            console.log('[Model] Load started for:', modelUri);
            onLoadStart && onLoadStart();
          }}
          onLoadEnd={handleLoadEnd}
          onError={(errorEvent: NativeSyntheticEvent<ViroErrorEvent>) => {
            const error = errorEvent.nativeEvent.error;
            console.error('[Model] Load error:', error, 'for:', modelUri);
            onError && onError(getErrorMessage(error));
          }}
        />
      </ViroNode>
    </ViroARScene>
  );
};

const ViroARScreen: React.FC = () => {
  const params = useLocalSearchParams<{ modelUri: string }>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localModelUri, setLocalModelUri] = useState<string | null>(null);
  const mounted = useRef(true);
  const navigation = useNavigation();

  useEffect(() => {
    // Set up navigation options
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={handleBack} style={{ marginLeft: 16 }}>
          <Text style={{ color: '#007AFF', fontSize: 16 }}>Back</Text>
        </Pressable>
      ),
    });

    return () => {
      mounted.current = false;
    };
  }, [navigation]);

  const handleBack = useCallback(() => {
    if (mounted.current) {
      mounted.current = false;
      router.replace("/(tabs)/ResourcesScreen");
    }
  }, []);

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  // Prepare the model when component mounts
  useEffect(() => {
    if (!params.modelUri) {
      console.error('[ViroARScreen] No model URI provided');
      setError('No model URI provided');
      return;
    }

    const prepareModel = async () => {
      if (!mounted.current) return;

      try {
        console.log('[ViroARScreen] Preparing model from:', params.modelUri);
        
        // Check if the file exists locally
        const fileInfo = await FileSystem.getInfoAsync(params.modelUri);
        console.log('[ViroARScreen] File info:', fileInfo);

        if (fileInfo.exists) {
          console.log('[ViroARScreen] Using local model file');
          setLocalModelUri(params.modelUri);
          setIsLoading(false);
          return;
        }

        // If not local, download it
        setIsDownloading(true);
        const localUri = await downloadModel(params.modelUri, (progress) => {
          console.log('[ViroARScreen] Download progress:', progress);
        });
        
        if (mounted.current) {
          setLocalModelUri(localUri);
          setIsDownloading(false);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[ViroARScreen] Error preparing model:', err);
        if (mounted.current) {
          setError(getErrorMessage(err));
          setIsLoading(false);
          setIsDownloading(false);
        }
      }
    };

    prepareModel();
  }, [params.modelUri]);

  if (!params.modelUri) {
    return (
      <View style={styles.container}>
        <Text>No model URI provided</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (isDownloading || isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>
          {isDownloading ? 'Downloading model...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  return (
    <ViroARSceneNavigator
      initialScene={{
        scene: () => <ARScene modelUri={localModelUri || params.modelUri} 
          onError={(error: string) => {
            console.error('[ViroARScreen] AR Scene error:', error);
            setError(error);
          }}
          onLoadStart={() => {
            console.log('[ViroARScreen] Model load starting');
            setIsLoading(true);
          }}
          onLoadEnd={() => {
            console.log('[ViroARScreen] Model load completed');
            if (mounted.current) {
              setIsLoading(false);
            }
          }}
        />,
      }}
      style={styles.arView}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  arView: {
    flex: 1,
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
  backButtonText: {
    color: 'white',
    marginLeft: 8,
    fontSize: 16,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 15,
    textAlign: 'center',
  },
});

export default ViroARScreen;
