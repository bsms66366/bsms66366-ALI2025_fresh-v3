import React from 'react';
import { Stack } from 'expo-router';
import UnifiedARScreen from '../components/UnifiedARScreen';

// This is the default export for Expo Router
const UnifiedARRoute = () => {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Unified AR Experience',
          headerShown: false, // Hide header for immersive experience
        }}
      />
      <UnifiedARScreen />
    </>
  );
};

export default UnifiedARRoute;
