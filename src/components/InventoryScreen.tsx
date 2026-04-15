import React, { useState } from 'react';
import { Search, AlertTriangle, PlusCircle, X, Edit3, Filter, Trash2 } from 'lucide-react';

export const InventoryScreen = () => {
  const [ingredients, setIngredients] = useState([
    { id: 1, name: 'Espresso Beans', stock: 12.5, unit: 'kg' },
    { id: 2, name: 'Whole Milk', stock: 2.0, unit: 'L' },
    { id: 3, name: 'Cocoa Powder', stock: 5.0, unit: 'kg' },
    { id: 4, name: 'Brown Sugar', stock: 0.8, unit: 'kg' },
  ]);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all"); 

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  
  const [selectedItem, setSelectedItem] = useState<{id: number, name: string, stock?: number} | null>(null);
  const [newStockInput, setNewStockInput] = useState("");
  const [newName, setNewName] = useState("");

  const getStatus = (stock: number) => {
    if (stock <= 1) return { label: 'CRITICAL', color: 'bg-orange-100 text-orange-600' };
    if (stock <= 3) return { label: 'LOW STOCK', color: 'bg-[#FFF5F0] text-orange-400' };
    return { label: 'HEALTHY', color: 'bg-emerald-100 text-emerald-600' };
  };

  const getProcessedIngredients = () => {
    let list = [...ingredients];
    list = list.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (filterType === "healthy") list = list.filter(i => i.stock > 3);
    if (filterType === "low") list = list.filter(i => i.stock <= 3 && i.stock > 1);
    if (filterType === "critical") list = list.filter(i => i.stock <= 1);
    if (filterType === "stock-asc") list.sort((a, b) => a.stock - b.stock);
    else if (filterType === "stock-desc") list.sort((a, b) => b.stock - a.stock);
    return list;
  };

  const filteredIngredients = getProcessedIngredients();

  const confirmDelete = () => {
    if (selectedItem) {
      setIngredients(ingredients.filter(item => item.id !== selectedItem.id));
      setIsDeleteModalOpen(false);
      setSelectedItem(null);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIngredients([...ingredients, { id: Date.now(), name: newName, stock: parseFloat(newStockInput) || 0, unit: 'qty' }]);
    setIsAddModalOpen(false);
    setNewName("");
    setNewStockInput("");
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItem) {
      setIngredients(prev => prev.map(item => item.id === selectedItem.id ? { ...item, stock: parseFloat(newStockInput) || 0 } : item));
    }
    setIsAdjustModalOpen(false);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 p-2">
      
      {/* MODAL: ADD NEW */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold mb-4">Add New Ingredient</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <input type="text" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-xl outline-none" required />
              <input type="number" step="0.1" placeholder="Stock" value={newStockInput} onChange={e => setNewStockInput(e.target.value)} className="w-full p-3 bg-gray-50 border rounded-xl outline-none" required />
              <button type="submit" className="w-full bg-[#3E2723] text-white py-3 rounded-xl font-bold">Save</button>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="w-full text-gray-400 text-sm py-2">Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADJUST STOCK */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <h3 className="text-lg font-bold mb-1">Adjust Stock</h3>
            <p className="text-sm text-gray-500 mb-6">Updating: <span className="font-bold text-[#3E2723]">{selectedItem?.name}</span></p>
            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <input autoFocus type="number" step="0.1" value={newStockInput} onChange={e => setNewStockInput(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-xl outline-none text-2xl font-bold text-center focus:border-[#3E2723]" required />
              <button type="submit" className="w-full bg-[#3E2723] text-white py-4 rounded-xl font-bold shadow-md">Update Stock</button>
              <button type="button" onClick={() => setIsAdjustModalOpen(false)} className="w-full text-gray-400 py-2">Go Back</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-500" size={30} />
            </div>
            <h3 className="text-xl font-bold mb-2">Are you sure?</h3>
            <p className="text-gray-500 mb-6 text-sm">Do you really want to delete <span className="font-bold text-gray-800">{selectedItem?.name}</span>? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* TOP SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="text-red-500" size={18} />
            <h3 className="font-bold text-gray-800">Low Stock Alerts</h3>
          </div>
          <div className="space-y-2">
            {ingredients.filter(i => i.stock <= 3).map(i => (
              /* Faint red background added here */
              <div key={i.id} className="flex justify-between items-center bg-red-50 p-4 rounded-2xl border border-red-100/50">
                <span className="text-sm font-bold text-gray-700">{i.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-lg font-black text-red-600">{i.stock}</span>
                  <span className="text-[#3E2723] font-black uppercase text-[10px] tracking-widest">{i.unit || 'kg'}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-[#3E2723] rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
          <h3 className="text-white font-bold text-xl mb-6">Inventory Management</h3>
          <button onClick={() => setIsAddModalOpen(true)} className="bg-white text-[#3E2723] px-8 py-3 rounded-2xl font-bold flex items-center gap-2 active:scale-95 transition-all">
            <PlusCircle size={20} /> Add New Ingredient
          </button>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Ingredients List</h2>
          <div className="flex gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm outline-none" />
            </div>
            <div className="relative">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="pl-11 pr-8 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-semibold text-gray-600 appearance-none cursor-pointer outline-none">
                <option value="all">All Status</option>
                <option value="healthy">Healthy Only</option>
                <option value="low">Low Stock Only</option>
                <option value="critical">Critical Only</option>
                <option value="stock-asc">Stock: Low to High</option>
                <option value="stock-desc">Stock: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        <table className="w-full text-left">
          <thead className="text-gray-400 text-[10px] uppercase font-bold tracking-widest border-b border-gray-50">
            <tr>
              <th className="pb-4 px-2">Name</th>
              <th className="pb-4 px-2">Current Stock</th>
              <th className="pb-4 px-2">Status</th>
              <th className="pb-4 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredIngredients.map((item) => {
              const status = getStatus(item.stock);
              return (
                <tr key={item.id} className="group hover:bg-gray-50/50">
                  <td className="py-6 px-2 font-bold text-gray-800 text-lg tracking-tight">{item.name}</td>
                  <td className="py-6 px-2 font-bold text-lg text-gray-700">
                    {item.stock} 
                    <span className="text-[#3E2723] font-black uppercase text-[10px] tracking-widest ml-2">
                      {item.unit || 'kg'}
                    </span>
                  </td>
                  <td className="py-6 px-2">
                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="py-6 px-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setSelectedItem(item); setNewStockInput(item.stock.toString()); setIsAdjustModalOpen(true); }} className="bg-gray-100 hover:bg-[#3E2723] hover:text-white text-gray-500 p-2.5 rounded-xl transition-all">
                        <Edit3 size={18} />
                      </button>
                      <button onClick={() => { setSelectedItem(item); setIsDeleteModalOpen(true); }} className="bg-gray-100 hover:bg-red-500 hover:text-white text-gray-500 p-2.5 rounded-xl transition-all">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};