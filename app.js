// Step 1: Import functions from the Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCQHrxquQTprRsX-IMLyaO3USu9yS-KFPM",
    authDomain: "lpg-shop-manager.firebaseapp.com",
    projectId: "lpg-shop-manager",
    storageBucket: "lpg-shop-manager.appspot.com",
    messagingSenderId: "466744007970",
    appId: "1:466744007970:web:7fdcf799f685326a9a597b"
};

// Initialize Firebase and Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- Firestore Collection References ---
const stockCollectionRef = collection(db, 'stock');
const vendorsCollectionRef = collection(db, 'vendors');
const salesCollectionRef = collection(db, 'sales');
const expensesCollectionRef = collection(db, 'expenses');
const paymentsCollectionRef = collection(db, 'payments');
const returnsCollectionRef = collection(db, 'cylinder_returns');

// --- Global State ---
let allVendors = [];
let allStock = [];

// --- UI Navigation & Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');
            loadPageData(targetId);
        });
    });

    // Initial data fetch
    Promise.all([fetchAllVendors(), fetchAllStock()]).then(() => {
        loadPageData('dashboard');
        attachAllListeners();
    });
});

function loadPageData(pageId) {
    switch (pageId) {
        case 'dashboard': loadDashboardData(); break;
        case 'stock': displayStock(); break;
        case 'vendors': displayVendors(); break;
        case 'sales': displaySales(); populateSalesCylinderDropdown(); break;
        case 'expenses': displayExpenses(); populateExpenseReportVendorDropdown(); break;
        case 'reports': populateReportVendorDropdown(); break;
    }
}

