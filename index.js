require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Root route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Gold Craft Billing API is running',
    version: '1.2.0',
    endpoints: ['/api/health', '/api/invoices', '/api/shops']
  });
});

// Middleware to check database connection
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

app.get('/api/health', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ status: 'error', message: 'DATABASE_URL environment variable is missing' });
    }
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      db_time: result.rows[0].now 
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Extract invoice data
    const {
      receiverName, receiverAddress, receiverGstin, receiverState, receiverStateCode,
      invoiceNo, invoiceDate, transportationMode, vehicleNo, dateOfSupply, placeOfSupply,
      bankName, bankBranch, accountNo, ifsc, totalBeforeTax, igstAmount, cgstAmount, 
      sgstAmount, totalTax, totalAfterTax, items
    } = req.body;
    
    // Insert invoice
    const invoiceResult = await client.query(`
      INSERT INTO invoices(
        receiver_name, receiver_address, receiver_gstin, receiver_state, receiver_state_code,
        invoice_no, invoice_date, transportation_mode, vehicle_no, date_of_supply,
        place_of_supply, bank_name, bank_branch, account_no, ifsc, 
        total_before_tax, igst_amount, cgst_amount, sgst_amount, total_tax, total_after_tax
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING id
    `, [
      receiverName, receiverAddress, receiverGstin, receiverState, receiverStateCode,
      invoiceNo, invoiceDate, transportationMode, vehicleNo, dateOfSupply,
      placeOfSupply, bankName, bankBranch, accountNo, ifsc,
      totalBeforeTax, igstAmount, cgstAmount, sgstAmount, totalTax, totalAfterTax
    ]);
    
    const invoiceId = invoiceResult.rows[0].id;
    
    // Insert items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await client.query(`
          INSERT INTO invoice_items(
            invoice_id, name, hsn, qty, gross_weight, net_weight, mc_rate, addl_charge, making_charge
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
        `, [
          invoiceId, item.name, item.hsn, item.qty, item.grossWeight, item.netWeight,
          item.mcRate, item.addlCharge, item.makingCharge
        ]);
      }
    }
    
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Invoice saved successfully', invoiceId });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error saving invoice:', error);
    if (error.code === '23505') {
       return res.status(409).json({ success: false, message: 'Invoice number already exists' });
    }
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.put('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      receiverName, receiverAddress, receiverGstin, receiverState, receiverStateCode,
      invoiceNo, invoiceDate, transportationMode, vehicleNo, dateOfSupply, placeOfSupply,
      bankName, bankBranch, accountNo, ifsc, totalBeforeTax, igstAmount, cgstAmount, 
      sgstAmount, totalTax, totalAfterTax, items
    } = req.body;
    
    // Update invoice metadata
    await client.query(`
      UPDATE invoices SET
        receiver_name = $1, receiver_address = $2, receiver_gstin = $3, 
        receiver_state = $4, receiver_state_code = $5, invoice_no = $6, 
        invoice_date = $7, transportation_mode = $8, vehicle_no = $9, 
        date_of_supply = $10, place_of_supply = $11, bank_name = $12, 
        bank_branch = $13, account_no = $14, ifsc = $15, 
        total_before_tax = $16, igst_amount = $17, cgst_amount = $18, 
        sgst_amount = $19, total_tax = $20, total_after_tax = $21
      WHERE id = $22
    `, [
      receiverName, receiverAddress, receiverGstin, receiverState, receiverStateCode,
      invoiceNo, invoiceDate, transportationMode, vehicleNo, dateOfSupply,
      placeOfSupply, bankName, bankBranch, accountNo, ifsc,
      totalBeforeTax, igstAmount, cgstAmount, sgstAmount, totalTax, totalAfterTax,
      id
    ]);
    
    // Delete old items and insert fresh ones
    await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
    
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await client.query(`
          INSERT INTO invoice_items(
            invoice_id, name, hsn, qty, gross_weight, net_weight, mc_rate, addl_charge, making_charge
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
        `, [
          id, item.name, item.hsn, item.qty, item.grossWeight, item.netWeight,
          item.mcRate, item.addlCharge, item.makingCharge
        ]);
      }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Invoice updated successfully' });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error updating invoice:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  } finally {
    if (client) client.release();
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const { shopName } = req.query;
    let result;
    if (shopName) {
      result = await pool.query(`
        SELECT i.*, 
        COALESCE(
          (SELECT json_agg(ii.*) FROM invoice_items ii WHERE ii.invoice_id = i.id), 
        '[]'::json) AS items 
        FROM invoices i 
        WHERE i.receiver_name = $1 
        ORDER BY i.created_at DESC
      `, [shopName]);
    } else {
      result = await pool.query(`
        SELECT i.*, 
        COALESCE(
          (SELECT json_agg(ii.*) FROM invoice_items ii WHERE ii.invoice_id = i.id), 
        '[]'::json) AS items 
        FROM invoices i 
        ORDER BY i.created_at DESC
      `);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/invoices/next', async (req, res) => {
  try {
    const result = await pool.query('SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1');
    let nextNum = 1;
    if (result.rows.length > 0 && result.rows[0].invoice_no) {
      const match = result.rows[0].invoice_no.match(/\d+$/);
      if (match) {
        nextNum = parseInt(match[0], 10) + 1;
      }
    }
    const paddedNum = nextNum.toString().padStart(5, '0');
    res.json({ nextInvoiceNo: `INV-${paddedNum}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/shops', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shops ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/shops', async (req, res) => {
  try {
    const { name, address, gstin, state, stateCode } = req.body;
    const result = await pool.query(`
      INSERT INTO shops(name, address, gstin, state, state_code)
      VALUES($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, address, gstin, state, stateCode]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
       return res.status(409).json({ success: false, message: 'Shop already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
