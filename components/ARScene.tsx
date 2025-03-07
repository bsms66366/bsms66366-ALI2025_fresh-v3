import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Camera as ExpoCamera, CameraType as ExpoCameraType, useCameraPermissions } from 'expo-camera';

export default function ARViewComponent() {
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    requestPermission();
  }, []);

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <ExpoCamera style={styles.camera} type={ExpoCameraType.back}>
      <View style={styles.overlay}>
        <Text style={styles.text}>AR View</Text>
      </View>
    </ExpoCamera>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 24,
  },
});