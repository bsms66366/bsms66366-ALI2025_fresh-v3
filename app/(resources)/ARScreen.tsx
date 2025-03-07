import { StyleSheet, View, Platform } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

// Define the model path relative to (resources)
const MODEL_PATH = '../../assets/models/larynx.glb';

// Create an asset reference
const MODEL = Asset.fromModule(require(MODEL_PATH));
console.log('Created asset reference:', MODEL);

export default function ARScreen() {
  let timeout: number;

  const loadModel = async () => {
    try {
      console.log('Starting model load...');
      
      // Ensure the model is downloaded
      if (!MODEL.downloaded) {
        console.log('Downloading model...');
        await MODEL.downloadAsync();
        console.log('Model downloaded successfully');
      }
      
      if (!MODEL.localUri) {
        console.error('Model state:', MODEL);
        throw new Error('Model localUri is undefined after download');
      }
      
      // Handle iOS file protocol
      const uri = Platform.OS === 'ios' 
        ? MODEL.localUri.startsWith('file://') 
          ? MODEL.localUri 
          : `file://${MODEL.localUri}`
        : MODEL.localUri;
      
      console.log('Model URI:', uri);
      return uri;
    } catch (error) {
      console.error('Error in loadModel:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw error;
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
      // Use same path as in loadModel function
      console.log('Starting model loading in context...');
      const modelURI = await loadModel();
      console.log('Model URI received:', modelURI);
      
      if (!modelURI) {
        throw new Error('Could not resolve model URI');
      }
      console.log('Model URI validated');

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
