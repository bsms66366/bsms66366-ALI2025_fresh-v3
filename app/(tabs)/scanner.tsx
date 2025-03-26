import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Alert, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CameraView,
  useCameraPermissions,
  CameraType,
  BarcodeScanningResult
} from 'expo-camera';
import { FontAwesome6 } from "@expo/vector-icons";

const QRScannerScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");

  // Request permissions if needed
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const toggleFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const handleBarCodeScanned = async (scanningResult: BarcodeScanningResult) => {
    if (scanned || loading) return;
    
    const { data, type } = scanningResult;
    setScanned(true);
    setLoading(true);
    
    console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
    
    try {
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
        
        // Store the model URI for use in the AR screen
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
      } else {
        // If the QR code doesn't contain valid model data
        Alert.alert(
          "Invalid QR Code",
          "Please scan a QR code that contains a 3D model URL.",
          [{ text: "OK", onPress: () => { setScanned(false); setLoading(false); } }]
        );
      }
    } catch (err) {
      console.error('Error processing QR code:', err);
      Alert.alert(
        "Error",
        "Error processing QR code. Please try again.",
        [{ text: "OK", onPress: () => { setScanned(false); setLoading(false); } }]
      );
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          We need your permission to use the camera to scan QR codes
        </Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        ref={cameraRef}
        facing={facing}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      >
        {/* Overlay with scan area indicator */}
        <View style={styles.overlay}>
          <View style={styles.scanArea} />
          <Text style={styles.instructions}>
            Position QR code in the square
          </Text>
        </View>
        
        {/* Camera controls */}
        <View style={styles.controlsContainer}>
          {scanned && !loading && (
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
          
          <Pressable 
            style={styles.cameraToggle}
            onPress={toggleFacing}
          >
            <FontAwesome6 name="rotate-left" size={24} color="white" />
          </Pressable>
        </View>
      </CameraView>
      
      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#bcba40" />
          <Text style={styles.loadingText}>Loading 3D model...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
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
    alignItems: 'center',
  },
  controlButton: {
    backgroundColor: '#bcba40',
    padding: 15,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  cameraToggle: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
    borderRadius: 50,
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
  text: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    margin: 20,
  },
  button: {
    backgroundColor: '#bcba40',
    padding: 15,
    borderRadius: 10,
    margin: 20,
    alignItems: 'center',
  },
});

// This is the default export for Expo Router
export default function ScannerRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'QR Code Scanner',
          headerShown: true,
        }}
      />
      <QRScannerScreen />
    </>
  );
}
