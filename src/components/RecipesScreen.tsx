import React, { useState } from 'react';
import { Search, ChevronRight, Edit3, Save, Coffee, Utensils, Trash2, Plus } from 'lucide-react';

export const RecipesScreen = () => {
  // 1. Full recipe data parsed from your CSV
  const [products, setProducts] = useState([
    { id: 1, name: 'Arroz Chaufa Fried Rice', category: 'Food', ingredients: [
      { id: 101, name: 'Rice', qty: '190', unit: 'g' },
      { id: 102, name: 'Eggs', qty: '3', unit: 'large' },
      { id: 103, name: 'Boneless Pork Chop', qty: '450', unit: 'g' },
      { id: 104, name: 'Vegetable Oil', qty: '3', unit: 'tbsp' },
      { id: 105, name: 'Scallions', qty: '60', unit: 'g' },
      { id: 106, name: 'Red Bell Peppers', qty: '150', unit: 'g' },
      { id: 107, name: 'Fresh Ginger', qty: '1', unit: 'tbsp' },
      { id: 108, name: 'Garlic', qty: '15', unit: 'g' },
      { id: 109, name: 'Soy Sauce', qty: '4', unit: 'tbsp' },
      { id: 110, name: 'Oyster Sauce', qty: '1', unit: 'tbsp' },
    ]},
    { id: 2, name: 'Chicken Skin', category: 'Food', ingredients: [
      { id: 201, name: 'Fresh chicken skin', qty: '250', unit: 'g' },
      { id: 202, name: 'Water', qty: '250', unit: 'mL' },
      { id: 203, name: 'Fine sea salt', qty: '5', unit: 'g' },
      { id: 204, name: 'Black pepper', qty: '2', unit: 'g' },
    ]},
    { id: 3, name: 'Crispy Pork Belly', category: 'Food', ingredients: [
      { id: 301, name: 'Pork Belly', qty: '1', unit: 'kg' },
      { id: 302, name: 'Salt', qty: '30', unit: 'g' },
      { id: 303, name: 'Black Peppercorns', qty: '10', unit: 'g' },
      { id: 304, name: 'Garlic', qty: '15', unit: 'g' },
    ]},
    { id: 4, name: 'Hawaiian Pizza', category: 'Food', ingredients: [
      { id: 401, name: 'All-purpose Flour', qty: '165', unit: 'g' },
      { id: 402, name: 'Yeast', qty: '4', unit: 'g' },
      { id: 403, name: 'Fine Sea Salt', qty: '4', unit: 'g' },
      { id: 404, name: 'Extra Virgin Olive Oil', qty: '8', unit: 'mL' },
    ]},
    { id: 5, name: 'Mahi-Mahi', category: 'Food', ingredients: [
      { id: 501, name: 'Mahi-Mahi fillet', qty: '180', unit: 'g' },
      { id: 502, name: 'Rice', qty: '200', unit: 'g' },
      { id: 503, name: 'Green cabbage', qty: '100', unit: 'g' },
      { id: 504, name: 'Fresh Calamansi', qty: '1', unit: 'piece' },
    ]},
    { id: 6, name: 'Potato Wedges', category: 'Food', ingredients: [
      { id: 601, name: 'Russet potatoes', qty: '500', unit: 'g' },
      { id: 602, name: 'Salt', qty: '10', unit: 'g' },
      { id: 603, name: 'All-purpose flour', qty: '60', unit: 'g' },
      { id: 604, name: 'Cornstarch', qty: '40', unit: 'g' },
    ]},
    { id: 7, name: 'Punked Out Sisig', category: 'Food', ingredients: [
      { id: 701, name: 'Pork', qty: '400', unit: 'g' },
      { id: 702, name: 'Chicken liver', qty: '50', unit: 'g' },
      { id: 703, name: 'White onion', qty: '100', unit: 'g' },
      { id: 704, name: 'Ginger', qty: '10', unit: 'g' },
    ]},
    { id: 8, name: 'Salt and Peppa Wings', category: 'Food', ingredients: [
      { id: 801, name: 'Chicken wings', qty: '350', unit: 'g' },
      { id: 802, name: 'Cornstarch', qty: '40', unit: 'g' },
      { id: 803, name: 'All-purpose flour', qty: '20', unit: 'g' },
      { id: 804, name: 'Baking powder', qty: '3', unit: 'g' },
    ]},
    { id: 9, name: 'Spicy Garlic Noodles', category: 'Food', ingredients: [
      { id: 901, name: 'Dry bihon', qty: '100', unit: 'g' },
      { id: 902, name: 'Chicken broth', qty: '200', unit: 'mL' },
      { id: 903, name: 'Soy sauce', qty: '15', unit: 'mL' },
      { id: 904, name: 'Fish sauce', qty: '5', unit: 'mL' },
    ]},
    { id: 10, name: 'Coke', category: 'Drinks', ingredients: [{ id: 1001, name: 'Coke', qty: '355', unit: 'mL' }]},
    { id: 11, name: 'Sprite', category: 'Drinks', ingredients: [{ id: 1101, name: 'Sprite', qty: '320', unit: 'mL' }]},
    { id: 12, name: 'Root Beer', category: 'Drinks', ingredients: [{ id: 1201, name: 'A&W Root Beer', qty: '355', unit: 'mL' }]},
    { id: 13, name: 'Soda Water', category: 'Drinks', ingredients: [{ id: 1301, name: 'Schweppes Sparkling Soda Water', qty: '325', unit: 'mL' }]},
    { id: 14, name: 'Gin', category: 'Drinks', ingredients: [{ id: 1401, name: 'Tanqueray London Dry Gin', qty: '750', unit: 'mL' }]},
    { id: 15, name: 'Rum', category: 'Drinks', ingredients: [{ id: 1501, name: 'Don Papa rum', qty: '700', unit: 'mL' }]},
    { id: 16, name: 'Tequila', category: 'Drinks', ingredients: [{ id: 1601, name: 'Cazadores Reposado Tequila', qty: '750', unit: 'mL' }]},
    { id: 17, name: 'Vodka', category: 'Drinks', ingredients: [{ id: 1701, name: 'Kanto Vodka Salted Caramel', qty: '700', unit: 'mL' }]},
    { id: 18, name: 'Whiskey', category: 'Drinks', ingredients: [{ id: 1801, name: 'Chivas Regal 12 Year Old', qty: '700', unit: 'mL' }]},
    { id: 19, name: 'White Wine', category: 'Drinks', ingredients: [{ id: 1901, name: 'Liboll Spumante Rosé Extra Dry', qty: '750', unit: 'mL' }]},
    { id: 20, name: 'Wine', category: 'Drinks', ingredients: [{ id: 2001, name: 'Casillero del Diablo Reserva Chardonnay', qty: '750', unit: 'mL' }]},
    { id: 21, name: 'Honey Ale (Mango Nation)', category: 'Drinks', ingredients: [{ id: 2101, name: 'Engkanto High Hive Honey Ale', qty: '330', unit: 'mL' }]},
    { id: 22, name: 'Tonic Water (Schweppes)', category: 'Drinks', ingredients: [{ id: 2201, name: 'Schweppes Sparkling Tonic Water', qty: '320', unit: 'mL' }]},
  ]);

  const [selectedProduct, setSelectedProduct] = useState(products[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleUpdateIngredient = (ingId: number, newQty: string) => {
    const updatedIngredients = selectedProduct.ingredients.map(ing => 
      ing.id === ingId ? { ...ing, qty: newQty } : ing
    );
    const updatedProduct = { ...selectedProduct, ingredients: updatedIngredients };
    setSelectedProduct(updatedProduct);
    setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 p-2 h-[calc(100vh-120px)] animate-in fade-in duration-500">
      
      {/* --- LEFT: MENU LIST --- */}
      <div className="w-full lg:w-1/3 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Draft Punk Recipes</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input 
              type="text" 
              placeholder="Search 22 items..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-1 focus:ring-[#3E2723] outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredProducts.map((product) => (
            <button 
              key={product.id}
              onClick={() => { setSelectedProduct(product); setIsEditing(false); }}
              className={`w-full p-5 flex items-center justify-between group transition-all ${
                selectedProduct.id === product.id ? 'bg-[#FFF5F0] border-l-4 border-l-[#3E2723]' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3 text-left">
                <div className={`p-2 rounded-lg transition-colors ${selectedProduct.id === product.id ? 'bg-[#3E2723] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {product.category === 'Drinks' ? <Coffee size={18} /> : <Utensils size={18} />}
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm tracking-tight">{product.name}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{product.category}</p>
                </div>
              </div>
              <ChevronRight size={16} className={selectedProduct.id === product.id ? 'text-[#3E2723]' : 'text-gray-200'} />
            </button>
          ))}
        </div>
      </div>

      {/* --- RIGHT: RECIPE DETAILS --- */}
      <div className="flex-1 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
          <div>
            <h1 className="text-3xl font-black text-gray-800 tracking-tighter uppercase">{selectedProduct.name}</h1>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Bill of Materials Management</p>
          </div>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 shadow-lg ${
              isEditing ? 'bg-emerald-500 text-white' : 'bg-[#3E2723] text-white'
            }`}
          >
            {isEditing ? <><Save size={18} /> Save Changes</> : <><Edit3 size={18} /> Edit Recipe</>}
          </button>
        </div>

        <div className="p-8 flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-bold text-gray-300 uppercase tracking-widest border-b border-gray-100">
                <th className="pb-4 px-2">Ingredient Name</th>
                <th className="pb-4 px-2 w-32">Qty</th>
                <th className="pb-4 px-2 w-24">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {selectedProduct.ingredients.map((ing) => (
                <tr key={ing.id} className="group">
                  <td className="py-6 px-2 font-bold text-gray-700 text-lg tracking-tight">{ing.name}</td>
                  <td className="py-6 px-2">
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={ing.qty} 
                        onChange={(e) => handleUpdateIngredient(ing.id, e.target.value)}
                        className="w-24 p-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-center outline-none focus:ring-1 focus:ring-[#3E2723]"
                      />
                    ) : (
                      <span className="font-mono font-black text-2xl text-[#3E2723]">{ing.qty}</span>
                    )}
                  </td>
                  <td className="py-6 px-2 text-gray-400 font-bold uppercase text-[10px] tracking-widest">{ing.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {isEditing && (
            <div className="mt-8 flex gap-4">
              <button className="flex items-center gap-2 text-gray-400 font-bold text-xs hover:text-[#3E2723] transition-colors">
                <Plus size={16} /> Add Ingredient
              </button>
              <button className="flex items-center gap-2 text-gray-400 font-bold text-xs hover:text-red-500 transition-colors">
                <Trash2 size={16} /> Remove Selected
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};