import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout';
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
    </Router>
  );
}

export default App;
