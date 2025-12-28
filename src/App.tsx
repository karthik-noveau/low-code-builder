import { ToastProvider } from './common/components/toast_container';
import { Builder } from './pages/builder';

function App() {
  return (
    <ToastProvider>
      <Builder />
    </ToastProvider>
  );
}

export default App;
