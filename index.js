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

// Middleware to check database connection
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', db_time: result.rows[0].now });
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
    await client.query('ROLLBACK');
    console.error('Error saving invoice:', error);
    // If it's a unique constraint violation for invoice no
    if (error.code === '23505') {
       return res.status(409).json({ success: false, message: 'Invoice number already exists' });
    }
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/invoices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(port, () => {
  console.log(\`Server is running on port \${port}\`);
});
