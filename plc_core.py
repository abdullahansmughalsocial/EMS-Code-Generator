"""
plc_core.py - PLC & CODESYS Generator Core Engine
Reconstructed from compiled bytecode.
Handles RS485/TCP Modbus communication code generation for WAGO/CODESYS ST.
"""

from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Union
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import json
import uuid
import re
import os
import shutil
import traceback

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import openpyxl
    from openpyxl import load_workbook, Workbook
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


# ─── DATA CLASSES ─────────────────────────────────────────────────────────────

@dataclass
class RS485Config:
    com_port: str = 'COM1'
    baud_rate: int = 9600
    parity: str = 'N'
    stop_bits: int = 1
    timeout_ms: int = 1000
    delay_ms: int = 9

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        valid_bauds = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
        if self.baud_rate not in valid_bauds:
            errors.append(f'Invalid baud rate: {self.baud_rate}')
        if self.parity not in ('N', 'E', 'O'):
            errors.append('Parity must be N, E, or O')
        if self.stop_bits not in (1, 2):
            errors.append('Stop bits must be 1 or 2')
        if self.timeout_ms < 100:
            errors.append('Timeout must be at least 100 ms')
        return len(errors) == 0, errors


@dataclass
class GatewayConfig:
    name: str = ''
    ip_address: str = ''
    port: int = 502
    description: str = ''

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not self.name.strip():
            errors.append('Gateway name cannot be empty')
        ip_pattern = r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
        if not re.match(ip_pattern, self.ip_address):
            errors.append(f'Invalid IP address format: {self.ip_address}')
        if not (1 <= self.port <= 65535):
            errors.append('Port must be between 1 and 65535')
        return len(errors) == 0, errors


@dataclass
class DeviceConfig:
    device_name: str = ''
    unit_id: int = 1
    array_name: str = ''
    pou_name: str = ''
    device_number: int = 0
    meter_model: str = ''
    fb_name: str = ''
    communication_type: str = 'RS485'
    gateway_name: str = ''

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not self.device_name.strip():
            errors.append('Device name cannot be empty')
        if not (1 <= self.unit_id <= 247):
            errors.append('Unit ID must be between 1 and 247')
        if self.device_number <= 0:
            errors.append('Device number must be positive')
        if self.pou_name:
            if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_.]*$', self.pou_name):
                errors.append('POU name must start with letter/underscore and contain only alphanumeric characters and dots')
        return len(errors) == 0, errors


@dataclass
class RegisterMap:
    meter_model: str = ''
    array_name: str = ''
    data_type: str = 'WORD'
    start_address: int = 0
    quantity: int = 1
    function_code: str = '16#03'
    comment: str = ''

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not (0 <= self.start_address <= 65535):
            errors.append('Start address must be between 0 and 65535')
        if not (1 <= self.quantity <= 125):
            errors.append('Quantity must be between 1 and 125')
        if not re.match(r'^16#[0-9A-Fa-f]{1,2}$', self.function_code):
            errors.append("Function code must be in format '16#XX'")
        return len(errors) == 0, errors


@dataclass
class TagConfig:
    tag_name: str = ''
    data_type: str = 'REAL'
    pou_name: str = ''
    message_number: int = 1
    tag_index: int = 1
    row_number: int = 0

    SUPPORTED_TYPES = ['BOOL', 'BYTE', 'WORD', 'DWORD', 'SINT', 'USINT',
                       'UINT', 'DINT', 'UDINT', 'REAL', 'LREAL', 'STRING']

    def get_variable_name(self) -> str:
        return re.sub(r'[^a-zA-Z0-9_]', '_', self.tag_name)

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', self.tag_name):
            errors.append('Tag name must start with letter/underscore and contain only alphanumeric characters and underscores')
        if not (1 <= self.message_number <= 66):
            errors.append('Message number must be between 1 and 66')
        if not (1 <= self.tag_index <= 1000):
            errors.append('Tag index must be between 1 and 1000')
        if self.data_type.upper() not in self.SUPPORTED_TYPES:
            errors.append(f'Invalid data type: {self.data_type}')
        return len(errors) == 0, errors


@dataclass
class POUMapping:
    pou_name: str = ''
    input_array: str = ''
    output_variable: str = ''
    mapping_fb_out: str = ''
    row_number: int = 0

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', self.output_variable):
            errors.append('Output variable must start with letter/underscore and contain only alphanumeric characters and underscores')
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', self.input_array):
            errors.append('Input array must start with letter/underscore and contain only alphanumeric characters and underscores')
        return len(errors) == 0, errors


@dataclass
class FBParameter:
    address: int = 0
    data_type: str = 'WORD'
    scale_factor: float = 1.0
    unit: str = ''
    comment: str = ''
    mapping_fb_out: str = ''
    conversion_type: str = 'single'
    input_array: str = ''

    def validate(self) -> Tuple[bool, List[str]]:
        errors = []
        if not (0 <= self.address <= 65535):
            errors.append('Address must be between 0 and 65535')
        return len(errors) == 0, errors


@dataclass
class FBConfig:
    fb_id: str = ''
    meter_model: str = ''
    fb_name: str = ''
    created_at: str = ''
    arrays: Dict = field(default_factory=dict)
    mappings: List = field(default_factory=list)
    has_swap: bool = False
    parameters: List = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'fb_id': self.fb_id,
            'meter_model': self.meter_model,
            'fb_name': self.fb_name,
            'created_at': self.created_at,
            'arrays': self.arrays,
            'mappings': self.mappings,
            'has_swap': self.has_swap,
            'parameters': self.parameters,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'FBConfig':
        return cls(
            fb_id=data.get('fb_id', str(uuid.uuid4())),
            meter_model=data.get('meter_model', ''),
            fb_name=data.get('fb_name', ''),
            created_at=data.get('created_at', datetime.now().isoformat()),
            arrays=data.get('arrays', {}),
            mappings=data.get('mappings', []),
            has_swap=data.get('has_swap', False),
            parameters=data.get('parameters', []),
        )


# ─── IMPORT MANAGERS ──────────────────────────────────────────────────────────

