import { StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';
import { resolveAsync } from 'expo-asset-utils';
import axios from 'axios';

export default function ARScreen() {
  let timeout: number;

  const isURL = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  const loadModel = async (modelPath: string) => {
    if (isURL(modelPath)) {
      // Handle remote URL
      try {
        const response = await axios.get(modelPath, {
          responseType: 'arraybuffer'
        });
        const blob = new Blob([response.data], { type: 'application/octet-stream' });
        return URL.createObjectURL(blob);
      } catch (error) {
        console.error('Error fetching remote model:', error);
        throw error;
      }
    } else {
      // Handle local file
      const resolved = await resolveAsync(modelPath);
      return resolved?.localUri || resolved?.uri;
    }
  };

  const onContextCreate = async (gl: any) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000
    );
    
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

    // Load 3D model

    
    try {
      // Can be either a local path or a remote URL
      const modelPath = '../../assets/models/larynx.glb';
      // const modelPath = 'https://your-api.com/models/larynx.glb';
      
      const modelURI = await loadModel(modelPath);
      
      if (!modelURI) {
        throw new Error('Could not resolve model URI');
      }

      console.log('Model URI:', modelURI); // Debug log

      const loader = new GLTFLoader();
      loader.setPath('');

      // Configure THREE.FileLoader for Expo environment
      const fileLoader = new THREE.FileLoader();
      fileLoader.setResponseType('arraybuffer');

      const model = await new Promise<GLTF>((resolve, reject) => {
        loader.load(
          modelURI,
          (gltf) => {
            console.log('Model loaded successfully');
            resolve(gltf);
          },
          (progress) => {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
          },
          (error) => {
            console.error('GLTFLoader error:', error);
            reject(error);
          }
        );
      });

      // Adjust model position and scale as needed
      model.scene.scale.set(0.5, 0.5, 0.5);
      model.scene.position.set(0, 0, 0);
      scene.add(model.scene);
    } catch (error) {
      console.error('Error loading model:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
    }

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 3;

    const render = () => {
      timeout = requestAnimationFrame(render);
      // Update animation if your model has animations
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        onContextCreate={onContextCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  glView: {
    flex: 1,
  },
});
