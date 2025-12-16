import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import UseCase1 from './components/UseCase1'; // Rename your original App.tsx to UseCase1.tsx
import UseCase2 from './components/UseCase2'; // The new component above

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UseCase1 />} /> {/* Original use case 1 */}
        <Route path="/use-case2" element={<UseCase2 />} />
      </Routes>
    </Router>
  );
}