// --- Attach all event listeners ---
function attachAllListeners() {
    const safeAddListener = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with ID '${id}' not found. Listener not attached.`);
        }
    };

    // Forms
    safeAddListener('stock-form', 'submit', handleStockForm);
    safeAddListener('vendor-form', 'submit', handleVendorForm);
    safeAddListener('sales-form', 'submit', handleSalesForm);
    safeAddListener('expense-form', 'submit', handleExpenseForm);
    safeAddListener('report-form', 'submit', handleReportGeneration);
    safeAddListener('expense-report-form', 'submit', handleExpenseReportGeneration);
    safeAddListener('due-payment-form', 'submit', handleDuePaymentForm);
    safeAddListener('cylinder-return-form', 'submit', handleCylinderReturnForm);

    // Search and Filters
    safeAddListener('vendor-list-search', 'input', displayVendors);
    safeAddListener('sales-history-filter', 'change', displaySales);
    safeAddListener('sales-history-start-date', 'change', displaySales);
    safeAddListener('sales-history-end-date', 'change', displaySales);

    // Vendor Search (Sales & Expenses)
    safeAddListener('sales-vendor-search', 'input', (e) => handleVendorSearch(e, 'sales'));
    safeAddListener('expense-vendor-search', 'input', (e) => handleVendorSearch(e, 'expense'));
    
    // Other UI elements
    safeAddListener('add-new-vendor-btn', 'click', handleAddNewVendorFromSale);
    safeAddListener('is-vendor-expense', 'change', (e) => {
        const container = document.getElementById('expense-vendor-search-container');
        if (container) container.style.display = e.target.checked ? 'block' : 'none';
    });
    safeAddListener('use-custom-rate', 'change', (e) => {
        const customRateContainer = document.getElementById('custom-rate-input-container');
        if(customRateContainer) customRateContainer.style.display = e.target.checked ? 'block' : 'none';
        calculateAndDisplaySaleTotal();
    });
    
    // Listen for changes to calculate sales total
    safeAddListener('sales-quantity', 'input', calculateAndDisplaySaleTotal);
    safeAddListener('custom-sale-rate', 'input', calculateAndDisplaySaleTotal);
    safeAddListener('sales-cylinder', 'change', checkCustomRate); // <-- MODIFIED LINE
    
    safeAddListener('selected-vendor-id', 'change', checkCustomRate);

    // Modals
    document.querySelectorAll('.modal .close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
    
    // Report type changes
    safeAddListener('report-type', 'change', (e) => {
        const customDateRange = document.getElementById('custom-date-range');
        if(customDateRange) customDateRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });
    safeAddListener('expense-report-type', 'change', (e) => {
        const customDateRange = document.getElementById('expense-custom-date-range');
        if(customDateRange) customDateRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });
    safeAddListener('sales-history-filter', 'change', (e) => {
        const customDateRange = document.getElementById('sales-history-custom-range');
        if(customDateRange) customDateRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });

    // Dynamic actions (edit/delete/view)
    document.body.addEventListener('click', handleActionButtons);
}


// --- Form Handlers ---
async function handleStockForm(e) {
    e.preventDefault();
    const brand = document.getElementById('stock-brand').value.trim();
    const weight = parseFloat(document.getElementById('stock-weight').value);
    const quantity = parseInt(document.getElementById('stock-quantity').value);
    const costPrice = parseFloat(document.getElementById('stock-cost-price').value);
    const salePrice = parseFloat(document.getElementById('stock-sale-price').value);

    if (!brand || isNaN(weight) || isNaN(quantity) || isNaN(costPrice) || isNaN(salePrice)) {
        alert("Please fill all fields with valid numbers.");
        return;
    }

    const docId = `${brand.toLowerCase().replace(/\s/g, '-')}-${weight}kg`;
    const docRef = doc(stockCollectionRef, docId);

    try {
        await setDoc(docRef, { brand, weight, quantity, costPrice, salePrice }, { merge: true });
        alert('Stock added/updated successfully!');
        e.target.reset();
        await fetchAllStock();
        displayStock();
    } catch (error) {
        console.error("Error adding stock: ", error);
        alert('Failed to add stock.');
    }
}

async function handleVendorForm(e) {
    e.preventDefault();
    const name = document.getElementById('vendor-name').value.trim();
    const contact = document.getElementById('vendor-contact').value.trim();
    const phone = document.getElementById('vendor-phone').value.trim();

    if (!name || !phone) {
        alert("Vendor Name and Phone are required.");
        return;
    }
    
    try {
        await addDoc(vendorsCollectionRef, { name, contact, phone, customRates: {}, alwaysApply: {}, totalDues: 0, cylindersSold: 0, cylindersReturned: 0 });
        alert('Vendor added successfully!');
        e.target.reset();
        await fetchAllVendors();
        displayVendors();
    } catch (error) {
        console.error("Error adding vendor: ", error);
        alert('Failed to add vendor.');
    }
}

async function handleSalesForm(e) {
    e.preventDefault();
    const vendorId = document.getElementById('selected-vendor-id').value;
    const cylinderId = document.getElementById('sales-cylinder').value;
    const quantitySold = parseInt(document.getElementById('sales-quantity').value);
    const paidAmount = parseFloat(document.getElementById('paid-amount').value);
    const cylindersReturnedAtSale = parseInt(document.getElementById('goted-cylinder-count').value) || 0;
    const customer = document.getElementById('sales-customer').value.trim();

    if (!vendorId || !cylinderId || isNaN(quantitySold) || quantitySold <= 0 || isNaN(paidAmount)) {
        alert('Please fill all required fields with valid numbers.');
        return;
    }

    const stockDocRef = doc(stockCollectionRef, cylinderId);
    const useCusRate = document.getElementById('use-custom-rate').checked;
    const customRate = parseFloat(document.getElementById('custom-sale-rate').value);
    
    if (useCusRate && isNaN(customRate)) {
        alert("Please enter a valid custom rate.");
        return;
    }

    try {
        const batch = writeBatch(db);
        const { salePrice, costPrice, cylinderName } = await runTransaction(db, async (transaction) => {
            const stockDoc = await transaction.get(stockDocRef);
            if (!stockDoc.exists()) throw new Error("Stock item not found!");

            const stockData = stockDoc.data();
            if (stockData.quantity < quantitySold) throw new Error("Not enough stock available!");

            const newQuantity = stockData.quantity - quantitySold;
            transaction.update(stockDocRef, { quantity: newQuantity });
            
            return {
                salePrice: useCusRate && !isNaN(customRate) ? customRate : stockData.salePrice,
                costPrice: stockData.costPrice,
                cylinderName: `${stockData.brand} ${stockData.weight}kg`
            };
        });

        const totalAmount = salePrice * quantitySold;
        const dueAmount = totalAmount - paidAmount;
        const profit = totalAmount - (costPrice * quantitySold);
        const vendorInfo = allVendors.find(v => v.id === vendorId);
        const vendorDocRef = doc(vendorsCollectionRef, vendorId);

        // Update vendor aggregates
        const newVendorDues = (vendorInfo.totalDues || 0) + dueAmount;
        const newCylindersSold = (vendorInfo.cylindersSold || 0) + quantitySold;
        const newCylindersReturned = (vendorInfo.cylindersReturned || 0) + cylindersReturnedAtSale;
        batch.update(vendorDocRef, { 
            totalDues: newVendorDues, 
            cylindersSold: newCylindersSold,
            cylindersReturned: newCylindersReturned
        });

        // Create Sale Record
        const saleRecord = {
            cylinderId,
            cylinderName,
            vendorId,
            vendorName: vendorInfo ? vendorInfo.name : 'Unknown',
            quantity: quantitySold,
            totalAmount,
            paidAmount,
            dueAmount,
            profit,
            customer,
            saleDate: serverTimestamp(),
            // Static record of cylinders to collect at time of sale
            cylindersToCollectAtSale: (vendorInfo.cylindersSold || 0) + quantitySold - newCylindersReturned
        };
        batch.set(doc(salesCollectionRef), saleRecord);

        // Create Initial Payment Record if paid
        if (paidAmount > 0) {
            batch.set(doc(paymentsCollectionRef), {
                vendorId,
                amount: paidAmount,
                paymentDate: serverTimestamp(),
                isInitialPayment: true
            });
        }
        
        // Create Initial Return Record if returned
        if (cylindersReturnedAtSale > 0) {
            batch.set(doc(returnsCollectionRef), {
                vendorId,
                count: cylindersReturnedAtSale,
                returnDate: serverTimestamp(),
                isInitialReturn: true
            });
        }

        // Update custom rate preference
        const alwaysApply = document.getElementById('always-apply-rate').checked;
        const vendorUpdateData = {
            [`customRates.${cylinderId}`]: useCusRate ? customRate : null,
            [`alwaysApply.${cylinderId}`]: alwaysApply
        };
        batch.update(vendorDocRef, vendorUpdateData);

        await batch.commit();

        alert('Sale recorded successfully!');
        e.target.reset();
        document.getElementById('calculated-price').textContent = 'BDT 0.00';
        document.getElementById('selected-vendor-id').value = '';
        document.getElementById('sales-vendor-search').value = '';
        document.getElementById('use-custom-rate').checked = false;
        document.getElementById('custom-rate-input-container').style.display = 'none';

        await fetchAllVendors();
        await fetchAllStock();
        displaySales();
        populateSalesCylinderDropdown();
        loadDashboardData();
    } catch (error) {
        console.error("Sale transaction failed: ", error);
        alert(`Failed to record sale: ${error.message}`);
    }
}

async function handleExpenseForm(e) {
    e.preventDefault();
    const type = document.getElementById('expense-type').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const description = document.getElementById('expense-desc').value.trim();
    const isVendorExpense = document.getElementById('is-vendor-expense').checked;
    const vendorId = document.getElementById('expense-selected-vendor-id').value;

    if (!type || isNaN(amount)) {
        alert("Please fill Expense Type and Amount.");
        return;
    }
    if(isVendorExpense && !vendorId) {
        alert("Please select a vendor for this expense.");
        return;
    }

    let expenseData = {
        type,
        amount,
        description,
        expenseDate: serverTimestamp(),
        isVendorExpense
    };

    if(isVendorExpense && vendorId) {
        const vendorInfo = allVendors.find(v => v.id === vendorId);
        expenseData.vendorId = vendorId;
        expenseData.vendorName = vendorInfo ? vendorInfo.name : 'Unknown';
    }

    try {
        await addDoc(expensesCollectionRef, expenseData);
        alert('Expense added successfully!');
        e.target.reset();
        document.getElementById('expense-vendor-search-container').style.display = 'none';
        displayExpenses();
        loadDashboardData();
    } catch (error) {
        console.error("Error adding expense: ", error);
        alert('Failed to add expense.');
    }
}

async function handleDuePaymentForm(e) {
    e.preventDefault();
    const vendorId = e.target.dataset.vendorId;
    const paymentAmount = parseFloat(document.getElementById('due-payment-amount').value);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
        alert("Please enter a valid payment amount.");
        return;
    }

    const vendorDocRef = doc(vendorsCollectionRef, vendorId);
    
    try {
        const batch = writeBatch(db);

        batch.set(doc(paymentsCollectionRef), {
            vendorId,
            amount: paymentAmount,
            paymentDate: serverTimestamp(),
            isInitialPayment: false
        });

        const vendor = allVendors.find(v => v.id === vendorId);
        const newTotalDues = (vendor.totalDues || 0) - paymentAmount;
        batch.update(vendorDocRef, { totalDues: newTotalDues });
        
        await batch.commit();

        alert("Payment updated successfully!");
        document.getElementById('due-payment-modal').style.display = 'none';
        await fetchAllVendors();
        displayVendors();
        loadDashboardData(); // Refresh dashboard
    } catch (error) {
        console.error("Error updating due payment: ", error);
        alert("Failed to update payment.");
    }
}

async function handleCylinderReturnForm(e) {
    e.preventDefault();
    const vendorId = e.target.dataset.vendorId;
    const returnCount = parseInt(document.getElementById('returned-cylinder-count').value);
    
    const vendor = allVendors.find(v => v.id === vendorId);
    const cylindersToCollect = (vendor.cylindersSold || 0) - (vendor.cylindersReturned || 0);

    if (isNaN(returnCount) || returnCount <= 0 || returnCount > cylindersToCollect) {
        alert(`Please enter a valid number of cylinders (1 to ${cylindersToCollect}).`);
        return;
    }

    const vendorDocRef = doc(vendorsCollectionRef, vendorId);

    try {
        const batch = writeBatch(db);

        batch.set(doc(returnsCollectionRef), {
            vendorId,
            count: returnCount,
            returnDate: serverTimestamp(),
            isInitialReturn: false
        });

        const newReturnedCount = (vendor.cylindersReturned || 0) + returnCount;
        batch.update(vendorDocRef, { cylindersReturned: newReturnedCount });

        await batch.commit();

        alert("Cylinder returns updated successfully!");
        document.getElementById('cylinder-return-modal').style.display = 'none';
        await fetchAllVendors();
        displayVendors();
        loadDashboardData(); // Refresh dashboard
    } catch (error) {
        console.error("Error updating cylinder returns: ", error);
        alert("Failed to update returns.");
    }
}

// --- Vendor Search, Custom Rates, etc. ---
async function fetchAllVendors() {
    const snapshot = await getDocs(query(vendorsCollectionRef, orderBy('name')));
    allVendors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function fetchAllStock() {
    const snapshot = await getDocs(query(stockCollectionRef, orderBy('brand')));
    allStock = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function handleVendorSearch(e, context) {
    const input = e.target.value.toLowerCase().trim();
    const resultsContainerId = context === 'sales' ? 'vendor-search-results' : 'expense-vendor-search-results';
    const selectedVendorIdInputId = context === 'sales' ? 'selected-vendor-id' : 'expense-selected-vendor-id';
    const addNewBtnId = context === 'sales' ? 'add-new-vendor-btn' : null;

    const resultsContainer = document.getElementById(resultsContainerId);
    const addNewVendorBtn = addNewBtnId ? document.getElementById(addNewBtnId) : null;

    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'none';
    if(addNewVendorBtn) addNewVendorBtn.style.display = 'none';
    
    document.getElementById(selectedVendorIdInputId).value = '';

    if (input.length === 0) {
        return;
    }

    const matches = allVendors.filter(v => 
        (v.name && v.name.toLowerCase().includes(input)) || 
        (v.phone && v.phone.includes(input))
    );

    if (matches.length > 0) {
        matches.forEach(vendor => {
            const div = document.createElement('div');
            div.innerHTML = `${vendor.name} - <strong>${vendor.phone}</strong>`;
            div.addEventListener('click', () => {
                e.target.value = `${vendor.name} (${vendor.phone})`;
                const selectedVendorInput = document.getElementById(selectedVendorIdInputId);
                selectedVendorInput.value = vendor.id;
                if (context === 'sales') {
                    selectedVendorInput.dispatchEvent(new Event('change'));
                }
                resultsContainer.style.display = 'none';
            });
            resultsContainer.appendChild(div);
        });
        resultsContainer.style.display = 'block';
    } else {
        if(addNewVendorBtn) addNewVendorBtn.style.display = 'block';
    }
}

function checkCustomRate() {
    const vendorId = document.getElementById('selected-vendor-id').value;
    const cylinderId = document.getElementById('sales-cylinder').value;

    const useCustomRateCheckbox = document.getElementById('use-custom-rate');
    const customRateInput = document.getElementById('custom-sale-rate');
    const alwaysApplyCheckbox = document.getElementById('always-apply-rate');
    const customRateContainer = document.getElementById('custom-rate-input-container');

    useCustomRateCheckbox.checked = false;
    customRateInput.value = '';
    alwaysApplyCheckbox.checked = false;
    customRateContainer.style.display = 'none';

    if (!vendorId || !cylinderId) return;
    
    const vendor = allVendors.find(v => v.id === vendorId);
    if (!vendor) return;

    const alwaysApply = vendor.alwaysApply && vendor.alwaysApply[cylinderId];
    const customRate = vendor.customRates && vendor.customRates[cylinderId];
    
    if (alwaysApply && customRate) {
        useCustomRateCheckbox.checked = true;
        customRateInput.value = customRate;
        alwaysApplyCheckbox.checked = true;
        customRateContainer.style.display = 'block';
    }
    calculateAndDisplaySaleTotal();
}

function calculateAndDisplaySaleTotal() {
    const cylinderId = document.getElementById('sales-cylinder').value;
    const quantity = parseInt(document.getElementById('sales-quantity').value);
    const useCusRate = document.getElementById('use-custom-rate').checked;
    const customRate = parseFloat(document.getElementById('custom-sale-rate').value);
    const priceDisplay = document.getElementById('calculated-price');

    if (!priceDisplay) return;

    if (!cylinderId || isNaN(quantity) || quantity <= 0) {
        priceDisplay.textContent = 'BDT 0.00';
        return;
    }

    const stockItem = allStock.find(s => s.id === cylinderId);
    if (!stockItem) return;

    const salePrice = useCusRate && !isNaN(customRate) ? customRate : stockItem.salePrice;
    const total = salePrice * quantity;
    priceDisplay.textContent = `BDT ${total.toFixed(2)}`;
}

async function handleAddNewVendorFromSale() {
    const name = prompt("Enter new vendor's name:");
    if (!name) return;
    const phone = prompt("Enter new vendor's phone number:");
    if (!phone) return;

    try {
        const docRef = await addDoc(vendorsCollectionRef, { name, contact: '', phone, customRates: {}, alwaysApply: {}, totalDues: 0, cylindersSold: 0, cylindersReturned: 0 });
        alert('New vendor added!');
        await fetchAllVendors();
        document.getElementById('sales-vendor-search').value = `${name} (${phone})`;
        document.getElementById('selected-vendor-id').value = docRef.id;
        document.getElementById('add-new-vendor-btn').style.display = 'none';
    } catch (error) {
        alert('Failed to add new vendor.');
        console.error(error);
    }
}

// --- Action Buttons (Edit/Delete/View/Due/Return) ---
async function handleActionButtons(e) {
    const target = e.target;
    const id = target.dataset.id;
    const collectionName = target.dataset.collection;

    if (target.classList.contains('delete-btn')) {
        if (confirm(`Are you sure you want to delete this item?`)) {
            try {
                await deleteDoc(doc(db, collectionName, id));
                alert('Item deleted!');
                if (collectionName === 'stock') await fetchAllStock();
                if (collectionName === 'vendors') await fetchAllVendors();
                loadPageData(document.querySelector('.page.active').id);
            } catch (error) {
                alert('Failed to delete item.');
                console.error(error);
            }
        }
    } else if (target.classList.contains('edit-btn')) {
        openEditModal(collectionName, id);
    } else if (target.classList.contains('view-btn')) {
        openVendorSummaryModal(id);
    } else if (target.classList.contains('due-btn')) {
        openDuePaymentModal(id);
    } else if (target.classList.contains('return-btn')) {
        openCylinderReturnModal(id);
    }
}

// --- Modals ---
async function openEditModal(collectionName, id) {
    const modal = document.getElementById('edit-modal');
    const form = document.getElementById('edit-form');
    form.innerHTML = '';

    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        alert("Item not found!");
        return;
    }
    const data = docSnap.data();
    
    let formHtml = '';
    if (collectionName === 'stock') {
        formHtml = `
            <label>Brand</label><input type="text" value="${data.brand}" readonly>
            <label>Weight (kg)</label><input type="number" value="${data.weight}" readonly>
            <label>Quantity</label><input type="number" id="edit-quantity" value="${data.quantity}" required>
            <label>Cost Price (BDT)</label><input type="number" id="edit-cost-price" value="${data.costPrice}" step="0.01" required>
            <label>Default Sale Price (BDT)</label><input type="number" id="edit-sale-price" value="${data.salePrice}" step="0.01" required>
            <button type="submit">Save Changes</button>
        `;
    } else if (collectionName === 'vendors') {
        formHtml = `
            <label>Vendor Name</label><input type="text" id="edit-vendor-name" value="${data.name}" required>
            <label>Contact Person</label><input type="text" id="edit-vendor-contact" value="${data.contact || ''}">
            <label>Phone</label><input type="tel" id="edit-vendor-phone" value="${data.phone}" required>
            <button type="submit">Save Changes</button>
        `;
    }
    form.innerHTML = formHtml;
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        let updatedData = {};
        if (collectionName === 'stock') {
            updatedData = {
                quantity: parseInt(document.getElementById('edit-quantity').value),
                costPrice: parseFloat(document.getElementById('edit-cost-price').value),
                salePrice: parseFloat(document.getElementById('edit-sale-price').value)
            };
        } else if (collectionName === 'vendors') {
            updatedData = {
                name: document.getElementById('edit-vendor-name').value,
                contact: document.getElementById('edit-vendor-contact').value,
                phone: document.getElementById('edit-vendor-phone').value
            };
        }
        
        try {
            await updateDoc(docRef, updatedData);
            alert("Update successful!");
            modal.style.display = 'none';
            if (collectionName === 'stock') await fetchAllStock();
            if (collectionName === 'vendors') await fetchAllVendors();
            loadPageData(document.querySelector('.page.active').id);
        } catch (error) {
            alert("Update failed!");
            console.error(error);
        }
    };

    modal.style.display = 'block';
}

function openDuePaymentModal(vendorId) {
    const vendor = allVendors.find(v => v.id === vendorId);
    if (!vendor) return;
    
    document.getElementById('due-vendor-name').textContent = vendor.name;
    document.getElementById('due-current-amount').textContent = `BDT ${(vendor.totalDues || 0).toFixed(2)}`;
    document.getElementById('due-payment-form').dataset.vendorId = vendorId;
    document.getElementById('due-payment-modal').style.display = 'block';
    document.getElementById('due-payment-form').reset();
}

function openCylinderReturnModal(vendorId) {
    const vendor = allVendors.find(v => v.id === vendorId);
    if (!vendor) return;
    
    const cylindersToCollect = (vendor.cylindersSold || 0) - (vendor.cylindersReturned || 0);
    
    document.getElementById('return-vendor-name').textContent = vendor.name;
    document.getElementById('return-cylinders-to-collect').textContent = cylindersToCollect;
    document.getElementById('cylinder-return-form').dataset.vendorId = vendorId;
    document.getElementById('cylinder-return-modal').style.display = 'block';
    document.getElementById('cylinder-return-form').reset();
}

async function openVendorSummaryModal(vendorId) {
    const vendor = allVendors.find(v => v.id === vendorId);
    if (!vendor) return;

    document.getElementById('summary-vendor-name').textContent = `${vendor.name}'s Summary`;
    const contentDiv = document.getElementById('vendor-summary-content');
    contentDiv.innerHTML = '<h4>Loading...</h4>';
    document.getElementById('vendor-summary-modal').style.display = 'block';
    
    try {
        const salesQuery = query(salesCollectionRef, where('vendorId', '==', vendorId));
        const paymentsQuery = query(paymentsCollectionRef, where('vendorId', '==', vendorId));
        const returnsQuery = query(returnsCollectionRef, where('vendorId', '==', vendorId));
        const expensesQuery = query(expensesCollectionRef, where('vendorId', '==', vendorId));

        const [salesSnap, paymentsSnap, returnsSnap, expensesSnap] = await Promise.all([
            getDocs(salesQuery), getDocs(paymentsQuery), getDocs(returnsQuery), getDocs(expensesQuery)
        ]);
        
        const salesData = salesSnap.docs.map(d => d.data()).sort((a,b) => b.saleDate.toDate() - a.saleDate.toDate());
        const paymentsData = paymentsSnap.docs.map(d => d.data()).sort((a,b) => b.paymentDate.toDate() - a.paymentDate.toDate());
        const returnsData = returnsSnap.docs.map(d => d.data()).sort((a,b) => b.returnDate.toDate() - a.returnDate.toDate());
        const expensesData = expensesSnap.docs.map(d => d.data()).sort((a,b) => b.expenseDate.toDate() - a.expenseDate.toDate());

        let html = `
            <div class="summary-section">
                <h4>Customer Information</h4>
                <p><strong>Name:</strong> ${vendor.name}</p>
                <p><strong>Phone:</strong> ${vendor.phone}</p>
                <p><strong>Contact Person:</strong> ${vendor.contact || 'N/A'}</p>
            </div>
            <div class="summary-section">
                <h4>Financial Summary</h4>
                <p><strong>Total Dues:</strong> BDT ${(vendor.totalDues || 0).toFixed(2)}</p>
            </div>
            <div class="summary-section">
                <h4>Cylinder Summary</h4>
                <p><strong>Total Cylinders Sold:</strong> ${vendor.cylindersSold || 0}</p>
                <p><strong>Total Cylinders Returned:</strong> ${vendor.cylindersReturned || 0}</p>
                <p><strong>Pending Cylinders:</strong> ${(vendor.cylindersSold || 0) - (vendor.cylindersReturned || 0)}</p>
            </div>
        `;

        html += `<div class="summary-section"><h4>Order History</h4><div class="table-wrapper"><table><thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Total</th><th>Due</th></tr></thead><tbody>`;
        if (salesData.length === 0) {
            html += `<tr><td colspan="5">No orders found.</td></tr>`;
        } else {
            salesData.forEach(sale => {
                html += `<tr><td>${sale.saleDate.toDate().toLocaleDateString()}</td><td>${sale.cylinderName || 'N/A'}</td><td>${sale.quantity}</td><td>${sale.totalAmount.toFixed(2)}</td><td>${sale.dueAmount.toFixed(2)}</td></tr>`;
            });
        }
        html += `</tbody></table></div></div>`;

        html += `<div class="summary-section"><h4>Payment History</h4><div class="table-wrapper"><table><thead><tr><th>Date</th><th>Amount Paid</th></tr></thead><tbody>`;
        if (paymentsData.length === 0) {
            html += `<tr><td colspan="2">No payments found.</td></tr>`;
        } else {
            paymentsData.forEach(payment => {
                html += `<tr><td>${payment.paymentDate.toDate().toLocaleDateString()}</td><td>${payment.amount.toFixed(2)}</td></tr>`;
            });
        }
        html += `</tbody></table></div></div>`;
        
        html += `<div class="summary-section"><h4>Cylinder Return History</h4><div class="table-wrapper"><table><thead><tr><th>Date</th><th>Count</th></tr></thead><tbody>`;
        if (returnsData.length === 0) {
            html += `<tr><td colspan="2">No returns found.</td></tr>`;
        } else {
            returnsData.forEach(ret => {
                html += `<tr><td>${ret.returnDate.toDate().toLocaleDateString()}</td><td>${ret.count}</td></tr>`;
            });
        }
        html += `</tbody></table></div></div>`;

        html += `<div class="summary-section"><h4>Associated Expenses</h4><div class="table-wrapper"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th></tr></thead><tbody>`;
        if (expensesData.length === 0) {
            html += `<tr><td colspan="3">No associated expenses found.</td></tr>`;
        } else {
            expensesData.forEach(expense => {
                html += `<tr><td>${expense.expenseDate.toDate().toLocaleDateString()}</td><td>${expense.type}</td><td>${expense.amount.toFixed(2)}</td></tr>`;
            });
        }
        html += `</tbody></table></div></div>`;

        contentDiv.innerHTML = html;
    } catch (error) {
        console.error("Error loading vendor summary:", error);
        contentDiv.innerHTML = '<h4>Could not load summary data. Please try again.</h4>';
    }
}

