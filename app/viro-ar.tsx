import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
// Import directly from the file path with the correct relative path
import ViroARScreen from './(resources)/ViroARScreen';

// Create a wrapper component to handle the ViroReact initialization
const ViroARScreenRoute = () => {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'ViroReact AR View',
          headerShown: false,
        }}
      />
      <ViroARScreen />
    </>
  );
};

// Make sure to export the component as default
export default ViroARScreenRoute;
