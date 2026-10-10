"""
packages/twin-core/twin_core/onnx_export.py

ONNX Model Export, INT8 Quantization, and Edge Model Bundler for UAV Digital Twin.
Implements improvement_plan.md §4 Phase 4:
  - Exports Keras LSTM RUL prognostics model to standard ONNX (opset 17).
  - Produces INT8 quantized variant optimized for airborne edge computers.
  - Extracts portable scaler coefficients (JSON) eliminating scikit-learn dependency on edge.
  - Packages artifacts into self-contained edge bundles.
"""

import os
import json
import pickle
from typing import Dict
import numpy as np
import onnx
from onnx import helper, TensorProto

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def convert_lstm_weights(w: np.ndarray, u: np.ndarray, b: np.ndarray, hidden_size: int):
    """
    Convert Keras LSTM gate weights [i, f, c, o] to ONNX LSTM gate layout [i, o, f, c].
    """
    # Keras W: [input_dim, 4*hidden_size] -> ONNX W: [1, 4*hidden_size, input_dim]
    i = w[:, 0 * hidden_size : 1 * hidden_size]
    f = w[:, 1 * hidden_size : 2 * hidden_size]
    c = w[:, 2 * hidden_size : 3 * hidden_size]
    o = w[:, 3 * hidden_size : 4 * hidden_size]
    W_onnx = np.expand_dims(np.hstack([i, o, f, c]).T, 0).astype(np.float32)

    # Keras U: [hidden_size, 4*hidden_size] -> ONNX R: [1, 4*hidden_size, hidden_size]
    ui = u[:, 0 * hidden_size : 1 * hidden_size]
    uf = u[:, 1 * hidden_size : 2 * hidden_size]
    uc = u[:, 2 * hidden_size : 3 * hidden_size]
    uo = u[:, 3 * hidden_size : 4 * hidden_size]
    R_onnx = np.expand_dims(np.hstack([ui, uo, uf, uc]).T, 0).astype(np.float32)

    # Keras b: [4*hidden_size] -> ONNX B: [1, 8*hidden_size] (W_bias + R_bias)
    bi = b[0 * hidden_size : 1 * hidden_size]
    bf = b[1 * hidden_size : 2 * hidden_size]
    bc = b[2 * hidden_size : 3 * hidden_size]
    bo = b[3 * hidden_size : 4 * hidden_size]
    b_reordered = np.concatenate([bi, bo, bf, bc])
    B_onnx = np.expand_dims(np.concatenate([b_reordered, np.zeros_like(b_reordered)]), 0).astype(np.float32)

    return W_onnx, R_onnx, B_onnx


def export_lstm_to_onnx(
    keras_model_path: str,
    output_onnx_path: str,
    opset_version: int = 17,
) -> str:
    """
    Export Keras LSTM RUL prognostics model to ONNX.
    Zero TensorFlow dependency required at runtime once exported!
    """
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
    import tensorflow as tf

    model = tf.keras.models.load_model(keras_model_path)
    w_lstm1, u_lstm1, b_lstm1 = model.layers[0].get_weights()
    w_lstm2, u_lstm2, b_lstm2 = model.layers[2].get_weights()
    w_dense1, b_dense1 = model.layers[4].get_weights()
    w_dense2, b_dense2 = model.layers[5].get_weights()

    W1, R1, B1 = convert_lstm_weights(w_lstm1, u_lstm1, b_lstm1, 128)
    W2, R2, B2 = convert_lstm_weights(w_lstm2, u_lstm2, b_lstm2, 64)

    nodes = [
        helper.make_node("Transpose", inputs=["input"], outputs=["lstm1_in"], perm=[1, 0, 2]),
        helper.make_node(
            "LSTM",
            inputs=["lstm1_in", "W1", "R1", "B1"],
            outputs=["lstm1_out", "lstm1_h_last", "lstm1_c_last"],
            hidden_size=128,
        ),
        helper.make_node("Squeeze", inputs=["lstm1_out", "squeeze_axes"], outputs=["lstm2_in"]),
        helper.make_node(
            "LSTM",
            inputs=["lstm2_in", "W2", "R2", "B2"],
            outputs=["lstm2_all", "lstm2_h_last", "lstm2_c_last"],
            hidden_size=64,
        ),
        helper.make_node("Squeeze", inputs=["lstm2_h_last", "squeeze_axes"], outputs=["dense1_in"]),
        helper.make_node("Gemm", inputs=["dense1_in", "W_d1", "B_d1"], outputs=["dense1_pre"], alpha=1.0, beta=1.0),
        helper.make_node("Relu", inputs=["dense1_pre"], outputs=["dense1_out"]),
        helper.make_node("Gemm", inputs=["dense1_out", "W_d2", "B_d2"], outputs=["output"], alpha=1.0, beta=1.0),
    ]

    initializers = [
        helper.make_tensor("W1", TensorProto.FLOAT, W1.shape, W1.flatten()),
        helper.make_tensor("R1", TensorProto.FLOAT, R1.shape, R1.flatten()),
        helper.make_tensor("B1", TensorProto.FLOAT, B1.shape, B1.flatten()),
        helper.make_tensor("squeeze_axes", TensorProto.INT64, [1], [1]),
        helper.make_tensor("W2", TensorProto.FLOAT, W2.shape, W2.flatten()),
        helper.make_tensor("R2", TensorProto.FLOAT, R2.shape, R2.flatten()),
        helper.make_tensor("B2", TensorProto.FLOAT, B2.shape, B2.flatten()),
        helper.make_tensor("W_d1", TensorProto.FLOAT, w_dense1.shape, w_dense1.flatten()),
        helper.make_tensor("B_d1", TensorProto.FLOAT, b_dense1.shape, b_dense1.flatten()),
        helper.make_tensor("W_d2", TensorProto.FLOAT, w_dense2.shape, w_dense2.flatten()),
        helper.make_tensor("B_d2", TensorProto.FLOAT, b_dense2.shape, b_dense2.flatten()),
    ]

    inputs = [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 50, 3])]
    outputs = [helper.make_tensor_value_info("output", TensorProto.FLOAT, [1, 1])]

    graph = helper.make_graph(nodes, "uav_rul_prognostics", inputs, outputs, initializers)
    onnx_model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", opset_version)], ir_version=9)
    onnx.checker.check_model(onnx_model)

    os.makedirs(os.path.dirname(os.path.abspath(output_onnx_path)), exist_ok=True)
    onnx.save(onnx_model, output_onnx_path)
    return output_onnx_path


