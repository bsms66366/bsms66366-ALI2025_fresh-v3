import { StyleSheet, View, Platform } from 'react-native';
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
      try {
        const response = await axios.get(modelPath, {
          responseType: 'arraybuffer',
          headers: {
            'Accept': 'application/octet-stream'
          }
        });
        const blob = new Blob([response.data], { type: 'model/gltf-binary' });
        return URL.createObjectURL(blob);
      } catch (error) {
        console.error('Error fetching remote model:', error);
        throw error;
      }
    } else {
      try {
        // Load local asset
        const asset = Asset.fromModule(require('../../assets/models/larynx.glb'));
        await asset.downloadAsync();
        
        if (!asset.localUri) {
          throw new Error('Failed to load local asset');
        }
        
        // Handle file protocol for iOS
        let uri = asset.localUri;
        if (Platform.OS === 'ios' && !uri.startsWith('file://')) {
          uri = `file://${uri}`;
        }
        
        console.log('Local asset URI:', uri);
        return uri;
      } catch (error) {
        console.error('Error loading local asset:', error);
        throw error;
      }
    }
  };

  const onContextCreate = async (gl: any) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000
    );
    
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);

    try {
      const modelURI = await loadModel('../../assets/models/larynx.glb');
      
      if (!modelURI) {
        throw new Error('Could not resolve model URI');
      }

      const loader = new GLTFLoader();
      
      // Set cross-origin policy
      loader.setCrossOrigin('anonymous');
      
      // Use arraybuffer manager
      const manager = new THREE.LoadingManager();
      loader.manager = manager;

      const model = await new Promise<GLTF>((resolve, reject) => {
        loader.load(
          modelURI,
          resolve,
          (progress) => console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%'),
          reject
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
