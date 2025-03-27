import React from 'react';
import { Stack } from 'expo-router';
// Import from the components directory
import ViroARScreen from '../components/ViroARScreen';

// This is the default export for Expo Router
export default function ViroARScreenRoute() {
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
}