def export_scaler_params(scaler_pickle_path: str, output_json_path: str) -> str:
    """
    Extract scikit-learn MinMaxScaler coefficients into portable JSON.
    Allows pure NumPy normalization on airborne edge hardware with 0 dependencies.
    """
    with open(scaler_pickle_path, "rb") as f:
        scaler = pickle.load(f)

    params = {
        "scaler_type": "MinMaxScaler",
        "features": ["rpm", "cht", "egt"],
        "scale": [float(x) for x in scaler.scale_],
        "min": [float(x) for x in scaler.min_],
        "data_min": [float(x) for x in scaler.data_min_],
        "data_max": [float(x) for x in scaler.data_max_],
    }

    os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
    with open(output_json_path, "w") as f:
        json.dump(params, f, indent=2)

    return output_json_path


def export_int8_quantized_model(
    input_onnx_path: str,
    output_int8_path: str,
) -> str:
    """
    Quantize ONNX model to INT8 representation for ultra-low latency airborne edge deployment.
    """
    from onnxruntime.quantization import quantize_dynamic, QuantType

    os.makedirs(os.path.dirname(os.path.abspath(output_int8_path)), exist_ok=True)
    quantize_dynamic(
        model_input=input_onnx_path,
        model_output=output_int8_path,
        op_types_to_quantize=["Gemm", "MatMul"],
        weight_type=QuantType.QInt8,
        extra_options={"WeightSymmetric": True},
    )
    return output_int8_path


def build_full_edge_bundle(models_dir: str = None) -> Dict[str, str]:
    """
    Build and export all edge artifacts (ONNX Float32, ONNX INT8, Scaler JSON).
    """
    target_dir = models_dir or os.path.join(_REPO_ROOT, "backend", "models")
    os.makedirs(target_dir, exist_ok=True)

    keras_path = os.path.join(_REPO_ROOT, "backend", "uav_rul_model.h5")
    scaler_path = os.path.join(_REPO_ROOT, "backend", "scaler.pkl")

    onnx_f32_path = os.path.join(target_dir, "uav_rul_model.onnx")
    onnx_int8_path = os.path.join(target_dir, "uav_rul_model_int8.onnx")
    scaler_json_path = os.path.join(target_dir, "scaler_params.json")

    export_lstm_to_onnx(keras_path, onnx_f32_path)
    export_scaler_params(scaler_path, scaler_json_path)
    export_int8_quantized_model(onnx_f32_path, onnx_int8_path)

    manifest = {
        "bundle_id": "uav-prognostics-edge-v4.0",
        "created_at": "2026-10-09T18:00:00Z",
        "artifacts": {
            "onnx_f32": os.path.basename(onnx_f32_path),
            "onnx_int8": os.path.basename(onnx_int8_path),
            "scaler_params": os.path.basename(scaler_json_path),
        },
        "target_architectures": ["Jetson Orin Nano", "NXP i.MX8M Plus", "x86_64"],
        "runtime": "onnxruntime",
    }
    manifest_path = os.path.join(target_dir, "edge_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    return {
        "onnx_f32": onnx_f32_path,
        "onnx_int8": onnx_int8_path,
        "scaler_json": scaler_json_path,
        "manifest": manifest_path,
    }


if __name__ == "__main__":
    print("[EXPORT] Building edge model artifacts...")
    artifacts = build_full_edge_bundle()
    print(f"  ✓ Exported ONNX Float32: {artifacts['onnx_f32']}")
    print(f"  ✓ Exported ONNX INT8:    {artifacts['onnx_int8']}")
    print(f"  ✓ Exported Scaler JSON:  {artifacts['scaler_json']}")
    print(f"  ✓ Created Edge Manifest: {artifacts['manifest']}")
