import {
  CameraMode,
  CameraType,
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import { useRef, useState, useEffect } from "react";
import { Button, Pressable, StyleSheet, Text, View, Image, Animated } from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { FontAwesome6 } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [mode, setMode] = useState<CameraMode>("picture");
  const [facing, setFacing] = useState<CameraType>("back");
  const [recording, setRecording] = useState(false);
  
  // QR code scanning states
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState(true); // Start in QR scan mode
  
  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;
  
  // Start progress animation when loading
  useEffect(() => {
    if (loading) {
      // Reset progress
      progressAnim.setValue(0);
      
      // Animate to 100% over 2 seconds
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: false,
      }).start();
    }
  }, [loading]);

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: "center", color: "white" }}>
          We need your permission to use the camera
        </Text>
        <Button onPress={requestPermission} title="Grant permission" />
      </View>
    );
  }

  // Function to validate if a URL points to a 3D model
  const isValidModelUrl = (url: string): boolean => {
    // Check if URL ends with common 3D model extensions
    if (url.match(/\.(glb|gltf|obj|fbx)$/i)) {
      return true;
    }
    
    // Check if URL contains a model parameter
    if (url.includes('model=') || url.includes('modelUrl=')) {
      return true;
    }
    
    return false;
  };

  // Extract model URL from QR code data
  const extractModelUrl = (data: string): string => {
    // If data is already a valid URL, return it
    if (data.startsWith('http://') || data.startsWith('https://')) {
      return data;
    }
    
    // Try to extract URL from text
    const urlMatch = data.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      return urlMatch[0];
    }
    
    return data;
  };

  // Save model URL to AsyncStorage
  const saveModelUrl = async (modelUrl: string) => {
    try {
      // First clear any existing model data to prevent conflicts
      await AsyncStorage.removeItem('currentModelUri');
      await AsyncStorage.removeItem('currentModelMetadata');
      
      // Add a small delay to ensure the clear operation completes
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now save the new model data
      await AsyncStorage.setItem('currentModelUri', modelUrl);
      
      // Create basic metadata for the model
      const metadata = {
        source: 'qr_scan',
        timestamp: new Date().toISOString(),
        url: modelUrl,
      };
      
      await AsyncStorage.setItem('currentModelMetadata', JSON.stringify(metadata));
      
      console.log('Model URL and metadata saved to AsyncStorage:', modelUrl);
      return true;
    } catch (error) {
      console.error('Error saving model URL to AsyncStorage:', error);
      setError('Failed to save model information');
      return false;
    }
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned || !data) return;
    
    setScanned(true);
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Bar code with type ${type} and data ${data} has been scanned!`);
      
      // Extract model URL from QR code data
      const modelUrl = extractModelUrl(data);
      console.log('Extracted model URL:', modelUrl);
      
      // Validate if it's a 3D model URL
      if (!isValidModelUrl(modelUrl)) {
        console.log('Invalid model URL detected');
        setLoading(false);
        setError('Invalid QR code: Not a 3D model URL');
        return;
      }
      
      // Save model URL to AsyncStorage
      const saved = await saveModelUrl(modelUrl);
      
      if (saved) {
        console.log('Successfully saved model URL, navigating to AR screen');
        // Complete the progress animation before navigating
        setTimeout(() => {
          setLoading(false);
          // Navigate to the appropriate AR screen based on the model type
          if (modelUrl.includes('marker') || modelUrl.includes('tracked')) {
            router.push("/marker-ar");
          } else {
            router.push("/viro-ar");
          }
        }, 1000);
      } else {
        setLoading(false);
        setError('Failed to process the QR code');
      }
    } catch (error) {
      console.error('Error processing QR code:', error);
      setLoading(false);
      setError('An error occurred while processing the QR code');
    }
  };

  const takePicture = async () => {
    const photo = await ref.current?.takePictureAsync();
    if (photo?.uri) {
      setUri(photo.uri);
    }
  };

  const recordVideo = async () => {
    if (recording) {
      setRecording(false);
      ref.current?.stopRecording();
      return;
    }
    setRecording(true);
    const video = await ref.current?.recordAsync();
    console.log({ video });
  };

  const toggleMode = () => {
    setMode((prev) => (prev === "picture" ? "video" : "picture"));
  };

  const toggleFacing = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const toggleScanMode = () => {
    setScanMode(prev => !prev);
    setScanned(false);
    setError(null);
  };

  const renderPicture = () => {
    return (
      <View>
        <Image
          source={{ uri: uri || undefined }}
          style={{ width: 300, aspectRatio: 1 }}
        />
        <Button onPress={() => setUri(null)} title="Take another picture" />
      </View>
    );
  };

  const renderCamera = () => {
    return (
      <CameraView
        style={styles.camera}
        ref={ref}
        mode={mode}
        facing={facing}
        mute={false}
        onBarcodeScanned={scanMode ? handleBarCodeScanned : undefined}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        responsiveOrientationWhenOrientationLocked
      >
        {scanMode ? (
          <View style={styles.overlay}>
            {/* QR code frame guide */}
            <View style={styles.scanArea}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
            
            {/* Instructions */}
            <Text style={styles.instructionText}>
              Position QR code within the frame
            </Text>
            
            {/* Loading indicator with progress bar */}
            {loading && (
              <View style={styles.loadingContainer}>
                <View style={styles.progressContainer}>
                  <Animated.View 
                    style={[
                      styles.progressBar, 
                      { 
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        }) 
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.loadingText}>Processing QR code...</Text>
              </View>
            )}
            
            {/* Error message */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <Button 
                  onPress={() => {
                    setScanned(false);
                    setError(null);
                  }} 
                  title="Try Again" 
                />
              </View>
            )}
            
            {/* Controls */}
            <View style={styles.controlsContainer}>
              {scanned && !loading && !error && (
                <Button 
                  onPress={() => setScanned(false)} 
                  title="Scan Again" 
                />
              )}
              
              <Pressable 
                style={styles.backButton} 
                onPress={() => router.push("/viro-ar")}
              >
                <FontAwesome6 name="arrow-left" size={24} color="white" />
                <Text style={styles.backButtonText}>Back to AR</Text>
              </Pressable>
              
              <Pressable 
                style={styles.modeButton} 
                onPress={toggleScanMode}
              >
                <AntDesign name="camera" size={24} color="white" />
                <Text style={styles.backButtonText}>Camera Mode</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.shutterContainer}>
            <Pressable onPress={toggleMode}>
              {mode === "picture" ? (
                <AntDesign name="picture" size={32} color="white" />
              ) : (
                <Feather name="video" size={32} color="white" />
              )}
            </Pressable>
            <Pressable onPress={mode === "picture" ? takePicture : recordVideo}>
              {({ pressed }) => (
                <View
                  style={[
                    styles.shutterBtn,
                    {
                      opacity: pressed ? 0.5 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.shutterBtnInner,
                      {
                        backgroundColor: mode === "picture" ? "white" : "red",
                      },
                    ]}
                  />
                </View>
              )}
            </Pressable>
            <Pressable onPress={toggleFacing}>
              <FontAwesome6 name="rotate-left" size={32} color="white" />
            </Pressable>
            
            <Pressable 
              style={[styles.modeButton, { position: 'absolute', bottom: -60, alignSelf: 'center' }]} 
              onPress={toggleScanMode}
            >
              <AntDesign name="qrcode" size={24} color="white" />
              <Text style={styles.backButtonText}>QR Scan Mode</Text>
            </Pressable>
          </View>
        )}
      </CameraView>
    );
  };

  return (
    <View style={styles.container}>
      {uri ? renderPicture() : renderCamera()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  shutterContainer: {
    position: "absolute",
    bottom: 44,
    left: 0,
    width: "100%",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 30,
  },
  shutterBtn: {
    backgroundColor: "transparent",
    borderWidth: 5,
    borderColor: "white",
    width: 85,
    height: 85,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterBtnInner: {
    width: 70,
    height: 70,
    borderRadius: 50,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#ffffff',
  },
  cornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#ffffff',
  },
  cornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#ffffff',
  },
  cornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#ffffff',
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  text: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 20,
  },
  subText: {
    fontSize: 14,
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    width: '80%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    marginTop: 15,
  },
  errorContainer: {
    position: 'absolute',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 10,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff6666',
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    marginTop: 20,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    marginTop: 20,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 8,
  },
});