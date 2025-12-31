import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import UseCase1 from './components/UseCase1'; // Rename your original App.tsx to UseCase1.tsx

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UseCase1 />} /> {/* Original use case 1 */}
      </Routes>
    </Router>
  );
}