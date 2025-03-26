import React from 'react';
import { Stack } from 'expo-router';
// Import directly from the file path with the correct relative path
import MarkerARScreen from './(resources)/MarkerARScreen';

export default function MarkerARScreenRoute() {
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
