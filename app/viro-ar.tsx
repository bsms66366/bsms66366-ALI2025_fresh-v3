import React from 'react';
import { Stack } from 'expo-router';
// Import directly from the file path with the correct relative path
import ViroARScreen from './(resources)/ViroARScreen';

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
