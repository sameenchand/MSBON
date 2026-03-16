import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import VerificationDetail from './pages/VerificationDetail';
import Review from './pages/Review';
import AuditLog from './pages/AuditLog';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/upload', label: 'Upload' },
];

function App() {
  const location = useLocation();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-msbon-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">MSBON Transcript Verification</h1>
              <p className="text-sm text-blue-200">Mississippi State Board of Nursing</p>
            </div>
            <nav className="flex gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-msbon-600 text-white'
                      : 'text-blue-200 hover:bg-msbon-700 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/transcript/:id" element={<VerificationDetail />} />
          <Route path="/transcript/:id/review" element={<Review />} />
          <Route path="/transcript/:id/audit" element={<AuditLog />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 text-center text-sm text-gray-500">
        <p>MSBON Transcript Verification POC - MS AI Innovation Hub</p>
        <p className="text-xs mt-1">Advisory outputs only. All decisions require human review.</p>
      </footer>
    </div>
  );
}

export default App;
