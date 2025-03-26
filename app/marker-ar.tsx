import React from 'react';
import { Stack } from 'expo-router';
// Import the Page component from MarkerARScreen
import Page from './(resources)/MarkerARScreen';

export default function MarkerARRoute() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Marker-Based AR View',
          headerShown: false,
        }}
      />
      <Page />
    </>
  );
}
