import { AppLayout } from './components/layout';
import { registerAllNodes } from './core/nodes';

// Register all nodes before first render so NodePalette can read them synchronously
registerAllNodes();

function App() {
  return <AppLayout />;
}

export default App;
