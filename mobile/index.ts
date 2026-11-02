import { registerRootComponent } from 'expo';

import App from './App';
// Registers the background field-tracking task (TaskManager.defineTask) at module load, so it exists even when the
// OS launches the JS bundle headlessly just to deliver a location update, not through the usual app UI.
import './src/lib/location';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
