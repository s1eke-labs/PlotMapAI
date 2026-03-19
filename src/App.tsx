import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import BookshelfPage from './pages/BookshelfPage';
import BookDetailPage from './pages/BookDetailPage';
import ReaderPage from './pages/ReaderPage';
import SettingsPage from './pages/SettingsPage';
import CharacterGraphPage from './pages/CharacterGraphPage';
import { ThemeProvider } from './context/ThemeContext';
import DebugPanel from './components/DebugPanel';
import { isDebugMode } from './services/debug';

function App() {
  return (
    <ThemeProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <Layout>
        <Routes>
          <Route path="/" element={<BookshelfPage />} />
          <Route path="/novel/:id" element={<BookDetailPage />} />
          <Route path="/novel/:id/read" element={<ReaderPage />} />
          <Route path="/novel/:id/graph" element={<CharacterGraphPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </Router>
    {isDebugMode() && <DebugPanel />}
    </ThemeProvider>
  );
}

export default App;
