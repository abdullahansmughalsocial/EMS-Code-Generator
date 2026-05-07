"""
Advanced PLC & CODESYS Generator - Web Interface Backend
Flask REST API with User Authentication (Admin / Editor / Viewer)
Users stored in complete_data/users.json
"""
from flask import Flask, request, jsonify, render_template, send_file, session, redirect, url_for
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

import os, sys, json, zipfile, io, traceback
from pathlib import Path
from datetime import datetime
from dataclasses import asdict
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import plc_core as core
except ImportError as e:
    print(f"ERROR: Could not import plc_core.py: {e}")
    print("Make sure plc_core.py is in the same directory as app.py")
    sys.exit(1)

app = Flask(__name__)
app.secret_key = os.environ.get('PLCGEN_SECRET', 'plcgen-secret-key-change-in-production-2024')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('RAILWAY_ENVIRONMENT') == 'production'

if HAS_CORS:
    CORS(app)

@app.after_request
def no_cache(response):
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

DATA_ROOT = Path(os.environ.get('DATA_DIR', 'complete_data'))
UPLOAD_FOLDER = DATA_ROOT.parent / 'uploads'
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# ─── USER MANAGEMENT ──────────────────────────────────────────────────────────

USERS_FILE = DATA_ROOT / 'users.json'

ROLE_PERMISSIONS = {
    'admin':  {'all': True},
    'editor': {
        # Can do: view everything, manage devices, mappings, tags, gateways,
        #         communication, import, generate code, backups
        # Cannot: create/delete meter models, create/delete/edit function blocks,
        #         manage users, reset all
        'view': True, 'devices': True, 'mappings': True, 'tags': True,
        'gateways': True, 'rs485': True, 'import': True,
        'generate': True, 'backups': True, 'flow': True,
        'meter_models_read': True,  # can read but not write
        'fbs_read': True,           # can read but not write
    },
    'viewer': {
        'view': True,
        'meter_models_read': True,
        'fbs_read': True,
    },
}

