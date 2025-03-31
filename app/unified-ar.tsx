import React, { useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import UnifiedARScreen from '@/components/UnifiedARScreen';
import ModelFetchScreen from '@/app/(resources)/ModelFetchScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// This is the default export for Expo Router
export default function UnifiedARRoute() {
  const [modelUri, setModelUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkModelUri = async () => {
      try {
        // Add a small delay to ensure AsyncStorage is ready
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const uri = await AsyncStorage.getItem('currentModelUri');
        console.log('Unified-AR route checking for model URI:', uri);
        setModelUri(uri);
      } catch (error) {
        console.error('Error checking model URI:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkModelUri();
  }, []);

  // When a model is selected in ModelFetchScreen, this function will be called
  const onModelSelected = () => {
    // Re-check AsyncStorage for the model URI
    checkModelUri();
  };

  const checkModelUri = async () => {
    try {
      setLoading(true);
      const uri = await AsyncStorage.getItem('currentModelUri');
      console.log('Re-checking model URI after selection:', uri);
      setModelUri(uri);
    } catch (error) {
      console.error('Error re-checking model URI:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: modelUri ? 'AR Experience' : 'Model Selection',
          headerShown: false,
        }}
      />
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#bcba40" />
        </View>
      ) : modelUri ? (
        <UnifiedARScreen />
      ) : (
        <ModelFetchScreen />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
