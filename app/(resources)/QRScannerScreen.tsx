import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Pressable, Animated } from 'react-native';
import { Stack, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { FontAwesome6 } from "@expo/vector-icons";

const QRScannerScreen = () => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress] = useState(new Animated.Value(0));
  
  // Request camera permissions
  useEffect(() => {
    const getBarCodeScannerPermissions = async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getBarCodeScannerPermissions();
  }, []);

  // Animation for progress bar
  useEffect(() => {
    if (loading) {
      // Reset progress
      progress.setValue(0);
      
      // Animate progress over 1 second
      Animated.timing(progress, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false
      }).start();
    }
  }, [loading, progress]);

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || loading) return;
    
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
          try {
            const url = new URL(data);
            const modelParam = url.searchParams.get('model');
            if (modelParam) {
              modelUri = modelParam;
            }
          } catch (urlError) {
            console.error('Error parsing URL:', urlError);
            // Continue with the original data if URL parsing fails
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

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          We need your permission to use the camera to scan QR codes
        </Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BarCodeScanner
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Overlay with scan area indicator */}
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        <Text style={styles.instructions}>
          Position QR code in the square
        </Text>
      </View>
      
      {/* Loading indicator with progress bar */}
      {loading && (
        <View style={styles.loadingContainer}>
          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBar,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%']
                  })
                }
              ]} 
            />
          </View>
          <Text style={styles.loadingText}>Loading 3D model...</Text>
        </View>
      )}
      
      {/* Controls */}
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
      </View>
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
  progressBarContainer: {
    width: '80%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#bcba40',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
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