class TripleSheetImportManager:
    """Imports devices, mappings, and cloud tags from 3 separate CSV files."""

    def __init__(self):
        self.devices: List[DeviceConfig] = []
        self.pou_mappings: Dict[str, List[POUMapping]] = {}
        self.tag_configs: List[TagConfig] = []
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self.import_summary: dict = {}

    def import_triple_sheet_system(
        self,
        sheet1_file: Optional[str],
        sheet2_file: Optional[str],
        sheet3_file: Optional[str]
    ) -> Tuple[bool, List[str], List[str]]:
        self.devices.clear()
        self.pou_mappings.clear()
        self.tag_configs.clear()
        self.warnings.clear()
        self.errors.clear()

        total_sheets = sum(1 for f in [sheet1_file, sheet2_file, sheet3_file]
                           if f and Path(f).exists())

        if sheet1_file and Path(sheet1_file).exists():
            self._import_devices_sheet(sheet1_file)
        if sheet2_file and Path(sheet2_file).exists():
            self._import_mappings_sheet(sheet2_file)
        if sheet3_file and Path(sheet3_file).exists():
            self._import_cloud_sheet(sheet3_file)

        self._validate_cross_references()
        self._generate_import_summary()
        return len(self.errors) == 0, self.errors, self.warnings

    def _import_devices_sheet(self, devices_file: str):
        df = self._read_csv_file(devices_file)
        if df is None:
            return

        # Column name normalization
        column_mapping = {
            'device_number': ['device_number', 'device_no', 'dev_no', 'no'],
            'device_name':   ['device_name', 'dev_name', 'name', 'device'],
            'unit_id':       ['unit_id', 'slave_id', 'modbus_address', 'address', 'unit'],
            'array_name':    ['array_name', 'array', 'variable'],
            'pou_name':      ['pou_name', 'pou', 'program', 'plc_name', 'tagname'],
            'meter_model':   ['meter_model', 'model', 'meter', 'device_type', 'type'],
            'communication_type': ['communication_type', 'comm_type', 'comm', 'communication', 'type_comm'],
            'gateway_name':  ['gateway_name', 'gateway'],
        }

        col_map = {}
        df_cols_lower = {c.lower().strip(): c for c in df.columns}
        for std_col, alt_names in column_mapping.items():
            for alt in alt_names:
                if alt.lower() in df_cols_lower:
                    col_map[std_col] = df_cols_lower[alt.lower()]
                    break

        required_columns = ['device_name', 'unit_id']
        missing = [c for c in required_columns if c not in col_map]
        if missing:
            self.errors.append(f'Missing required columns in devices sheet: {", ".join(missing)}')
            return

        if col_map:
            rename_map = {v: k for k, v in col_map.items()}
            df = df.rename(columns=rename_map)

        seen_device_numbers = set()
        seen_device_names = set()

        for idx, row in df.iterrows():
            try:
                device_num = self._parse_int(row.get('device_number', idx + 1), idx + 2, 'device_number')
                if device_num is None:
                    device_num = idx + 1

                device_name = str(row.get('device_name', '')).strip()
                if not device_name:
                    continue

                unit_id = self._parse_int(row.get('unit_id', 1), idx + 2, 'unit_id')
                if unit_id is None:
                    unit_id = 1

                # Avoid duplicates
                if device_num in seen_device_numbers:
                    device_num = max(seen_device_numbers) + 1
                seen_device_numbers.add(device_num)
                seen_device_names.add(device_name)

                array_name = str(row.get('array_name', f'GVL.D{device_num:03d}')).strip()
                pou_name   = str(row.get('pou_name', device_name.replace(' ', '_'))).strip()
                meter_model = str(row.get('meter_model', '')).strip()
                comm_type  = str(row.get('communication_type', 'RS485')).strip()
                gateway    = str(row.get('gateway_name', '')).strip()

                is_valid = True
                validation_errors = []
                if not (1 <= unit_id <= 247):
                    validation_errors.append(f'Row {idx+2} Unit ID must be between 1 and 247')
                    is_valid = False

                device = DeviceConfig(
                    device_name=device_name,
                    unit_id=unit_id,
                    array_name=array_name,
                    pou_name=pou_name,
                    device_number=device_num,
                    meter_model=meter_model,
                    communication_type=comm_type if comm_type in ('RS485', 'Gateway', 'TCP') else 'RS485',
                    gateway_name=gateway,
                )
                self.devices.append(device)
                if not is_valid:
                    for e in validation_errors:
                        self.warnings.append(e)

            except Exception as e:
                self.warnings.append(f'Row {idx+2}: Error: {e}')

    def _import_mappings_sheet(self, mappings_file: str):
        df = self._read_csv_file(mappings_file)
        if df is None:
            return

        column_mapping = {
            'pou_name':       ['pou_name', 'pou', 'program', 'plc_name'],
            'input_array':    ['input_array', 'input', 'source', 'source_array', 'array'],
            'output_variable':['output_variable', 'output', 'target', 'target_variable', 'variable'],
            'mapping_fb_out': ['mapping_fb_out', 'mapping', 'function_block', 'fb_output', 'parameter'],
        }

        col_map = {}
        df_cols_lower = {c.lower().strip(): c for c in df.columns}
        for std_col, alt_names in column_mapping.items():
            for alt in alt_names:
                if alt.lower() in df_cols_lower:
                    col_map[std_col] = df_cols_lower[alt.lower()]
                    break

        required_columns = ['pou_name', 'output_variable']
        missing = [c for c in required_columns if c not in col_map]
        if missing:
            self.errors.append(f'Missing required columns in mappings sheet: {", ".join(missing)}')
            return

        if col_map:
            rename_map = {v: k for k, v in col_map.items()}
            df = df.rename(columns=rename_map)

        current_pou = ''
        current_input_array = ''
        mappings_by_pou: Dict[str, List[POUMapping]] = {}
        row_counter = 0

        for idx, row in df.iterrows():
            try:
                pou = str(row.get('pou_name', '')).strip()
                input_arr = str(row.get('input_array', '')).strip()
                output_var = str(row.get('output_variable', '')).strip()
                fb_out = str(row.get('mapping_fb_out', '')).strip()

                if pou:
                    current_pou = pou
                if input_arr:
                    current_input_array = input_arr
                if not output_var or not current_pou:
                    continue

                row_counter += 1
                mapping = POUMapping(
                    pou_name=current_pou,
                    input_array=current_input_array,
                    output_variable=output_var,
                    mapping_fb_out=fb_out,
                    row_number=row_counter,
                )
                if current_pou not in mappings_by_pou:
                    mappings_by_pou[current_pou] = []
                mappings_by_pou[current_pou].append(mapping)

            except Exception as e:
                self.warnings.append(f'Mapping row {idx+2}: Error: {e}')

        self.pou_mappings = mappings_by_pou

    def _import_cloud_sheet(self, cloud_file: str):
        df = self._read_csv_file(cloud_file)
        if df is None:
            return

        column_mapping = {
            'tag_name':      ['tag_name', 'tagname', 'name', 'variable'],
            'data_type':     ['data_type', 'datatype', 'type', 'dtype'],
            'pou_name':      ['pou_name', 'pou', 'program'],
            'message_number':['message_number', 'message', 'msg_no', 'msg_number'],
            'tag_index':     ['tag_index', 'index', 'tag_no', 'tag_idx'],
        }

        col_map = {}
        df_cols_lower = {c.lower().strip(): c for c in df.columns}
        for std_col, alt_names in column_mapping.items():
            for alt in alt_names:
                if alt.lower() in df_cols_lower:
                    col_map[std_col] = df_cols_lower[alt.lower()]
                    break

        required_columns = ['tag_name']
        missing = [c for c in required_columns if c not in col_map]
        if missing:
            self.errors.append(f'Missing required columns in cloud sheet: {", ".join(missing)}')
            return

        if col_map:
            rename_map = {v: k for k, v in col_map.items()}
            df = df.rename(columns=rename_map)

        message_num = 1
        tags_in_message = 0
        tag_row = 0

        for idx, row in df.iterrows():
            try:
                tag_name = str(row.get('tag_name', '')).strip()
                if not tag_name or tag_name.lower() in ('nan', 'none', ''):
                    continue

                data_type = str(row.get('data_type', 'REAL')).strip().upper()
                pou_name  = str(row.get('pou_name', '')).strip()

                # Parse message number if provided
                message_num_str = str(row.get('message_number', '')).strip()
                if message_num_str and message_num_str.isdigit():
                    message_num = int(message_num_str)
                    tags_in_message = 0

                tag_index_str = str(row.get('tag_index', '')).strip()
                if tag_index_str and tag_index_str.isdigit():
                    tag_idx = int(tag_index_str)
                else:
                    tags_in_message += 1
                    tag_idx = tags_in_message
                    if tag_idx > 20:
                        tag_idx = 1
                        tags_in_message = 1
                        message_num += 1

                tag_row += 1
                tag_config = TagConfig(
                    tag_name=tag_name,
                    data_type=data_type if data_type in TagConfig.SUPPORTED_TYPES else 'REAL',
                    pou_name=pou_name,
                    message_number=message_num,
                    tag_index=tag_idx,
                    row_number=tag_row,
                )
                self.tag_configs.append(tag_config)

            except Exception as e:
                self.warnings.append(f'Cloud row {idx+2}: Error: {e}')

    def _read_csv_file(self, filepath: str) -> Optional['pd.DataFrame']:
        if not HAS_PANDAS:
            self.errors.append('pandas is required for CSV import. Install with: pip install pandas')
            return None
        encodings = ['utf-8', 'latin1', 'cp1252']
        for encoding in encodings:
            try:
                df = pd.read_csv(filepath, dtype=str, encoding=encoding)
                df = df.fillna('')
                df.columns = [c.strip() for c in df.columns]
                return df
            except Exception:
                continue
        self.errors.append(f'Error reading CSV: {filepath}')
        return None

    def _parse_int(self, value, row_num: int, field_name: str) -> Optional[int]:
        try:
            if isinstance(value, (int, float)):
                return int(value)
            cleaned = str(value).strip()
            if not cleaned:
                return None
            return int(float(cleaned))
        except (ValueError, TypeError):
            self.warnings.append(f'Row {row_num}: Invalid {field_name} value: {value!r}')
            return None

    def _validate_cross_references(self):
        device_pou_names = {d.pou_name for d in self.devices}
        for pou_name in self.pou_mappings.keys():
            if pou_name and pou_name not in device_pou_names:
                self.warnings.append(f"'{pou_name}' in mappings not found in devices")

    def _generate_import_summary(self):
        total_devices  = len(self.devices)
        total_mappings = sum(len(m) for m in self.pou_mappings.values())
        total_tags     = len(self.tag_configs)
        unique_pous    = len(self.pou_mappings)
        self.import_summary = {
            'total_devices':  total_devices,
            'total_mappings': total_mappings,
            'total_tags':     total_tags,
            'unique_pous':    unique_pous,
            'timestamp':      datetime.now().isoformat(),
        }


