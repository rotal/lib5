import { useEffect } from 'react';
import { AppLayout } from './components/layout';
import { registerAllNodes } from './core/nodes';

function App() {
  // Register all nodes on mount
  useEffect(() => {
    registerAllNodes();
  }, []);

  return <AppLayout />;
}

export default App;
