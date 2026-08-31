"""
simulator/can_bridge.py
------------------------
Simulates SocketCAN / SAE J1939 & UAVCAN Aero Piston Engine Frames.

Encodes live engine telemetry into standard 29-bit CAN frames:
  - PGN 61444 (0x0CF00400) EEC1: Engine Speed (RPM), Demand %
  - PGN 65262 (0x18FEEE00) ET1 : Engine Coolant/CHT, Fuel Temp, Oil Temp
  - PGN 65263 (0x18FEEF00) EFLP: Engine Oil Pressure, Crankcase Pressure
  - PGN 65266 (0x18FEF200) LFE : Fuel Rate (L/h), Instantaneous Fuel Economy
  - PGN 65271 (0x18FEF700) VEP : Battery Voltage, Alternator Current
  - PGN 65168 (0x18FE9000) VIB : Vibration RMS, Peak Acceleration, Kurtosis
"""

import struct
import time
from typing import Dict, List, Any


class AeroCANBridge:
    """
    Encodes sensor parameters into standard 8-byte CAN payload frames
    with arbitration IDs, priorities, PGNs, and payload hex strings.
    """

    @staticmethod
    def encode_eec1(rpm: float, torque_pct: float = 75.0) -> Dict[str, Any]:
        """PGN 61444 - Electronic Engine Controller 1"""
        # RPM resolution 0.125 rpm/bit, offset 0
        raw_rpm = min(65535, int(rpm / 0.125))
        raw_torque = min(250, max(0, int(torque_pct + 125)))
        # 8 bytes: [Engine Torque Mode, Driver Demand, Actual Torque, RPM Low, RPM High, Source, Starter, Demand]
        payload = bytes([0x01, raw_torque, raw_torque, raw_rpm & 0xFF, (raw_rpm >> 8) & 0xFF, 0x00, 0xFF, 0xFF])
        return {
            "can_id": "0x0CF00400",
            "pgn": 61444,
            "name": "EEC1_ENGINE_SPEED",
            "dlc": 8,
            "hex": payload.hex().upper(),
            "decoded": f"Speed={rpm:.0f} RPM, Actual Torque={torque_pct:.0f}%"
        }

    @staticmethod
    def encode_et1(cht: float, oil_temp: float) -> Dict[str, Any]:
        """PGN 65262 - Engine Temperature 1"""
        # Temp resolution 1 deg C/bit, offset -40 deg C
        cht_c = (cht - 32.0) * 5.0 / 9.0
        oil_t_c = (oil_temp - 32.0) * 5.0 / 9.0
        raw_cht = min(250, max(0, int(cht_c + 40)))
        raw_oil = min(250, max(0, int(oil_t_c + 40)))
        # [Coolant/CHT, Fuel Temp, Oil Temp Low, Oil Temp High, Turbo Oil, Intercooler, Reserved, Reserved]
        payload = bytes([raw_cht, 0x55, raw_oil, 0x00, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FEEE00",
            "pgn": 65262,
            "name": "ET1_TEMPERATURES",
            "dlc": 8,
            "hex": payload.hex().upper(),
            "decoded": f"CHT={cht:.1f}°F ({cht_c:.1f}°C), OilTemp={oil_temp:.1f}°F"
        }

    @staticmethod
    def encode_eflp(oil_press_psi: float) -> Dict[str, Any]:
        """PGN 65263 - Engine Fluid Level/Pressure"""
        # Oil pressure resolution 4 kPa/bit
        oil_kpa = oil_press_psi * 6.89476
        raw_oil_p = min(250, max(0, int(oil_kpa / 4.0)))
        payload = bytes([0xFF, 0xFF, 0xFF, raw_oil_p, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FEEF00",
            "pgn": 65263,
            "name": "EFLP_OIL_PRESSURE",
            "dlc": 8,
            "hex": payload.hex().upper(),
            "decoded": f"OilPress={oil_press_psi:.1f} PSI ({oil_kpa:.1f} kPa)"
        }

    @staticmethod
    def encode_lfe(fuel_flow_l_h: float) -> Dict[str, Any]:
        """PGN 65266 - Fuel Economy / Rate"""
        # Fuel rate resolution 0.05 L/h per bit
        raw_fuel = min(65535, int(fuel_flow_l_h / 0.05))
        payload = bytes([raw_fuel & 0xFF, (raw_fuel >> 8) & 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FEF200",
            "pgn": 65266,
            "name": "LFE_FUEL_RATE",
            "dlc": 8,
            "hex": payload.hex().upper(),
            "decoded": f"FuelRate={fuel_flow_l_h:.2f} L/h"
        }

    @staticmethod
    def encode_vep(voltage: float, current: float = 18.5) -> Dict[str, Any]:
        """PGN 65271 - Vehicle Electrical Power"""
        # Voltage resolution 0.05 V/bit
        raw_v = min(65535, int(voltage / 0.05))
        raw_i = min(250, max(0, int(current + 125)))
        payload = bytes([0xFF, 0xFF, 0xFF, 0xFF, raw_v & 0xFF, (raw_v >> 8) & 0xFF, raw_i, 0xFF])
        return {
            "can_id": "0x18FEF700",
            "pgn": 65271,
            "name": "VEP_ELECTRICAL_BUS",
            "dlc": 8,
            "hex": payload.hex().upper(),
            "decoded": f"BusVoltage={voltage:.2f}V, AlternatorCur={current:.1f}A"
        }

    @staticmethod
    def encode_vib(vib_rms: float, kurtosis: float = 3.0) -> Dict[str, Any]:
        """PGN 65168 - Aero Propulsion Vibration Monitor"""
        raw_vib = min(65535, int(vib_rms * 1000.0))  # milli-g
        raw_kurt = min(250, int(kurtosis * 20.0))
        payload = bytes([raw_vib & 0xFF, (raw_vib >> 8) & 0xFF, raw_kurt, 0x00, 0xFF, 0xFF, 0xFF, 0xFF])
        return {
            "can_id": "0x18FE9000",
            "pgn": 65168,
            "name": "VIB_VIBRATION_RMS",
            "dlc": 8,
            "hex": payload.hex().upper(),
            "decoded": f"VibRMS={vib_rms:.3f}g, Kurtosis={kurtosis:.2f}"
        }

    @classmethod
    def generate_packet_burst(cls, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generates a synchronized burst of CAN frames matching current telemetry."""
        rpm = float(data.get("rpm", 1400.0))
        cht = float(data.get("cht", 380.0))
        oil_p = float(data.get("oil_pressure", 55.0))
        oil_t = float(data.get("oil_temp", 185.0))
        fuel = float(data.get("fuel_flow", 8.5))
        batt = float(data.get("battery_v", 13.8))
        vib = float(data.get("vibration", 0.8))
        kurt = float(data.get("vibration_kurtosis", 3.0))

        ts = round(time.time(), 4)
        frames = [
            cls.encode_eec1(rpm),
            cls.encode_et1(cht, oil_t),
            cls.encode_eflp(oil_p),
            cls.encode_lfe(fuel),
            cls.encode_vep(batt),
            cls.encode_vib(vib, kurt)
        ]
        for f in frames:
            f["timestamp"] = ts
        return frames