class ExcelImportManager(TripleSheetImportManager):
    """Imports from a single Excel file with multiple sheets."""

    def import_from_excel(self, excel_path: str) -> Tuple[bool, List[str], List[str]]:
        if not HAS_OPENPYXL:
            return False, ['openpyxl is required. Install with: pip install openpyxl'], []
        if not Path(excel_path).exists():
            return False, ['Excel file not found'], []

        try:
            wb = load_workbook(excel_path, read_only=True, data_only=True)
        except Exception as e:
            return False, [f'Cannot open Excel file: {e}'], []

        sheet_names = wb.sheetnames
        if len(sheet_names) < 2:
            return False, ['Excel file must have at least 2 sheets (Devices + Mappings).'], []

        import tempfile
        tmp_files = []
        try:
            sheet_map = {
                'Sheet1_Devices':  0,
                'Sheet2_Mappings': 1,
                'Sheet3_CloudTags': 2,
            }

            csv_paths = []
            for i, sheet_name in enumerate(sheet_names[:3]):
                ws = wb[sheet_name]
                tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.csv',
                                                  delete=False, newline='')
                import csv
                writer = csv.writer(tmp)
                for row in ws.iter_rows(values_only=True):
                    writer.writerow(['' if v is None else str(v) for v in row])
                tmp.flush()
                tmp.close()
                csv_paths.append(tmp.name)
                tmp_files.append(tmp.name)

            result = self.import_triple_sheet_system(
                csv_paths[0] if len(csv_paths) > 0 else None,
                csv_paths[1] if len(csv_paths) > 1 else None,
                csv_paths[2] if len(csv_paths) > 2 else None,
            )
        except Exception as e:
            return False, [f'Error reading Excel sheets: {e}'], []
        finally:
            for fp in tmp_files:
                try:
                    os.remove(fp)
                except Exception:
                    pass
        return result

    @staticmethod
    def create_sample_excel() -> Optional[bytes]:
        if not HAS_OPENPYXL:
            return None
        from io import BytesIO
        wb = Workbook()

        # Sheet 1 - Devices
        ws1 = wb.active
        ws1.title = 'Sheet1_Devices'
        ws1.append(['device_number', 'device_name', 'unit_id', 'array_name',
                    'pou_name', 'meter_model', 'communication_type', 'gateway_name'])
        ws1.append([1, 'Zone1_Meter1', 1, 'GVL.EM01', 'EM01_PLC1', 'ABB_EM6400', 'RS485', ''])
        ws1.append([2, 'Zone1_Meter2', 2, 'GVL.EM02', 'EM02_PLC1', 'ABB_EM6400', 'RS485', ''])
        ws1.append([3, 'Zone2_Meter1', 3, 'GVL.EM03', 'EM03_PLC1', 'Schneider_PM800', 'Gateway', 'Gateway1'])
        ws1.append([4, 'Main_Substation', 4, 'GVL.Main', 'Main_PLC', 'ABB_EM6400', 'RS485', ''])

        # Sheet 2 - Mappings
        ws2 = wb.create_sheet('Sheet2_Mappings')
        ws2.append(['pou_name', 'input_array', 'output_variable', 'mapping_fb_out'])
        ws2.append(['EM01_PLC1', 'Realtime', 'EM01_Voltage_L1', 'v1'])
        ws2.append(['', '', 'EM01_Voltage_L2', 'v2'])
        ws2.append(['', '', 'EM01_Voltage_L3', 'v3'])
        ws2.append(['', 'Energy', 'EM01_Energy_Imp', 'kwh_import'])
        ws2.append(['EM02_PLC1', 'Realtime', 'EM02_Voltage_L1', 'v1'])
        ws2.append(['Main_PLC', 'Realtime', 'Main_Voltage_L1', 'v1'])
        ws2.append(['', 'Harmonics', 'Main_THD_V1', 'thd_v1'])

        # Sheet 3 - Cloud Tags
        ws3 = wb.create_sheet('Sheet3_CloudTags')
        ws3.append(['tag_name', 'data_type', 'pou_name'])
        ws3.append(['EM01_Voltage_L1', 'REAL', 'EM01_PLC1'])
        ws3.append(['EM01_Voltage_L2', 'REAL', 'EM01_PLC1'])
        ws3.append(['EM01_Voltage_L3', 'REAL', 'EM01_PLC1'])
        ws3.append(['EM01_Energy_Imp', 'REAL', 'EM01_PLC1'])
        ws3.append(['Main_Voltage_L1', 'REAL', 'Main_PLC'])
        ws3.append(['System_Status',   'INT',  'Main_PLC'])

        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        return buf.read()