// --- Display Functions ---
async function displayStock() {
    const tableBody = document.getElementById('stock-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    allStock.forEach(item => {
        const row = `<tr>
            <td>${item.brand}</td>
            <td>${item.weight} kg</td>
            <td>${item.quantity}</td>
            <td>BDT ${item.costPrice.toFixed(2)}</td>
            <td>BDT ${item.salePrice.toFixed(2)}</td>
            <td>
                <button class="action-btn edit-btn" data-id="${item.id}" data-collection="stock">Edit</button>
                <button class="action-btn delete-btn" data-id="${item.id}" data-collection="stock">Delete</button>
            </td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

async function displayVendors() {
    const searchInput = document.getElementById('vendor-list-search');
    if(!searchInput) return;
    const searchTerm = searchInput.value.toLowerCase();
    const tableBody = document.getElementById('vendor-table-body');
    tableBody.innerHTML = '';
    
    const filteredVendors = allVendors.filter(v => 
        (v.name && v.name.toLowerCase().includes(searchTerm)) || 
        (v.phone && v.phone.includes(searchTerm))
    );

    filteredVendors.forEach(vendor => {
        const cylindersToCollect = (vendor.cylindersSold || 0) - (vendor.cylindersReturned || 0);
        const row = `<tr>
            <td>${vendor.name}</td>
            <td>${vendor.phone}</td>
            <td>BDT ${(vendor.totalDues || 0).toFixed(2)}</td>
            <td>${cylindersToCollect}</td>
            <td>
                <button class="action-btn view-btn" data-id="${vendor.id}">View</button>
                <button class="action-btn due-btn" data-id="${vendor.id}">Pay Due</button>
                <button class="action-btn return-btn" data-id="${vendor.id}">Return</button>
                <button class="action-btn edit-btn" data-id="${vendor.id}" data-collection="vendors">Edit</button>
                <button class="action-btn delete-btn" data-id="${vendor.id}" data-collection="vendors">Delete</button>
            </td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

async function displaySales() {
    const filterSelect = document.getElementById('sales-history-filter');
    if(!filterSelect) return;
    const filter = filterSelect.value;
    let constraints = [];
    
    if (filter !== 'all-time') {
        let startDate;
        const endDate = new Date();
        switch(filter) {
            case 'daily': startDate = new Date(); startDate.setHours(0,0,0,0); break;
            case 'weekly': startDate = new Date(); startDate.setDate(endDate.getDate() - 7); break;
            case 'monthly': startDate = new Date(); startDate.setMonth(endDate.getMonth() - 1); break;
            case 'custom':
                const startVal = document.getElementById('sales-history-start-date').value;
                const endVal = document.getElementById('sales-history-end-date').value;
                if(startVal && endVal) {
                    startDate = new Date(startVal);
                    constraints.push(where('saleDate', '>=', startDate), where('saleDate', '<=', new Date(endVal)));
                }
                break;
        }
        if(startDate && filter !== 'custom') constraints.push(where('saleDate', '>=', startDate));
    }
    
    const q = query(salesCollectionRef, ...constraints, orderBy('saleDate', 'desc'));
    const snapshot = await getDocs(q);
    const tableBody = document.getElementById('sales-table-body');
    tableBody.innerHTML = '';
    snapshot.forEach(doc => {
        const sale = doc.data();
        const saleDate = sale.saleDate ? sale.saleDate.toDate().toLocaleString() : 'Processing...';
        const row = `<tr>
            <td>${saleDate}</td>
            <td>${sale.vendorName || 'N/A'}</td>
            <td>${sale.quantity}</td>
            <td>${sale.cylindersToCollectAtSale || 'N/A'}</td>
            <td>BDT ${sale.totalAmount.toFixed(2)}</td>
            <td>BDT ${sale.dueAmount.toFixed(2)}</td>
            <td>BDT ${(sale.profit || 0).toFixed(2)}</td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

async function displayExpenses() {
    const q = query(expensesCollectionRef, orderBy('expenseDate', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    const tableBody = document.getElementById('expense-table-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    snapshot.forEach(doc => {
        const expense = doc.data();
        const expenseDate = expense.expenseDate ? expense.expenseDate.toDate().toLocaleString() : 'Processing...';
        const row = `<tr>
            <td>${expenseDate}</td>
            <td>${expense.type}</td>
            <td>${expense.vendorName || 'General'}</td>
            <td>BDT ${expense.amount.toFixed(2)}</td>
            <td>${expense.description || 'N/A'}</td>
            <td><button class="action-btn delete-btn" data-id="${doc.id}" data-collection="expenses">Delete</button></td>
        </tr>`;
        tableBody.innerHTML += row;
    });
}

// --- Dashboard & Reports ---
async function loadDashboardData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const salesQuery = query(salesCollectionRef, where('saleDate', '>=', today));
    const salesSnapshot = await getDocs(salesQuery);
    
    let todaysSales = 0, todaysProfit = 0, cylindersSold = 0, todaysNewDues = 0;
    const vendorSales = {};

    salesSnapshot.forEach(doc => {
        const sale = doc.data();
        todaysSales += sale.totalAmount;
        todaysProfit += sale.profit || 0;
        cylindersSold += sale.quantity;
        todaysNewDues += sale.dueAmount;

        const vendorName = sale.vendorName || 'Unknown';
        if (!vendorSales[vendorName]) {
            vendorSales[vendorName] = { cylinders: 0, sales: 0 };
        }
        vendorSales[vendorName].cylinders += sale.quantity;
        vendorSales[vendorName].sales += sale.totalAmount;
    });

    const safeUpdateText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    safeUpdateText('todays-total-sale', todaysSales.toFixed(2));
    safeUpdateText('todays-profit', todaysProfit.toFixed(2));
    safeUpdateText('todays-cylinders-sold', cylindersSold);
    safeUpdateText('todays-new-dues', todaysNewDues.toFixed(2));
    
    const totalOutstandingDues = allVendors.reduce((acc, v) => acc + (v.totalDues || 0), 0);
    safeUpdateText('total-outstanding-dues', totalOutstandingDues.toFixed(2));
    
    const totalCylindersToCollect = allVendors.reduce((acc, v) => acc + ((v.cylindersSold || 0) - (v.cylindersReturned || 0)), 0);
    safeUpdateText('cylinders-to-collect', totalCylindersToCollect);

    const vendorTableBody = document.getElementById('vendor-sales-body');
    if (vendorTableBody) {
        vendorTableBody.innerHTML = '';
        if (Object.keys(vendorSales).length > 0) {
            for (const vendorName in vendorSales) {
                const data = vendorSales[vendorName];
                vendorTableBody.innerHTML += `<tr><td>${vendorName}</td><td>${data.cylinders}</td><td>BDT ${data.sales.toFixed(2)}</td></tr>`;
            }
        } else {
            vendorTableBody.innerHTML = `<tr><td colspan="3">No sales recorded today.</td></tr>`;
        }
    }

    const expensesQuery = query(expensesCollectionRef, where('expenseDate', '>=', today));
    const expensesSnapshot = await getDocs(expensesQuery);
    let todaysExpenses = 0;
    expensesSnapshot.forEach(doc => {
        todaysExpenses += doc.data().amount;
    });
    safeUpdateText('todays-expenses-amount', todaysExpenses.toFixed(2));

    displayStockSummary();
}

function displayStockSummary() {
    const stockBody = document.getElementById('dashboard-stock-body');
    if(!stockBody) return;
    stockBody.innerHTML = '';
    if(allStock.length > 0) {
        allStock.forEach(item => {
            stockBody.innerHTML += `<tr>
                <td>${item.brand} ${item.weight}kg</td>
                <td>${item.quantity}</td>
            </tr>`;
        });
    } else {
        stockBody.innerHTML = `<tr><td colspan="2">No stock items found.</td></tr>`;
    }
}

async function populateSalesCylinderDropdown() {
    const select = document.getElementById('sales-cylinder');
    if(!select) return;
    select.innerHTML = '<option value="">-- Select Cylinder --</option>';
    allStock.forEach(item => {
        if (item.quantity > 0) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.brand} - ${item.weight}kg (Stock: ${item.quantity})`;
            select.appendChild(option);
        }
    });
}
function populateReportVendorDropdown() {
    const select = document.getElementById('report-vendor');
    if (!select) return;
    select.innerHTML = '<option value="all">All Vendors</option>';
    allVendors.forEach(v => {
        select.innerHTML += `<option value="${v.id}">${v.name}</option>`;
    });
}
function populateExpenseReportVendorDropdown() {
    const select = document.getElementById('expense-report-vendor');
    if (!select) return;
    select.innerHTML = '<option value="all">All Expenses</option><option value="general">General Shop Expenses Only</option>';
    allVendors.forEach(v => {
        select.innerHTML += `<option value="${v.id}">${v.name}</option>`;
    });
}

async function handleReportGeneration(e) {
    e.preventDefault();
    const reportType = document.getElementById('report-type').value;
    const vendorId = document.getElementById('report-vendor').value;
    
    const constraints = [];

    if (reportType !== 'all-time') {
        let startDate, endDate;
        switch(reportType) {
            case 'daily':
                startDate = new Date();
                startDate.setHours(0,0,0,0);
                endDate = new Date();
                endDate.setHours(23,59,59,999);
                break;
            case 'weekly':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 6);
                startDate.setHours(0,0,0,0);
                endDate = new Date();
                endDate.setHours(23,59,59,999);
                break;
            case 'monthly':
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
                startDate.setHours(0,0,0,0);
                endDate = new Date();
                endDate.setHours(23,59,59,999);
                break;
            case 'custom':
                const startVal = document.getElementById('start-date').value;
                const endVal = document.getElementById('end-date').value;
                if (!startVal || !endVal) {
                    alert("Please select both a start and end date for custom reports.");
                    return;
                }
                startDate = new Date(startVal);
                endDate = new Date(endVal);
                startDate.setHours(0,0,0,0);
                endDate.setHours(23,59,59,999);
                break;
        }
        constraints.push(where('saleDate', '>=', startDate), where('saleDate', '<=', endDate));
    }

    try {
        const salesQuery = query(salesCollectionRef, ...constraints);
        
        const snapshot = await getDocs(salesQuery);
        let salesData = [];
        let vendorsInReport = new Set();
        snapshot.forEach(doc => {
            const sale = doc.data();
            if (vendorId === 'all' || sale.vendorId === vendorId) {
                salesData.push(sale);
                vendorsInReport.add(sale.vendorId);
            }
        });
        
        salesData.sort((a, b) => b.saleDate.toDate() - a.saleDate.toDate());

        let totalSales = 0, totalProfit = 0, totalCylindersSold = 0;
        const reportBody = document.getElementById('report-table-body');
        reportBody.innerHTML = '';

        if (salesData.length === 0) {
            reportBody.innerHTML = `<tr><td colspan="7">No sales found for the selected period.</td></tr>`;
        } else {
            salesData.forEach(sale => {
                totalSales += sale.totalAmount;
                totalCylindersSold += sale.quantity;
                totalProfit += sale.profit || 0;
                const vendor = allVendors.find(v => v.id === sale.vendorId);
                const cylindersToCollect = vendor ? (vendor.cylindersSold || 0) - (vendor.cylindersReturned || 0) : 'N/A';
                
                reportBody.innerHTML += `<tr>
                    <td>${sale.saleDate.toDate().toLocaleDateString()}</td>
                    <td>${sale.vendorName}</td>
                    <td>${sale.quantity}</td>
                    <td>${cylindersToCollect}</td>
                    <td>BDT ${sale.totalAmount.toFixed(2)}</td>
                    <td>BDT ${sale.dueAmount.toFixed(2)}</td>
                    <td>BDT ${(sale.profit || 0).toFixed(2)}</td>
                </tr>`;
            });
        }

        let reportTotalDues = 0;
        let reportCylindersToCollect = 0;

        allVendors.forEach(v => {
            if(vendorId === 'all' && vendorsInReport.has(v.id)) {
                reportTotalDues += v.totalDues || 0;
                reportCylindersToCollect += (v.cylindersSold || 0) - (v.cylindersReturned || 0);
            } else if (v.id === vendorId) {
                reportTotalDues = v.totalDues || 0;
                reportCylindersToCollect = (v.cylindersSold || 0) - (v.cylindersReturned || 0);
            }
        });

        document.getElementById('report-total-sales').textContent = totalSales.toFixed(2);
        document.getElementById('report-total-dues').textContent = reportTotalDues.toFixed(2);
        document.getElementById('report-total-cylinders-sold').textContent = totalCylindersSold;
        document.getElementById('report-cylinders-to-collect').textContent = reportCylindersToCollect;
        document.getElementById('report-total-profit').textContent = totalProfit.toFixed(2);
        document.getElementById('report-results').style.display = 'block';

    } catch (error) {
        console.error("Error generating report: ", error);
        alert("Failed to generate report. See console for details.");
    }
}

