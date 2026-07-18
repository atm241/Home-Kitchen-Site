import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Auth from './pages/Auth/Auth';
import Home from './pages/Home/Home';
import Calendar from './pages/Calendar/Calendar';
import Recipes from './pages/Recipes/Recipes';
import RecipeDetail from './pages/Recipes/RecipeDetail';
import AddRecipe from './pages/Recipes/AddRecipe';
import Pantry from './pages/Pantry/Pantry';
import GroceryList from './pages/GroceryList/GroceryList';
import CookHistory from './pages/CookHistory/CookHistory';
import './App.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/recipes/new" element={<AddRecipe />} />
                    <Route path="/recipes/:id" element={<RecipeDetail />} />
                    <Route path="/pantry" element={<Pantry />} />
                    <Route path="/grocery" element={<GroceryList />} />
                    <Route path="/history" element={<CookHistory />} />
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
