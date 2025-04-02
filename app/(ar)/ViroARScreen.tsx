import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform, NativeSyntheticEvent } from 'react-native';
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
import { useLocalSearchParams, router } from 'expo-router';

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

// Type for scene props from ViroARSceneNavigator
type SceneProps = {
  sceneNavigator: {
    viroAppProps: {
      modelUri: string;
    };
  };
};

// Type for ARScene props
type ARSceneProps = SceneProps & {
  onError: (error: unknown) => void;
  onLoadStart: () => void;
  onLoadEnd: () => void;
};

// LoadingIndicator component
const LoadingIndicator: React.FC<{ progress?: number; message: string }> = ({ progress, message }) => (
  <View style={styles.loadingBox}>
    <Text style={styles.loadingText}>{message}</Text>
    {progress !== undefined && (
      <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
    )}
  </View>
);

// ARScene component
const ARScene: React.FC<ARSceneProps> = (props) => {
  const [modelLoaded, setModelLoaded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (modelLoaded) {
      safeCreateMaterials();
    }
  }, [modelLoaded]);

  const handleError = (event: NativeSyntheticEvent<ViroErrorEvent>) => {
    if (mounted.current) {
      props.onError(event.nativeEvent);
    }
  };

  const handleLoadStart = () => {
    if (mounted.current) {
      props.onLoadStart();
    }
  };

  const handleLoadEnd = () => {
    if (mounted.current) {
      setModelLoaded(true);
      props.onLoadEnd();
    }
  };

  return (
    <ViroARScene>
      <ViroAmbientLight color="#ffffff" intensity={200} />
      <ViroSpotLight
        position={[0, 3, 0]}
        color="#ffffff"
        direction={[0, -1, 0]}
        attenuationStartDistance={5}
        attenuationEndDistance={10}
        innerAngle={5}
        outerAngle={20}
        castsShadow={true}
      />
      <ViroNode position={[0, -1, -3]}>
        <Viro3DObject
          source={{ uri: props.sceneNavigator.viroAppProps.modelUri }}
          type="GLB"
          scale={[0.05, 0.05, 0.05]}
          position={[0, 0, 0]}
          rotation={[0, 0, 0]}
          onError={handleError}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
        />
      </ViroNode>
    </ViroARScene>
  );
};

// Main ViroARScreen component
const ViroARScreen = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [localModelUri, setLocalModelUri] = useState<string | null>(null);
  const params = useLocalSearchParams();
  const modelUri = params.modelUri as string;

  useEffect(() => {
    const loadModel = async () => {
      if (!modelUri) return;
      
      setIsDownloading(true);
      setError(null);
      
      try {
        const localUri = await downloadModel(modelUri, setDownloadProgress);
        if (localUri.startsWith('file://')) {
          setLocalModelUri(localUri);
        } else {
          setLocalModelUri(`file://${localUri}`);
        }
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setIsDownloading(false);
      }
    };

    loadModel();
  }, [modelUri]);

  const handleBackPress = () => {
    router.back();
  };

  const handleError = (error: unknown) => {
    setError(getErrorMessage(error));
    setIsLoading(false);
  };

  const handleLoadStart = () => {
    setIsLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  if (!modelUri) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No model URI provided</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        autofocus={true}
        initialScene={{
          scene: () => (
            <ARScene
              sceneNavigator={{ viroAppProps: { modelUri: localModelUri || modelUri } }}
              onError={handleError}
              onLoadStart={handleLoadStart}
              onLoadEnd={handleLoadEnd}
            />
          ),
        }}
        style={styles.arView}
      />
      
      <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>

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
              <TouchableOpacity style={styles.retryButton} onPress={() => router.replace('/qr-scanner')}>
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default ViroARScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  arView: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 1,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
