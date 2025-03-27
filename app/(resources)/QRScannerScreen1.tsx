import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Vibration } from 'react-native';
import { Camera } from 'expo-camera';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

const QRScannerScreen = () => {
  const [hasCameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSimulatedScan, setShowSimulatedScan] = useState(false);

  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setCameraPermission(status === 'granted');
        
        // If we're in development mode or having camera issues, enable simulated scanning
        if (__DEV__ || status !== 'granted') {
          setShowSimulatedScan(true);
        }
      } catch (err) {
        console.error("Error requesting camera permissions:", err);
        setCameraPermission(false);
        setShowSimulatedScan(true);
      }
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    if (hasCameraPermission === false) {
      Alert.alert(
        "Camera Permissions Required",
        "You must grant access to your camera to scan QR codes. You can still use the simulated scan feature.",
        [
          { text: "Go to settings", onPress: goToSettings },
          {
            text: "Continue with simulation",
            onPress: () => {
              setShowSimulatedScan(true);
            },
          },
        ]
      );
    }
  }, [hasCameraPermission]);

  const goToSettings = () => {
    Linking.openSettings();
  };

  const processModelUrl = async (modelUri: string) => {
    try {
      setLoading(true);
      
      await AsyncStorage.setItem('currentModelUri', modelUri);
      
      // Create a simple metadata object
      const metadata = {
        name: 'QR Scanned Model',
        description: 'Model loaded from QR code',
        source: 'qr_scan'
      };
      
      await AsyncStorage.setItem('currentModelMetadata', JSON.stringify(metadata));
      
      // Navigate to the AR view after a short delay
      setTimeout(() => {
        setLoading(false);
        router.push("/marker-ar");
      }, 1000);
    } catch (err) {
      console.error('Error saving model data:', err);
      setError('Error saving model data. Please try again.');
      setLoading(false);
      setScanned(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    try {
      if (scanned) return;
      
      Vibration.vibrate();
      setScanned(true);
      setError(null);
      
      console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
      
      // Check if the QR code contains valid model data
      if (data.startsWith('http') && (data.endsWith('.glb') || data.endsWith('.gltf') || data.includes('model='))) {
        // Extract model URI from the QR code data
        let modelUri = data;
        
        // If the QR code contains a URL with a model parameter, extract it
        if (data.includes('model=')) {
          const url = new URL(data);
          const modelParam = url.searchParams.get('model');
          if (modelParam) {
            modelUri = modelParam;
          }
        }
        
        processModelUrl(modelUri);
      } else {
        // If the QR code doesn't contain valid model data
        setError('Invalid QR code. Please scan a QR code that contains a 3D model URL.');
        setLoading(false);
        setScanned(false);
      }
    } catch (err) {
      console.error('Error processing QR code:', err);
      setError('Error processing QR code. Please try again.');
      setLoading(false);
      setScanned(false);
    }
  };

  // For testing purposes - simulates scanning a valid QR code
  const simulateScan = () => {
    // Example model URLs - you can replace these with your actual model URLs
    const testModelUrls = [
      'https://example.com/model1.glb',
      'https://example.com/model2.glb',
      'https://example.com/model3.glb'
    ];
    
    // Select a random model URL
    const randomIndex = Math.floor(Math.random() * testModelUrls.length);
    const testModelUrl = testModelUrls[randomIndex];
    
    Vibration.vibrate();
    setScanned(true);
    setError(null);
    processModelUrl(testModelUrl);
  };

  if (hasCameraPermission === null && !showSimulatedScan) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dark background */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'black' }]} />
      
      {/* Overlay with scan area indicator */}
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        <Text style={styles.instructions}>
          {showSimulatedScan 
            ? "Use the buttons below to simulate scanning a QR code" 
            : "Position QR code in the square"}
        </Text>
      </View>
      
      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#bcba40" />
          <Text style={styles.loadingText}>Loading 3D model...</Text>
        </View>
      )}
      
      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      
      {/* Controls */}
      <View style={styles.controlsContainer}>
        {showSimulatedScan && !loading && (
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={simulateScan}
          >
            <Text style={styles.buttonText}>Simulate QR Scan</Text>
          </TouchableOpacity>
        )}
        
        {scanned && !loading && !showSimulatedScan && (
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setScanned(false)}
          >
            <Text style={styles.buttonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={styles.controlButton}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
      
      {/* Message about QR scanning */}
      {showSimulatedScan && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>
            QR code scanning simulation mode is active. This is perfect for users with latex gloves.
          </Text>
        </View>
      )}
    </View>
  );
};

const { width } = Dimensions.get('window');
const scanAreaSize = width * 0.7;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: scanAreaSize,
    height: scanAreaSize,
    borderWidth: 2,
    borderColor: '#bcba40',
    borderRadius: 10,
  },
  instructions: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 5,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlButton: {
    backgroundColor: '#bcba40',
    padding: 15,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
  },
  errorContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  text: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    margin: 20,
  },
  messageContainer: {
    position: 'absolute',
    top: '40%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  messageText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
});

// This is the default export for Expo Router
export default function Page() {
  return <QRScannerScreen />;
}

export { QRScannerScreen };