async function handleExpenseReportGeneration(e) {
    e.preventDefault();
    const reportType = document.getElementById('expense-report-type').value;
    const vendorFilter = document.getElementById('expense-report-vendor').value;
    
    const constraints = [];

    if (reportType !== 'all-time') {
        let startDate, endDate;
        switch(reportType) {
            case 'daily':
                startDate = new Date();
                startDate.setHours(0,0,0,0);
                endDate = new Date();
                endDate.setHours(23,59,59,999);
                break;
            case 'weekly':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 6);
                startDate.setHours(0,0,0,0);
                endDate = new Date();
                endDate.setHours(23,59,59,999);
                break;
            case 'monthly':
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 1);
                startDate.setHours(0,0,0,0);
                endDate = new Date();
                endDate.setHours(23,59,59,999);
                break;
            case 'custom':
                const startVal = document.getElementById('expense-start-date').value;
                const endVal = document.getElementById('expense-end-date').value;
                if (!startVal || !endVal) {
                    alert("Please select both a start and end date for custom reports.");
                    return;
                }
                startDate = new Date(startVal);
                endDate = new Date(endVal);
                startDate.setHours(0,0,0,0);
                endDate.setHours(23,59,59,999);
                break;
        }
        constraints.push(where('expenseDate', '>=', startDate), where('expenseDate', '<=', endDate));
    }
    
    try {
        const expensesQuery = query(expensesCollectionRef, ...constraints);
        
        const snapshot = await getDocs(expensesQuery);
        let expenseData = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (vendorFilter === 'all') {
                expenseData.push(data);
            } else if (vendorFilter === 'general' && !data.isVendorExpense) {
                expenseData.push(data);
            } else if (data.vendorId === vendorFilter) {
                expenseData.push(data);
            }
        });
        
        expenseData.sort((a, b) => b.expenseDate.toDate() - a.expenseDate.toDate());

        let totalExpenses = 0;
        const reportBody = document.getElementById('expense-report-table-body');
        reportBody.innerHTML = '';

        if (expenseData.length === 0) {
            reportBody.innerHTML = `<tr><td colspan="5">No expenses found for the selected period.</td></tr>`;
        } else {
            expenseData.forEach(expense => {
                totalExpenses += expense.amount;
                
                reportBody.innerHTML += `<tr>
                    <td>${expense.expenseDate.toDate().toLocaleDateString()}</td>
                    <td>${expense.type}</td>
                    <td>${expense.vendorName || 'General'}</td>
                    <td>BDT ${expense.amount.toFixed(2)}</td>
                    <td>${expense.description || 'N/A'}</td>
                </tr>`;
            });
        }

        document.getElementById('report-total-expenses').textContent = totalExpenses.toFixed(2);
        document.getElementById('expense-report-results').style.display = 'block';

    } catch (error) {
        console.error("Error generating expense report: ", error);
        alert("Failed to generate expense report. See console for details.");
    }
}