def load_users():
    """Load users from JSON file. Creates default admin if file missing."""
    USERS_FILE.parent.mkdir(exist_ok=True)
    if not USERS_FILE.exists():
        default = {
            "users": [
                {
                    "id": str(uuid.uuid4()),
                    "username": "admin",
                    "password": generate_password_hash("admin123"),
                    "role": "admin",
                    "display_name": "Administrator",
                    "created_at": datetime.now().isoformat(),
                    "active": True
                }
            ]
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(default, f, indent=2)
        print("  Created default admin user (username: admin, password: admin123)")
        print("  !! Change the password after first login !!")
    with open(USERS_FILE, 'r') as f:
        return json.load(f)

def save_users(data):
    USERS_FILE.parent.mkdir(exist_ok=True)
    with open(USERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def find_user(username):
    data = load_users()
    return next((u for u in data['users'] if u['username'] == username), None)

def find_user_by_id(user_id):
    data = load_users()
    return next((u for u in data['users'] if u['id'] == user_id), None)

def current_user():
    uid = session.get('user_id')
    if not uid:
        return None
    return find_user_by_id(uid)

def current_role():
    u = current_user()
    return u['role'] if u else None

def can(permission):
    """Check if current user has a specific permission."""
    role = current_role()
    if not role:
        return False
    perms = ROLE_PERMISSIONS.get(role, {})
    return perms.get('all', False) or perms.get(permission, False)

# ─── AUTH DECORATORS ──────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user():
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({"status": "error", "message": "Authentication required", "code": 401}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated

def role_required(*roles):
    """Require user to have one of the given roles."""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            u = current_user()
            if not u:
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({"status": "error", "message": "Authentication required", "code": 401}), 401
                return redirect(url_for('login_page'))
            if u['role'] not in roles:
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({"status": "error", "message": f"Access denied. Required role: {' or '.join(roles)}", "code": 403}), 403
                return err("Access denied", 403)
            return f(*args, **kwargs)
        return decorated
    return decorator

def admin_required(f):
    return role_required('admin')(f)

def editor_or_admin(f):
    return role_required('admin', 'editor')(f)

# ─── HELPERS ──────────────────────────────────────────────────────────────────

data_manager = core.CompleteDataManager()
generator = core.AdvancedCODESYSGenerator()

def ok(data=None, message="OK"):
    return jsonify({"status": "success", "message": message, "data": data})

def err(message, code=400):
    return jsonify({"status": "error", "message": message}), code

def safe_user(u):
    """Return user dict without password hash."""
    return {k: v for k, v in u.items() if k != 'password'}

# ─── PAGES ────────────────────────────────────────────────────────────────────

@app.route('/login')
def login_page():
    if current_user():
        return redirect('/')
    return render_template('login.html')

@app.route('/')
@login_required
def index():
    return render_template('index.html')


# ─── AUTH API ─────────────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    d = request.json or {}
    username = d.get('username', '').strip()
    password = d.get('password', '')
    if not username or not password:
        return err("Username and password required")
    user = find_user(username)
    if not user or not user.get('active', True):
        return err("Invalid credentials")
    if not check_password_hash(user['password'], password):
        return err("Invalid credentials")
    session.permanent = True
    session['user_id'] = user['id']
    return ok(safe_user(user), "Login successful")

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.clear()
    return ok(message="Logged out")

@app.route('/api/auth/me', methods=['GET'])
@login_required
def auth_me():
    u = current_user()
    return ok(safe_user(u))

@app.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    d = request.json or {}
    current_pw = d.get('current_password', '')
    new_pw = d.get('new_password', '')
    if not current_pw or not new_pw:
        return err("Both current and new password required")
    if len(new_pw) < 6:
        return err("New password must be at least 6 characters")
    u = current_user()
    if not check_password_hash(u['password'], current_pw):
        return err("Current password is incorrect")
    data = load_users()
    for user in data['users']:
        if user['id'] == u['id']:
            user['password'] = generate_password_hash(new_pw)
            break
    save_users(data)
    return ok(message="Password changed successfully")


# ─── USER MANAGEMENT (Admin only) ─────────────────────────────────────────────

@app.route('/api/users', methods=['GET'])
@admin_required
def get_users():
    data = load_users()
    return ok([safe_user(u) for u in data['users']])

@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    d = request.json or {}
    username = d.get('username', '').strip()
    password = d.get('password', '')
    role = d.get('role', 'viewer')
    display_name = d.get('display_name', username).strip()

    if not username or not password:
        return err("Username and password required")
    if len(password) < 6:
        return err("Password must be at least 6 characters")
    if role not in ('admin', 'editor', 'viewer'):
        return err("Invalid role. Must be admin, editor, or viewer")
    if find_user(username):
        return err(f"Username '{username}' already exists")

    new_user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password": generate_password_hash(password),
        "role": role,
        "display_name": display_name or username,
        "created_at": datetime.now().isoformat(),
        "active": True
    }
    data = load_users()
    data['users'].append(new_user)
    save_users(data)
    return ok(safe_user(new_user), f"User '{username}' created")

@app.route('/api/users/<user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    d = request.json or {}
    data = load_users()
    user = next((u for u in data['users'] if u['id'] == user_id), None)
    if not user:
        return err("User not found", 404)

    # Prevent demoting the last admin
    if user['role'] == 'admin' and d.get('role') and d['role'] != 'admin':
        admins = [u for u in data['users'] if u['role'] == 'admin' and u.get('active', True)]
        if len(admins) <= 1:
            return err("Cannot change role: this is the only admin account")

    if 'display_name' in d:
        user['display_name'] = d['display_name'].strip() or user['username']
    if 'role' in d:
        if d['role'] not in ('admin', 'editor', 'viewer'):
            return err("Invalid role")
        user['role'] = d['role']
    if 'active' in d:
        # Prevent deactivating self
        if user['id'] == session.get('user_id') and not d['active']:
            return err("Cannot deactivate your own account")
        user['active'] = bool(d['active'])
    if 'password' in d and d['password']:
        if len(d['password']) < 6:
            return err("Password must be at least 6 characters")
        user['password'] = generate_password_hash(d['password'])

    save_users(data)
    return ok(safe_user(user), "User updated")

@app.route('/api/users/<user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    if user_id == session.get('user_id'):
        return err("Cannot delete your own account")
    data = load_users()
    user = next((u for u in data['users'] if u['id'] == user_id), None)
    if not user:
        return err("User not found", 404)
    if user['role'] == 'admin':
        admins = [u for u in data['users'] if u['role'] == 'admin']
        if len(admins) <= 1:
            return err("Cannot delete the only admin account")
    data['users'] = [u for u in data['users'] if u['id'] != user_id]
    save_users(data)
    return ok(message=f"User '{user['username']}' deleted")


# ─── FLOW LAYOUT ──────────────────────────────────────────────────────────────

FLOW_LAYOUT_FILE = DATA_ROOT / 'flow_layout.json'

@app.route('/api/flow/layout', methods=['GET'])
@login_required
def get_flow_layout():
    if FLOW_LAYOUT_FILE.exists():
        try:
            with open(FLOW_LAYOUT_FILE, 'r') as f:
                return ok(json.load(f))
        except:
            pass
    return ok({'nodes': [], 'connections': []})

@app.route('/api/flow/layout', methods=['POST'])
@editor_or_admin
def save_flow_layout():
    try:
        FLOW_LAYOUT_FILE.parent.mkdir(exist_ok=True)
        with open(FLOW_LAYOUT_FILE, 'w') as f:
            json.dump(request.json, f, indent=2)
        return ok(message="Layout saved")
    except Exception as e:
        return err(str(e))


# ─── STATUS ───────────────────────────────────────────────────────────────────

@app.route('/health')
def health_check():
    return jsonify({"status": "ok"}), 200

@app.route('/api/status')
@login_required
def get_status():
    u = current_user()
    return ok({
        "devices": len(data_manager.devices),
        "meter_models": len(data_manager.meter_models),
        "function_blocks": len(data_manager.function_blocks),
        "tags": len(data_manager.tag_configs),
        "pou_mappings": sum(len(m) for m in data_manager.pou_mappings.values()),
        "gateways": len(data_manager.gateways),
        "devices_without_model": len(data_manager.get_devices_without_meter_model()),
        "data_dir": str(data_manager.data_dir.resolve()),
        "last_saved": datetime.fromtimestamp(
            data_manager.config_file.stat().st_mtime
        ).isoformat() if data_manager.config_file.exists() else None,
        "current_user": safe_user(u) if u else None,
        "role": u['role'] if u else None,
    })


# ─── DEVICES ──────────────────────────────────────────────────────────────────

@app.route('/api/devices', methods=['GET'])
@login_required
def get_devices():
    return ok([asdict(d) for d in sorted(data_manager.devices, key=lambda x: x.device_number)])

@app.route('/api/devices', methods=['POST'])
@editor_or_admin
def add_device():
    d = request.json
    try:
        fields = core.DeviceConfig.__dataclass_fields__
        device = core.DeviceConfig(**{k: v for k, v in d.items() if k in fields})
        if not device.device_number or any(x.device_number == device.device_number for x in data_manager.devices):
            device.device_number = max((x.device_number for x in data_manager.devices), default=0) + 1
        if data_manager.add_device(device):
            return ok(asdict(device), "Device added")
        return err("Failed to add device")
    except Exception as e:
        return err(str(e))

@app.route('/api/devices/<int:num>', methods=['PUT'])
@editor_or_admin
def update_device(num):
    d = request.json
    try:
        fields = core.DeviceConfig.__dataclass_fields__
        device = core.DeviceConfig(**{k: v for k, v in d.items() if k in fields})
        device.device_number = num
        if data_manager.update_device(device):
            return ok(asdict(device), "Device updated")
        return err("Device not found", 404)
    except Exception as e:
        return err(str(e))

@app.route('/api/devices/<int:num>', methods=['DELETE'])
@editor_or_admin
def delete_device(num):
    data_manager.delete_device(num)
    return ok(message="Device deleted")

@app.route('/api/devices/<int:num>/assign-model', methods=['POST'])
@editor_or_admin
def assign_model(num):
    model = request.json.get('meter_model', '')
    if data_manager.assign_meter_model(num, model):
        return ok(message=f"Model '{model}' assigned")
    return err("Failed to assign model")


# ─── METER MODELS — read: all roles / write: admin only ───────────────────────

@app.route('/api/meter-models', methods=['GET'])
@login_required
def get_meter_models():
    result = {
        name: [asdict(rm) for rm in maps]
        for name, maps in data_manager.meter_models.items()
    }
    return ok(result)

@app.route('/api/meter-models', methods=['POST'])
@admin_required
def add_meter_model():
    d = request.json
    name = d.get('model_name', '').strip()
    if not name:
        return err("Model name is required")
    rms_data = d.get('register_maps', [])
    try:
        fields = core.RegisterMap.__dataclass_fields__
        rms = []
        for rm_data in rms_data:
            rm_data['meter_model'] = name
            rms.append(core.RegisterMap(**{k: v for k, v in rm_data.items() if k in fields}))
        if data_manager.add_meter_model(name, rms):
            return ok(message=f"Model '{name}' added")
        return err("Failed to add meter model")
    except Exception as e:
        return err(str(e))

@app.route('/api/meter-models/<path:name>', methods=['DELETE'])
@admin_required
def delete_meter_model(name):
    if data_manager.delete_meter_model(name):
        return ok(message="Model deleted")
    return err("Model not found", 404)


# ─── FUNCTION BLOCKS — read: all roles / write: admin only ────────────────────

@app.route('/api/function-blocks', methods=['GET'])
@login_required
def get_fbs():
    return ok([fb.to_dict() for fb in data_manager.function_blocks])

@app.route('/api/function-blocks', methods=['POST'])
@admin_required
def create_fb():
    d = request.json
    try:
        fb = core.FBConfig(
            fb_id=str(uuid.uuid4()),
            meter_model=d['meter_model'],
            fb_name=d['fb_name'],
            created_at=datetime.now().isoformat(),
            arrays=d.get('arrays', {}),
            mappings=d.get('mappings', []),
            has_swap=d.get('has_swap', False)
        )
        data_manager.save_function_block(fb)
        return ok(fb.to_dict(), "Function block created")
    except Exception as e:
        return err(str(e))

@app.route('/api/function-blocks/<fb_id>', methods=['PUT'])
@admin_required
def update_fb(fb_id):
    d = request.json
    try:
        existing = next((f for f in data_manager.function_blocks if f.fb_id == fb_id), None)
        if not existing:
            return err("Function block not found", 404)
        fb = core.FBConfig(
            fb_id=fb_id,
            meter_model=d.get('meter_model', existing.meter_model),
            fb_name=d.get('fb_name', existing.fb_name),
            created_at=existing.created_at,
            arrays=d.get('arrays', existing.arrays),
            mappings=d.get('mappings', existing.mappings),
            has_swap=d.get('has_swap', existing.has_swap)
        )
        data_manager.save_function_block(fb)
        return ok(fb.to_dict(), "Function block updated")
    except Exception as e:
        return err(str(e))

@app.route('/api/function-blocks/<fb_id>', methods=['DELETE'])
@admin_required
def delete_fb(fb_id):
    data_manager.delete_function_block(fb_id)
    return ok(message="Function block deleted")

@app.route('/api/function-blocks/<fb_id>/code', methods=['GET'])
@login_required
def get_fb_code(fb_id):
    fb = next((f for f in data_manager.function_blocks if f.fb_id == fb_id), None)
    if not fb:
        return err("Not found", 404)
    code = generator.generate_parameters_fb(fb)
    return ok({"code": code, "filename": f"{fb.fb_name}.st"})


# ─── POU MAPPINGS ─────────────────────────────────────────────────────────────

@app.route('/api/pou-mappings', methods=['GET'])
@login_required
def get_pou_mappings():
    return ok({
        pou: [asdict(m) for m in maps]
        for pou, maps in data_manager.pou_mappings.items()
    })

@app.route('/api/pou-mappings', methods=['POST'])
@editor_or_admin
def add_pou_mapping():
    d = request.json
    try:
        if 'mappings' in d and isinstance(d['mappings'], list):
            pou_name = d.get('pou_name', '')
            instance_name = d.get('instance_name', '').strip()
            if pou_name and instance_name:
                data_manager.pou_instances[pou_name] = instance_name
            added = 0
            for m in d['mappings']:
                fields = core.POUMapping.__dataclass_fields__
                mapping = core.POUMapping(**{k: v for k, v in m.items() if k in fields})
                if data_manager.add_pou_mapping(mapping):
                    added += 1
            data_manager.save_data()
            return ok({'added': added}, f"{added} mappings added")
        fields = core.POUMapping.__dataclass_fields__
        mapping = core.POUMapping(**{k: v for k, v in d.items() if k in fields})
        if data_manager.add_pou_mapping(mapping):
            return ok(asdict(mapping), "Mapping added")
        return err("Failed to add mapping")
    except Exception as e:
        return err(str(e))

@app.route('/api/pou-instances', methods=['GET'])
@login_required
def get_pou_instances():
    return ok(data_manager.pou_instances)

@app.route('/api/pou-mappings/<pou_name>', methods=['DELETE'])
@editor_or_admin
def delete_pou_mappings(pou_name):
    if pou_name in data_manager.pou_mappings:
        del data_manager.pou_mappings[pou_name]
        data_manager.save_data()
        return ok(message="Mappings deleted")
    return err("POU not found", 404)


# ─── TAGS ─────────────────────────────────────────────────────────────────────

@app.route('/api/tags', methods=['GET'])
@login_required
def get_tags():
    return ok(sorted([asdict(t) for t in data_manager.tag_configs],
                     key=lambda x: (x['message_number'], x['tag_index'])))

@app.route('/api/tags', methods=['POST'])
@editor_or_admin
def add_tag():
    d = request.json
    try:
        fields = core.TagConfig.__dataclass_fields__
        tag = core.TagConfig(**{k: v for k, v in d.items() if k in fields})
        if data_manager.add_tag_config(tag):
            return ok(asdict(tag), "Tag added")
        return err("Failed to add tag")
    except Exception as e:
        return err(str(e))

@app.route('/api/tags/<int:msg>/<int:idx>', methods=['DELETE'])
@editor_or_admin
def delete_tag(msg, idx):
    if data_manager.delete_tag_config(msg, idx):
        return ok(message="Tag deleted")
    return err("Tag not found", 404)

@app.route('/api/tags/clear', methods=['POST'])
@editor_or_admin
def clear_tags():
    data_manager.clear_tag_configs()
    return ok(message="All tags cleared")


# ─── GATEWAYS ─────────────────────────────────────────────────────────────────

@app.route('/api/gateways', methods=['GET'])
@login_required
def get_gateways():
    return ok([asdict(g) for g in data_manager.gateways])

@app.route('/api/gateways', methods=['POST'])
@editor_or_admin
def add_gateway():
    d = request.json
    try:
        fields = core.GatewayConfig.__dataclass_fields__
        gw = core.GatewayConfig(**{k: v for k, v in d.items() if k in fields})
        if data_manager.add_gateway(gw):
            return ok(asdict(gw), "Gateway added")
        return err("Failed to add gateway")
    except Exception as e:
        return err(str(e))

@app.route('/api/gateways/<n>', methods=['PUT'])
@editor_or_admin
def update_gateway(n):
    d = request.json
    try:
        fields = core.GatewayConfig.__dataclass_fields__
        gw = core.GatewayConfig(**{k: v for k, v in d.items() if k in fields})
        if data_manager.update_gateway(gw):
            return ok(asdict(gw), "Gateway updated")
        return err("Gateway not found", 404)
    except Exception as e:
        return err(str(e))

@app.route('/api/gateways/<n>', methods=['DELETE'])
@editor_or_admin
def delete_gateway(n):
    if data_manager.delete_gateway(n):
        return ok(message="Gateway deleted")
    return err("Cannot delete (may be in use)", 400)


# ─── RS485 ────────────────────────────────────────────────────────────────────

@app.route('/api/rs485', methods=['GET'])
@login_required
def get_rs485():
    return ok(asdict(data_manager.rs485_config))

@app.route('/api/rs485', methods=['PUT'])
@editor_or_admin
def update_rs485():
    d = request.json
    try:
        cfg = data_manager.rs485_config
        for k, v in d.items():
            if hasattr(cfg, k):
                setattr(cfg, k, type(getattr(cfg, k))(v))
        valid, errors = cfg.validate()
        if not valid:
            return err(", ".join(errors))
        data_manager.save_data()
        return ok(asdict(cfg), "RS485 config updated")
    except Exception as e:
        return err(str(e))


# ─── IMPORT ───────────────────────────────────────────────────────────────────

@app.route('/api/import/triple-sheet', methods=['POST'])
@editor_or_admin
def import_triple_sheet():
    saved = {}
    for sheet in ['sheet1', 'sheet2', 'sheet3']:
        if sheet in request.files and request.files[sheet].filename:
            f = request.files[sheet]
            fname = secure_filename(f.filename)
            fpath = UPLOAD_FOLDER / fname
            f.save(str(fpath))
            saved[sheet] = str(fpath)
    if not saved:
        return err("No files provided")
    reset_first = request.form.get('reset_first', 'false').lower() == 'true'
    im = core.TripleSheetImportManager()
    success_flag, errors, warnings = im.import_triple_sheet_system(
        saved.get('sheet1'), saved.get('sheet2'), saved.get('sheet3')
    )
    missing_models = sorted({
        d.meter_model for d in im.devices
        if d.meter_model and d.meter_model not in data_manager.meter_models
    })
    if reset_first:
        data_manager.reset_devices_and_tags()
    dev_count = mapping_count = tag_count = 0
    for device in im.devices:
        if not any(d.device_number == device.device_number for d in data_manager.devices):
            if device.meter_model:
                fb = data_manager.get_fb_by_meter_model(device.meter_model)
                if fb:
                    device.fb_name = fb.fb_name
            if data_manager.add_device(device):
                dev_count += 1
    for pou_name, maps in im.pou_mappings.items():
        for m in maps:
            if data_manager.add_pou_mapping(m):
                mapping_count += 1
    for tag in im.tag_configs:
        if data_manager.add_tag_config(tag):
            tag_count += 1
    for fp in saved.values():
        try: os.remove(fp)
        except: pass
    return ok({
        "parse_success": success_flag, "errors": errors,
        "warnings": warnings, "missing_models": missing_models,
        "summary": im.import_summary,
        "imported": {"devices": dev_count, "mappings": mapping_count, "tags": tag_count}
    })


@app.route('/api/import/excel', methods=['POST'])
@editor_or_admin
def import_excel():
    if 'file' not in request.files or not request.files['file'].filename:
        return err("No Excel file provided")
    f = request.files['file']
    fname = secure_filename(f.filename)
    if not fname.lower().endswith('.xlsx'):
        return err("Only .xlsx files are supported")
    fpath = UPLOAD_FOLDER / fname
    f.save(str(fpath))
    reset_first = request.form.get('reset_first', 'false').lower() == 'true'
    im = core.ExcelImportManager()
    success_flag, errors, warnings = im.import_from_excel(str(fpath))
    missing_models = sorted({
        d.meter_model for d in im.devices
        if d.meter_model and d.meter_model not in data_manager.meter_models
    })
    if reset_first:
        data_manager.reset_devices_and_tags()
    dev_count = mapping_count = tag_count = 0
    for device in im.devices:
        if not any(d.device_number == device.device_number for d in data_manager.devices):
            if device.meter_model:
                fb = data_manager.get_fb_by_meter_model(device.meter_model)
                if fb:
                    device.fb_name = fb.fb_name
            if data_manager.add_device(device):
                dev_count += 1
    for pou_name, maps in im.pou_mappings.items():
        for m in maps:
            if data_manager.add_pou_mapping(m):
                mapping_count += 1
    for tag in im.tag_configs:
        if data_manager.add_tag_config(tag):
            tag_count += 1
    try: os.remove(str(fpath))
    except: pass
    return ok({
        "parse_success": success_flag, "errors": errors,
        "warnings": warnings, "missing_models": missing_models,
        "summary": im.import_summary,
        "imported": {"devices": dev_count, "mappings": mapping_count, "tags": tag_count}
    })


# ─── CODE GENERATION ──────────────────────────────────────────────────────────

@app.route('/api/generate/all', methods=['POST'])
@editor_or_admin
def generate_all():
    d = request.json or {}
    output_dir = d.get('output_dir', 'generated_code')
    try:
        out_path = Path(output_dir)
        generator.generate_all_to_folder(data_manager, out_path, data_manager.rs485_config)
        files = [str(f.relative_to(out_path)) for f in out_path.rglob('*.st')]
        return ok({"files": files, "output_dir": str(out_path.resolve()), "count": len(files)},
                  f"Generated {len(files)} files")
    except Exception as e:
        return err(str(e))

@app.route('/api/generate/download', methods=['GET'])
@editor_or_admin
def download_code():
    out_path = Path(request.args.get('dir', 'generated_code'))
    if not out_path.exists():
        return err("No generated code found. Generate first.", 404)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fp in out_path.rglob('*.st'):
            zf.write(fp, fp.relative_to(out_path.parent))
    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'plc_code_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip')

@app.route('/api/generate/items', methods=['GET'])
@login_required
def generate_items():
    pou_names = list(set(d.pou_name for d in data_manager.devices if d.pou_name))
    return ok({
        'fbs': [{'fb_id': fb.fb_id, 'fb_name': fb.fb_name, 'meter_model': fb.meter_model}
                for fb in data_manager.function_blocks],
        'pous': [{'pou_name': p, 'device_name': next((d.device_name for d in data_manager.devices if d.pou_name == p), p)}
                 for p in sorted(pou_names)],
        'gateways': [{'name': g.name, 'ip_address': g.ip_address} for g in data_manager.gateways],
        'has_rs485': any(d.communication_type == 'RS485' for d in data_manager.devices),
        'has_cloud': len(data_manager.tag_configs) > 0,
    })

@app.route('/api/generate/preview', methods=['POST'])
@login_required
def preview_code():
    code_type = request.json.get('type', 'gvl')
    try:
        if code_type == 'gvl':
            code = generator.generate_gvl_file(data_manager.devices, data_manager.meter_models)
            return ok({"code": code, "filename": "GVL_Array.st"})
        elif code_type == 'plc_rs485':
            code = generator.generate_plc_rs485(data_manager.devices, data_manager.meter_models, data_manager.rs485_config)
            return ok({"code": code, "filename": "PLC_RS485.st"})
        elif code_type == 'cloud':
            code = generator.generate_cloud_configuration(data_manager.tag_configs, data_manager.devices)
            return ok({"code": code, "filename": "Cloud_Configuration.st"})
        elif code_type == 'fb':
            fb_id = request.json.get('fb_id')
            fb = next((f for f in data_manager.function_blocks if f.fb_id == fb_id), None)
            if not fb: return err("FB not found")
            code = generator.generate_parameters_fb(fb)
            return ok({"code": code, "filename": f"{fb.fb_name}.st"})
        elif code_type == 'pou':
            pou_name = request.json.get('pou_name')
            device = next((d for d in data_manager.devices if d.pou_name == pou_name), None)
            if not device: return err("POU/Device not found")
            mappings = data_manager.pou_mappings.get(pou_name, [])
            fb = data_manager.get_fb_by_meter_model(device.meter_model) if device.meter_model else None
            code = generator.generate_pou_with_meter_fb(device, mappings, fb)
            return ok({"code": code, "filename": f"{pou_name}.st"})
        elif code_type == 'gateway':
            gw_name = request.json.get('gateway_name')
            gw = data_manager.get_gateway_by_name(gw_name)
            if not gw: return err("Gateway not found")
            code = generator.generate_plc_gateway(gw_name, gw, data_manager.devices,
                                                   data_manager.meter_models, data_manager.rs485_config.delay_ms)
            if not code: code = f"(* No devices assigned to gateway '{gw_name}' *)"
            return ok({"code": code, "filename": f"{gw_name}.st"})
        elif code_type == 'support_dtr':
            code = "TYPE DWordToReal :\nUNION\n    dwValue: DWORD;\n    rValue: REAL;\nEND_UNION\nEND_TYPE\n"
            return ok({"code": code, "filename": "DWordToReal.st"})
        elif code_type == 'support_fbwtr':
            code = ("FUNCTION_BLOCK FB_WordToReal\nVAR_INPUT\n    wHighWord: WORD;\n    wLowWord: WORD;\nEND_VAR\n"
                    "VAR_OUTPUT\n    rValue: REAL;\nEND_VAR\nVAR\n    dwTemp: DWORD;\n    convert: DWordToReal;\nEND_VAR\n"
                    "dwTemp := SHL(WORD_TO_DWORD(wHighWord), 16) OR WORD_TO_DWORD(wLowWord);\n"
                    "convert.dwValue := dwTemp;\nrValue := convert.rValue;\nEND_FUNCTION_BLOCK\n")
            return ok({"code": code, "filename": "FB_WordToReal.st"})
        return err("Unknown code type")
    except Exception as e:
        return err(str(e))


# ─── BACKUPS ──────────────────────────────────────────────────────────────────

@app.route('/api/backups', methods=['GET'])
@login_required
def get_backups():
    return ok(data_manager.get_backups())

@app.route('/api/backups', methods=['POST'])
@editor_or_admin
def create_backup():
    data_manager.create_backup()
    return ok(message="Backup created successfully")

@app.route('/api/backups/<filename>/restore', methods=['POST'])
@admin_required
def restore_backup(filename):
    if data_manager.restore_backup(filename):
        return ok(message="Backup restored")
    return err("Backup not found", 404)

@app.route('/api/backups/<filename>', methods=['DELETE'])
@admin_required
def delete_backup(filename):
    bp = data_manager.backup_dir / filename
    if bp.exists():
        bp.unlink()
        return ok(message="Backup deleted")
    return err("Not found", 404)


# ─── EXPORT ───────────────────────────────────────────────────────────────────

@app.route('/api/export', methods=['GET'])
@editor_or_admin
def export_all():
    try:
        ep = data_manager.export_to_files('exports')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for fp in ep.iterdir():
                if fp.is_file():
                    zf.write(fp, fp.name)
        buf.seek(0)
        return send_file(buf, mimetype='application/zip', as_attachment=True,
                         download_name=f'plc_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip')
    except Exception as e:
        return err(str(e))


# ─── RESET ────────────────────────────────────────────────────────────────────

@app.route('/api/reset/devices', methods=['POST'])
@admin_required
def reset_devices():
    data_manager.reset_devices_and_tags()
    return ok(message="Devices, mappings, and tags cleared")

@app.route('/api/reset/all', methods=['POST'])
@admin_required
def reset_all():
    data_manager.reset_all_except_models()
    return ok(message="All data reset (meter models and FBs kept)")


# ─── SAMPLE CSVs ──────────────────────────────────────────────────────────────

SAMPLES = {
    '1': ('sample_devices.csv', """device_number,device_name,unit_id,array_name,pou_name,meter_model,communication_type,gateway_name
1,Zone1_Meter1,1,GVL.EM01,EM01_PLC1,ABB_EM6400,RS485,
2,Zone1_Meter2,2,GVL.EM02,EM02_PLC1,ABB_EM6400,RS485,
3,Zone2_Meter1,3,GVL.EM03,EM03_PLC1,Schneider_PM800,Gateway1,Gateway1
4,Main_Substation,4,GVL.Main,Main_PLC,ABB_EM6400,RS485,"""),
    '2': ('sample_mappings.csv', """pou_name,input_array,output_variable,mapping_fb_out
EM01_PLC1,Realtime,EM01_Voltage_L1,v1
EM01_PLC1,Realtime,EM01_Voltage_L2,v2
EM01_PLC1,Energy,EM01_Energy_Imp,kwh_import
Main_PLC,Realtime,Main_Voltage_L1,v1"""),
    '3': ('sample_cloud.csv', """tag_name,data_type,pou_name
EM01_Voltage_L1,REAL,EM01_PLC1
Main_Voltage_L1,REAL,Main_PLC"""),
}

@app.route('/api/sample-csv/<sheet>')
@login_required
def sample_csv(sheet):
    if sheet not in SAMPLES:
        return err("Invalid sheet")
    fname, content = SAMPLES[sheet]
    return send_file(io.BytesIO(content.encode()), mimetype='text/csv',
                     as_attachment=True, download_name=fname)

@app.route('/api/sample-excel')
@login_required
def sample_excel():
    data = core.ExcelImportManager.create_sample_excel()
    if not data:
        return err("openpyxl not installed — cannot create Excel sample", 500)
    return send_file(
        io.BytesIO(data),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='plc_import_sample.xlsx'
    )


if __name__ == '__main__':
    load_users()  # ensure default admin exists
    print("\n" + "="*60)
    print("  PLC & CODESYS GENERATOR - WEB INTERFACE")
    print("="*60)
    print("  Open → http://localhost:5000")
    print("  Default login: admin / admin123")
    print("="*60 + "\n")
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=debug, host='0.0.0.0', port=port)