# ─── DATA MANAGER ─────────────────────────────────────────────────────────────

class CompleteDataManager:
    """Manages all persistent data: devices, models, FBs, tags, mappings, gateways."""

    def __init__(self):
        self.data_dir    = Path(os.environ.get('DATA_DIR', 'complete_data'))
        self.config_file = self.data_dir / 'complete_config.json'
        self.fb_dir      = self.data_dir / 'function_blocks'
        self.pou_dir     = self.data_dir / 'pou_files'
        self.backup_dir  = self.data_dir / 'backups'
        self.tags_dir    = self.data_dir / 'tags'
        self.import_dir  = self.data_dir / 'imports'

        for d in [self.data_dir, self.fb_dir, self.pou_dir,
                  self.backup_dir, self.tags_dir, self.import_dir]:
            d.mkdir(exist_ok=True)

        self.devices: List[DeviceConfig]         = []
        self.meter_models: Dict[str, List[RegisterMap]] = {}
        self.function_blocks: List[FBConfig]     = []
        self.gateways: List[GatewayConfig]       = []
        self.rs485_config: RS485Config           = RS485Config()
        self.pou_mappings: Dict[str, List[POUMapping]] = {}
        self.pou_instances: Dict[str, str]       = {}
        self.tag_configs: List[TagConfig]        = []

        self.load_data()

    def load_data(self):
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    data = json.load(f)

                self.devices = [DeviceConfig(**d) for d in data.get('devices', [])]
                self.meter_models = {
                    name: [RegisterMap(**rm) for rm in maps]
                    for name, maps in data.get('meter_models', {}).items()
                }
                self.gateways = [GatewayConfig(**g) for g in data.get('gateways', [])]

                rs485_dict = data.get('rs485_config', {})
                if rs485_dict:
                    self.rs485_config = RS485Config(**rs485_dict)

                self.pou_mappings = {
                    pou: [POUMapping(**m) for m in maps]
                    for pou, maps in data.get('pou_mappings', {}).items()
                }
                self.pou_instances = data.get('pou_instances', {})
                self.tag_configs   = [TagConfig(**t) for t in data.get('tag_configs', [])]

            except Exception as e:
                print(f'Error loading config: {e}')

        self.load_function_blocks()

    def load_function_blocks(self):
        self.function_blocks = []
        for fb_file in sorted(self.fb_dir.glob('*.json')):
            try:
                with open(fb_file, 'r') as f:
                    self.function_blocks.append(FBConfig.from_dict(json.load(f)))
            except Exception as e:
                print(f'Error loading FB {fb_file}: {e}')

    def save_data(self):
        config_data = {
            'version':      '1.0',
            'last_saved':   datetime.now().isoformat(),
            'devices':      [asdict(d) for d in self.devices],
            'meter_models': {name: [asdict(rm) for rm in maps]
                             for name, maps in self.meter_models.items()},
            'gateways':     [asdict(g) for g in self.gateways],
            'rs485_config': asdict(self.rs485_config),
            'pou_mappings': {pou: [asdict(m) for m in maps]
                             for pou, maps in self.pou_mappings.items()},
            'pou_instances': self.pou_instances,
            'tag_configs':  [asdict(t) for t in self.tag_configs],
        }
        with open(self.config_file, 'w') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)

    def create_backup(self):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f'backup_{timestamp}.json'
        shutil.copy2(self.config_file, self.backup_dir / backup_name)
        self.cleanup_backups()

    def cleanup_backups(self, max_backups: int = 20):
        files = sorted(self.backup_dir.glob('backup_*.json'))
        while len(files) > max_backups:
            files[0].unlink()
            files = files[1:]

    def get_backups(self) -> List[dict]:
        files = sorted(self.backup_dir.glob('backup_*.json'),
                       key=lambda f: f.stat().st_mtime, reverse=True)
        return [{
            'filename': f.name,
            'size':     f.stat().st_size,
            'date':     datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
            'mtime':    f.stat().st_mtime,
        } for f in files]

    def restore_backup(self, filename: str) -> bool:
        bp = self.backup_dir / filename
        if not bp.exists():
            return False
        shutil.copy2(bp, self.config_file)
        self.load_data()
        return True

    def reset_devices_and_tags(self):
        self.devices.clear()
        self.pou_mappings.clear()
        self.tag_configs.clear()
        self.pou_instances.clear()
        self.save_data()

    def reset_all_except_models(self):
        self.reset_devices_and_tags()

    # ── Devices ──

    def add_device(self, device: DeviceConfig) -> bool:
        if not any(d.device_number == device.device_number for d in self.devices):
            fb = self.get_fb_by_meter_model(device.meter_model) if device.meter_model else None
            if fb:
                device.fb_name = fb.fb_name
            self.devices.append(device)
            self.save_data()
            return True
        return False

    def update_device(self, device: DeviceConfig) -> bool:
        for i, d in enumerate(self.devices):
            if d.device_number == device.device_number:
                self.devices[i] = device
                self.save_data()
                return True
        return False

    def delete_device(self, device_number: int):
        self.devices = [d for d in self.devices if d.device_number != device_number]
        self.save_data()

    def assign_meter_model(self, device_number: int, model_name: str) -> bool:
        for d in self.devices:
            if d.device_number == device_number:
                d.meter_model = model_name
                fb = self.get_fb_by_meter_model(model_name)
                if fb:
                    d.fb_name = fb.fb_name
                self.save_data()
                return True
        return False

    def get_devices_without_meter_model(self) -> List[DeviceConfig]:
        return [d for d in self.devices if not d.meter_model]

    def get_devices_by_meter_model(self, model_name: str) -> List[DeviceConfig]:
        return [d for d in self.devices if d.meter_model == model_name]

    # ── Meter Models ──

    def add_meter_model(self, model_name: str, register_maps: List[RegisterMap]) -> bool:
        self.meter_models[model_name] = register_maps
        self.save_data()
        return True

    def delete_meter_model(self, model_name: str) -> bool:
        if model_name in self.meter_models:
            del self.meter_models[model_name]
            self.save_data()
            return True
        return False

    # ── Gateways ──

    def add_gateway(self, gw: GatewayConfig) -> bool:
        if not any(g.name == gw.name for g in self.gateways):
            self.gateways.append(gw)
            self.save_data()
            return True
        return False

    def update_gateway(self, gw: GatewayConfig) -> bool:
        for i, g in enumerate(self.gateways):
            if g.name == gw.name:
                self.gateways[i] = gw
                self.save_data()
                return True
        return False

    def delete_gateway(self, name: str) -> bool:
        if not any(d.gateway_name == name for d in self.devices):
            self.gateways = [g for g in self.gateways if g.name != name]
            self.save_data()
            return True
        return False

    def get_gateway_by_name(self, name: str) -> Optional[GatewayConfig]:
        return next((g for g in self.gateways if g.name == name), None)

    # ── Tags ──

    def add_tag_config(self, tag: TagConfig) -> bool:
        self.tag_configs.append(tag)
        self.save_data()
        return True

    def delete_tag_config(self, message_number: int, tag_index: int) -> bool:
        initial = len(self.tag_configs)
        self.tag_configs = [t for t in self.tag_configs
                            if not (t.message_number == message_number and t.tag_index == tag_index)]
        if len(self.tag_configs) < initial:
            self.save_data()
            return True
        return False

    def clear_tag_configs(self):
        self.tag_configs.clear()
        self.save_data()

    # ── POU Mappings ──

    def add_pou_mapping(self, mapping: POUMapping) -> bool:
        if mapping.pou_name not in self.pou_mappings:
            self.pou_mappings[mapping.pou_name] = []
        self.pou_mappings[mapping.pou_name].append(mapping)
        self.save_data()
        return True

    # ── Function Blocks ──

    def save_function_block(self, fb: FBConfig):
        fb_path = self.fb_dir / f'{fb.fb_id}.json'
        with open(fb_path, 'w') as f:
            json.dump(fb.to_dict(), f, indent=2)
        existing = next((i for i, x in enumerate(self.function_blocks) if x.fb_id == fb.fb_id), None)
        if existing is not None:
            self.function_blocks[existing] = fb
        else:
            self.function_blocks.append(fb)

    def delete_function_block(self, fb_id: str):
        fb_path = self.fb_dir / f'{fb_id}.json'
        if fb_path.exists():
            fb_path.unlink()
        self.function_blocks = [fb for fb in self.function_blocks if fb.fb_id != fb_id]

    def get_fb_by_name(self, fb_name: str) -> Optional[FBConfig]:
        return next((fb for fb in self.function_blocks if fb.fb_name == fb_name), None)

    def get_fb_by_meter_model(self, model_name: str) -> Optional[FBConfig]:
        return next((fb for fb in self.function_blocks if fb.meter_model == model_name), None)

    def create_function_block(self, fb: FBConfig) -> FBConfig:
        self.save_function_block(fb)
        return fb

    def save_pou_file(self, pou_name: str, code: str, output_dir: Optional[Path] = None):
        target = (output_dir or self.pou_dir)
        target.mkdir(parents=True, exist_ok=True)
        (target / f'{pou_name}.st').write_text(code)

    def export_to_files(self, export_dir: str = 'exports') -> Path:
        ep = Path(export_dir)
        ep.mkdir(exist_ok=True)
        with open(ep / 'devices_.json', 'w') as f:
            json.dump([asdict(d) for d in self.devices], f, indent=2)
        with open(ep / 'meter_models_.json', 'w') as f:
            json.dump({n: [asdict(r) for r in rs] for n, rs in self.meter_models.items()}, f, indent=2)
        with open(ep / 'mappings_.json', 'w') as f:
            json.dump({p: [asdict(m) for m in ms] for p, ms in self.pou_mappings.items()}, f, indent=2)
        with open(ep / 'tags_.json', 'w') as f:
            json.dump([asdict(t) for t in self.tag_configs], f, indent=2)
        return ep


