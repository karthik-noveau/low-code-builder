import './App.css';
import PageRenderer from './editor/PageRenderer';
import LeftPanel from './layouts/LeftPanel';
import RightPanel from './layouts/RightPanel';
import TopBar from './layouts/TopBar';

function App() {
  return (
    <div className="app-layout">
      <div className="top-bar"> {/* Added this wrapper div */}
        <TopBar />
      </div>
      <div className="left-panel">
        <LeftPanel />
      </div>
      <div className="center-canvas">
        <PageRenderer />
      </div>
      <div className="right-panel">
        <RightPanel />
      </div>
    </div>
  );
}

export default App;
