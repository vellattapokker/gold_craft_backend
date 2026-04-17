CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    receiver_name VARCHAR(255),
    receiver_address TEXT,
    receiver_gstin VARCHAR(50),
    receiver_state VARCHAR(100),
    receiver_state_code VARCHAR(10),
    invoice_no VARCHAR(100) UNIQUE,
    invoice_date TIMESTAMP,
    transportation_mode VARCHAR(100),
    vehicle_no VARCHAR(100),
    date_of_supply TIMESTAMP,
    place_of_supply VARCHAR(255),
    bank_name VARCHAR(100),
    bank_branch VARCHAR(100),
    account_no VARCHAR(100),
    ifsc VARCHAR(50),
    
    total_before_tax NUMERIC(15, 2),
    igst_amount NUMERIC(15, 2),
    cgst_amount NUMERIC(15, 2),
    sgst_amount NUMERIC(15, 2),
    total_tax NUMERIC(15, 2),
    total_after_tax NUMERIC(15, 2),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
    name VARCHAR(255),
    hsn VARCHAR(50),
    qty NUMERIC(10, 3),
    gross_weight NUMERIC(10, 3),
    net_weight NUMERIC(10, 3),
    mc_rate NUMERIC(10, 2),
    addl_charge NUMERIC(10, 2),
    making_charge NUMERIC(10, 2)
);