# ─── CODE GENERATOR ───────────────────────────────────────────────────────────

class AdvancedCODESYSGenerator:
    """Generates CODESYS Structured Text code for Modbus RS485 and TCP/IP."""

    def __init__(self):
        pass

    def _get_array_suffix(self, array_name: str) -> str:
        name = array_name.lower()
        if 'realtime' in name:
            return 'zA'
        elif 'energy' in name:
            return 'zB'
        elif 'harmonics' in name:
            return 'zC'
        else:
            return 'zA'

    def generate_parameters_fb(self, fb: FBConfig) -> str:
        """
        Generate FUNCTION_BLOCK ST code for a meter model FB.
        Conversion types used:
            single       -> WORD_TO_REAL(arr[i])
            single_int   -> WORD_TO_INT(arr[i])
            dword_real   -> IEEE-754 UNION (HighWord/LowWord)
            dword_shift  -> Bit-shift SHL/OR -> DWORD_TO_REAL
            dword_signed -> Bit-shift -> DWORD_TO_DINT -> DINT_TO_REAL
        """
        lines = [f'FUNCTION_BLOCK {fb.fb_name}']

        # Collect all input arrays needed
        input_arrays = set()
        needs_union   = False
        needs_temp32  = False

        for mapping in fb.mappings:
            conv = mapping.get('conversion_type', 'single') if isinstance(mapping, dict) else 'single'
            arr  = mapping.get('input_array', 'Realtime') if isinstance(mapping, dict) else 'Realtime'
            input_arrays.add(arr)
            if conv == 'dword_real':
                needs_union = True
            if conv in ('dword_shift', 'dword_signed'):
                needs_temp32 = True

        # VAR_INPUT
        lines.append('VAR_INPUT')
        for arr in sorted(input_arrays):
            lines.append(f'    {arr}     : ARRAY[0..124] OF WORD;')
        if needs_union:
            lines.append('')
            lines.append('    (* IEEE-754 union for DWORD->REAL without bit manipulation *)')
            lines.append('    fbWordToReal   : FB_WordToReal;')
        lines.append('END_VAR')
        lines.append('VAR_OUTPUT')

        # Output variables
        active_mappings = fb.mappings if fb.mappings else []
        for mapping in active_mappings:
            if isinstance(mapping, dict):
                out_var = mapping.get('output_variable', mapping.get('mapping_fb_out', ''))
                desc    = mapping.get('comment', '')
                param   = mapping.get('mapping_fb_out', '')
            else:
                out_var = getattr(mapping, 'output_variable', '')
                desc    = ''
                param   = getattr(mapping, 'mapping_fb_out', '')
            if out_var:
                comment = f'    (* {desc} *)' if desc else ''
                lines.append(f'    {out_var:<30}: REAL; {comment}')

        lines.append('END_VAR')
        lines.append('VAR')
        if needs_temp32:
            lines.append('    temp32      : DWORD;')
        if needs_union and not needs_temp32:
            pass  # fbWordToReal is VAR_INPUT
        if needs_union:
            pass
        lines.append('END_VAR')
        lines.append('')

        # Body
        for mapping in active_mappings:
            if isinstance(mapping, dict):
                out_var = mapping.get('output_variable', mapping.get('mapping_fb_out', ''))
                arr     = mapping.get('input_array', 'Realtime')
                idx     = mapping.get('address', 0)
                scale   = mapping.get('scale_factor', 1.0)
                conv    = mapping.get('conversion_type', 'single')
            else:
                out_var = getattr(mapping, 'output_variable', '')
                arr     = getattr(mapping, 'input_array', 'Realtime')
                idx     = 0
                scale   = 1.0
                conv    = 'single'

            if not out_var:
                continue

            scale_str = f' * {scale}' if scale != 1.0 else ''

            if conv == 'single':
                lines.append(f'{out_var} := WORD_TO_REAL({arr}[{idx}]){scale_str};')
            elif conv == 'single_int':
                lines.append(f'{out_var} := WORD_TO_INT({arr}[{idx}]){scale_str};')
            elif conv == 'dword_real':
                lines.append(f'fbWordToReal(wHighWord := {arr}[{idx}], wLowWord := {arr}[{idx+1}]);')
                lines.append(f'{out_var} := fbWordToReal.rValue{scale_str};')
            elif conv == 'dword_shift':
                lines.append(f'temp32 := SHL(WORD_TO_DWORD({arr}[{idx}]), 16) OR WORD_TO_DWORD({arr}[{idx+1}]);')
                lines.append(f'{out_var} := DWORD_TO_REAL(temp32){scale_str};')
            elif conv == 'dword_signed':
                lines.append(f'temp32   := SHL(WORD_TO_DWORD({arr}[{idx}]), 16) OR WORD_TO_DWORD({arr}[{idx+1}]);')
                lines.append(f'tempDint := DWORD_TO_DINT(temp32);')
                lines.append(f'{out_var} := DINT_TO_REAL(tempDint){scale_str};')
            elif conv == 'calculated':
                formula = mapping.get('formula', '') if isinstance(mapping, dict) else ''
                lines.append(f'(* Custom CODESYS ST formula *)')
                lines.append(f'')
            elif conv == 'constant':
                val = mapping.get('scale_factor', 0.0) if isinstance(mapping, dict) else 0.0
                lines.append(f'{out_var} := {val};')

        lines.append('')
        lines.append(f'END_FUNCTION_BLOCK')
        return '\n'.join(lines)

    def generate_support_files(self, output_dir: Path):
        support_dir = output_dir / 'Support'
        support_dir.mkdir(parents=True, exist_ok=True)

        # DWordToReal TYPE
        dtr = 'TYPE DWordToReal :\nUNION\n    dwValue: DWORD;\n    rValue: REAL;\nEND_UNION\nEND_TYPE\n'
        (support_dir / 'DWordToReal.st').write_text(dtr)

        # FB_WordToReal
        fbwtr = (
            'FUNCTION_BLOCK FB_WordToReal\n'
            'VAR_INPUT\n'
            '    wHighWord: WORD;\n'
            '    wLowWord: WORD;\n'
            'END_VAR\n'
            'VAR_OUTPUT\n'
            '    rValue: REAL;\n'
            'END_VAR\n'
            'VAR\n'
            '    dwTemp: DWORD;\n'
            '    convert: DWordToReal;\n'
            'END_VAR\n'
            'dwTemp := SHL(WORD_TO_DWORD(wHighWord), 16) OR WORD_TO_DWORD(wLowWord);\n'
            'convert.dwValue := dwTemp;\n'
            'rValue := convert.rValue;\n'
            'END_FUNCTION_BLOCK\n'
        )
        (support_dir / 'FB_WordToReal.st').write_text(fbwtr)

    def generate_gvl_file(self, devices: List[DeviceConfig],
                           meter_models: Dict[str, List[RegisterMap]]) -> str:
        lines = ['VAR_GLOBAL']

        for device in sorted(devices, key=lambda d: d.device_number):
            if not device.array_name:
                continue
            # Find arrays for this device's meter model
            arrays_done = set()
            if device.meter_model and device.meter_model in meter_models:
                for rm in meter_models[device.meter_model]:
                    arr_name = rm.array_name
                    if arr_name not in arrays_done:
                        arrays_done.add(arr_name)
                        suffix = self._get_array_suffix(arr_name)
                        qty    = rm.quantity
                        lines.append(
                            f'    {device.array_name}.{suffix}  : ARRAY[0..{max(qty-1,124)}] OF WORD; '
                            f'(* {device.device_name} - {arr_name} *)'
                        )
            else:
                lines.append(
                    f'    {device.array_name}.zA  : ARRAY[0..124] OF WORD; '
                    f'(* {device.device_name} *)'
                )

        lines.append('END_VAR')
        return '\n'.join(lines)

    def generate_plc_rs485(self, devices: List[DeviceConfig],
                            meter_models: Dict[str, List[RegisterMap]],
                            rs485_cfg: RS485Config) -> str:
        rs485_devices = [d for d in devices if d.communication_type == 'RS485']

        parity_map  = {'N': 'None', 'E': 'Even', 'O': 'Odd'}
        parity_enum = parity_map.get(rs485_cfg.parity, 'None')

        lines = [
            f'(* PLC RS485 Communication - Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")} *)',
            'PROGRAM PLC_RS485',
            'VAR',
            f'    mySerialMaster : FbMbMasterSerial := (xConnect := TRUE, udiBaudrate := {rs485_cfg.baud_rate}, '
            f'eParity := agoTypesCom.eTTYParity.{parity_enum}, '
            f'uiStopBits := {rs485_cfg.stop_bits}, tTimeOut := T#{rs485_cfg.timeout_ms}MS);',
            f'    utQuery        : typMbQuery;',
            f'    xTxTrigger     : BOOL;',
            f'    utResponse     : typMbResponse;',
            f'    ntonDelay      : TON := (PT := T#{rs485_cfg.delay_ms}MS);',
            '    wState         : INT;',
            'END_VAR',
        ]

        # Connect call
        lines.append(f"mySerialMaster(I_Port := '{rs485_cfg.com_port}', utQuery := utQuery, "
                     f'xTrigger := xTxTrigger, utResponse := utResponse);')
        lines.append('CASE wState OF')
        lines.append('    0:')
        lines.append('        IF mySerialMaster.xConnect THEN wState := 10; END_IF;')

        state_counter = 10
        for device in rs485_devices:
            model_maps = meter_models.get(device.meter_model, [])
            read_maps  = model_maps if model_maps else [RegisterMap(array_name='Realtime', start_address=0, quantity=60)]

            for rm in read_maps:
                suffix  = self._get_array_suffix(rm.array_name)
                gvl_arr = f'{device.array_name}.{suffix}'

                lines.append(f'    {state_counter}:')
                lines.append(f'        ntonDelay(IN := TRUE);')
                lines.append(f'        IF ntonDelay.Q THEN')
                lines.append(f'            ntonDelay(IN := FALSE);')
                lines.append(f'            utQuery.bUnitId := {device.unit_id};')
                lines.append(f'            utQuery.bFunctionCode := {rm.function_code};')
                lines.append(f'            utQuery.uiReadAddress := {rm.start_address};')
                lines.append(f'            utQuery.uiReadQuantity := {rm.quantity};')
                lines.append(f'            xTxTrigger := TRUE;')
                lines.append(f'            wState := {state_counter + 1};')
                lines.append(f'        END_IF;')

                lines.append(f'    {state_counter + 1}:')
                lines.append(f'        IF NOT xTxTrigger THEN')
                lines.append(f'            IF NOT mySerialMaster.xError THEN')
                lines.append(f'                GVL_Array.zA := utResponse.awData;')
                lines.append(f'            END_IF;')
                lines.append(f'            wState := {state_counter + 2};')
                lines.append(f'        END_IF;')

                state_counter += 10

        # Wrap-around state
        lines.append(f'    {state_counter}:')
        lines.append(f'        ntonDelay(IN := TRUE);')
        lines.append(f'        IF ntonDelay.Q THEN ntonDelay(IN := FALSE); wState := 10; END_IF;')
        lines.append(f'    ELSE:')
        lines.append(f'        wState := 0;')
        lines.append('END_CASE')
        lines.append('END_PROGRAM')
        return '\n'.join(lines)

    def generate_plc_gateway(self, gw_name: str, gw: GatewayConfig,
                              devices: List[DeviceConfig],
                              meter_models: Dict[str, List[RegisterMap]],
                              delay_ms: int = 9) -> str:
        gw_devices = [d for d in devices if d.gateway_name == gw_name]
        if not gw_devices:
            return ''

        lines = [
            f'(* TCP Communication - Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")} *)',
            f'PROGRAM {gw_name}',
            'VAR',
            f"    myTCPMaster : FbMbMasterTcp := (xConnect := TRUE, sHost := '{gw.ip_address}', uiPort := {gw.port});",
            f'    utQuery     : WagoAppPlcModbus.typMbQuery;',
            f'    utResponse  : WagoAppPlcModbus.typMbResponse;',
            f'    xTxTrigger  : BOOL;',
            f'    ntonDelay   : TON := (PT := T#{delay_ms}MS);',
            '    wState      : INT;',
            'END_VAR',
        ]

        lines.append('myTCPMaster(utQuery := utQuery, xTrigger := xTxTrigger, utResponse := utResponse);')
        lines.append('CASE wState OF')
        lines.append('    0:')
        lines.append(f'        IF myTCPMaster.xConnect AND NOT myTCPMaster.xError THEN wState := 10; END_IF;')

        state_counter = 10
        for device in gw_devices:
            model_maps = meter_models.get(device.meter_model, [])
            read_maps  = model_maps if model_maps else [RegisterMap(array_name='Realtime', start_address=0, quantity=60)]

            for rm in read_maps:
                suffix  = self._get_array_suffix(rm.array_name)
                gvl_arr = f'{device.array_name}.{suffix}'

                lines.append(f'    {state_counter}:')
                lines.append(f'        ntonDelay(IN := TRUE);')
                lines.append(f'        IF ntonDelay.Q THEN')
                lines.append(f'            ntonDelay(IN := FALSE);')
                lines.append(f'            utQuery.bUnitId := {device.unit_id};')
                lines.append(f'            utQuery.bFunctionCode := {rm.function_code};')
                lines.append(f'            utQuery.uiReadAddress := {rm.start_address};')
                lines.append(f'            utQuery.uiReadQuantity := {rm.quantity};')
                lines.append(f'            xTxTrigger := TRUE;')
                lines.append(f'            wState := {state_counter + 1};')
                lines.append(f'        END_IF;')

                lines.append(f'    {state_counter + 1}:')
                lines.append(f'        IF NOT myTCPMaster.xBusy THEN')
                lines.append(f'            IF NOT myTCPMaster.xError THEN')
                lines.append(f'                GVL_Array.zb := utResponse.awData;')
                lines.append(f'            END_IF;')
                lines.append(f'            xTxTrigger := FALSE;')
                lines.append(f'            wState := {state_counter + 2};')
                lines.append(f'        END_IF;')

                state_counter += 10

        lines.append(f'    {state_counter}:')
        lines.append(f'        ntonDelay(IN := TRUE);')
        lines.append(f'        IF ntonDelay.Q THEN ntonDelay(IN := FALSE); wState := 10; END_IF;')
        lines.append(f'    ELSE:')
        lines.append(f'        wState := 0;')
        lines.append('END_CASE')
        lines.append('END_PROGRAM')
        return '\n'.join(lines)

    def generate_pou_with_meter_fb(self, device: DeviceConfig,
                                    mappings: List[POUMapping],
                                    fb: Optional[FBConfig]) -> str:
        pou_name = device.pou_name
        arr_name = device.array_name
        inst     = f'{pou_name}_inst'

        lines = [f'PROGRAM {pou_name}', 'VAR']

        if fb:
            lines.append(f'    {inst}: {fb.fb_name};')
        lines.append('END_VAR')
        lines.append('')

        # Call FB with arrays
        if fb and fb.arrays:
            fb_call_args = []
            for arr_key in fb.arrays:
                suffix  = self._get_array_suffix(arr_key)
                fb_call_args.append(f'{arr_key} := GVL_Array.{arr_name}.{suffix}')
            lines.append(f'{inst}({", ".join(fb_call_args)});')
        elif fb:
            lines.append(f'{inst}(Realtime := GVL_Array.{arr_name}.zA);')

        lines.append('')

        # Output variable assignments
        output_vars = []
        for mapping in mappings:
            out_var  = mapping.output_variable
            fb_out   = mapping.mapping_fb_out
            if fb and fb_out:
                lines.append(f'{out_var} := {inst}.{fb_out};')
            elif arr_name:
                lines.append(f'{out_var} := WORD_TO_REAL(GVL_Array.{arr_name}.zA[0]) * 1.0;')
            output_vars.append(out_var)

        lines.append('')
        lines.append('END_PROGRAM')
        return '\n'.join(lines).rstrip()

    def generate_cloud_configuration(self, tag_configs: List[TagConfig],
                                      devices: List[DeviceConfig]) -> str:
        # Sort tags by message_number then tag_index
        sorted_tags = sorted(tag_configs, key=lambda t: (t.message_number, t.tag_index))

        # Group by message number
        messages: Dict[int, List[TagConfig]] = defaultdict(list)
        for tag in sorted_tags:
            messages[tag.message_number].append(tag)

        total_msgs = max(messages.keys()) if messages else 1

        type_map = {
            'BOOL':   'E_TagDataType.dtBOOL',
            'BYTE':   'E_TagDataType.dtBYTE',
            'WORD':   'E_TagDataType.dtWORD',
            'DWORD':  'E_TagDataType.dtDWORD',
            'INT':    'E_TagDataType.dtINT',
            'UINT':   'E_TagDataType.dtUINT',
            'DINT':   'E_TagDataType.dtDINT',
            'UDINT':  'E_TagDataType.dtUDINT',
            'REAL':   'E_TagDataType.dtREAL',
            'LREAL':  'E_TagDataType.dtLREAL',
            'STRING': 'E_TagDataType.dtSTRING',
            'SINT':   'E_TagDataType.dtSINT',
            'USINT':  'E_TagDataType.dtUSINT',
        }

        union_map = {
            'BOOL':   'xBoolValue',
            'BYTE':   'byByteValue',
            'WORD':   'wWordValue',
            'DWORD':  'dwDwordValue',
            'INT':    'iIntValue',
            'UINT':   'uiUintValue',
            'DINT':   'diDintValue',
            'UDINT':  'udiUdintValue',
            'REAL':   'rRealValue',
            'LREAL':  'lrLrealValue',
            'STRING': 'sStringValue',
            'SINT':   'siSintValue',
            'USINT':  'usiUsintValue',
        }

        lines = [
            f'(* Cloud Tag Configuration - {len(sorted_tags)} Messages: {total_msgs} *)',
            '',
            'VAR_GLOBAL',
            f'    aMessageDefs: ARRAY[1..{max(total_msgs,1)}] OF CloudMessage;',
            'END_VAR',
            '',
        ]

        # Build assignments per message
        devs_by_pou = {d.pou_name: d for d in devices}

        for msg_num in sorted(messages.keys()):
            tags_in_msg = messages[msg_num]
            lines.append(f'(* Message {msg_num} — {len(tags_in_msg)} tags *)')
            for tag in tags_in_msg:
                dt_enum = type_map.get(tag.data_type.upper(), 'E_TagDataType.dtREAL')
                u_mem   = union_map.get(tag.data_type.upper(), 'rRealValue')
                var_name = tag.get_variable_name()
                pou_ref  = tag.pou_name
                lines.append(
                    f'aMessageDefs[{msg_num}].aTags[{tag.tag_index}].sTagName := \'{tag.tag_name}\';'
                )
                lines.append(
                    f'aMessageDefs[{msg_num}].aTags[{tag.tag_index}].eDataType := {dt_enum};'
                )
                if pou_ref:
                    lines.append(
                        f'aMessageDefs[{msg_num}].aTags[{tag.tag_index}].Value.{u_mem} := {pou_ref}.{var_name};'
                    )
            lines.append('')

        return '\n'.join(lines)

    def generate_all_plc_code(self, devices: List[DeviceConfig],
                               meter_models: Dict[str, List[RegisterMap]],
                               rs485_config: RS485Config,
                               gateways: List[GatewayConfig]) -> Dict[str, str]:
        result = {}
        has_rs485 = any(d.communication_type == 'RS485' for d in devices)
        if has_rs485:
            result['PLC_RS485'] = self.generate_plc_rs485(devices, meter_models, rs485_config)
        for gw in gateways:
            code = self.generate_plc_gateway(gw.name, gw, devices, meter_models, rs485_config.delay_ms)
            if code:
                result[gw.name] = code
        return result

    def generate_all_to_folder(self, data_manager: CompleteDataManager,
                                output_dir: Path,
                                rs485_config: RS485Config):
        output_dir.mkdir(parents=True, exist_ok=True)

        # GVL
        gvl_dir = output_dir / 'GVL_Array.st'
        gvl_code = self.generate_gvl_file(data_manager.devices, data_manager.meter_models)
        gvl_dir.write_text(gvl_code)

        # Support files
        self.generate_support_files(output_dir)

        # Function blocks
        seen = set()
        for fb in data_manager.function_blocks:
            if fb.fb_name not in seen:
                seen.add(fb.fb_name)
                code = self.generate_parameters_fb(fb)
                (output_dir / f'{fb.fb_name}.st').write_text(code)

        # RS485 main program
        devs_by_pou = defaultdict(list)
        for d in data_manager.devices:
            devs_by_pou[d.pou_name].append(d)

        has_rs485 = any(d.communication_type == 'RS485' for d in data_manager.devices)
        if has_rs485:
            comm_dir = output_dir / 'Communication'
            comm_dir.mkdir(exist_ok=True)
            rs485_code = self.generate_plc_rs485(
                data_manager.devices, data_manager.meter_models, rs485_config
            )
            (comm_dir / 'PLC_RS485.st').write_text(rs485_code)

        # Gateway programs
        for gw in data_manager.gateways:
            code = self.generate_plc_gateway(
                gw.name, gw, data_manager.devices,
                data_manager.meter_models, rs485_config.delay_ms
            )
            if code:
                comm_dir = output_dir / 'Communication'
                comm_dir.mkdir(exist_ok=True)
                (comm_dir / f'{gw.name}.st').write_text(code)

        # POU programs
        for pou_name, pou_devices in devs_by_pou.items():
            if not pou_name:
                continue
            device = pou_devices[0]
            mappings = data_manager.pou_mappings.get(pou_name, [])
            fb = data_manager.get_fb_by_meter_model(device.meter_model) if device.meter_model else None
            code = self.generate_pou_with_meter_fb(device, mappings, fb)
            (output_dir / f'{pou_name}.st').write_text(code)

        # Cloud configuration
        if data_manager.tag_configs:
            cloud_dir = output_dir / 'Cloud'
            cloud_dir.mkdir(exist_ok=True)
            cloud_code = self.generate_cloud_configuration(
                data_manager.tag_configs, data_manager.devices
            )
            (cloud_dir / 'Cloud_Configuration.st').write_text(cloud_code)
