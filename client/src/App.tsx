import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import UpdatePrompt from './components/UpdatePrompt/UpdatePrompt';
import Layout from './components/Layout/Layout';
import Auth from './pages/Auth/Auth';
import Home from './pages/Home/Home';
import Cookbook from './pages/Cookbook/Cookbook';
import Import from './pages/Import/Import';
import CookMode from './pages/CookMode/CookMode';
import ShareSetup from './pages/ShareSetup/ShareSetup';
import Calendar from './pages/Calendar/Calendar';
import RecipeDetail from './pages/Recipes/RecipeDetail';
import AddRecipe from './pages/Recipes/AddRecipe';
import Pantry from './pages/Pantry/Pantry';
import GroceryList from './pages/GroceryList/GroceryList';
import CookHistory from './pages/CookHistory/CookHistory';

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* Outside Routes so the banner shows on every page, including login */}
        <UpdatePrompt />
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    {/* The cookbook is the home screen; planning and pantry are supporting tools. */}
                    <Route path="/" element={<Cookbook />} />
                    <Route path="/import" element={<Import />} />
                    <Route path="/recipes" element={<Navigate to="/" replace />} />
                    <Route path="/recipes/new" element={<AddRecipe />} />
                    <Route path="/recipes/:id" element={<RecipeDetail />} />
                    <Route path="/recipes/:id/cook" element={<CookMode />} />
                    <Route path="/plan" element={<Home />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/pantry" element={<Pantry />} />
                    <Route path="/grocery" element={<GroceryList />} />
                    <Route path="/history" element={<CookHistory />} />
                    <Route path="/settings/share" element={<ShareSetup />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
