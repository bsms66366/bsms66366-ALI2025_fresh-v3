import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, Alert, Dimensions, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import axios from 'axios';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define model types
interface Model {
  id: string;
  question: string;
  url: string;
  description: string;
  category_id: number;
}

const ModelFetchScreen = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [filteredModels, setFilteredModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  // API URLs
  const API_URL = 'https://placements.bsms.ac.uk/api/physquiz';
  
  // Fetch available models from server
  const fetchAvailableModels = async () => {
    setIsLoading(true);
    try {
      // Fetch models from the API
      const response = await axios.get(API_URL);
      
      // Debug: Log the raw API response
      console.log('API Response:', JSON.stringify(response.data).substring(0, 500));
      
      // Process the API response to extract model information
      const fetchedModels: Model[] = response.data.map((item: any) => {
        // Log each item to see its structure
        console.log('Raw item data:', JSON.stringify(item));
        
        // Extract the ID
        const id = item.id || String(Math.random());
        
        // Extract the question from the question field in the database
        let question = 'Unknown Model';
        if (item.question && typeof item.question === 'string' && item.question.trim() !== '') {
          question = item.question;
          console.log(`Model ${id}: Using question field: ${question}`);
        } else if (item.name && typeof item.name === 'string' && item.name.trim() !== '') {
          question = item.name;
          console.log(`Model ${id}: Using name as question: ${question}`);
        } else if (item.title && typeof item.title === 'string' && item.title.trim() !== '') {
          question = item.title;
          console.log(`Model ${id}: Using title as question: ${question}`);
        } else if (item.filename && typeof item.filename === 'string' && item.filename.trim() !== '') {
          question = item.filename;
          console.log(`Model ${id}: Using filename as question: ${question}`);
        }
        
        // Extract description directly from the database
        const description = item.description || 'No description available';
        
        // Extract category ID
        const category_id = item.category_id || 0;
        
        // Get the URL directly from the urlCode field in the database - use it as is
        let modelUrl = '';
        if (item.urlCode && typeof item.urlCode === 'string' && item.urlCode.trim() !== '') {
          // Use the urlCode directly as it's already a complete URL
          modelUrl = item.urlCode;
          console.log(`Model ${id} (${question}): Using URL from urlCode: ${modelUrl}`);
        }
        
        return {
          id,
          question,
          url: modelUrl,
          description,
          category_id
        };
      });
      
      console.log('Processed models:', fetchedModels);
      
      // Store all fetched models
      setModels(fetchedModels);
      
      // Filter models to only show those with category_id 58 (3D models)
      const filtered = fetchedModels.filter(item => item.category_id === 58);
      console.log('Filtered models count:', filtered.length);
      console.log('First filtered model:', filtered.length > 0 ? filtered[0] : 'None');
      
      setFilteredModels(filtered);
    } catch (error) {
      console.error('Error fetching models:', error);
      Alert.alert('Error', 'Failed to fetch available models');
      
      // Fallback to empty array if the API call fails
      setModels([]);
      setFilteredModels([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Download the selected model
  const downloadModel = async () => {
    if (!selectedModel) {
      Alert.alert('Error', 'Please select a model first');
      return;
    }
    
    setIsLoading(true);
    setDownloadProgress(0);
    
    try {
      // Create directory for models if it doesn't exist
      const modelDir = `${FileSystem.documentDirectory}models/`;
      const dirInfo = await FileSystem.getInfoAsync(modelDir);
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true });
      }
      
      // Extract the original filename from the URL or use the question field
      let originalFilename = selectedModel.question;
      
      // If the URL contains a filename, extract it
      if (selectedModel.url) {
        const urlParts = selectedModel.url.split('/');
        const urlFilename = urlParts[urlParts.length - 1];
        if (urlFilename && urlFilename.includes('.')) {
          originalFilename = urlFilename;
        }
      }
      
      // Ensure the filename ends with .glb
      if (!originalFilename.toLowerCase().endsWith('.glb')) {
        originalFilename = `${originalFilename}.glb`;
      }
      
      // Local path to save the model with original filename
      const localUri = `${modelDir}${originalFilename}`;
      
      // Store model metadata for reference
      await AsyncStorage.setItem('currentModelMetadata', JSON.stringify({
        id: selectedModel.id,
        name: selectedModel.question,
        filename: originalFilename,
        description: selectedModel.description
      }));
      
      // Check if model already exists
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      
      if (fileInfo.exists) {
        // Model already downloaded
        navigateToARScreen(localUri);
      } else {
        // Download the model with progress tracking
        console.log('Downloading model from URL:', selectedModel.url);
        
        const downloadResumable = FileSystem.createDownloadResumable(
          selectedModel.url,
          localUri,
          {},
          (downloadProgress) => {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setDownloadProgress(progress);
          }
        );
        
        const result = await downloadResumable.downloadAsync();
        if (result) {
          navigateToARScreen(result.uri);
        } else {
          throw new Error('Download failed');
        }
      }
    } catch (error) {
      console.error('Error downloading model:', error);
      Alert.alert('Error', 'Failed to download the model');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Navigate to AR screen with the downloaded model
  const navigateToARScreen = (modelUri: string) => {
    // Pass the model URI to the AR screen
    console.log('Navigating to AR screen with model:', modelUri);
    
    // Store the model URI in AsyncStorage before navigation
    const storeModelUri = async () => {
      try {
        await AsyncStorage.setItem('currentModelUri', modelUri);
        router.push("/unified-ar");
      } catch (error) {
        console.error('Error storing model URI:', error);
        Alert.alert('Error', 'Failed to prepare model for AR view');
      }
    };
    
    storeModelUri();
  };
  
  // Load models when the screen mounts
  useEffect(() => {
    fetchAvailableModels();
  }, []);
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>3D Model Selector</Text>
      
      {/* Header Image */}
      <View style={styles.imageContainer}>
        <Image 
          source={require('../../assets/images/interfaceIcons_Artboard39.png')} 
          style={styles.headerImage} 
        />
      </View>
      
      {/* Model Selection */}
      <View style={styles.modelSelectionContainer}>
        <Text style={styles.sectionTitle}>Available 3D Models</Text>
        
        {isLoading && filteredModels.length === 0 ? (
          <ActivityIndicator size="large" color="#bcba40" />
        ) : filteredModels.length > 0 ? (
          <ScrollView>
            {filteredModels.map(model => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.modelItem,
                  selectedModel?.id === model.id && styles.selectedModelItem
                ]}
                onPress={() => setSelectedModel(model)}
              >
                <Text style={styles.modelName}>{model.question}</Text>
                <Text style={styles.modelDescription}>{model.description}</Text>
                <Text style={styles.modelCategory}>Category ID: {model.category_id}</Text>
                <Text style={styles.modelUrl}>URL: {model.url.substring(0, 30)}...</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noModelsText}>No 3D models available</Text>
        )}
      </View>
      
      {/* Download Progress */}
      {isLoading && downloadProgress > 0 && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>{`Downloading: ${Math.round(downloadProgress * 100)}%`}</Text>
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${downloadProgress * 100}%` }
              ]} 
            />
          </View>
        </View>
      )}
      
      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, !selectedModel && styles.disabledButton]}
          onPress={downloadModel}
          disabled={!selectedModel || isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Processing...' : 'Load Selected Model'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  imageContainer: {
    width: '100%',
    height: 150,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerImage: {
    width: '25%',
    height: '100%',
    resizeMode: 'contain',
  },
  modelSelectionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  modelItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedModelItem: {
    borderColor: '#bcba40',
  },
  modelName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  modelDescription: {
    fontSize: 14,
    color: '#ccc',
  },
  modelCategory: {
    fontSize: 12,
    color: '#888',
    marginTop: 5,
  },
  modelUrl: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  noModelsText: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 5,
    textAlign: 'center',
  },
  progressBarContainer: {
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#bcba40',
  },
  buttonContainer: {
    marginTop: 10,
    gap: 10,
  },
  button: {
    backgroundColor: '#bcba40',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: 'rgba(188, 186, 64, 0.5)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ModelFetchScreen;
