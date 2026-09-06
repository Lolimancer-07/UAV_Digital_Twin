"""
simulator/can_bridge.py

Encodes live engine telemetry into SAE J1939 / SocketCAN CAN bus frames.
Simulates real avionics CAN bus flight data recorder (FDR) streams with full SPN field breakdowns.

PGNs implemented:
  PGN 61444 (0x0CF00400) EEC1 — Electronic Engine Controller 1 (RPM, Torque Demand)
  PGN 65262 (0x18FEEE00) ET1  — Engine Temperatures 1 (CHT, Oil Temp)
  PGN 65263 (0x18FEEF00) EFLP — Engine Fluid Level & Pressure (Oil Pressure)
  PGN 65266 (0x18FEF200) LFE  — Fuel Economy & Delivery Rate
  PGN 65271 (0x18FEF700) VEP  — Vehicle Electrical Power (28V Bus, Alternator Current)
  PGN 65168 (0x18FE9000) VIB  — Aero Vibration Monitor (RMS Acceleration, Kurtosis)
"""

import time
from typing import Dict, List, Any


class AeroCANBridge:
    """
    Encodes sensor parameters into standard 8-byte J1939 CAN payloads
    with arbitration IDs, PGN numbers, decoded strings, and SPN bit-field schemas.
    """

    @staticmethod
    def encode_eec1(rpm: float, torque_pct: float = 75.0) -> Dict[str, Any]:
        """PGN 61444 — Electronic Engine Controller 1"""
        raw_rpm = min(65535, max(0, int(rpm / 0.125)))
        raw_torque = min(250, max(0, int(torque_pct + 125)))
        payload = bytes([0x01, raw_torque, raw_torque, raw_rpm & 0xFF, (raw_rpm >> 8) & 0xFF, 0x00, 0xFF, 0xFF])
        return {
            "can_id": "0x0CF00400",
            "pgn": 61444,
            "name": "EEC1_ENGINE_SPEED",
            "dlc": 8,
            "hex": " ".join(f"{b:02X}" for b in payload),
            "decoded": f"Speed={rpm:.0f} RPM | Actual Torque={torque_pct:.0f}%",
            "spns": [
                {"spn": 190, "name": "Engine Speed", "raw": raw_rpm, "val": f"{rpm:.1f}", "unit": "RPM", "bits": "24-39", "res": "0.125 rpm/bit"},
                {"spn": 513, "name": "Actual Engine % Torque", "raw": raw_torque, "val": f"{torque_pct:.0f}", "unit": "%", "bits": "16-23", "res": "1%/bit (-125% offset)"},
                {"spn": 898, "name": "Engine Requested Speed Control", "raw": 1, "val": "Speed Control Active", "unit": "state", "bits": "0-7", "res": "Enum"}
            ]
        }

    @staticmethod
    def encode_et1(cht: float, oil_temp: float) -> Dict[str, Any]:
        """PGN 65262 — Engine Temperature 1"""
        cht_c = (cht - 32.0) * 5.0 / 9.0
        oil_t_c = (oil_temp - 32.0) * 5.0 / 9.0
        raw_cht = min(250, max(0, int(cht_c + 40)))
        raw_oil = min(250, max(0, int(oil_t_c + 40)))
        payload = bytes([raw_cht, 0x55, raw_oil, 0x00, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FEEE00",
            "pgn": 65262,
            "name": "ET1_TEMPERATURES",
            "dlc": 8,
            "hex": " ".join(f"{b:02X}" for b in payload),
            "decoded": f"CHT={cht:.1f}°F ({cht_c:.1f}°C) | OilTemp={oil_temp:.1f}°F ({oil_t_c:.1f}°C)",
            "spns": [
                {"spn": 110, "name": "Cylinder Head Temp (CHT)", "raw": raw_cht, "val": f"{cht:.1f}", "unit": "°F", "bits": "0-7", "res": "1°C/bit (-40°C offset)"},
                {"spn": 175, "name": "Engine Oil Temperature", "raw": raw_oil, "val": f"{oil_temp:.1f}", "unit": "°F", "bits": "16-23", "res": "1°C/bit (-40°C offset)"},
                {"spn": 174, "name": "Fuel Temp", "raw": 0x55, "val": "45.0", "unit": "°C", "bits": "8-15", "res": "1°C/bit (-40°C offset)"}
            ]
        }

    @staticmethod
    def encode_eflp(oil_press_psi: float) -> Dict[str, Any]:
        """PGN 65263 — Engine Fluid Level & Pressure"""
        oil_kpa = oil_press_psi * 6.89476
        raw_oil_p = min(250, max(0, int(oil_kpa / 4.0)))
        payload = bytes([0xFF, 0xFF, 0xFF, raw_oil_p, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FEEF00",
            "pgn": 65263,
            "name": "EFLP_OIL_PRESSURE",
            "dlc": 8,
            "hex": " ".join(f"{b:02X}" for b in payload),
            "decoded": f"OilPress={oil_press_psi:.1f} PSI ({oil_kpa:.1f} kPa)",
            "spns": [
                {"spn": 100, "name": "Engine Oil Pressure", "raw": raw_oil_p, "val": f"{oil_press_psi:.1f}", "unit": "PSI", "bits": "24-31", "res": "4 kPa/bit"},
                {"spn": 101, "name": "Crankcase Pressure", "raw": 0xFF, "val": "101.3", "unit": "kPa", "bits": "32-39", "res": "1/128 kPa/bit"}
            ]
        }

    @staticmethod
    def encode_lfe(fuel_flow_l_h: float) -> Dict[str, Any]:
        """PGN 65266 — Fuel Economy / Rate"""
        raw_fuel = min(65535, max(0, int(fuel_flow_l_h / 0.05)))
        payload = bytes([raw_fuel & 0xFF, (raw_fuel >> 8) & 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FEF200",
            "pgn": 65266,
            "name": "LFE_FUEL_RATE",
            "dlc": 8,
            "hex": " ".join(f"{b:02X}" for b in payload),
            "decoded": f"FuelRate={fuel_flow_l_h:.2f} L/h",
            "spns": [
                {"spn": 183, "name": "Engine Fuel Rate", "raw": raw_fuel, "val": f"{fuel_flow_l_h:.2f}", "unit": "L/h", "bits": "0-15", "res": "0.05 L/h per bit"}
            ]
        }

    @staticmethod
    def encode_vep(voltage: float, current: float = 18.5) -> Dict[str, Any]:
        """PGN 65271 — Vehicle Electrical Power"""
        raw_v = min(65535, max(0, int(voltage / 0.05)))
        raw_i = min(250, max(0, int(current + 125)))
        payload = bytes([0xFF, 0xFF, 0xFF, 0xFF, raw_v & 0xFF, (raw_v >> 8) & 0xFF, raw_i, 0xFF])
        return {
            "can_id": "0x18FEF700",
            "pgn": 65271,
            "name": "VEP_ELECTRICAL_BUS",
            "dlc": 8,
            "hex": " ".join(f"{b:02X}" for b in payload),
            "decoded": f"BusVoltage={voltage:.2f} V | AlternatorCurrent={current:.1f} A",
            "spns": [
                {"spn": 168, "name": "Electrical Potential (Voltage)", "raw": raw_v, "val": f"{voltage:.2f}", "unit": "V", "bits": "32-47", "res": "0.05 V/bit"},
                {"spn": 114, "name": "Net Battery Current", "raw": raw_i, "val": f"{current:.1f}", "unit": "A", "bits": "48-55", "res": "1 A/bit (-125 A offset)"}
            ]
        }

    @staticmethod
    def encode_vib(vib_rms: float, kurtosis: float = 3.0) -> Dict[str, Any]:
        """PGN 65168 — Aero Propulsion Vibration Monitor"""
        raw_vib = min(65535, max(0, int(vib_rms * 1000.0)))
        raw_kurt = min(250, max(0, int(kurtosis * 20.0)))
        payload = bytes([raw_vib & 0xFF, (raw_vib >> 8) & 0xFF, raw_kurt, 0x00, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FE9000",
            "pgn": 65168,
            "name": "VIB_VIBRATION_RMS",
            "dlc": 8,
            "hex": " ".join(f"{b:02X}" for b in payload),
            "decoded": f"VibRMS={vib_rms:.3f} g | Kurtosis={kurtosis:.2f}",
            "spns": [
                {"spn": 520001, "name": "Propulsion Vibration RMS", "raw": raw_vib, "val": f"{vib_rms:.3f}", "unit": "g RMS", "bits": "0-15", "res": "0.001 g/bit"},
                {"spn": 520002, "name": "Vibration Kurtosis", "raw": raw_kurt, "val": f"{kurtosis:.2f}", "unit": "K4", "bits": "16-23", "res": "0.05/bit"}
            ]
        }

    @classmethod
    def generate_packet_burst(cls, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generates all 6 CAN frames for one telemetry sample with timestamps."""
        rpm = float(data.get("rpm", 1400.0))
        cht = float(data.get("cht", 380.0))
        oil_p = float(data.get("oil_pressure", 55.0))
        oil_t = float(data.get("oil_temp", 185.0))
        fuel = float(data.get("fuel_flow", 8.5))
        batt = float(data.get("battery_v", 13.8))
        vib = float(data.get("vibration", 0.8))
        kurt = float(data.get("vibration_kurtosis", 3.0))

        ts_str = time.strftime("%H:%M:%S") + f".{int(time.time()*1000)%1000:03d}"
        cycle = data.get("cycle", 0)

        frames = [
            cls.encode_eec1(rpm),
            cls.encode_et1(cht, oil_t),
            cls.encode_eflp(oil_p),
            cls.encode_lfe(fuel),
            cls.encode_vep(batt),
            cls.encode_vib(vib, kurt),
        ]

        for f in frames:
            f["timestamp"] = ts_str
            f["cycle"] = cycle

        return frames
