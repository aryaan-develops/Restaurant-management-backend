// server.js
// This is the main entry point for the Express.js application,
// consolidating all models and routes into a single file.

const express = require('express'); // Import the Express.js framework
const mongoose = require('mongoose'); // Import Mongoose for MongoDB object modeling
const dotenv = require('dotenv'); // Import dotenv to load environment variables from a .env file
const cors = require('cors'); // Import CORS to allow cross-origin requests

dotenv.config(); // Load environment variables from .env file

const app = express(); // Create an Express application instance

// Middleware
app.use(express.json()); // Enable Express to parse JSON formatted request bodies
app.use(cors()); // Enable CORS for all routes, allowing frontend applications to connect

// Database Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_db';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Mongoose Models ---

// MenuItem Schema
const MenuItemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: {
        type: String,
        required: false,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    category: {
        type: String,
        required: true,
        enum: ['Appetizer', 'Main Course', 'Dessert', 'Beverage', 'Other'],
        trim: true
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    imageUrl: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});
const MenuItem = mongoose.model('MenuItem', MenuItemSchema);

// Table Schema
const TableSchema = new mongoose.Schema({
    tableNumber: {
        type: Number,
        required: true,
        unique: true,
        min: 1
    },
    capacity: {
        type: Number,
        required: true,
        min: 1
    },
    isAvailable: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});
const Table = mongoose.model('Table', TableSchema);

// Order Schema
const OrderSchema = new mongoose.Schema({
    table: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
        required: true
    },
    items: [{
        menuItem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MenuItem',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        priceAtOrder: {
            type: Number,
            required: true,
            min: 0
        }
    }],
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'preparing', 'completed', 'cancelled'],
        default: 'pending'
    },
    orderTime: {
        type: Date,
        default: Date.now
    },
    completionTime: {
        type: Date
    }
}, {
    timestamps: true
});
const Order = mongoose.model('Order', OrderSchema);

