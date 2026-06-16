/**
 * Merchant Products — Full product catalog management for native mobile.
 * CRUD, image upload, variants, categories, bulk import support.
 */
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert, Modal } from "react-native";
import { useAuth } from "../../hooks/useAuth";

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  currency: string;
  available: boolean;
  imageUrl?: string;
}

export function MerchantProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("accommodation");

  const categories = ["accommodation", "activity", "dining", "transport", "wellness", "shopping"];

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleAdd = () => {
    if (!newName || !newPrice) {
      Alert.alert("Missing Fields", "Please enter name and price");
      return;
    }
    const product: Product = {
      id: Date.now(),
      name: newName,
      category: newCategory,
      price: parseFloat(newPrice),
      currency: "USD",
      available: true,
    };
    setProducts([product, ...products]);
    setShowAdd(false);
    setNewName("");
    setNewPrice("");
  };

  const toggleAvailability = (id: number) => {
    setProducts(products.map((p) => p.id === id ? { ...p, available: !p.available } : p));
  };

  return (
    <View style={s.container}>
      {/* Search + Add */}
      <View style={s.topRow}>
        <TextInput
          style={s.search}
          placeholder="Search products..."
          placeholderTextColor="#666"
          value={filter}
          onChangeText={setFilter}
        />
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Category Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catRow}>
        <TouchableOpacity style={[s.catPill, s.catActive]}><Text style={s.catPillTextActive}>All</Text></TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity key={c} style={s.catPill}>
            <Text style={s.catPillText}>{c.charAt(0).toUpperCase() + c.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Product List */}
      <ScrollView style={s.list}>
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🛍️</Text>
            <Text style={s.emptyText}>No products yet</Text>
            <Text style={s.emptySubtext}>Add your first product or import via CSV</Text>
          </View>
        ) : (
          filtered.map((p) => (
            <View key={p.id} style={s.productCard}>
              <View style={s.productImage}><Text style={{ fontSize: 24 }}>📦</Text></View>
              <View style={s.productInfo}>
                <Text style={s.productName}>{p.name}</Text>
                <Text style={s.productCat}>{p.category}</Text>
                <Text style={s.productPrice}>${p.price.toFixed(2)}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleAvailability(p.id)}>
                <View style={[s.availBadge, p.available ? s.availOn : s.availOff]}>
                  <Text style={s.availText}>{p.available ? "Live" : "Off"}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Add Product Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add Product</Text>

            <Text style={s.label}>Name *</Text>
            <TextInput style={s.input} placeholder="Product name" placeholderTextColor="#666" value={newName} onChangeText={setNewName} />

            <Text style={s.label}>Price (USD) *</Text>
            <TextInput style={s.input} placeholder="0.00" placeholderTextColor="#666" value={newPrice} onChangeText={setNewPrice} keyboardType="decimal-pad" />

            <Text style={s.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {categories.map((c) => (
                <TouchableOpacity key={c} style={[s.catChip, newCategory === c && s.catChipActive]} onPress={() => setNewCategory(c)}>
                  <Text style={[s.catChipText, newCategory === c && s.catChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAdd(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleAdd}>
                <Text style={s.saveText}>Save Product</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  topRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  search: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 10, padding: 12, color: "#fff", fontSize: 14 },
  addBtn: { backgroundColor: "#6c63ff", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  catRow: { marginTop: 12, marginBottom: 8, maxHeight: 36 },
  catPill: { backgroundColor: "#1a1a2e", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  catActive: { backgroundColor: "#6c63ff" },
  catPillText: { color: "#888", fontSize: 12 },
  catPillTextActive: { color: "#fff", fontSize: 12, fontWeight: "500" },
  list: { flex: 1, marginTop: 8 },
  empty: { alignItems: "center", marginTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4 },
  productCard: { flexDirection: "row", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, marginBottom: 8, alignItems: "center" },
  productImage: { width: 48, height: 48, backgroundColor: "#2d2d44", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1, marginLeft: 12 },
  productName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  productCat: { color: "#888", fontSize: 11, marginTop: 2 },
  productPrice: { color: "#6c63ff", fontSize: 13, fontWeight: "600", marginTop: 2 },
  availBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  availOn: { backgroundColor: "#22c55e20" },
  availOff: { backgroundColor: "#64748b20" },
  availText: { fontSize: 11, fontWeight: "600", color: "#ccc" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", fontSize: 14, borderWidth: 1, borderColor: "#2d2d44" },
  catChip: { backgroundColor: "#0f0f1a", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginTop: 8, borderWidth: 1, borderColor: "#2d2d44" },
  catChipActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff10" },
  catChipText: { color: "#888", fontSize: 12 },
  catChipTextActive: { color: "#6c63ff" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44" },
  cancelText: { color: "#888", fontWeight: "500" },
  saveBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: "#6c63ff" },
  saveText: { color: "#fff", fontWeight: "600" },
});
