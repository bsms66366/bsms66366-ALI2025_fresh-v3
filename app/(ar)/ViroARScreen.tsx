import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ViroARScene,
  ViroARSceneNavigator,
  Viro3DObject,
  ViroAmbientLight,
  ViroSpotLight,
  ViroNode,
  ViroMaterials,
} from '@reactvision/react-viro';
import { useLocalSearchParams, router } from 'expo-router';

// Helper function to extract error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
};

// ARScene component
const ARScene = (props: { 
  sceneNavigator: { viroAppProps: { modelUri: string } },
  onError: (error: unknown) => void,
  onLoadStart: () => void,
  onLoadEnd: () => void
}) => {
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    // Initialize materials after model is loaded
    if (modelLoaded) {
      try {
        ViroMaterials.createMaterials({
          white: {
            lightingModel: "Lambert",
            diffuseColor: "#FFFFFF"
          }
        });
      } catch (error) {
        console.error('Error creating materials:', error);
      }
    }
  }, [modelLoaded]);

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
      <ViroNode position={[0, 0, -1]}>
        <Viro3DObject
          source={{ uri: props.sceneNavigator.viroAppProps.modelUri }}
          position={[0, 0, 0]}
          scale={[0.1, 0.1, 0.1]}
          type="GLB"
          onLoadStart={() => {
            console.log('[Model] Load started');
            props.onLoadStart();
          }}
          onLoadEnd={() => {
            console.log('[Model] Load completed');
            setModelLoaded(true);
            props.onLoadEnd();
          }}
          onError={(error) => {
            console.error('[Model] Load error:', error);
            props.onError(error);
          }}
        />
      </ViroNode>
    </ViroARScene>
  );
};

// Main ViroARScreen component
export default function ViroARScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const params = useLocalSearchParams<{ modelUri: string }>();

  useEffect(() => {
    console.log('[ViroARScreen] Mounted with params:', params);
    return () => {
      console.log('[ViroARScreen] Unmounted');
    };
  }, []);

  const handleError = (error: unknown) => {
    const message = getErrorMessage(error);
    console.error('[ViroARScreen] Error:', message);
    setError(message);
  };

  const handleLoadStart = () => {
    console.log('[ViroARScreen] Model load started');
    setIsLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    console.log('[ViroARScreen] Model load completed');
    setIsLoading(false);
  };

  const handleBack = () => {
    router.back();
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
      <ViroARSceneNavigator
        autofocus={true}
        initialScene={{
          scene: ARScene
        }}
        viroAppProps={{
          modelUri: params.modelUri
        }}
        style={styles.flex}
      />

      {/* Overlay for loading and error states */}
      {(isLoading || error) && (
        <View style={styles.overlay}>
          {isLoading && !error && (
            <ActivityIndicator size="large" color="#ffffff" />
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    padding: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
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
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontSize: 16,
  },
});
