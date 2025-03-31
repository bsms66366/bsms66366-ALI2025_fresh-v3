import React from 'react';
import { Stack } from 'expo-router';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// This is the default export for Expo Router
export default function UnifiedARRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'QR Scanner',
          headerShown: true,
        }}
      />
      <View style={styles.container}>
        <View style={styles.introContainer}>
          <Text style={styles.title}>QR Code Scanner</Text>
          <Text style={styles.description}>
            Scan a QR code to load a 3D model in augmented reality.
          </Text>
          
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => {
              // First clear any previous model URI
              AsyncStorage.removeItem('currentModelUri')
                .then(() => {
                  // Navigate to the model fetch screen which we'll modify to support scanning
                  router.push("/model-fetch");
                })
                .catch(error => {
                  console.error('Error clearing AsyncStorage:', error);
                  // Navigate anyway
                  router.push("/model-fetch");
                });
            }}
          >
            <Text style={styles.buttonText}>Start Scanning</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  introContainer: {
    width: '100%',
    maxWidth: 500,
    padding: 20,
    backgroundColor: 'rgba(50, 50, 50, 0.9)',
    borderRadius: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#bcba40',
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  scanButton: {
    backgroundColor: '#bcba40',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
    width: '80%',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