// Reservation Schema
const ReservationSchema = new mongoose.Schema({
    customerName: {
        type: String,
        required: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    table: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Table',
        required: false
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    numberOfGuests: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    notes: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});
const Reservation = mongoose.model('Reservation', ReservationSchema);

// Inventory Schema
const InventorySchema = new mongoose.Schema({
    itemName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 0
    },
    unit: {
        type: String,
        required: true,
        enum: ['kg', 'grams', 'liters', 'ml', 'pieces', 'packs', 'other'],
        trim: true
    },
    minStockLevel: {
        type: Number,
        required: false,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});
const Inventory = mongoose.model('Inventory', InventorySchema);

// --- Helper Functions ---

// Helper function to update inventory (simplified for this example)
async function updateInventoryForOrder(orderItems, isDecrement = true) {
    for (const item of orderItems) {
        const inventoryItemName = item.name; // Using menu item name as inventory item name for simplicity

        let inventoryItem = await Inventory.findOne({ itemName: inventoryItemName });

        if (!inventoryItem) {
            console.warn(`Inventory item "${inventoryItemName}" not found. Cannot update inventory.`);
            continue;
        }

        if (isDecrement) {
            inventoryItem.quantity -= item.quantity;
        } else {
            inventoryItem.quantity += item.quantity;
        }

        if (inventoryItem.quantity < 0) {
            inventoryItem.quantity = 0;
            console.warn(`Inventory for ${inventoryItemName} went below zero. Set to 0.`);
        }

        inventoryItem.lastUpdated = Date.now();
        await inventoryItem.save();

        if (inventoryItem.quantity <= inventoryItem.minStockLevel) {
            console.warn(`LOW STOCK ALERT: ${inventoryItem.itemName} is at ${inventoryItem.quantity} ${inventoryItem.unit}`);
        }
    }
}

// --- API Routes ---

// Basic Home Route
app.get('/', (req, res) => {
    res.send('Restaurant Management System Backend is running!');
});

// --- Menu Item Routes ---
// @route   GET /api/menu
// @desc    Get all menu items
// @access  Public
app.get('/api/menu', async (req, res) => {
    try {
        const menuItems = await MenuItem.find();
        res.json(menuItems);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/menu/:id
// @desc    Get a single menu item by ID
// @access  Public
app.get('/api/menu/:id', async (req, res) => {
    try {
        const menuItem = await MenuItem.findById(req.params.id);
        if (!menuItem) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json(menuItem);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Menu Item ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/menu
// @desc    Add a new menu item
// @access  Private (e.g., Admin)
app.post('/api/menu', async (req, res) => {
    const { name, description, price, category, isAvailable, imageUrl } = req.body;
    try {
        let menuItem = await MenuItem.findOne({ name });
        if (menuItem) {
            return res.status(400).json({ msg: 'Menu item with this name already exists' });
        }
        menuItem = new MenuItem({ name, description, price, category, isAvailable, imageUrl });
        await menuItem.save();
        res.status(201).json(menuItem);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/menu/:id
// @desc    Update a menu item by ID
// @access  Private (e.g., Admin)
app.put('/api/menu/:id', async (req, res) => {
    const { name, description, price, category, isAvailable, imageUrl } = req.body;
    const menuItemFields = {};
    if (name) menuItemFields.name = name;
    if (description) menuItemFields.description = description;
    if (price) menuItemFields.price = price;
    if (category) menuItemFields.category = category;
    if (isAvailable !== undefined) menuItemFields.isAvailable = isAvailable;
    if (imageUrl) menuItemFields.imageUrl = imageUrl;

    try {
        let menuItem = await MenuItem.findById(req.params.id);
        if (!menuItem) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        if (name && name !== menuItem.name) {
            const existingMenuItem = await MenuItem.findOne({ name });
            if (existingMenuItem && existingMenuItem._id.toString() !== req.params.id) {
                return res.status(400).json({ msg: 'Menu item with this name already exists' });
            }
        }
        menuItem = await MenuItem.findByIdAndUpdate(req.params.id, { $set: menuItemFields }, { new: true });
        res.json(menuItem);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Menu Item ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/menu/:id
// @desc    Delete a menu item by ID
// @access  Private (e.g., Admin)
app.delete('/api/menu/:id', async (req, res) => {
    try {
        const menuItem = await MenuItem.findByIdAndDelete(req.params.id);
        if (!menuItem) {
            return res.status(404).json({ msg: 'Menu item not found' });
        }
        res.json({ msg: 'Menu item removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Menu Item ID' });
        }
        res.status(500).send('Server Error');
    }
});

// --- Table Routes ---
// @route   GET /api/tables
// @desc    Get all tables
// @access  Public
app.get('/api/tables', async (req, res) => {
    try {
        const tables = await Table.find();
        res.json(tables);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/tables/:id
// @desc    Get a single table by ID
// @access  Public
app.get('/api/tables/:id', async (req, res) => {
    try {
        const table = await Table.findById(req.params.id);
        if (!table) {
            return res.status(404).json({ msg: 'Table not found' });
        }
        res.json(table);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Table ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/tables
// @desc    Add a new table
// @access  Private (Admin)
app.post('/api/tables', async (req, res) => {
    const { tableNumber, capacity } = req.body;
    try {
        let table = await Table.findOne({ tableNumber });
        if (table) {
            return res.status(400).json({ msg: 'Table with this number already exists' });
        }
        table = new Table({ tableNumber, capacity });
        await table.save();
        res.status(201).json(table);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/tables/:id
// @desc    Update a table by ID
// @access  Private (Admin)
app.put('/api/tables/:id', async (req, res) => {
    const { tableNumber, capacity, isAvailable } = req.body;
    const tableFields = {};
    if (tableNumber) tableFields.tableNumber = tableNumber;
    if (capacity) tableFields.capacity = capacity;
    if (isAvailable !== undefined) tableFields.isAvailable = isAvailable;

    try {
        let table = await Table.findById(req.params.id);
        if (!table) {
            return res.status(404).json({ msg: 'Table not found' });
        }
        if (tableNumber && tableNumber !== table.tableNumber) {
            const existingTable = await Table.findOne({ tableNumber });
            if (existingTable && existingTable._id.toString() !== req.params.id) {
                return res.status(400).json({ msg: 'Table with this number already exists' });
            }
        }
        table = await Table.findByIdAndUpdate(req.params.id, { $set: tableFields }, { new: true });
        res.json(table);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Table ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/tables/:id/availability
// @desc    Update table availability (e.g., after reservation or order completion)
// @access  Private (Admin/System)
app.put('/api/tables/:id/availability', async (req, res) => {
    const { isAvailable } = req.body;
    if (isAvailable === undefined) {
        return res.status(400).json({ msg: 'Please provide isAvailable status (true/false)' });
    }
    try {
        let table = await Table.findById(req.params.id);
        if (!table) {
            return res.status(404).json({ msg: 'Table not found' });
        }
        table.isAvailable = isAvailable;
        await table.save();
        res.json(table);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Table ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/tables/:id
// @desc    Delete a table by ID
// @access  Private (Admin)
app.delete('/api/tables/:id', async (req, res) => {
    try {
        const table = await Table.findByIdAndDelete(req.params.id);
        if (!table) {
            return res.status(404).json({ msg: 'Table not found' });
        }
        res.json({ msg: 'Table removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Table ID' });
        }
        res.status(500).send('Server Error');
    }
});

// --- Order Routes ---
// @route   POST /api/orders
// @desc    Place a new order
// @access  Public (or Private for staff)
app.post('/api/orders', async (req, res) => {
    const { tableId, items } = req.body;
    if (!tableId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ msg: 'Please provide tableId and at least one item.' });
    }
    try {
        const table = await Table.findById(tableId);
        if (!table) {
            return res.status(404).json({ msg: 'Table not found' });
        }

        let totalAmount = 0;
        const orderItems = [];
        const menuItemsForInventoryUpdate = [];

        for (const item of items) {
            const menuItem = await MenuItem.findById(item.menuItemId);
            if (!menuItem) {
                return res.status(404).json({ msg: `Menu item with ID ${item.menuItemId} not found.` });
            }
            if (!menuItem.isAvailable) {
                return res.status(400).json({ msg: `${menuItem.name} is currently not available.` });
            }
            if (item.quantity <= 0) {
                return res.status(400).json({ msg: `Quantity for ${menuItem.name} must be at least 1.` });
            }

            orderItems.push({
                menuItem: menuItem._id,
                quantity: item.quantity,
                priceAtOrder: menuItem.price
            });
            totalAmount += menuItem.price * item.quantity;
            menuItemsForInventoryUpdate.push({ name: menuItem.name, quantity: item.quantity });
        }

        const newOrder = new Order({
            table: tableId,
            items: orderItems,
            totalAmount: totalAmount,
            status: 'pending'
        });
        await newOrder.save();
        await updateInventoryForOrder(menuItemsForInventoryUpdate, true);
        res.status(201).json(newOrder);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid ID format in request.' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/orders
// @desc    Get all orders (with optional status filter)
// @access  Private (Admin/Staff)
app.get('/api/orders', async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status) {
            query.status = status;
        }
        const orders = await Order.find(query)
            .populate('table', 'tableNumber capacity')
            .populate('items.menuItem', 'name price category');
        res.json(orders);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/orders/:id
// @desc    Get a single order by ID
// @access  Private (Admin/Staff)
app.get('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('table', 'tableNumber capacity')
            .populate('items.menuItem', 'name price category');
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.json(order);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Order ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status (e.g., from pending to preparing, or completed)
// @access  Private (Admin/Staff)
app.put('/api/orders/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ msg: 'Please provide a new status for the order.' });
    }
    try {
        let order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        const oldStatus = order.status;
        order.status = status;
        if (status === 'completed' && oldStatus !== 'completed') {
            order.completionTime = Date.now();
        }
        if (status === 'cancelled' && oldStatus !== 'cancelled') {
            const itemsToReturn = await Promise.all(order.items.map(async item => {
                const menuItem = await MenuItem.findById(item.menuItem);
                return { name: menuItem ? menuItem.name : 'Unknown Item', quantity: item.quantity };
            }));
            await updateInventoryForOrder(itemsToReturn, false);
        }
        await order.save();
        res.json(order);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Order ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/orders/:id
// @desc    Delete an order by ID (use with caution, usually status update is preferred)
// @access  Private (Admin)
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }
        res.json({ msg: 'Order removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Order ID' });
        }
        res.status(500).send('Server Error');
    }
});

// --- Reservation Routes ---
// @route   POST /api/reservations
// @desc    Create a new reservation
// @access  Public
app.post('/api/reservations', async (req, res) => {
    const { customerName, phoneNumber, date, time, numberOfGuests, tableId, notes } = req.body;
    if (!customerName || !phoneNumber || !date || !time || !numberOfGuests) {
        return res.status(400).json({ msg: 'Please fill all required fields: customerName, phoneNumber, date, time, numberOfGuests.' });
    }
    try {
        let tableToReserve = null;
        if (tableId) {
            tableToReserve = await Table.findById(tableId);
            if (!tableToReserve) {
                return res.status(404).json({ msg: 'Specified table not found.' });
            }
            if (!tableToReserve.isAvailable) {
                return res.status(400).json({ msg: `Table ${tableToReserve.tableNumber} is currently not available.` });
            }
            if (tableToReserve.capacity < numberOfGuests) {
                return res.status(400).json({ msg: `Table ${tableToReserve.tableNumber} cannot accommodate ${numberOfGuests} guests (capacity: ${tableToReserve.capacity}).` });
            }
            const existingReservation = await Reservation.findOne({
                table: tableId,
                date: new Date(date),
                time: time,
                status: { $in: ['pending', 'confirmed'] }
            });
            if (existingReservation) {
                return res.status(400).json({ msg: `Table ${tableToReserve.tableNumber} is already reserved for ${time} on ${new Date(date).toDateString()}.` });
            }
        } else {
            const availableTables = await Table.find({
                isAvailable: true,
                capacity: { $gte: numberOfGuests }
            }).sort({ capacity: 1 });
            if (availableTables.length === 0) {
                return res.status(400).json({ msg: 'No available tables found for the requested number of guests.' });
            }
            for (const tbl of availableTables) {
                const existingReservation = await Reservation.findOne({
                    table: tbl._id,
                    date: new Date(date),
                    time: time,
                    status: { $in: ['pending', 'confirmed'] }
                });
                if (!existingReservation) {
                    tableToReserve = tbl;
                    break;
                }
            }
            if (!tableToReserve) {
                return res.status(400).json({ msg: 'No suitable table found for reservation at this time.' });
            }
        }
        const newReservation = new Reservation({
            customerName,
            phoneNumber,
            table: tableToReserve ? tableToReserve._id : null,
            date: new Date(date),
            time,
            numberOfGuests,
            notes
        });
        await newReservation.save();
        res.status(201).json(newReservation);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Table ID format.' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/reservations
// @desc    Get all reservations (with optional filters)
// @access  Private (Admin/Staff)
app.get('/api/reservations', async (req, res) => {
    try {
        const { date, status, tableId } = req.query;
        let query = {};
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        }
        if (status) {
            query.status = status;
        }
        if (tableId) {
            query.table = tableId;
        }
        const reservations = await Reservation.find(query)
            .populate('table', 'tableNumber capacity isAvailable')
            .sort({ date: 1, time: 1 });
        res.json(reservations);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/reservations/:id
// @desc    Get a single reservation by ID
// @access  Private (Admin/Staff)
app.get('/api/reservations/:id', async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id)
            .populate('table', 'tableNumber capacity isAvailable');
        if (!reservation) {
            return res.status(404).json({ msg: 'Reservation not found' });
        }
        res.json(reservation);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Reservation ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/reservations/:id/status
// @desc    Update reservation status (e.g., pending to confirmed, or cancelled)
// @access  Private (Admin/Staff)
app.put('/api/reservations/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ msg: 'Please provide a new status for the reservation.' });
    }
    try {
        let reservation = await Reservation.findById(req.params.id);
        if (!reservation) {
            return res.status(404).json({ msg: 'Reservation not found' });
        }
        const oldStatus = reservation.status;
        reservation.status = status;
        if (reservation.table) {
            const table = await Table.findById(reservation.table);
            if (table) {
                if (status === 'confirmed' && oldStatus !== 'confirmed') {
                    table.isAvailable = false;
                } else if ((status === 'cancelled' || status === 'completed') && oldStatus !== 'cancelled' && oldStatus !== 'completed') {
                    table.isAvailable = true;
                }
                await table.save();
            }
        }
        await reservation.save();
        res.json(reservation);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Reservation ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/reservations/:id
// @desc    Delete a reservation by ID
// @access  Private (Admin)
app.delete('/api/reservations/:id', async (req, res) => {
    try {
        const reservation = await Reservation.findByIdAndDelete(req.params.id);
        if (!reservation) {
            return res.status(404).json({ msg: 'Reservation not found' });
        }
        if (reservation.table && reservation.status === 'confirmed') {
            const table = await Table.findById(reservation.table);
            if (table) {
                table.isAvailable = true;
                await table.save();
            }
        }
        res.json({ msg: 'Reservation removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Reservation ID' });
        }
        res.status(500).send('Server Error');
    }
});

// --- Inventory Routes ---
// @route   GET /api/inventory
// @desc    Get all inventory items
// @access  Private (Admin/Staff)
app.get('/api/inventory', async (req, res) => {
    try {
        const inventoryItems = await Inventory.find();
        res.json(inventoryItems);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/inventory/:id
// @desc    Get a single inventory item by ID
// @access  Private (Admin/Staff)
app.get('/api/inventory/:id', async (req, res) => {
    try {
        const inventoryItem = await Inventory.findById(req.params.id);
        if (!inventoryItem) {
            return res.status(404).json({ msg: 'Inventory item not found' });
        }
        res.json(inventoryItem);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Inventory Item ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   POST /api/inventory
// @desc    Add a new inventory item
// @access  Private (Admin)
app.post('/api/inventory', async (req, res) => {
    const { itemName, quantity, unit, minStockLevel } = req.body;
    try {
        let inventoryItem = await Inventory.findOne({ itemName });
        if (inventoryItem) {
            return res.status(400).json({ msg: 'Inventory item with this name already exists' });
        }
        inventoryItem = new Inventory({ itemName, quantity, unit, minStockLevel });
        await inventoryItem.save();
        res.status(201).json(inventoryItem);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/inventory/:id
// @desc    Update an inventory item by ID
// @access  Private (Admin/Staff)
app.put('/api/inventory/:id', async (req, res) => {
    const { itemName, quantity, unit, minStockLevel } = req.body;
    const inventoryFields = {};
    if (itemName) inventoryFields.itemName = itemName;
    if (quantity !== undefined) inventoryFields.quantity = quantity;
    if (unit) inventoryFields.unit = unit;
    if (minStockLevel !== undefined) inventoryFields.minStockLevel = minStockLevel;
    inventoryFields.lastUpdated = Date.now();

    try {
        let inventoryItem = await Inventory.findById(req.params.id);
        if (!inventoryItem) {
            return res.status(404).json({ msg: 'Inventory item not found' });
        }
        if (itemName && itemName !== inventoryItem.itemName) {
            const existingItem = await Inventory.findOne({ itemName });
            if (existingItem && existingItem._id.toString() !== req.params.id) {
                return res.status(400).json({ msg: 'Inventory item with this name already exists' });
            }
        }
        inventoryItem = await Inventory.findByIdAndUpdate(req.params.id, { $set: inventoryFields }, { new: true });
        if (inventoryItem.quantity <= inventoryItem.minStockLevel) {
            console.warn(`LOW STOCK ALERT: ${inventoryItem.itemName} is at ${inventoryItem.quantity} ${inventoryItem.unit}`);
        }
        res.json(inventoryItem);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Inventory Item ID' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/inventory/:id
// @desc    Delete an inventory item by ID
// @access  Private (Admin)
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const inventoryItem = await Inventory.findByIdAndDelete(req.params.id);
        if (!inventoryItem) {
            return res.status(404).json({ msg: 'Inventory item not found' });
        }
        res.json({ msg: 'Inventory item removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(400).json({ msg: 'Invalid Inventory Item ID' });
        }
        res.status(500).send('Server Error');
    }
});


// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
