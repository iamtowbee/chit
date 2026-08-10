"""
Chit built-in native operations.

Each Op follows the pugqeep FunctionType pattern:
- name: unique identifier
- c_signature: (c_func_name, arg_types, return_type)
- numpy_dispatch: pure-numpy fallback

Register ops with OpsRegistry:
    from chit.ops import BUILTIN_OPS
    registry = OpsRegistry()
    for op in BUILTIN_OPS:
        registry.register(op)
"""

import numpy as np
from typing import Any, Tuple, List

from .registry import Op


class MatMulOp(Op):
    """Matrix multiply: out = A @ B (row-major)."""

    name = "matmul"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_matmul", ["float*", "float*", "float*", "int", "int", "int"], "void"

    def numpy_dispatch(self, out: np.ndarray, A: np.ndarray, B: np.ndarray,
                       M: int, N: int, K: int, **kw) -> None:
        np.dot(A.reshape(M, K), B.reshape(N, K).T, out=out.reshape(M, N))


class RMSNormOp(Op):
    """RMS normalization: out = (x / sqrt(mean(x^2) + eps)) * weight."""

    name = "rmsnorm"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_rmsnorm", ["float*", "float*", "float*", "int", "float"], "void"

    def numpy_dispatch(self, out: np.ndarray, x: np.ndarray, weight: np.ndarray,
                       n: int, eps: float = 1e-5, **kw) -> None:
        rms = np.sqrt(np.mean(x[:n] ** 2) + eps)
        out[:n] = (x[:n] / rms) * weight[:n]


class SiLUOp(Op):
    """SiLU activation: out = x * sigmoid(x) = x / (1 + exp(-x))."""

    name = "silu"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_silu", ["float*", "float*", "int"], "void"

    def numpy_dispatch(self, out: np.ndarray, x: np.ndarray, n: int, **kw) -> None:
        out[:n] = x[:n] / (1.0 + np.exp(-x[:n]))


class AddResidualOp(Op):
    """Add residual connection: out += residual."""

    name = "add_residual"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_add_residual", ["float*", "float*", "int"], "void"

    def numpy_dispatch(self, out: np.ndarray, residual: np.ndarray, n: int, **kw) -> None:
        out[:n] += residual[:n]


class EmbedOp(Op):
    """Token embedding lookup: out = embedding[token_id]."""

    name = "embed"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_embed", ["float*", "float*", "int", "int"], "void"

    def numpy_dispatch(self, out: np.ndarray, emb: np.ndarray,
                       token_id: int, D: int, **kw) -> None:
        tid = int(token_id)
        out[:D] = emb[tid * D: (tid + 1) * D]


class ArgMaxOp(Op):
    """Argmax over vocabulary: out[0] = argmax(logits)."""

    name = "argmax"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_argmax", ["float*", "float*", "int"], "void"

    def numpy_dispatch(self, out: np.ndarray, logits: np.ndarray, n: int, **kw) -> None:
        out[0] = float(np.argmax(logits[:n]))


class RopeOp(Op):
    """Rotary position embedding applied to q and k."""

    name = "rope"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_rope", ["float*", "float*", "int", "int", "int", "float"], "void"

    def numpy_dispatch(self, out: np.ndarray, x: np.ndarray,
                       n: int, head_dim: int, pos: int, base: float = 10000.0,
                       **kw) -> None:
        n_heads = n // head_dim
        inv_freq = 1.0 / (base ** (np.arange(0, head_dim, 2, dtype=np.float32) / head_dim))
        for h in range(n_heads):
            t = np.float32(pos) * inv_freq
            cos_t = np.cos(t)
            sin_t = np.sin(t)
            d = h * head_dim
            x0 = x[d:d+head_dim:2].copy()
            x1 = x[d+1:d+head_dim:2].copy()
            out[d:d+head_dim:2] = x0 * cos_t - x1 * sin_t
            out[d+1:d+head_dim:2] = x0 * sin_t + x1 * cos_t


class CopyOp(Op):
    """Memory copy: dst = src."""

    name = "copy"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_copy", ["float*", "float*", "int"], "void"

    def numpy_dispatch(self, dst: np.ndarray, src: np.ndarray, n: int, **kw) -> None:
        dst[:n] = src[:n]


class SoftmaxOp(Op):
    """Softmax over last dimension."""

    name = "softmax"

    def c_signature(self) -> Tuple[str, List[str], str]:
        return "chit_softmax", ["float*", "float*", "int", "int"], "void"

    def numpy_dispatch(self, out: np.ndarray, x: np.ndarray,
                       rows: int, cols: int, **kw) -> None:
        for i in range(rows):
            row = x[i * cols:(i + 1) * cols]
            e_x = np.exp(row - np.max(row))
            out[i * cols:(i + 1) * cols] = e_x / e_x.sum()


# All built-in ops
BUILTIN_OPS = [
    MatMulOp(),
    RMSNormOp(),
    SiLUOp(),
    AddResidualOp(),
    EmbedOp(),
    ArgMaxOp(),
    RopeOp(),
    CopyOp(),
    SoftmaxOp(),
]
