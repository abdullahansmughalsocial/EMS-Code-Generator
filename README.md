# Advanced PLC & CODESYS Generator — Web Interface v7.3

Industrial-grade web frontend for the PLC & CODESYS Generator tool.

## Project Structure

```
plc-generator-web/
├── app.py               ← Flask backend (REST API)
├── plc_core.py          ← YOUR ORIGINAL CODE (rename your file to this)
├── requirements.txt
├── templates/
│   └── index.html       ← Main SPA page
├── static/
│   ├── css/style.css    ← Industrial dark theme
│   └── js/app.js        ← Frontend application
└── uploads/             ← Temp folder for CSV uploads (auto-created)
```

## Setup & Run

### Step 1: Place your original Python file
Rename your existing Python script to `plc_core.py` and put it in this folder.

### Step 2: Install dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Run the server
```bash
python app.py
```

### Step 4: Open in browser
```
http://localhost:5000
```

## Features

- **Dashboard** — System overview with live stats
- **Device Management** — Add, edit, delete, search devices
- **Meter Models** — Define register maps for each meter type
- **Function Blocks** — Create & preview CODESYS FBs with form UI
- **POU Mappings** — View and manage output variable assignments
- **Cloud Tags** — SCADA tag configuration management
- **Communication** — Edit RS485 settings and manage TCP gateways
- **CSV Import** — Drag-and-drop triple sheet import with validation
- **Code Generation** — Generate all ST files, preview, download as ZIP
- **Backups** — Create, restore, delete configuration backups
- **Export** — Export all data to CSV/JSON files (ZIP download)

## CSV Format

**Sheet 1 (Devices):**
```csv
device_number,device_name,unit_id,array_name,pou_name,meter_model,communication_type,gateway_name
1,Zone1_Meter,1,GVL.EM01,EM01_PLC1,ABB_EM6400,RS485,
```

**Sheet 2 (Mappings):**
```csv
pou_name,input_array,output_variable,mapping_fb_out
EM01_PLC1,Realtime,EM01_Voltage_L1,v1
```

**Sheet 3 (Cloud Tags — optional):**
```csv
tag_name,data_type,pou_name
EM01_Voltage_L1,REAL,EM01_PLC1
```

## Notes

- Meter models must be created **before** importing devices that reference them
- Data is stored in `complete_data/` directory (same as the terminal version)
- Generated code goes to `generated_code/` (configurable)
- Backups are kept in `complete_data/backups/`
