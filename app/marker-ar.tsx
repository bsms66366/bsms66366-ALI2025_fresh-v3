import React from 'react';
import { Stack } from 'expo-router';
// Import from the components directory
import MarkerARScreen from '../components/MarkerARScreen';

// This is the default export for Expo Router
export default function MarkerARRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Marker-Based AR View',
          headerShown: false,
        }}
      />
      <MarkerARScreen />
    </>
  );
}
